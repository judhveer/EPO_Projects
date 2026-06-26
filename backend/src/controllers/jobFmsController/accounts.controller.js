// ══════════════════════════════════════════════════════════════════════
//  Accounts Dashboard Controller
//  Handles billing and payment tracking for the Accounts / CRM team.
//
//  Endpoints:
//    GET    /api/fms/accounts              — paginated job list + stats
//    PATCH  /api/fms/accounts/:job_no/bill     — create bill (locked once set)
//    PATCH  /api/fms/accounts/:job_no/payment  — update payment status
// ══════════════════════════════════════════════════════════════════════

import { Op } from 'sequelize';
import db from "../../models/index.js";

const ACCOUNTS_DEPARTMENTS = ["Accounts", "CRM"];

// Reusable error responder — keeps controllers DRY.
function respondToError(res, error, fallbackMsg) {
    const status = error.statusCode || (error instanceof StageTransitionError ? 422 : 500);
    if (status >= 500) console.error(fallbackMsg, error);
    return res.status(status).json({ message: error.message || fallbackMsg });
}

/**
 * Throws 403 if the requesting user is not Accounts or CRM department.
 * Follows the same throw-style pattern as ensureProductionRole.
 */

const ensureAccountsRole = (req) => {
    const dept = req.user?.department;
    if (!ACCOUNTS_DEPARTMENTS.includes(dept)) {
        throw Object.assign(
            new Error("Access denied. Accounts or CRM department only."),
            { statusCode: 403 }
        );
    }
};

// ─────────────────────────────────────────────────────────────────────
//  GET /api/fms/accounts
//  filter: all | unbilled | billed | half_paid | paid | complimentary
//
//  "all" (default) hides paid and complimentary jobs — those only
//  appear when their specific filter tab is selected.
//  Stats are always computed on the full scope (non-completed, non-cancelled)
//  regardless of which filter tab is active.
// ─────────────────────────────────────────────────────────────────────

export const getJobsForAccounts = async (req, res) => {
    try {
        ensureAccountsRole(req);

        const { page = 1, limit = 50, filter = "all", search } = req.query;
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
        const offset = (pageNum - 1) * limitNum;

        // ── Build WHERE using Op.and array to avoid Op.or collisions ─────────
        // (filter condition and search condition both potentially use Op.or;
        //  wrapping each as a separate element in Op.and keeps them isolated)
        const baseCondition = {
            status: { [Op.notIn]: ["completed", "cancelled"] },
        };

        const filterCondition = (() => {
            switch (filter) {
                case "unbilled":
                    return { bill_created: "no" };
                case "billed":
                    return { bill_created: "yes" };
                case "paid":
                    return { payment_status: "Paid" };
                case "half_paid":
                    return { payment_status: "Half Paid" };
                case "unpaid":
                    return { payment_status: "Un-paid" };
                case "complimentary":
                    return { bill_created: "complimentary" };
                case "all":
                default:
                    // Hide paid and complimentary — they only appear under their own tabs.
                    // The Op.or handles null payment_status (jobs where job writer
                    // didn't set it — they should still appear in the All view).
                    return {
                        [Op.or]: [
                            { payment_status: null },
                            { payment_status: { [Op.notIn]: ["Paid", "Complimentary"] } },
                        ],
                    };
            }
        })();

        const conditions = [baseCondition, filterCondition];

        // ── Search — added as a separate AND to avoid Op.or collision ─────────
        const searchTerm = typeof search === "string" ? search.trim() : "";
        if (searchTerm) {
            const searchOr = [
                { client_name: { [Op.like]: `%${searchTerm}%` } },
                { order_handled_by: { [Op.like]: `%${searchTerm}%` } },
                { order_received_by: { [Op.like]: `%${searchTerm}%` } },
                { reference: { [Op.like]: `%${searchTerm}%` } },
            ];
            if (/^\d+$/.test(searchTerm)) {
                searchOr.push({ job_no: Number(searchTerm) });
            }
            conditions.push({ [Op.or]: searchOr });
        }

        const where = { [Op.and]: conditions };

        // ── Stats always reflect full scope (not affected by active filter) ───
        const statsScope = {
            status: { [Op.notIn]: ["completed", "cancelled"] },
        };

        const [
            statsTotal,
            statsBilled,
            statsUnbilled,
            statsPaid,
            statsHalfPaid,
            statsUnpaid,
            statsComplimentary,
            filteredTotal,
        ] = await Promise.all([
            db.JobCard.count({ where: statsScope }),
            db.JobCard.count({ where: { ...statsScope, bill_created: "yes" } }),
            db.JobCard.count({ where: { ...statsScope, bill_created: "no" } }),
            db.JobCard.count({ where: { ...statsScope, payment_status: "Paid" } }),
            db.JobCard.count({ where: { ...statsScope, payment_status: "Half Paid" } }),
            db.JobCard.count({ where: { ...statsScope, payment_status: "Un-paid" } }),
            db.JobCard.count({ where: { ...statsScope, bill_created: "complimentary" } }),
            db.JobCard.count({ where }),
        ]);

        const jobs = await db.JobCard.findAll({
            where,
            attributes: {
                include: [
                    [
                        db.sequelize.literal(`(
                SELECT COUNT(*)
                FROM jobfms_job_items ji
                WHERE ji.job_no = JobCard.job_no
                )`),
                        "item_count",
                    ],
                ],
            },
            limit: limitNum,
            offset,
            order: [["created_at", "DESC"]],
        });

        return res.json({
            total: filteredTotal,
            page: pageNum,
            limit: limitNum,
            stats: {
                total: statsTotal,
                billed: statsBilled,
                unbilled: statsUnbilled,
                paid: statsPaid,
                halfPaid: statsHalfPaid,
                unpaid: statsUnpaid,
                complimentary: statsComplimentary,
            },
            data: jobs,
        });
    }
    catch (error) {
        return respondToError(res, error, "Unable to fetch accounts jobs.");
    }
}

