// ══════════════════════════════════════════════════════════════════════
//  Designer Transfer Request Controller — READ endpoints
//
//  GET /api/fms/designers/available-designers
//  GET /api/fms/designers/transfer-requests/outgoing
//  GET /api/fms/designers/transfer-requests/incoming
//  GET /api/fms/designers/transfer-requests/badge-count
//
//  Mutation endpoints (create, cancel, accept, reject, dismiss)
//    POST   /api/fms/designers/transfer-requests
//    DELETE /api/fms/designers/transfer-requests/:request_id
//    PATCH  /api/fms/designers/transfer-requests/:request_id/accept
//    PATCH  /api/fms/designers/transfer-requests/:request_id/reject
//    PATCH  /api/fms/designers/transfer-requests/:request_id/dismiss
//    PATCH  /api/fms/designers/:job_no/cancel-requests-and-start

import { Op } from "sequelize";
import db from "../../models/index.js";
import { advanceStage } from "../../utils/jobFms/stageTracking.js";
import { sendPushToDepartment, sendPushToUser } from "../../utils/pushNotification.js";
import { autoPauseActiveJob } from "./designer.controller.js";

const { 
    DesignerTransferRequest, 
    User, 
    JobCard,  
    JobAssignment,
    JobDesignTime,
    ActivityLog,
} = db;

function respondToError(res, error, fallbackMsg) {
  const status = error.statusCode || 500;
  if (status >= 500) console.error(fallbackMsg, error);
  return res.status(status).json({ message: error.message || fallbackMsg });
}

// ─────────────────────────────────────────────────────────────────────
//  GET /api/fms/designers/available-designers
//  All active Designer-department users except the requester.
//  Used to populate the "Transfer to" dropdown on the job row.
// ─────────────────────────────────────────────────────────────────────
export const getAvailableDesigners = async (req, res) => {
    try{
        const designers = await User.findAll({
            where: {
                department: "Designer",
                isActive: true,
                id: { [Op.ne]: req.user.id },
            },
            attributes: ["id", "username", "email"],
            order: [["username", "ASC"]],
        });

        return res.json({
            data: designers
        });
    }
    catch(error){
        return respondToError(res, error, "Failed to fetch available designers.");
    }
}

// ─────────────────────────────────────────────────────────────────────
//  GET /api/fms/designers/transfer-requests/outgoing
//
//  All undismissed requests sent BY this designer —
//    • pending  : waiting for the recipient to respond
//    • accepted : outcome not yet dismissed, job already transferred
//    • rejected : outcome not yet dismissed, reason visible
//
//  Cancelled requests are never returned here because the cancel
//  operation (Step 3) sets dismissed_by_requester_at simultaneously,
//  so they fall outside this query the moment they're cancelled.
//
//  Order: pending first (still actionable), then by recency.
// ─────────────────────────────────────────────────────────────────────
export const getOutgoingRequests = async (req, res) => {
  try {
    const requests = await DesignerTransferRequest.findAll({
      where: {
        from_designer_id: req.user.id,
        dismissed_by_requester_at: null,
      },
      include: [
        {
          model: User,
          as: "toDesigner",
          attributes: ["id", "username"],
        },
        {
          model: JobCard,
          as: "jobCard",
          attributes: ["job_no", "client_name", "task_priority"],
        },
      ],
      order: [
        // Pending requests rise to the top — still need action
        [
          db.sequelize.literal(`CASE WHEN DesignerTransferRequest.status = 'pending' THEN 0 ELSE 1 END`),
          "ASC",
        ],
        ["created_at", "DESC"],
      ],
    });
    return res.json({ data: requests });
  }
    catch(error){
        return respondToError(res, error, "Failed to fetch outgoing transfer requests.");
    }
}

