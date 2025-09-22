import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { authConfig } from '../config/auth.js';
import models from '../models/index.js';

const { User } = models;

function sign(user) {
    return jwt.sign(
        {
            sub: user.id,
            role: user.role,
            dept: user.department
        },
        authConfig.jwtSecret,
        { expiresIn: authConfig.jwtExpiresIn }
    );
};

export async function login(req, res) {
    console.log("login controller called");
    try {
        const { identifier, password } = req.body;

        if (!identifier) {
            return res.status(400).json({
                message: 'Email or Username is required',
                status: false,
                data: null
            });
        }
        if (!password) {
            return res.status(400).json({
                message: 'Password is required',
                status: false,
                data: null
            });
        }

        const where = identifier.includes('@') ? { email: identifier } : { username: identifier };


        const user = await User.scope('withSecret').findOne({ where });

        if (!user || !user.isActive) {
            return res.status(400).json({
                message: 'Invalid credentials',
                status: false,
                data: null
            });
        }

        const ok = await user.checkPassword(password);
        console.log(ok);
        if (!ok) {
            return res.status(400).json({
                message: 'Invalid credentials',
                status: false,
                data: null
            });
        }

        user.lastLoginAt = new Date();
        await user.save();

        const token = sign(user);
        return res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role,
                department: user.department,
            }
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || 'Login failed',
            status: false,
            data: null
        });
    }
};

export async function createUser(req, res) {
    try {
        console.log("createUser called");
        // Only Admin/Boss routes call this (middleware enforced)
        const errors = validationResult(req);
        console.log("req.body: ", req.body);
        if (!errors.isEmpty()) {
            return res.status(422).json({
                errors: errors.array()
            });
        }

        const { email, username, role, department, password } = req.body;

        console.log("req.body: ", req.body);

        if (!email || !username || !role || !department || !password) {
            return res.status(400).json({
                message: 'Email, username, role, department and password are required',
                status: false,
                data: null
            });
        }

        const exists = await User.findOne({
            where: { email }
        });

        if (exists) {
            return res.status(409).json({
                message: 'Email already in use',
                status: false,
                data: null
            });
        }

        const userNameExists = await User.findOne({
            where: { username }
        });

        if (userNameExists) {
            return res.status(409).json({
                message: 'Username already in use',
                status: false,
                data: null
            });
        }

        const user = await User.scope('withSecret').create({
            email,
            username,
            role,
            department,
            createdBy: req.user.id,
            passwordHash: password
        });



        user._password = password;
        await user.save();

        return res.status(201).json({
            message: 'User created successfully',
            status: true,
            data: {
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role,
                department: user.department,
            }
        });
    }
    catch (error) {
        return res.status(500).json({
            message: error.message || 'User creation failed',
            status: false,
            data: null
        });
    }
};

export async function me(req, res) {
    return res.json({
        user: req.user
    });
};


export async function getTelecallers(req, res) {
    console.log("get Telecallers called:");
    try {
        const users = await User.findAll({
            where: {
                department: 'Sales dept',
                role: 'TELECALLER',
                is_active: true // optional
            },
            attributes: ['id', 'username', 'email'],
            order: [['username', 'ASC']]
        });
        res.status(200).json(users);
    } catch (err) {
        console.error('getTelecallers error', err);
        res.status(500).json({ error: 'Failed to fetch telecallers' });
    }
}


export async function getExecutives(req, res) {
    console.log("getExecutives called:");
    try {
        const users = await User.findAll({
            where: {
                department: 'Sales dept',
                role: 'EXECUTIVE',
                is_active: true
            },
            attributes: ['id', 'username', 'email'],
            order: [['username', 'ASC']]
        });

        res.status(200).json(users);
    }
    catch(err){
        console.error('getExecutives error', err);
        res.status(500).json({ error: 'Failed to fetch Executives' });
    }
}