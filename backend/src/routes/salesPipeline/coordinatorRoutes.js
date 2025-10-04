// backend/routes/coordinatorRoutes.js
import express from 'express';
import { getUsersStats, getUserDaily } from '../../controllers/salesPipelineController/coordinatorController.js';


const router = express.Router();

// Only allow BOSS / ADMIN / SALES COORDINATOR
function requireCoordinatorRole(req, res, next) {
  const allowed = new Set(['BOSS', 'ADMIN', 'SALES COORDINATOR']);
  const role = (req.user?.role || '').toUpperCase();
  if (!allowed.has(role)) return res.status(403).json({ message: 'Forbidden' });
  return next();
}

// Protect all coordinator routes
router.use( requireCoordinatorRole);

// GET /api/sales/coordinator/users
router.get('/users', getUsersStats);

// GET /api/sales/coordinator/user/:userId/daily
router.get('/user/:userId/daily', getUserDaily);

export default router;