// ─────────────────────────────────────────────────────────────────────
//  GET /api/fms/designers/transfer-requests/incoming
//
//  All PENDING requests sent TO this designer.
//  Once they respond (accept or reject), the item no longer has
//  status = 'pending' so it vanishes from this query automatically —
//  no separate dismiss step needed for the recipient.
// ─────────────────────────────────────────────────────────────────────
export const getIncomingRequests = async (req, res) => {
    try{
        const requests = await DesignerTransferRequest.findAll({
            where: {
                to_designer_id: req.user.id,
                status: "pending",
            },
            include: [
                {
                    model: User,
                    as: "fromDesigner",
                    attributes: ["id", "username"],
                },{
                    model: JobCard,
                    as: "jobCard",
                    // Include enough for the recipient to make an informed decision
                    attributes: [
                        "job_no",
                        "client_name",
                        "task_priority",
                        "delivery_date",
                        "order_type",
                        "execution_location",
                    ],
                },
            ],
            order: [["created_at", "DESC"]],
        });

        return res.json({
            data: requests
        });
    }
    catch(error){
        return respondToError(res, error, "Failed to fetch incoming transfer requests.");
    }
}

// ─────────────────────────────────────────────────────────────────────
//  GET /api/fms/designers/transfer-requests/badge-count
//
//  Lightweight — only COUNT queries, no full rows.
//  Called on dashboard mount and after any transfer action to keep
//  the badge number current without refetching all jobs.
//
//  outgoing : undismissed requests I sent (pending + unread outcomes)
//  incoming : pending requests sent to me
//  total    : what the badge number shows (outgoing + incoming)
// ─────────────────────────────────────────────────────────────────────
export const getBadgeCount = async (req, res) => {
    try{
        const [outgoing, incoming] = await Promise.all([
            DesignerTransferRequest.count({
                where: {
                    from_designer_id: req.user.id,
                    dismissed_by_requester_at: null,
                }
            }),
            DesignerTransferRequest.count({
                where: {
                    to_designer_id: req.user.id,
                    status: "pending",
                },
            }),
        ]);

        return res.json({
            outgoing,
            incoming,
            total: outgoing + incoming,
        });
    }
    catch(error){
        return respondToError(res, error, "Failed to fetch badge count.");
    }
}


