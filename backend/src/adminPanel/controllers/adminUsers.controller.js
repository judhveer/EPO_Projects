// ══════════════════════════════════════════════════════════════════════
//  Admin Panel — User Management
//
//  GET    /api/admin/users            — paginated, searchable, filterable list
//  PATCH  /api/admin/users/:id        — edit username/email/password/role/department
//  PATCH  /api/admin/users/:id/status — activate / deactivate
//  DELETE /api/admin/users/:id        — hard delete, only if zero linked records
//
//  Access: BOSS or ADMIN only (enforced by requireBossOrAdmin in the router).
// ══════════════════════════════════════════════════════════════════════



import { Op } from "sequelize";
import { validationResult } from "express-validator";
import db from "../../models/index.js";
import {
    ASSIGNABLE_DEPARTMENTS,
    ASSIGNABLE_ROLES,
} from "../../models/salesPipelineModels/User.model.js";
import { getDeletionBlockers } from "../utils/userDeletionGuard.js";

const { User } = db;

function respondToError(res, error, fallbackMsg) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error(fallbackMsg, error);
    return res.status(status).json({ message: error.message || fallbackMsg });
}

/**
 * Mirrors enforceRoleDeptConsistency from User.model.js, but returns a
 * message instead of throwing — lets the controller respond with a clean
 * 400 instead of relying on the model hook's raw throw to surface as a
 * generic 500.
 */

function validateRoleDeptCombo(role, department) {
    const salesRoles = new Set(["RESEARCHER", "COORDINATOR", "TELECALLER", "EXECUTIVE", "CRM"]);
    if (salesRoles.has(role) && department !== "Sales dept") {
        return `Role "${role}" requires department "Sales dept".`;
    }
    if (role === "EA" && department !== "EA") {
        return `Role "EA" requires department "EA".`;
    }
    if(role === "ADMIN" && department !== "Admin"){
        return `Role "ADMIN" requires department "Admin".`;
    }
    return null;
}

/** Blocks an ADMIN-role requester from mutating a BOSS-role target. */
function ensureNotActingOnBossUnlessBoss(req, targetUser) {
    if (targetUser.role === "BOSS" && req.user.role !== "BOSS") {
        throw Object.assign(
            new Error("Only a BOSS-role account can modify another BOSS account."),
            { statusCode: 403 }
        );
    }
}

function ensureNotActingOnSelf(req, targetUserId, action) {
    if (req.user.id === targetUserId) {
        throw Object.assign(
            new Error(`You cannot ${action} your own account from this panel.`),
            { statusCode: 403 }
        );
    }
}

// ─────────────────────────────────────────────────────────────────────
//  GET /api/admin/users
// ─────────────────────────────────────────────────────────────────────
export const listUsers = async (req, res) => {
    try {

        const { page = 1, limit = 25, search, department, role, isActive } = req.query;

        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
        const offset = (pageNum - 1) * limitNum;

        const where = {};
        if (department) {
            where.department = department;
        }
        if (role) {
            where.role = role;
        }

        if (isActive === "true") {
            where.isActive = true;
        }

        if (isActive === "false") {
            where.isActive = false;
        }

        const searchTerm = typeof search === "string" ? search.trim() : "";
        if (searchTerm) {
            where[Op.or] = [
                { username: { [Op.like]: `%${searchTerm}%` } },
                { email: { [Op.like]: `%${searchTerm}%` } },
            ];
        }

        const { rows, count } = await User.findAndCountAll({
            where,
            attributes: ["id", "username", "email", "role", "department", "isActive", "lastLoginAt", "createdAt"],
            order: [["createdAt", "DESC"]],
            limit: limitNum,
            offset,
        });

        return res.json({
            total: count,
            page: pageNum,
            limit: limitNum,
            data: rows,
            // Single source of truth for the frontend's dropdowns — keeps the
            // UI options and the server-side allow-list from drifting apart.
            assignableDepartments: ASSIGNABLE_DEPARTMENTS,
            assignableRoles: ASSIGNABLE_ROLES,
        });

    }
    catch (error) {
        return respondToError(res, error, "Unable to fetch users.");
    }
}