// ─────────────────────────────────────────────────────────────────────
//  PATCH /api/fms/accounts/:job_no/bill
//
//  Creates a bill for a job. LOCKED once submitted — bill_created
//  cannot be changed from "yes" or "complimentary" back to anything.
//
//  bill_created = "yes"           → bill_type required (GST Bill / PI Bill)
//  bill_created = "complimentary" → bill_type = null, payment_status
//                                   auto-set to "Complimentary"
// ─────────────────────────────────────────────────────────────────────
export const updateBillInfo = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        ensureAccountsRole(req);

        const { job_no } = req.params;
        const { bill_created, bill_type } = req.body || {};
        if (!job_no) {
            throw Object.assign(new Error("Job number required."), { statusCode: 400 });
        }

        if (!["yes", "complimentary"].includes(bill_created)) {
            throw Object.assign(
                new Error("bill_created must be 'yes' or 'complimentary'."),
                { statusCode: 400 }
            );
        }

        if (bill_created === "yes" && !["GST Bill", "PI Bill"].includes(bill_type)) {
            throw Object.assign(
                new Error("bill_type is required and must be 'GST Bill' or 'PI Bill'."),
                { statusCode: 400 }
            );
        }

        const job = await db.JobCard.findByPk(job_no, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!job) {
            throw Object.assign(new Error("Job not found."), { statusCode: 404 });
        }

        // Lock: once bill_created is not "no", it cannot be changed
        if (job.bill_created !== "no") {
            throw Object.assign(
                new Error("Bill information is already set and cannot be changed."),
                { statusCode: 409 }
            );
        }

        const updateData = {
            bill_created,
            bill_created_at: new Date(),
            bill_created_by_id: req.user?.id || null,
        };

        if (bill_created === "yes") {
            updateData.bill_type = bill_type;
        } else {
            // complimentary: no bill type, auto-set payment status
            updateData.bill_type = null;
            updateData.payment_status = "Complimentary";
            // Edge case: job is already delivered — skip "delivered" and go to "completed"
            // Same logic that the delivery controllers apply when payment is already
            // settled at the time of delivery, just in the opposite order.
            if (job.status === "delivered") {
                updateData.status = "completed";
                updateData.current_stage = "completed";
                updateData.completed_at = new Date();
            }
        }

        await job.update(updateData, { transaction: t });

        await db.ActivityLog.create(
            {
                job_no,
                action: "bill_created",
                performed_by_id: req.user?.id || null,
                meta: {
                    bill_created,
                    bill_type: updateData.bill_type || null,
                },
            },
            { transaction: t }
        );

        await t.commit();

        const autoCompleted = updateData.status === "completed";

        return res.json({
            message:
                bill_created === "yes"
                ? `Bill created: ${bill_type}.`
                : autoCompleted
                ? "Job marked as complimentary and auto-completed (was already delivered)."
                : "Job marked as complimentary. Payment status set to Complimentary.",
            job_no,
            bill_created,
            bill_type: updateData.bill_type || null,
            auto_completed: autoCompleted,
        });

    }
    catch (error) {
        await t.rollback().catch(() => { });
        return respondToError(res, error, "Failed to create bill.");
    }
};



