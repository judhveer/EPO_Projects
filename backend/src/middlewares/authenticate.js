import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth.js';
import models from '../models/index.js';
import { getCache, setCache, TTL, CACHE_KEYS } from "../utils/cache.js";
const { User } = models;

export default async function authenticate(req, res, next) {
    try {
        console.log("authenticate middleware called");
        const auth = req.headers.authorization || '';
        if (!auth || !auth.startsWith("Bearer ")) {
            return res.status(401).json({
                message: 'Token missing or malformed',
                status: false,
                data: null
            });
        }

        
        const token = auth.split(' ')[1];
        const payload = jwt.verify(token, authConfig.jwtSecret);
        const userId = payload.sub;

        // Cache key: epo:user:{userId}
        // TTL: 12h — same as JWT expiry so the cached user never outlives its token.
        // If Redis is down, getCache() returns null and we fall through to DB.
        const cacheKey = CACHE_KEYS.user(userId);
        const cachedUser = await getCache(cacheKey);

        if(cachedUser){
            // Cache hit — no DB query needed
            req.user = cachedUser;
            return next();
        }

        // Cache miss — query DB

        const user = await User.findByPk(payload.sub);

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
            office: user.office,
            role: user.role,
            department: user.department,
            isActive: user.isActive
        };

        // Store in cache for subsequent requests within this JWT's lifetime
        await setCache(cacheKey, userObj, TTL.USER_AUTH);

        req.user = userObj;
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