// ─────────────────────────────────────────────────────────────────────
//  PATCH /api/admin/users/:id
// ─────────────────────────────────────────────────────────────────────
export const updateUser = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw Object.assign(
                new Error(errors.array()[0].msg || "Invalid input."),
                { statusCode: 422 }
            );
        }

        const { id } = req.params;
        const { username, email, department, role, password } = req.body || {};

        const target = await User.findByPk(id, {
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!target) {
            throw Object.assign(new Error("User not found."), { statusCode: 404 });
        }

        ensureNotActingOnBossUnlessBoss(req, target);

        const isChangingRoleOrDept =
            (department !== undefined && department !== target.department) ||
            (role !== undefined && role !== target.role);

        if (isChangingRoleOrDept) {
            ensureNotActingOnSelf(req, target.id, "change the role or department of");
        }

        const updateData = {};

        if (username !== undefined && username.trim() !== target.username) {
            const exists = await User.findOne({
                where: {
                    username: username.trim(),
                    id: { [Op.ne]: target.id }
                },
                transaction: t,
            });

            if (exists) {
                throw Object.assign(new Error("Username already in use."), { statusCode: 409 });
            }
            updateData.username = username.trim();
        }

        // Resolve final department/role (changed value or existing one) so the consistency check and email rule below evaluate the post-update state, not a half-applied one.
        const finalDepartment = department !== undefined ? department : target.department;
        const finalRole = role !== undefined ? role : target.role;

        if (department !== undefined && department !== target.department) {
            if (!ASSIGNABLE_DEPARTMENTS.includes(department)) {
                throw Object.assign(
                    new Error(`"${department}" is not an assignable department.`),
                    { statusCode: 400 }
                );
            }
            updateData.department = department;
        }

        if (role !== undefined && role !== target.role) {
            if (!ASSIGNABLE_ROLES.includes(role)) {
                throw Object.assign(
                    new Error(`"${role}" is not an assignable role.`),
                    { statusCode: 400 }
                );
            }
            updateData.role = role;
        }

        if (isChangingRoleOrDept) {
            const comboError = validateRoleDeptCombo(finalRole, finalDepartment);
            if (comboError) {
                throw Object.assign(new Error(comboError), { statusCode: 400 });
            }
        }


        // Email required for everyone except Production Worker — mirrors createUser.
        const finalEmail = email !== undefined ? email : target.email;
        if (finalDepartment !== "Production Worker" && !finalEmail) {
            throw Object.assign(
                new Error(`Email is required for department "${finalDepartment}".`),
                { statusCode: 400 }
            );
        }

        if (email !== undefined && email !== target.email) {
            if (email) {
                const exists = await User.findOne({
                    where: {
                        email,
                        id: { [Op.ne]: target.id }
                    },
                    transaction: t,
                });

                if (exists) {
                    throw Object.assign(new Error("Email already in use."), { statusCode: 409 });
                }
            }
            updateData.email = email || null;
        }

        if (password) {
            // Validity already enforced by isStrongPassword at the route layer.
            target._password = password;
        }

        target.set(updateData);
        await target.save({ transaction: t });

        await t.commit();
        return res.json({
            message: "User updated successfully.",
            data: {
                id: target.id,
                username: target.username,
                email: target.email,
                role: target.role,
                department: target.department,
                isActive: target.isActive,
            },
        });
    }
    catch (error) {
        await t.rollback().catch(() => { });
        return respondToError(res, error, "Failed to update user.");
    }
}


// ─────────────────────────────────────────────────────────────────────
//  PATCH /api/admin/users/:id/status
//  Body: { isActive: boolean }
// ─────────────────────────────────────────────────────────────────────
export const toggleUserStatus = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const errors = validationResult(req);
        if(!errors.isEmpty()){
            throw Object.assign(
                new Error(errors.array()[0].msg || "isActive (boolean) is required."),
                { statusCode: 422 }
            );
        }

        const { id } = req.params;
        const { isActive } = req.body;

        const target = await User.findByPk(id, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!target){
            throw Object.assign(new Error("User not found."), { statusCode: 404 });
        }

        ensureNotActingOnBossUnlessBoss(req, target);
        ensureNotActingOnSelf(req, target.id, isActive ? "reactivate" : "deactivate");

        await target.update({
            isActive
        }, {transaction: t});

        await t.commit();

        return res.json({
            message: isActive ? "User reactivated." : "User deactivated.",
            id: target.id,
            isActive,
        });
    }
    catch(error){
        await t.rollback().catch( () => {});
        return respondToError(res, error, "Failed to update user status.");
    }
}

// ─────────────────────────────────────────────────────────────────────
//  DELETE /api/admin/users/:id
//  Hard delete — only allowed when the user has zero rows across every
//  linked table. Otherwise returns 409 naming what's still linked.
// ─────────────────────────────────────────────────────────────────────
export const deleteUser = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const { id } = req.params;

        const target = await User.findByPk(id, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        
        if(!target){
            throw Object.assign(
                new Error("User not found."),
                { statusCode: 404 },
            );
        }

        ensureNotActingOnBossUnlessBoss(req, target);
        ensureNotActingOnSelf(req, target.id, "delete");

        const blockerMessage = await getDeletionBlockers(target.id, t);
        if(blockerMessage){
            throw Object.assign(new Error(blockerMessage), { statusCode: 409 });
        }

        await target.destroy({ transaction: t });
        await t.commit();

        return res.json({ 
            message: "User deleted permanently.", 
            id 
        });
    }
    catch(error){
        await t.rollback().catch(() => {});
        return respondToError(res, error, "Failed to delete user.");
    }
}