// ─────────────────────────────────────────────────────────────────────
//  MUTATION — POST /api/fms/designers/transfer-requests
//  Body: { job_no, to_designer_id, request_reason }
//
//  Guards:
//    - Assignment must be status='assigned' (not started)
//    - to_designer must be an active Designer-department user
//    - Max 2 requests ever per (job_no, from_designer_id, to_designer_id)
//      across all statuses — cancelled ones count toward the limit
// ─────────────────────────────────────────────────────────────────────
export const createTransferRequest = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const { job_no, to_designer_id, request_reason } = req.body || {};

        if(!job_no){
            throw Object.assign(
                new Error("job_no is required."), 
                { statusCode: 400 }
            );
        }

        if(!to_designer_id){
            throw Object.assign(
                new Error("to_designer_id is required."), 
                { statusCode: 400 }
            );
        }

        if(!request_reason){
            throw Object.assign(
                new Error("request_reason is required."), 
                { statusCode: 400 }
            );
        }

        if(to_designer_id === req.user.id){
            throw Object.assign(
                new Error("Cannot transfer a job to yourself."), 
                { statusCode: 400 }
            );
        }

        // ── Verify recipient ──────────────────────────────────────────────
        const toDesigner = await User.findOne({
            where: {
                id: to_designer_id,
                department: "Designer",
                isActive: true,
            },
            transaction: t,
        });

        if(!toDesigner){
            throw Object.assign(
                new Error("Target designer not found or is inactive."),
                { statusCode: 404 }
            );
        }

        // ── Verify the job has a transferable (not-started) assignment ─────
        // The assignment must belong to this designer and job must not have
        // been started. We verify via the JobCard's assigned_designer field
        // so a designer can't submit transfers for jobs that aren't theirs.
        const assignment = await JobAssignment.findOne({
            where: {
                job_no,
                status: "assigned",
            },
            include: [
                {
                    model: JobCard,
                    as: "jobCard",
                    where: {
                        assigned_designer: req.user.username,
                        status: { [Op.in]: ["assigned_to_designer", "client_changes"] },
                    },
                    attributes: ["job_no", "client_name"],
                },
            ],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!assignment){
            throw Object.assign(
                new Error("No transferable assignment found. The job may have already been started or is not assigned to you."),
                { statusCode: 404 }
            );
        }

        // ── 2-request cap — counts ALL statuses, not just pending ─────────
        const existingCount = await DesignerTransferRequest.count({
            where: {
                job_no,
                from_designer_id: req.user.id,
                to_designer_id,
            },
            transaction: t,
        });

        if(existingCount >= 2){
            throw Object.assign(
                new Error(`You have already sent 2 requests to ${toDesigner.username} for this job. No further requests are allowed to this designer.`),
                { statusCode: 409 }
            );
        }

        // ── Create ────────────────────────────────────────────────────────
        const transferRequest = await DesignerTransferRequest.create({
            job_no,
            assignment_id: assignment.id,
            from_designer_id: req.user.id,
            to_designer_id,
            request_reason: request_reason.trim(),
            status: "pending",
        }, { transaction: t });

        await ActivityLog.create({
            job_no,
            performed_by_id: req.user.id,
            action: "designer_transfer_requested",
            meta: {
                request_id: transferRequest.id,
                to_designer_id,
                to_designer_name: toDesigner.username,
                request_reason: request_reason.trim(),
            },
        }, { transaction: t });

        await t.commit();

        // ── Push to recipient (fire-and-forget) ───────────────────────────
        sendPushToUser(to_designer_id, {
            title: "New Job Transfer Request",
            body: `${req.user.username} wants to transfer Job #${job_no} (${assignment.jobCard?.client_name}) to you.`,
            icon: "/favicon.png",
            vibrate: [1000, 200, 1000, 200, 1000],
            requireInteraction: true,
            data: { url: "/job-fms/designer", tag: `transfer-in-${transferRequest.id}` },
        }).catch((err) => console.warn(`Push failed for transfer request to ${toDesigner.username}:`, err.message));

        // ── Push to process coordinators (fire-and-forget) ────────────────
        sendPushToDepartment("Process Coordinator", {
            title: "Job Transfer Requested",
            body: `${req.user.username} requested to transfer Job #${job_no} to ${toDesigner.username}.`,
            icon: "/favicon.png",
            vibrate: [1000, 200, 1000],
            requireInteraction: true,
            data: { url: "/job-fms/coordinator", tag: `transfer-${transferRequest.id}` },
        }).catch((err) =>
            console.warn(`Push failed for coordinator on transfer request:`, err.message)
        );

        return res.status(201).json({
            message: `Transfer request sent to ${toDesigner.username}.`,
            data: {
                id: transferRequest.id,
                job_no,
                to_designer_id,
                to_designer_name: toDesigner.username,
                status: "pending",
            },
        });
    }
    catch(error){
        await t.rollback().catch(() => {});
        respondToError(res, error, "Failed to create transfer request.");
    }
}

// ─────────────────────────────────────────────────────────────────────
//  MUTATION — DELETE /api/fms/designers/transfer-requests/:request_id
//  Designer A manually cancels a single pending request they sent.
//  Auto-dismisses simultaneously so it vanishes from their panel
//  immediately — no separate dismiss step needed after a self-cancel.
// ─────────────────────────────────────────────────────────────────────
export const cancelTransferRequest = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const { request_id } = req.params;

        const transferRequest = await DesignerTransferRequest.findOne({
            where: {
                id: request_id,
                from_designer_id: req.user.id,
                status: "pending",
            },
            include: [
                {
                    model: User,
                    as: "toDesigner",
                    attributes: ["id", "username"],
                }
            ],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!transferRequest){
            throw Object.assign(
                new Error("Request not found or already resolved. Only your own pending requests can be cancelled."),
                { statusCode: 404 }
            );
        }

        const now = new Date();
        await transferRequest.update({
            status: "cancelled",
            // Auto-dismiss: a self-cancelled request has no useful notification
            // for Designer A — they initiated the cancel, they already know.
            dismissed_by_requester_at: now,
        }, { transaction: t} );

        await ActivityLog.create({
            job_no: transferRequest.job_no,
            performed_by_id: req.user.id,
            action: "designer_transfer_cancelled",
            meta: {
                request_id,
                to_designer_id: transferRequest.to_designer_id,
                to_designer_name: transferRequest.toDesigner?.username,
            },
        },{ transaction: t });

        await t.commit();

        // Notify recipient that the request was withdrawn
        if (transferRequest.toDesigner?.id) {
            sendPushToUser(transferRequest.toDesigner.id, {
                title: "Transfer Request Withdrawn",
                body: `${req.user.username} cancelled their transfer request for Job #${transferRequest.job_no}.`,
                icon: "/favicon.png",
                vibrate: [500, 100, 500],
                data: {
                    url: "/job-fms/designer",
                    tag: `transfer-cancel-${request_id}`,
                },
            }).catch((err) =>
                console.warn(`Push failed for cancelled transfer notification:`, err.message)
            );
        }

        return res.json({ 
            message: "Transfer request cancelled." 
        });
    }
    catch(error){
        await t.rollback().catch(() => {});
        respondToError(res, error, "Failed to cancel transfer request.");
    }
}

