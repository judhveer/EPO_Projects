import { recomputeAllocation } from '../../services/attendance/leaveLedgerService.js';
import models from '../../models/index.js';
import { writeAuditLog } from '../../services/attendance/auditLogService.js';


const { LeaveType, LeavePolicy } = models;

function isApprover(user) {
  return user.role === 'BOSS' || user.role === 'ADMIN' || user.department === 'HR';
}
function sendError(res, err) {
    console.error('[leaveConfig.controller]', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Something went wrong.' });
}

// ── Leave Types ──────────────────────────────────────────────────────
export async function listLeaveTypes(req, res) {
    try {
        const types = await LeaveType.findAll({
            include: [{
                model: LeavePolicy,
                as: 'policies',
                where: {
                    active: true
                },
                required: false
            }],
            order: [['name', 'ASC']],
        });
        res.json(types);
    } catch (err) {
        sendError(res, err);
    }
}


export async function createLeaveType(req, res) {
    try {
        if (!isApprover(req.user)) {
            return res.status(403).json({
                error: 'Only BOSS or ADMIN may configure leave types.'
            });
        }

        const { name, is_paid, requires_approval, auto_deductible, auto_deduct_priority } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'name is required.' });
        }
        if (auto_deductible && auto_deduct_priority == null) {
            return res.status(400).json({
                error: 'auto_deduct_priority is required when auto_deductible is true.'
            });
        }

        const type = await LeaveType.create({
            name,
            is_paid: is_paid !== false,
            requires_approval: requires_approval !== false,
            auto_deductible: !!auto_deductible,
            auto_deduct_priority: auto_deductible ? auto_deduct_priority : null,
            created_by: req.user.id,
        });

        await writeAuditLog({
            entityType: 'LEAVE_TYPE',
            entityId: type.id,
            action: 'CREATED',
            performedBy: req.user.id,
            oldValue: null,
            newValue: { 
                name: type.name, 
                is_paid: type.is_paid, 
                requires_approval: type.requires_approval, 
                auto_deductible: type.auto_deductible 
            },
        });

        res.status(201).json(type);
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({
                error: 'A leave type with this name already exists.'
            });
        }
        sendError(res, err);
    }
}


export async function updateLeaveType(req, res) {
    try {
        if (!isApprover(req.user)) {
            return res.status(403).json({
                error: 'Only BOSS or ADMIN may configure leave types.'
            });
        }

        const type = await LeaveType.findByPk(req.params.id);
        if (!type) {
            return res.status(404).json({
                error: 'Leave type not found.'
            });
        }
        const { is_paid, requires_approval, auto_deductible, auto_deduct_priority, active } = req.body;

        if (auto_deductible && auto_deduct_priority == null && type.auto_deduct_priority == null) {
            return res.status(400).json({
                error: 'auto_deduct_priority is required when auto_deductible is true.'
            });
        }

        const oldValues = { 
            is_paid: type.is_paid, 
            requires_approval: type.requires_approval, 
            auto_deductible: type.auto_deductible,
            auto_deduct_priority: type.auto_deduct_priority, 
            active: type.active 
        };

        await type.update({
            ...(is_paid !== undefined && { is_paid }),
            ...(requires_approval !== undefined && { requires_approval }),
            ...(auto_deductible !== undefined && { auto_deductible }),
            ...(auto_deduct_priority !== undefined && { auto_deduct_priority }),
            ...(active !== undefined && { active }),
        });

        await writeAuditLog({
            entityType: 'LEAVE_TYPE',
            entityId: type.id,
            action: 'UPDATED',
            performedBy: req.user.id,
            oldValue: oldValues,
            newValue: { 
                is_paid: type.is_paid, 
                requires_approval: type.requires_approval, 
                auto_deductible: type.auto_deductible, 
                auto_deduct_priority: type.auto_deduct_priority, 
                active: type.active 
            },
        });

        res.json(type);

    } catch (err) {
        sendError(res, err);
    }
}

// ── Leave Policies ───────────────────────────────────────────────────
export async function createLeavePolicy(req, res) {
    try {
        if (!isApprover(req.user)) {
            return res.status(403).json({
                error: 'Only BOSS or ADMIN may configure leave policies.'
            });
        }

        const { leave_type_id, annual_entitlement } = req.body;

        if (!leave_type_id || annual_entitlement == null) {
            return res.status(400).json({
                error: 'leave_type_id and annual_entitlement are required.'
            });
        }
        const leaveType = await LeaveType.findByPk(leave_type_id);

        if (!leaveType) {
            return res.status(404).json({
                error: 'Leave type not found.'
            });
        }

        // Deactivate any existing active policy for this type first — one
        // active policy per type at a time. Historical policies stay in
        // the table (never deleted), just no longer active, matching the
        // deactivate-don't-delete pattern used everywhere else.
        await LeavePolicy.update({
            active: false
        }, {
            where: {
                leave_type_id,
                active: true
            }
        });

        const policy = await LeavePolicy.create({
            leave_type_id,
            annual_entitlement,
            active: true
        });

        await writeAuditLog({
            entityType: 'LEAVE_POLICY',
            entityId: policy.id,
            action: 'CREATED',
            performedBy: req.user.id,
            oldValue: null,
            newValue: { 
                leave_type_id, 
                annual_entitlement 
            },
        });

        res.status(201).json(policy);
    } catch (err) {
        sendError(res, err);
    }
}


export async function postRecomputeAllocation(req, res) {
  try {
    if (!isApprover(req.user)) return res.status(403).json({ error: 'Only BOSS, ADMIN, or HR may correct allocations.' });
    const { employee_id, leave_type_id, leave_year, reason } = req.body;
    if (!employee_id || !leave_type_id || !leave_year || !reason) {
      return res.status(400).json({ error: 'employee_id, leave_type_id, leave_year, and reason are required.' });
    }

    const employee = await models.User.findByPk(employee_id);
    const policy = await models.LeavePolicy.findOne({ where: { leave_type_id, active: true } });
    if (!employee || !policy) return res.status(404).json({ error: 'Employee or active policy not found.' });

    const t = await models.sequelize.transaction();
    try {
      const result = await recomputeAllocation({
        employeeId: employee_id, leaveTypeId: leave_type_id, leaveYear: leave_year,
        newJoinDate: employee.join_date, annualEntitlement: policy.annual_entitlement,
        reason, createdBy: req.user.id, transaction: t,
      });
      await t.commit();
      res.json(result);
    } catch (err) { await t.rollback(); throw err; }
  } catch (err) {
    console.error('[postRecomputeAllocation]', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Failed to recompute allocation.' });
  }
}