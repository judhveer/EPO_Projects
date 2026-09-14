import models from '../../models/index.js';
import { submitLeaveRequest, approveLeaveRequest, rejectLeaveRequest, cancelLeaveRequest } from '../../services/attendance/leaveRequestService.js';
import { getAllBalances } from '../../services/attendance/leaveLedgerService.js';
import { todayISTDateOnly } from '../../utils/attendance/istTime.js';

const { LeaveType, LeaveRequest, User } = models;

function isApprover(user) {
    return user.role === 'BOSS' || user.role === 'ADMIN' || user.department === 'HR';
}

function sendError(res, err) {
    console.error('[leaveRequest.controller]', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Something went wrong.' });
}

// ── GET /api/leave/types — active leave types, for the request form dropdown
export async function listActiveLeaveTypes(req, res) {
    try {
        const types = await LeaveType.findAll({
            where: { active: true },
            attributes: ['id', 'name', 'is_paid'],
            order: [['name', 'ASC']],
        });
        res.json(types);
    } catch (err) { sendError(res, err); }
}

// ── GET /api/leave/me/balance — current year's balance per leave type
export async function getMyBalance(req, res) {
    try {
        const currentYear = Number(todayISTDateOnly().slice(0, 4));
        const balances = await getAllBalances(req.user.id, currentYear);
        const types = await LeaveType.findAll({
            where: {
                active: true
            },
            attributes: ['id', 'name', 'is_paid']
        });

        res.json(
            types.map((t) => ({
                leave_type_id: t.id,
                name: t.name,
                is_paid: t.is_paid,
                balance: balances[t.id] ?? 0
            }))
        );

    } catch (err) {
        sendError(res, err);
    }
}

// ── POST /api/leave/requests — submit
export async function createLeaveRequest(req, res) {
    try {
        const { leave_type_id, date_from, date_to, reason } = req.body;
        if (!leave_type_id || !date_from || !date_to) {
            return res.status(400).json({
                error: 'leave_type_id, date_from, and date_to are required.'
            });
        }

        const result = await submitLeaveRequest({
            employeeId: req.user.id, leaveTypeId: leave_type_id, dateFrom: date_from, dateTo: date_to, reason,
        });
        res.status(201).json(result);
    } catch (err) {
        sendError(res, err);
    }
}

// ── GET /api/leave/requests/me — own history
export async function getMyLeaveRequests(req, res) {
    try {
        const requests = await LeaveRequest.findAll({
            where: {
                employee_id: req.user.id
            },
            include: [{
                model: LeaveType,
                as: 'leaveType',
                attributes: ['id', 'name']
            }],
            order: [['createdAt', 'DESC']],
        });
        res.json(requests);
    } catch (err) { sendError(res, err); }
}

// ── GET /api/leave/requests/pending — approver queue
export async function getPendingApprovals(req, res) {
    try {
        if (!isApprover(req.user)) {
            return res.status(403).json({ error: 'Only BOSS, ADMIN, or HR may view the approval queue.' });
        }
        const requests = await LeaveRequest.findAll({
            where: { status: 'PENDING' },
            include: [
                {
                    model: LeaveType,
                    as: 'leaveType',
                    attributes: ['id', 'name']
                },
                {
                    model: User,
                    as: 'employee',
                    attributes: ['id', 'username', 'office', 'department']
                },
            ],
            order: [['createdAt', 'ASC']], // oldest first — first come, first reviewed
        });
        res.json(requests);
    } catch (err) {
        sendError(res, err);
    }
}

// ── PATCH /api/leave/requests/:id/approve
export async function approveRequest(req, res) {
    try {
        const result = await approveLeaveRequest({
            requestId: req.params.id,
            approver: req.user,
            decisionReason: req.body?.reason,
        });
        res.json(result);
    } catch (err) {
        sendError(res, err);
    }
}

// ── PATCH /api/leave/requests/:id/reject
export async function rejectRequest(req, res) {
    try {
        if (!req.body?.reason) {
            return res.status(400).json({
                error: 'A reason is required to reject a leave request.'
            });
        }
        const result = await rejectLeaveRequest({
            requestId: req.params.id,
            approver: req.user,
            decisionReason: req.body.reason,
        });
        res.json(result);
    } catch (err) {
        sendError(res, err);
    }
}


// ── PATCH /api/leave/requests/:id/cancel
export async function cancelRequest(req, res) {
  try {
    const result = await cancelLeaveRequest({
      requestId: req.params.id, actor: req.user, reason: req.body?.reason,
    });
    res.json(result);
  } catch (err) { sendError(res, err); }
}