// ─────────────────────────────────────────────────────────────────────
//  MUTATION — PATCH /api/fms/designers/:job_no/cancel-requests-and-start
//  Called when Designer A clicks Start but has pending requests, confirms the "cancel and start?" popup.
//  Atomically:
//    1. Bulk-cancels + auto-dismisses ALL pending requests for this job
//    2. Starts the job (same DB operations as designerStartTask)
//
//  Push notifications fire post-commit (fire-and-forget):
//    - Each cancelled request's recipient: "request withdrawn"
//    - Coordinators + CRM: "designer started" (same as normal start)
//  Note: emails are deliberately not sent here (push is the primary real-time channel). The normal /start path handles emails for the standard flow.
export const cancelRequestsAndStart = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const { job_no } = req.params;
        // ── Fetch all pending requests to cancel ──────────────────────────
        // Fetch before the bulk update so we have the recipient IDs for
        // post-commit push notifications.
        const pendingRequests = await DesignerTransferRequest.findAll({
            where: {
                job_no,
                from_designer_id: req.user.id,
                status: "pending",
            },
            include: [{
                model: User,
                as: "toDesigner",
                attributes: ["id", "username"],
            }],
            transaction: t,
        });

        if(pendingRequests.length === 0){
            throw Object.assign(
                new Error("No pending transfer requests found for this job. Use the normal start endpoint."),
                { statusCode: 400 }
            );
        }

        // ── Find the assignment to start ──────────────────────────────────
        const assignment = await JobAssignment.findOne({
            where: {
                job_no,
                status: "assigned",
            },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!assignment){
            throw Object.assign(
                new Error("No assignment found to start."), 
                { statusCode: 404 }
            );
        }

        if(!assignment.estimated_completion_time){
            throw Object.assign(
                new Error("Please set estimated completion time before starting."),
                { statusCode: 400 }
            );
        }

        // ── Bulk-cancel + auto-dismiss all pending requests ───────────────
        await DesignerTransferRequest.update({
            status: "cancelled",
            dismissed_by_requester_at: new Date(),
        }, {
            where: {
                job_no,
                from_designer_id: req.user.id,
                status: "pending",
            },
            transaction: t,
        });

        // ── Auto-pause any currently running job for this designer ─────────
        const autoPausedJobNo = await autoPauseActiveJob(req.user.username, job_no, t);

        // ── Start this job ────────────────────────────────────────────────
        const startTime = new Date();
        assignment.status = "in_progress";
        assignment.designer_start_time = startTime;
        assignment.is_paused = false;
        await assignment.save({ transaction: t });

        await JobDesignTime.create({
            assignment_id: assignment.id,
            start_time: startTime,
        }, { transaction: t } );

        const job = await JobCard.findByPk(job_no, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!job){
            throw new Error("Job not found.");
        }

        job.status = "design_in_progress";
        job.current_stage = "design_in_progress";
        await job.save({ transaction: t });

        await advanceStage({
            job_no,
            new_stage: "design_in_progress",
            performed_by_id: req.user.id,
            remarks: "(Designer) Task started after cancelling transfer requests",
            transaction: t,
        });

        await ActivityLog.create({
            job_no,
            performed_by_id: req.user.id,
            action: "designer_start_after_cancel_requests",
            meta: {
                cancelled_request_count: pendingRequests.length,
                auto_paused_job: autoPausedJobNo,
            },
        }, { transaction: t } );

        await t.commit();

        // ── Post-commit: push to each cancelled request recipient ──────────
        pendingRequests.forEach((transfer) => {
            if (!transfer.toDesigner?.id) return;
            sendPushToUser(transfer.toDesigner.id, {
                title: "Transfer Request Withdrawn",
                body: `${req.user.username} has started Job #${job_no} and cancelled their transfer request.`,
                icon: "/favicon.png",
                vibrate: [500, 100, 500],
                data: {
                    url: "/job-fms/designer",
                    tag: `transfer-cancel-${transfer.id}`,
                },
            }).catch((err) => console.warn(`Push failed for cancelled request to ${transfer.toDesigner.username}:`, err.message));
        });

        // ── Post-commit: same "started" push as designerStartTask ─────────
        const [crmUser, coordinators] = await Promise.all([
            User.findOne({ where: { username: job.order_handled_by } }),
            User.findAll({ where: { department: "Process Coordinator", isActive: true } }),
        ]);

        coordinators.forEach((c) => {
            sendPushToUser(c.id, {
                title: "Designer Started Work",
                body: `Designer has started working on Job #${job_no}.`,
                icon: "/favicon.png",
                vibrate: [1000, 200, 1000, 200, 1000],
                requireInteraction: true,
                data: { url: "/job-fms/coordinator", tag: `job-${job_no}` },
            }).catch((err) =>
                console.warn(`Push failed for coordinator on job ${job_no}:`, err.message)
            );
        });

        if (crmUser?.id) {
            sendPushToUser(crmUser.id, {
                title: "Designer Started Work",
                body: `Designer has started working on Job #${job_no}.`,
                icon: "/favicon.png",
                vibrate: [1000, 200, 1000, 200, 1000],
                requireInteraction: true,
                data: { url: "/job-fms/common", tag: `job-${job_no}` },
            }).catch((err) =>
                console.warn(`Push failed for CRM on job ${job_no}:`, err.message)
            );
        }

        return res.json({
            message: "Transfer requests cancelled and task started.",
            auto_paused_job_no: autoPausedJobNo,
            cancelled_count: pendingRequests.length,
        });

    }
    catch(error){
        t.rollback().catch(() => {});
        return respondToError(res, error, "Failed to cancel requests and start.");
    }
}

