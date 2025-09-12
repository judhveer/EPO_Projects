import jwt from 'jsonwebtoken';

import { authConfig } from '../config/auth.js';
import models from '../models/index.js';

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
        const user = await User.findByPk(payload.sub);

        if(!user && !user.isActive){
            return res.status(401).json({
                message: 'Invalid user',
                status: false,
                data: null
            });
        }

        req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            department: user.department,
            isActive: user.isActive
        };

        next();
    }
    catch(error){
        console.error("Authentication error:", error);
        return res.status(401).json({
            message: error || error.message,
            status: false,
            data: null
        });
    }
}
