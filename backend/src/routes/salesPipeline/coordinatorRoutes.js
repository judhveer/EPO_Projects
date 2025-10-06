// backend/routes/coordinatorRoutes.js
import express from 'express';
import * as controller  from '../../controllers/salesPipelineController/coordinatorController.js';


// routes/coordinatorRoutes.js
// ESM-style express router that wires controller functions to endpoints

const router = express.Router();

// GET /api/sales/coordinator/users?role=
router.get('/users', controller.getUsers);

// GET /api/sales/coordinator/user/:userId/pending?metric=
router.get('/user/:userId/pending', controller.getUserPending);

// GET /api/sales/coordinator/pending/crm
router.get('/pending/crm', controller.getCrmPending);

export default router;