// ─────────────────────────────────────────────────────────────────────
//  MUTATION — PATCH /api/fms/designers/transfer-requests/:request_id/accept
//
//  Designer B/C accepts a pending transfer request.
//
//  Atomically:
//    1. Marks this request as 'accepted'
//    2. Cancels + auto-dismisses all OTHER pending requests Designer A
//       sent for this job (they're no longer needed)
//    3. Cancels the original assignment
//    4. Creates a new 'assigned' assignment for the acceptor
//    5. Updates JobCard.assigned_designer to acceptor's username
//
//  The accepted request itself is NOT dismissed — Designer A needs to
//  see "✅ accepted by [name]" so they know why the job disappeared.
//  They dismiss it manually via the /dismiss endpoint.
export const acceptTransferRequest = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const { request_id } = req.params;

        const transferRequest = await DesignerTransferRequest.findOne({
            where: {
                id: request_id,
                to_designer_id: req.user.id,
                status: "pending",
            },
            include: [{
                model: User,
                as: "fromDesigner",
                attributes: ["id", "username"],
            }],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!transferRequest){
            throw Object.assign(
                new Error("Request not found or no longer pending."),
                { statusCode: 404 }
            );
        }

        // ── Verify original assignment is still in a transferable state ────
        const originalAssignment = await JobAssignment.findOne({
            where: {
                id: transferRequest.assignment_id,
                status: "assigned",
            },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!originalAssignment){
            throw Object.assign(
                new Error("This job is no longer transferable. It may have been started or already transferred." ),
                { statusCode: 409 }
            );
        }

        const job = await JobCard.findByPk(transferRequest.job_no, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!job){
            throw Object.assign(
                new Error("Job not found."), 
                { statusCode: 404 }
            );
        }

        if (!["assigned_to_designer", "client_changes"].includes(job.status)){
            throw Object.assign(
                new Error(`Cannot accept transfer: job is in status "${job.status}".`),
                { statusCode: 409 }
            );
        }

        // ── Mark this request as accepted ─────────────────────────────────
        await transferRequest.update({ status: "accepted"}, { transaction: t });

        // ── Fetch other pending requests from Designer A for this job ──────
        // Need before the bulk update for post-commit push notifications.
        const otherPendingRequests = await DesignerTransferRequest.findAll({
            where: {
                job_no: transferRequest.job_no,
                from_designer_id: transferRequest.from_designer_id,
                status: "pending",
                id: { [Op.ne]: request_id },
            },
            transaction: t
        });

        // ── Cancel + auto-dismiss all other pending requests ───────────────
        if(otherPendingRequests.length > 0){
            await DesignerTransferRequest.update({
                status: "cancelled",
                dismissed_by_requester_at: new Date(),
            },{
                where: {
                    job_no: transferRequest.job_no,
                    from_designer_id: transferRequest.from_designer_id,
                    status: "pending",
                    id: { [Op.ne]: request_id },
                },
                transaction: t,
            });
        }

        // ── Cancel original assignment ─────────────────────────────────────
        await originalAssignment.update({ status: "cancelled" }, { transaction: t} );

        // ── Create new assignment for the accepting designer ───────────────
        // instance stays the same — this is a handover, not a redesign round.
        // assigned_by_id = from_designer_id to track who transferred the job.
        // estimated_completion_time = null — accepting designer sets their own.
        const newAssignment = await JobAssignment.create({
            job_no: transferRequest.job_no,
            designer_id: req.user.id,
            assigned_by_id: transferRequest.from_designer_id,
            instance: originalAssignment.instance,
            status: "assigned",
            is_paused: false,
            designer_duration_seconds: 0,
            remarks: `Transferred from ${transferRequest.fromDesigner?.username || "previous designer"}`,
        }, { transaction: t } );

        // ── Update JobCard.assigned_designer ──────────────────────────────
        await job.update({
            assigned_designer: req.user.username,
        }, { transaction: t } );

        await ActivityLog.create({
            job_no: transferRequest.job_no,
            performed_by_id: req.user.id,
            action: "designer_transfer_accepted",
            meta: {
                request_id,
                from_designer_id: transferRequest.from_designer_id,
                from_designer_name: transferRequest.fromDesigner?.username,
                new_assignment_id: newAssignment.id,
                cancelled_other_requests: otherPendingRequests.length,
            },
        },{ transaction: t } );

        await t.commit();

        // ── Post-commit: notify Designer A their request was accepted ──────
        sendPushToUser(transferRequest.from_designer_id, {
            title: "Transfer Request Accepted ✅",
            body: `${req.user.username} accepted Job #${transferRequest.job_no}. It has been transferred.`,
            icon: "/favicon.png",
            vibrate: [1000, 200, 1000],
            requireInteraction: true,
            data: {
                url: "/job-fms/designer",
                tag: `transfer-accepted-${request_id}`,
            },
        }).catch((err) =>
            console.warn(`Push failed for acceptance notification to Designer A:`, err.message)
        );

        // ── Post-commit: notify other designers their requests were voided ─
        otherPendingRequests.forEach((other) => {
            sendPushToUser(other.to_designer_id, {
                title: "Transfer Request Withdrawn",
                body: `Job #${transferRequest.job_no} has been accepted by another designer.`,
                icon: "/favicon.png",
                vibrate: [500, 100, 500],
                data: {
                    url: "/job-fms/designer",
                    tag: `transfer-cancel-${other.id}`,
                },
            }).catch((err) =>
                console.warn(`Push failed for auto-cancelled request notification:`, err.message)
            );
        });

        // ── Post-commit: notify process coordinators ───────────────────────
        await sendPushToDepartment("Process Coordinator", {
            title: "Job Transferred",
            body: `Job #${transferRequest.job_no} transferred from ${transferRequest.fromDesigner?.username} to ${req.user.username}.`,
            icon: "/favicon.png",
            vibrate: [1000, 200, 1000],
            requireInteraction: true,
            data: { url: "/job-fms/coordinator", tag: `transfer-${request_id}` },
        }).catch((err) =>
            console.warn(`Push failed for coordinator on transfer acceptance:`, err.message)
        );

        return res.json({
            message: `Transfer accepted. Job #${transferRequest.job_no} is now assigned to you.`,
            new_assignment_id: newAssignment.id,
        });
    }
    catch(error){
        await t.rollback().catch(() => {});
        return respondToError(res, error, "Failed to accept transfer request.");
    }

}


