/**
 * Cache utility — thin wrapper around Redis with failsafe error handling.
 *
 * Design principle: Redis failure is NEVER fatal.
 * Every function catches its own errors and returns a safe fallback value.
 * The app always falls through to the database if the cache is unavailable.
 *
 * Key naming convention — prefix all keys with "epo:" to namespace them:
 *   epo:user:{userId}              — authenticated user object (auth middleware)
 *   epo:workers:dept:{department}  — workers list by department
 *   epo:items:cat:{category}       — item master by category
 *   epo:paper:types                — all paper types
 *   epo:paper:gsm:{paperName}      — GSM values for a paper type
 *   epo:wide:types                 — wide format material types
 *   epo:wide:gsm:{materialName}    — GSM values for a material
 *   epo:bindings:cat:{category}    — bindings by category
 *   epo:sizes:all                  — full sizes list
 *   epo:push:subs:{userId}         — push subscriptions for a user
 *   epo:clients:names              — full client names list
 */

import redis from "../config/redis.js";

/**
 * Get a cached value by key.
 * Returns the parsed JS value, or null on cache miss or error.
 */
export async function getCache(key){
    try {
        const raw = await redis.get(key);
        if(raw === null){
            return null; // cache miss
        }
        console.log(`[cache:get] key="${key}": cache hit`);
        return JSON.parse(raw);
    }
    catch (error){
        console.error(`[cache:get] key="${key}": `, error.message);
        return null;    // failsafe — treat as cache miss
    }
}

/**
 * Store a value in cache with a TTL (seconds).
 * Silently swallows errors — a failed cache write never breaks a request.
 */
export async function setCache(key, value, ttlSeconds){
    try{
        await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
        console.log(`[cache:set] key="${key}": stored with TTL=${ttlSeconds}s`);
    }
    catch (error){
        console.error(`[cache:set] key="${key}":`, error.message);
        // failsafe — app continues, data just won't be cached this time
    }
}

/**
 * Delete one or more specific keys.
 * Use this when you know exactly which keys to invalidate.
 */
export async function deleteCache(...keys){
    if(keys.length === 0){
        return; // nothing to delete
    }
    try{
        await redis.del(...keys);
    }
    catch (error){
        console.error(`[cache:del] keys="${keys.join(", ")}":`, error.message);
    }
}

/**
 * Delete all keys matching a glob pattern (e.g. "epo:paper:*").
 *
 * WARNING: Use this sparingly and only with narrow patterns.
 * redis.keys() scans the entire keyspace — on a large Redis instance
 * this blocks other operations. For EPO's scale this is perfectly fine.
 */
export async function delCachePattern(pattern){
    try{
        const keys = await redis.keys(pattern);
        if (keys.length === 0) {
            return;
        }
        await redis.del(...keys);
        console.log(`[cache:pattern-del] Deleted ${keys.length} key(s) matching "${pattern}"`);
    }
    catch (error){
        console.error(`[cache:pattern-del] pattern="${pattern}":`, error.message);
    }
}

/**
 * TTL constants (seconds) — centralised so every cache call uses the same value.
 *
 * USER_AUTH:  12h — matches JWT expiry. User object is stable within a session.
 *             Invalidated explicitly when admin updates or deactivates a user.
 *
 * WORKERS:    10 min — small team, changes only when admin creates/edits a user.
 *             Short enough that stale data is not a real problem even without
 *             explicit invalidation.
 *
 * MASTER_DATA: 2h — paper types, GSM, bindings, sizes, wide format materials.
 *              Reference data managed by admin. Never changes mid-shift.
 *              Explicitly invalidated when admin edits master data.
 *
 * PUSH_SUBS:  30 min — subscriptions are stable per browser/device.
 *             Invalidated explicitly on subscribe/unsubscribe.
 *
 * CLIENTS:    15 min — client list used for autocomplete.
 *             Frequently queried, rarely changes.
 */
export const TTL = {
  USER_AUTH:   43200,  // 12 hours
  WORKERS:     600,    // 10 minutes
  MASTER_DATA: 7200,   // 2 hours
  PUSH_SUBS:   1800,   // 30 minutes
  CLIENTS:     900,    // 15 minutes
  ATTENDANCE_SETTINGS: 7200,    // ← 2h, same class as MASTER_DATA: rarely changes, explicitly invalidated on write
};


// ─────────────────────────────────────────────────────────────────────────────
/**
 * All cache keys in one place.
 *
 * Static keys (no dynamic part) are plain strings.
 * Dynamic keys (depend on a value) are arrow functions that return a string.
 *
 * Rule: NEVER write a key string directly in a controller.
 * Always use this object. This prevents silent typo bugs during invalidation.
 */
export const CACHE_KEYS = {
  // Auth middleware — user object per JWT
  user:               (id)       => `epo:user:${id}`,

  // User lists
  nonBossUsers:                     "epo:users:non-boss",
  crmUsers:                         "epo:users:crms",
  workersByDept:      (dept)     => `epo:workers:dept:${dept}`,

  // Item master — static reference data
  itemsByCategory:    (category) => `epo:items:cat:${category}`,
  paperTypes:                       "epo:paper:types",
  paperGsm:           (name)     => `epo:paper:gsm:${name}`,
  wideTypes:                        "epo:wide:types",
  wideGsm:            (name)     => `epo:wide:gsm:${name}`,
  bindingsByCategory: (category) => `epo:bindings:cat:${category}`,
  sizesAll:                         "epo:sizes:all",

  // Push notifications
  pushSubs:           (userId)   => `epo:push:subs:${userId}`,

  // Client autocomplete
  clientNames:                      "epo:clients:names",
  attendanceSettings:               "epo:attendance:settings",
};


/**
 * Glob patterns for bulk invalidation via delCachePattern().
 * Used when a category of keys must all be cleared at once
 * (e.g. any paper type changed → clear all paper-related keys).
 */
export const CACHE_PATTERNS = {
    allPaper:        "epo:paper:*",
    allWide:         "epo:wide:*",
    allWorkersDept:  "epo:workers:dept:*",
}