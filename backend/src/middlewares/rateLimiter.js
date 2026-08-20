/**
 * Rate limiting — two approaches depending on context:
 *
 * MIDDLEWARE limiters (createRateLimiter):
 *   Used for delivery confirmation and IP-based login safety net.
 *   Applied directly in route files.
 *
 * CONTROLLER helpers (getLoginAttemptInfo, incrementLoginFailure, resetLoginAttempts):
 *   Used for identifier-based login rate limiting INSIDE the login controller.
 *   This is necessary because only the controller knows whether the password
 *   was correct or not — the middleware layer has no access to that result.
 *   On wrong password → increment counter.
 *   On correct password → reset counter (so legitimate users are never locked out).
 */

import redis from "../config/redis.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_SECS = 900; // 15 minutes



// ─────────────────────────────────────────────────────────────────────────────
// Lua script — atomic INCR + EXPIRE in one Redis round-trip.
// Prevents the race condition where INCR succeeds but the process
// crashes before EXPIRE, leaving the key alive forever.
// ─────────────────────────────────────────────────────────────────────────────
const INCREMENT_SCRIPT = `
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    return count
`;


// ─────────────────────────────────────────────────────────────────────────────
// Dynamic time formatter
// Converts a raw TTL in seconds into a human-readable string.
// Examples:
//   900  → "15 minutes"
//   847  → "14 minutes and 7 seconds"
//   60   → "1 minute"
//   45   → "45 seconds"
//   0    → "a moment"
// ─────────────────────────────────────────────────────────────────────────────