// ─────────────────────────────────────────────────────────────────────
//  MUTATION — PATCH /api/fms/designers/transfer-requests/:request_id/reject
//  Body: { rejection_reason }
//
//  The request status moves to 'rejected'. It stays visible in Designer
//  A's panel (dismissed_by_requester_at stays null) so they can read the reason. They manually dismiss it when done.
export const rejectTransferRequest = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const { request_id } = req.params;
        const { rejection_reason } = req.body || {};

        if(!rejection_reason.trim()){
            throw Object.assign(
                new Error("rejection_reason is required."),
                { statusCode: 400 }
            );
        }

        const transferRequest = await DesignerTransferRequest.findOne({
            where: {
                id: request_id,
                to_designer_id: req.user.id,
                status: "pending",
            },
            include: [{
                model: User,
                as: "fromDesigner",
                attributes: ["id", "username"],
            }],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!transferRequest){
            throw Object.assign(
                new Error("Request not found or no longer pending."),
                { statusCode: 404 }
            );
        }

        await transferRequest.update({
            status: "rejected",
            rejection_reason: rejection_reason.trim(),
        }, { transaction: t } );

        await ActivityLog.create({
            job_no: transferRequest.job_no,
            performed_by_id: req.user.id,
            action: "designer_transfer_rejected",
            meta: {
                request_id,
                from_designer_id: transferRequest.from_designer_id,
                from_designer_name: transferRequest.fromDesigner?.username,
                rejection_reason: rejection_reason.trim(),
            },
        },{ transaction: t } );

        await t.commit();

        // Notify Designer A of the rejection with the reason
        sendPushToUser(transferRequest.from_designer_id, {
            title: "Transfer Request Rejected ❌",
            body: `${req.user.username} rejected Job #${transferRequest.job_no}: "${rejection_reason.trim()}"`,
            icon: "/favicon.png",
            vibrate: [1000, 200, 1000],
            requireInteraction: true,
            data: {
                url: "/job-fms/designer",
                tag: `transfer-rejected-${request_id}`,
            },
        }).catch((err) =>
            console.warn(`Push failed for rejection notification to Designer A:`, err.message)
        );

        return res.json({
            message: "Transfer request rejected.",
        });
    }
    catch(error){
        await t.rollback().catch(() => {});
        respondToError(res, error, "Failed to reject transfer request.");
    }
}