// ─────────────────────────────────────────────────────────────────────
//  PATCH /api/fms/accounts/:job_no/payment
//
//  Updates payment_status and optionally mode_of_payment.
//
//  Rules enforced at API level:
//    - Cannot set "Paid" if bill_created !== "yes"
//    - Complimentary jobs cannot have payment_status changed
//    - If marking "Paid" and job.status === "delivered" → auto-complete
// ─────────────────────────────────────────────────────────────────────
export const updatePaymentStatus = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        ensureAccountsRole(req);

        const { job_no } = req.params;
        const { payment_status, mode_of_payment } = req.body || {};

        if (!job_no) {
            throw Object.assign(new Error("Job number required."), { statusCode: 400 });
        }

        const VALID_PAYMENT_STATUSES = ["Paid", "Half Paid", "Un-paid"];
        if (!VALID_PAYMENT_STATUSES.includes(payment_status)) {
            throw Object.assign(
                new Error(`payment_status must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}.`),
                { statusCode: 400 }
            );
        }
        const job = await db.JobCard.findByPk(job_no, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!job) {
            throw Object.assign(new Error("Job not found."), { statusCode: 404 });
        }

        // Complimentary jobs are handled at billing time — cannot manually change
        if (job.bill_created === "complimentary") {
            throw Object.assign(
                new Error("Complimentary jobs cannot have their payment status changed manually."),
                { statusCode: 400 }
            );
        }

        // Cannot mark as Paid without a bill — enforced at API level
        if (payment_status === "Paid" && job.bill_created !== "yes") {
            throw Object.assign(
                new Error(
                    "Cannot mark as Paid: a bill has not been created for this job yet. Create a bill first."
                ),
                { statusCode: 400 }
            );
        }

        const updateData = { payment_status };
        if (mode_of_payment) updateData.mode_of_payment = mode_of_payment;

        // Auto-complete: Paid + already delivered → move to completed
        let autoCompleted = false;
        if (payment_status === "Paid" && job.status === "delivered") {
            updateData.status = "completed";
            updateData.current_stage = "completed";
            updateData.completed_at = new Date();
            autoCompleted = true;
        }

        await job.update(updateData, { transaction: t });

        await db.ActivityLog.create(
            {
                job_no,
                action: autoCompleted ? "job_auto_completed_on_payment" : "payment_status_updated",
                performed_by_id: req.user?.id || null,
                meta: {
                    payment_status,
                    mode_of_payment: mode_of_payment || null,
                    auto_completed: autoCompleted,
                    job_status_at_payment: job.status,
                },
            },
            { transaction: t }
        );

        await t.commit();

        return res.json({
            message: autoCompleted
                ? "Payment marked as Paid. Job auto-completed (was already delivered)."
                : `Payment status updated to ${payment_status}.`,
            job_no,
            payment_status,
            auto_completed: autoCompleted,
        });

    }
    catch (error) {
        await t.rollback().catch(() => { });
        return respondToError(res, error, "Failed to update payment status.");
    }
};