export function formatRetryAfter(seconds) {
    if (!seconds || seconds <= 0) return "a moment";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const minStr = mins > 0 ? `${mins} minute${mins !== 1 ? "s" : ""}` : "";
    const secStr = secs > 0 ? `${secs} second${secs !== 1 ? "s" : ""}` : "";
    if (minStr && secStr) return `${minStr} and ${secStr}`;
    return minStr || secStr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Identifier-based login rate limit helpers
// Called directly from authController — NOT used as middleware.
// ─────────────────────────────────────────────────────────────────────────────
function loginKey(identifier){
    return `epo:rl:login:id:${identifier.toString().toLowerCase().trim()}`;
}

/**
 * Returns current attempt count and TTL for an identifier.
 * Used at the START of login to check if the account is already locked
 * before even touching the database.
 */
export async function getLoginAttemptInfo(identifier){
    try {
        const key = loginKey(identifier);
        const [count, ttl] = await Promise.all([
        redis.get(key),
        redis.ttl(key),
        ]);
        return {
        count: parseInt(count || "0", 10),
        ttl: Math.max(ttl, 0),
        };
    } catch {
        // Redis down — fail open, allow the request
        return { count: 0, ttl: 0 };
    }
}

/**
 * Increments the failure counter for an identifier.
 * Called ONLY after a wrong password is confirmed.
 * Returns the new count, TTL, and how many attempts remain.
 */
export async function incrementLoginFailure(identifier){
    try{
        const key = loginKey(identifier);
        const count = await redis.eval(INCREMENT_SCRIPT, 1, key, String(LOGIN_WINDOW_SECS));

        const ttl = await redis.ttl(key);
        const remaining = Math.max(0, LOGIN_LIMIT - count);

        return {
            count,
            ttl: Math.max(ttl, 0),
            remaining,
            locked: count >= LOGIN_LIMIT,
        };
    }
    catch{
        // Redis down — fail open
        console.error("redis is down!");
        return { count: 0, ttl: 0, remaining: LOGIN_LIMIT, locked: false };
    }

}

/**
 * Resets the failure counter for an identifier.
 * Called ONLY after a SUCCESSFUL login.
 * Ensures a legitimate user who eventually gets their password right
 * is never left with a stale counter.
 */
export async function resetLoginAttempts(identifier){
    try{
        await redis.del(loginKey(identifier));
    }
    catch{
        // Non-fatal — if Redis is down, the key expires naturally
        console.error("['resetLoginAttempts'] redis is down!");
    }
}


/**
 * Factory function that returns an Express middleware enforcing a rate limit.
 *
 * @param {object}   options
 * @param {function} options.keyFn      - (req) => string | null
 *                                        Builds the Redis key for this request.
 *                                        Return null to skip rate limiting for
 *                                        this specific request (e.g. missing field).
 * @param {number}   options.limit      - Max requests allowed in the window.
 * @param {number}   options.windowSecs - Window size in seconds.
 * @param {string}   options.message    - Human-readable message on 429.
 */
// ─────────────────────────────────────────────────────────────────────────────
// Generic middleware factory — used for delivery and IP safety net
// ─────────────────────────────────────────────────────────────────────────────
function createRateLimiter({ keyFn, limit, windowSecs, message }){
    return async function rateLimiterMiddleware(req, res, next){
        const key = keyFn(req);

        // keyFn returned null — cannot derive a key for this request
        // (e.g. identifier missing from body). Let the controller handle it.
        if(!key){
            return next();
        }

        try{
            const count = await redis.eval(INCREMENT_SCRIPT, 1, key, String(windowSecs));
            const remaining = Math.max(0, limit - count);
            
            // Standard rate limit headers — frontend can inspect these to show a meaningful message without parsing the body.
            res.set("X-RateLimit-Limit", String(limit));
            res.set("X-RateLimit-Remaining", String(remaining));

            if(count > limit){
                // Fetch actual TTL so Retry-After is exact, not an approximation.
                const ttl = await redis.ttl(key);
                res.set("Retry-After", String(Math.max(ttl, 0)));

                return res.status(429).json({
                    message: `${message} Please try again in ${formatRetryAfter(Math.max(ttl, 0))}.`,
                    retryAfter: Math.max(ttl, 0),
                });
            }

            return next();
        }
        catch(err){
            // Redis unavailable → fail open, log it, continue normally.
            console.error("[rate-limiter] Redis error, failing open:", err.message);
            return next();
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware: loose IP safety net for login
// 300 attempts per 15 minutes per IP — never triggers for real users
// (60 staff sharing one IP would need to log in 300 times in 15 minutes).
// Only blocks automated scripts cycling through many accounts.
//  * Key: epo:rl:login:ip:{ip}
//  * Limit: 300 attempts per 15 minutes per IP
// ─────────────────────────────────────────────────────────────────────────────
export const loginByIpLimiter = createRateLimiter({
    keyFn: (req) => {
        // req.ip respects X-Forwarded-For if trust proxy is set in Express.
        // Falls back to socket address if header is missing.
        const ip = req.ip || req.socket?.remoteAddress || "unknown";
        return `epo:rl:login:ip:${ip}`;
    },
    limit: 300,
    windowSecs: 900,    // 15 minutes
    message: "Too many requests from this network.",
});



// ─────────────────────────────────────────────────────────────────────────────
// Public delivery confirmation
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Rate limit by token — the token IS the credential for this endpoint.
 *
 * Each delivery assignment has one unique token. A legitimate delivery
 * worker submits once successfully. Rate limiting by token means:
 * - Worker A's token limit is independent of Worker B's token
 * - No shared-IP problem — the token, not the IP, identifies the resource
 * - Protects your Google Drive quota from spam uploads
 *
 * Key: epo:rl:delivery:{token}
 * Limit: 5 attempts per hour per token
 */
export const deliveryConfirmLimiter = createRateLimiter({
    keyFn: (req) => {
        const token = req.params?.token;
        if(!token){
            return null;
        }

        return `epo:rl:delivery:${token}`;
    },
    limit: 5,
    windowSecs: 3600, // 1 hour
    message:    "Too many submission attempts for this delivery link. Please try again in an hour.",
});