// ─────────────────────────────────────────────────────────────────────
//  MUTATION — PATCH /api/fms/designers/transfer-requests/:request_id/dismiss
//
//  Designer A dismisses a resolved (accepted/rejected) notification
//  from their outgoing panel. Sets dismissed_by_requester_at.
//  Only accepted/rejected can be dismissed — pending requests must be cancelled first, which auto-dismisses them.
export const dismissTransferNotification = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const { request_id } = req.params;

        const transferRequest = await DesignerTransferRequest.findOne({
            where: {
                id: request_id,
                from_designer_id: req.user.id,
                // Only resolved outcomes can be dismissed manually.
                // Pending requests need to be cancelled, which auto-dismisses.
                status: { [Op.in]: ["accepted", "rejected"] },
                dismissed_by_requester_at: null,
            },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!transferRequest){
            throw Object.assign(
                new Error("Notification not found or already dismissed. Only resolved (accepted/rejected) notifications can be dismissed."),
                { statusCode: 404 }
            );
        }

        await transferRequest.update({
            dismissed_by_requester_at: new Date()
        }, { transaction: t });

        await t.commit();
        return res.json({ 
            message: "Notification dismissed." 
        });
    }
    catch(error){
        await t.rollback().catch(() => {});
        respondToError(res, error, "Failed to dismiss notification.");
    }

}