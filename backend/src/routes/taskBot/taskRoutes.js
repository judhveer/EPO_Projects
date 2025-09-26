import express from 'express';
const router = express.Router();
import { listTask } from '../../controllers/taskbotController/task.controller.js';
// GET /api/tasks?status=COMPLETED&doer=John&query=meeting&urgent=true&from=2024-01-01&to=2024-01-31

// GET /api/tasks
// Query params:
// q → search in task, doer, department
// status → comma list: pending,revised,completed,canceled
// urgency → exact match (or tweak to LIKE)
// dueFrom → YYYY-MM-DD (inclusive)
// dueTo → YYYY-MM-DD (inclusive)
// page, limit → pagination
// sort, dir → sort key (dueDate|createdAt|urgency|status) + dir (asc|desc)

router.get('/', listTask);


export default router;