import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth.js';
import models from '../models/index.js';
import { getCache, setCache, TTL, CACHE_KEYS } from "../utils/cache.js";
const { User } = models;
import { performance } from "node:perf_hooks";

export default async function authenticate(req, res, next) {
    const authStart = performance.now();
    try {
        const auth = req.headers.authorization || '';
        if (!auth || !auth.startsWith("Bearer ")) {
            return res.status(401).json({
                message: 'Token missing or malformed',
                status: false,
                data: null
            });
        }

        const jwtStart = performance.now();
        
        const token = auth.split(' ')[1];
        const payload = jwt.verify(token, authConfig.jwtSecret);
        const userId = payload.sub;

        const jwtTime = performance.now() - jwtStart;

        // Cache key: epo:user:{userId}
        // TTL: 12h — same as JWT expiry so the cached user never outlives its token.
        // If Redis is down, getCache() returns null and we fall through to DB.
        const cacheKey = CACHE_KEYS.user(userId);

        const redisStart = performance.now();

        const cachedUser = await getCache(cacheKey);

        const redisTime = performance.now() - redisStart;

        if(cachedUser){
            // Cache hit — no DB query needed
            req.user = cachedUser;
            console.log(`[AUTH] hit jwt=${jwtTime.toFixed(2)} redis=${redisTime.toFixed(2)} total=${(performance.now() - authStart).toFixed(2)}`);
            return next();
        }

        // Cache miss — query DB


        const dbStart = performance.now();

        const user = await User.findByPk(payload.sub);

        const dbTime = performance.now() - dbStart;

        if(!user || !user.isActive){
            return res.status(401).json({
                message: 'Invalid or inactive user.',
                status: false,
                data: null
            });
        }

        const userObj = {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            department: user.department,
            isActive: user.isActive
        };

        // Store in cache for subsequent requests within this JWT's lifetime
        const redisSetStart = performance.now();
        await setCache(cacheKey, userObj, TTL.USER_AUTH);
        const redisSetTime = performance.now() - redisSetStart;

        req.user = userObj;
        console.log(`[AUTH] miss jwt=${jwtTime.toFixed(2)} redisget=${redisTime.toFixed(2)} mysql=${dbTime.toFixed(2)} redisset=${redisSetTime.toFixed(2)} total=${(performance.now() - authStart).toFixed(2)}`);
        return next();
    }
    catch(error){
        console.error("Authentication error:", error);
        return res.status(401).json({
            message: error.message || "Authentication failed.",
            status: false,
            data: null
        });
    }
}