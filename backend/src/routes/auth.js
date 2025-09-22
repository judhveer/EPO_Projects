import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middlewares/authenticate.js';
import { requireBossOrAdmin } from '../middlewares/authorize.js';
import { login, createUser, me, getTelecallers, getExecutives } from '../controllers/authController.js';

const router = Router();

router.post('/login', login);
router.get('/me', authenticate, me);


router.get('/users/telecallers', getTelecallers);

router.get('/users/executives', getExecutives);

router.post(
    '/users',
    authenticate,
    requireBossOrAdmin,
    body('email').isEmail(),
    body('username').isString().isLength({ min: 3}),
    body('password').isStrongPassword({minLength: 8, minSymbols: 0}),
    body('role').isString(),
    body('department').isString(),
    createUser
);


export default router;
