import Redis from "ioredis";

const redis = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    // Only pass password if it is actually set — passing an empty string
    // causes authentication errors on Redis instances with no password.
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
    lazyConnect: true,          // do not auto-connect on import — we connect explicitly in init()
    maxRetriesPerRequest: 1,    // fail fast on individual commands — never hang the request
    connectTimeout: 5000,       // 5s to establish connection on startup
    retryStrategy: (times) => {
        if (times > 3) {
            console.error("[redis] Connection failed after 3 retries. Redis disabled for this session.");
            return null; // stop retrying — app continues without cache
        }
        return 1000; // retry after 1s
    },
});

redis.on("connect", () => {
    console.log("[redis] Connected successfully.");
});

redis.on("error", (error) => {
    // Log but never crash — the app works fine without Redis
    console.error("[redis] Error:", error.message);
});

redis.on("close", () => {
  console.warn("[redis] Connection closed.");
});

/**
 * Call this once during app startup (in app.js init()).
 * Uses lazyConnect so the actual TCP connection only happens here,
 * not at module import time.
 */
export async function connectRedis(){
    try {
        await redis.connect();
    }
    catch (error){
        // Non-fatal — app runs without cache if Redis is unavailable
        console.error("[redis] Startup connection failed:", error.message);
    }
}


export default redis;

