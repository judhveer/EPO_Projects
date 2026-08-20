import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middlewares/authenticate.js';
import { requireBossOrAdmin } from '../middlewares/authorize.js';
import { login, createUser, me, getTelecallers, getExecutives } from '../controllers/authController.js';
import { loginByIpLimiter } from "../middlewares/rateLimiter.js";

const router = Router();

// IP limiter = broad safety net only.
// Identifier-based limiting is handled inside the login controller
// so it can distinguish success from failure and reset on success.
router.post('/login', loginByIpLimiter, login);

router.get('/me', authenticate, me);


router.get('/users/telecallers', getTelecallers);

router.get('/users/executives', getExecutives);

router.post(
    '/users',
    authenticate,
    requireBossOrAdmin,
    body('email').optional({ checkFalsy: true }).isEmail(),
    body('username').isString().isLength({ min: 3}),
    body('password').isStrongPassword({minLength: 8, minSymbols: 0}),
    body('role').isString(),
    body('department').isString(),
    createUser
);


export default router;
