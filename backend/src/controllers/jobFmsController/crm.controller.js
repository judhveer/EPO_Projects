import { Op, where } from "sequelize";
import db from "../../models/index.js";
const { JobCard, JobAssignment, ActivityLog, User, ClientApproval } = db;
import { advanceStage } from "../../utils/jobFms/stageTracking.js";
import path from "path";
import { sendMailForFMS } from "../../email/sendMail.js";
import {
  processCoordinatorApprovalSentTemplate,
  clientApprovedTemplate,
  clientChangesProcessTemplate,
  designerRedesignTemplate,
  productionReadyTemplate,
} from "../../email/templates/emailTemplates.js";
import { sendProductionJobEmail } from "./jobCard.controller.js";

import { calculateMaxDesignDeadlineWithRule } from "./designer.controller.js";
import { rankDesignersForAssignment } from "../../services/jobFms/designerAllocation.service.js";

import { sendPushToUser, sendPushToDepartment } from "../../utils/pushNotification.js";

export const getAllJobsForCRM = async (req, res) => {
  try {
    const total = await JobCard.count({
      where: {
        status: ["sent_for_approval", "awaiting_client_response"],
        order_handled_by: req.user?.username,
      },
    });

    const jobCards = await JobCard.findAll({
      where: {
        status: ["sent_for_approval", "awaiting_client_response"],
        order_handled_by: req.user?.username,
      },
      // For items count
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
      include: [
        {
          model: ClientApproval,
          as: "clientApprovals",
          separate: true,
          limit: 1,
          order: [["instance", "DESC"]],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    if (!jobCards) {
      return res.status(404).json({
        total,
        message: "No jobs found for CRM",
      });
    }

    return res.status(200).json({
      total,
      data: jobCards,
    });
  } catch (error) {
    console.error("Error fetching jobs for CRM:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * 📤 PATCH - Sent to Client
 */
export const sendToClient = async (req, res) => {
  const { job_no } = req.params;

  if (!job_no) {
    return res.status(400).json({ message: "Job number is required" });
  }

  const t = await db.sequelize.transaction();
  try {
    const job = await JobCard.findOne({ where: { job_no }, transaction: t, lock: t.LOCK.UPDATE });
    if (!job) {
      await t.rollback();
      return res.status(404).json({ message: "Job not found" });
    }

    // Only a job the coordinator has already sent for approval can go to the client.
    // (Blocks double-click, cancelled / in-production / delivered jobs.)
    if (job.status !== "sent_for_approval") {
      await t.rollback();
      return res.status(409).json({
        message: `A job can be sent to the client only from "sent for approval" (current status: ${job.status}).`,
      });
    }

    job.status = "awaiting_client_response";
    job.current_stage = "awaiting_client_response";
    await job.save({ transaction: t });

    // Track Stage
    await advanceStage({
      job_no,
      new_stage: "awaiting_client_response",
      performed_by_id: req.user?.id || null,
      remarks: "( CRM ) Sent to client for approval",
      transaction: t,
    });

    const existingApproval = await ClientApproval.findOne({
      where: { job_no: job.job_no, status: "changes_requested" },
      order: [["instance", "DESC"]],
      transaction: t,
    });

    await ClientApproval.create(
      {
        job_no: job.job_no,
        handled_by_id: req.user?.id || null,
        status: "pending",
        sent_at: new Date(),
        ...(existingApproval ? { instance: existingApproval.instance + 1 } : {}),
      },
      { transaction: t },
    );

    await ActivityLog.create(
      {
        job_no: job.job_no,
        action: "Sent to client for approval",
        performed_by_id: req.user?.id || null,
        meta: { action: "sent_to_client" },
      },
      { transaction: t },
    );

    await t.commit();

    res.json({ message: "Job sent to client successfully" });

    // 🔔 Notifications (after the response; a failure here never affects the result)
    try {
      const coordinators = await User.findAll({
        where: { department: "Process Coordinator", isActive: true },
      });

      coordinators.forEach((coordinator) => {
        sendPushToUser(coordinator.id, {
          title: "Job Sent To Client",
          body: `CRM has sent Job #${job_no} · ${job.client_name} to the client for approval.`,
          icon: "/favicon.png",
          vibrate: [1000, 200, 1000, 200, 1000],
          requireInteraction: true,
          data: { url: "/job-fms/common", tag: `job-${job_no}` },
        }).catch(() => {
          console.warn(`Failed to send push notification to (${coordinator?.username}) for job ${job_no}.`);
        });
      });

      const attachments = [{ filename: "epo-logo.jpg", path: path.resolve("assets/epo-logo.jpg"), cid: "epo-logo" }];

      for (const coordinator of coordinators) {
        if (!coordinator.email) continue;
        await sendMailForFMS({
          to: coordinator.email,
          subject: `Client Approval Sent - Job No ${job.job_no}`,
          html: processCoordinatorApprovalSentTemplate({
            coordinatorName: coordinator.username,
            crmName: job.order_handled_by,
            jobNo: job.job_no,
            clientName: job.client_name,
            sentAt: new Date().toLocaleString(),
            dashboardUrl: `${process.env.LEADS_URL}/jobs/${job.job_no}`,
          }),
          attachments,
        }).catch((err) => console.error("Coordinator sentToClient email failed:", err.message));
      }
    } catch (notifyError) {
      console.error("Error sending sent-to-client notifications:", notifyError);
    }
  } catch (error) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error("Error sending job to client:", error);
    if (res.headersSent) return;
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * ✅ PATCH - Client Approved
 */
export const approveJobByClient = async (req, res) => {
  const { job_no } = req.params;

  if (!job_no) {
    return res.status(400).json({
      message: "Job number is required",
    });
  }
  const t = await db.sequelize.transaction();
  try {
    const job = await JobCard.findOne({ 
      where: { job_no }, 
      transaction: t, 
      lock: t.LOCK.UPDATE 
    });

    if (!job) {
      await t.rollback();
      return res.status(404).json({ message: "Job not found" });
    }

    // Only a job that was sent to the client can be approved by the client.
    // (Blocks double-click, cancelled / in-production / delivered jobs.)
    if (job.status !== "awaiting_client_response") {
      await t.rollback();
      return res.status(409).json({
        message: `Client approval can be recorded only while the job is awaiting client response (current status: ${job.status}).`,
      });
    }

    job.status = "ready_for_production";
    job.current_stage = "ready_for_production";
    await job.save({ transaction: t });

    // Only the latest pending approval — older rounds (changes_requested) stay as history.
    const approval = await ClientApproval.findOne({
      where: { 
        job_no: job.job_no, 
        status: "pending" 
      },
      order: [["instance", "DESC"]],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (approval) {
      await approval.update({ 
        status: "approved", 
        approved_at: new Date() 
      }, { transaction: t });
    } else {
      console.warn(`No pending ClientApproval found for job ${job.job_no}`);
    }

    await advanceStage({
      job_no,
      new_stage: "ready_for_production",
      performed_by_id: req.user?.id || null,
      remarks: "( CRM ) Client approved → Ready for Production",
      transaction: t,
    });

    await ActivityLog.create(
      {
        job_no: job.job_no,
        action: "Client approved the job",
        performed_by_id: req.user?.id || null,
        meta: { action: "client_approved", client_approval_id: approval?.id ?? null },
      },
      { transaction: t },
    );

    await t.commit();

    res.json({ message: "Job approved successfully" });

    // 🔔 NOTIFICATIONS (after the response; a failure here never affects the approval)
    try {
      // Fetch Process Coordinators
      const coordinators = await User.findAll({
        where: { 
          department: "Process Coordinator",
          isActive: true
        },
      });
      // Active designer only — an inactive / missing designer must not break the rest.
      const designer = job.assigned_designer
        ? await User.findOne({ 
          where: { 
            username: job.assigned_designer, 
            isActive: true 
          } }) : null;

      const body = `Job #${job_no} · ${job.client_name} has been approved by the client and is now ready for production.`;
      const pushOpts = (url) => ({
        title: "Job Approved By Client",
        body,
        icon: "/favicon.png",
        vibrate: [1000, 200, 1000, 200, 1000],
        requireInteraction: true,
        data: { url, tag: `job-${job_no}` },
      });


      // Push notification to Process Coordinators.
      coordinators.forEach((coordinator) => {
        sendPushToUser(coordinator.id, pushOpts("/job-fms/common")).catch(() => {
          console.warn(`Failed to send push notification to (${coordinator?.username}) for job ${job_no}.`);
        });
      });
      // Push notification to Designer.
      if (designer) {
        sendPushToUser(designer.id, pushOpts("/job-fms/common")).catch(() => {
          console.warn(`Failed to send push notification to (${designer.username}) for job ${job_no}.`);
        });
      }

      // Push notification to Production Coordinators.
      sendPushToDepartment("Production Coordinator", {
        ...pushOpts("/job-fms/production"),
        title: "Job Ready For Production",
      }).catch(() => {
        console.warn(`Failed to send push notification to Production Coordinator for job ${job_no}.`);
      });

      const attachments = [{ 
        filename: "epo-logo.jpg", 
        path: path.resolve("assets/epo-logo.jpg"), 
        cid: "epo-logo" 
      }];
      const approvedAt = new Date().toLocaleString();
      const dashboardUrl = `${process.env.LEADS_URL}/jobs/${job.job_no}`;

      // Send to Process Coordinators
      for (const coordinator of coordinators) {
        if (!coordinator.email) continue;
        await sendMailForFMS({
          to: coordinator.email,
          subject: `Client Approved - Job No ${job.job_no}`,
          html: clientApprovedTemplate({
            recipientName: coordinator.username, jobNo: job.job_no, clientName: job.client_name,
            crmName: job.order_handled_by, designerName: designer?.username, approvedAt, dashboardUrl,
          }),
          attachments,
        }).catch((e) => console.error(`Client-approved mail failed for ${coordinator.username}:`, e.message));
      }

      // Send to Assigned Designer
      if (designer?.email) {
        await sendMailForFMS({
          to: designer.email,
          subject: `Client Approved - Job No ${job.job_no}`,
          html: clientApprovedTemplate({
            recipientName: designer.username, jobNo: job.job_no, clientName: job.client_name,
            crmName: job.order_handled_by, designerName: designer.username, approvedAt, dashboardUrl,
          }),
          attachments,
        }).catch((e) => console.error(`Client-approved mail failed for ${designer.username}:`, e.message));
      }

      if (job.execution_location !== "Out-Bound") {
        await sendProductionJobEmail({ job_no: job.job_no, kind: "new" });
      }
      // Send to Production (PENDING)
    } catch (notifyError) {
      console.error("Error sending client-approval notifications:", notifyError);
    }
  } catch (error) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error("Error approving job:", error);
    if (res.headersSent) return;
    res.status(500).json({ message: "Internal server error" });
  }
};


// Picks who gets the redesign when the previous designer's account is inactive.
async function pickFallbackDesigner(transaction) {
  // Tier 1: present today (checked in, not on leave) → best-ranked
  try {
    const { ranked } = await rankDesignersForAssignment();
    if (ranked.length > 0) {
      const user = await User.findByPk(ranked[0].designer_id, {
        attributes: ["id", "username", "email"], transaction,
      });
      if (user) return { user, tier: "ranking" };
    }
  } catch (err) {
    console.warn("Fallback ranking failed, trying next tier:", err.message);
  }

  // Tier 2: any active designer with the fewest open jobs (even if not checked in)
  const activeDesigners = await User.findAll({
    where: { department: "Designer", isActive: true },
    attributes: ["id", "username", "email"],
    order: [["username", "ASC"]],
    transaction,
  });
  if (activeDesigners.length === 0) return null;

  const counts = await JobAssignment.findAll({
    attributes: ["designer_id", [db.sequelize.fn("COUNT", db.sequelize.col("id")), "open_count"]],
    where: { designer_id: { [Op.in]: activeDesigners.map((d) => d.id) }, status: { [Op.in]: ["assigned", "in_progress"] } },
    group: ["designer_id"],
    raw: true,
    transaction,
  });
  const openById = new Map(counts.map((c) => [c.designer_id, Number(c.open_count)]));
  const best = [...activeDesigners].sort(
    (a, b) => (openById.get(a.id) ?? 0) - (openById.get(b.id) ?? 0) || a.username.localeCompare(b.username),
  )[0];
  return { user: best, tier: "fewest_open_jobs" };
}

const fmtIST = (d) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date(d));

/**
 * 🔁 PATCH - Client Changes Requested
 */
export const clientChanges = async (req, res) => {
  const { job_no } = req.params;
  const feedback = typeof req.body?.client_feedback === "string" ? req.body.client_feedback.trim() : "";

  if (!job_no) {
    return res.status(400).json({ message: "Job number is required" });
  }

  if (!feedback) {
    return res.status(400).json({ message: "Client feedback is required" });
  }
  
  const t = await db.sequelize.transaction();
  try {
    // Lock order: assignments → job (same as designerStartTask / cancelJobCard)
    const assignments = await JobAssignment.findAll({
      where: { job_no },
      order: [["instance", "DESC"], ["id", "DESC"]],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const job = await JobCard.findOne({ where: { job_no }, transaction: t, lock: t.LOCK.UPDATE });
    if (!job) {
      await t.rollback();
      return res.status(404).json({ message: "Job not found" });
    }

    if (job.status !== "awaiting_client_response") {
      await t.rollback();
      return res.status(409).json({
        message: `Client changes can be recorded only while the job is awaiting client response (current status: ${job.status}).`,
      });
    }

    if (assignments.some((a) => ["assigned", "in_progress"].includes(a.status))) {
      await t.rollback();
      return res.status(409).json({ message: "This job still has an active designer assignment." });
    }

    // Latest NON-cancelled assignment (a transfer leaves a cancelled row with the same instance)
    const previous = assignments.find((a) => a.status !== "cancelled");
    if (!previous) {
      await t.rollback();
      return res.status(409).json({ message: "No previous designer assignment found for this job." });
    }

    // Who gets the redesign?
    let designer = await User.findByPk(previous.designer_id, {
      attributes: ["id", "username", "email", "isActive"], transaction: t,
    });
    const previousDesignerName = designer?.username ?? null;
    let fallbackTier = null;

    if (!designer || !designer.isActive) {
      const fallback = await pickFallbackDesigner(t);
      if (fallback) {
        designer = fallback.user;
        fallbackTier = fallback.tier;
      } else {
        fallbackTier = "none_available"; // keep previous designer, coordinators are told
      }
    }

    // Latest pending client approval → changes_requested
    const approval = await ClientApproval.findOne({
      where: { job_no, status: "pending" },
      order: [["instance", "DESC"]],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (approval) {
      await approval.update({ status: "changes_requested", client_feedback: feedback }, { transaction: t });
    } else {
      console.warn(`No pending ClientApproval for job ${job_no}`);
    }

    // Redesign estimate: 50% / +4h rule, capped at delivery.
    // Delivery already passed (or the rule fails) → the estimate is the delivery date itself,
    // so an estimate is ALWAYS set automatically.
    const assignedAt = new Date();
    const instance = (previous.instance || 1) + 1;
    const deliveryAt = job.delivery_date ? new Date(job.delivery_date) : null;
    const deliveryValid = !!deliveryAt && !Number.isNaN(deliveryAt.getTime());
    let estimated = null;
    let deadlineRule = null;
    if (deliveryValid) {
      if (deliveryAt <= assignedAt) {
        estimated = deliveryAt;
        deadlineRule = "delivery_already_passed";
      } else {
        const r = calculateMaxDesignDeadlineWithRule(job.delivery_date, job.createdAt, job.task_priority, instance, assignedAt);
        if (r?.deadline instanceof Date && !Number.isNaN(r.deadline.getTime())) {
          estimated = r.deadline;
          deadlineRule = r.rule;
        } else {
          estimated = deliveryAt;
          deadlineRule = "fallback_delivery_date";
        }
      }
    }

    const targetDesignerId = designer?.id ?? previous.designer_id;
    const reassignedToOther = targetDesignerId !== previous.designer_id;

    const newAssignment = await JobAssignment.create(
      {
        job_no,
        designer_id: targetDesignerId,
        assigned_by_id: req.user?.id ?? previous.assigned_by_id,
        assigned_at: assignedAt,
        status: "assigned",
        instance,
        estimated_completion_time: estimated,
        remarks: reassignedToOther
          ? "Re-assigned due to client requested changes (previous designer unavailable)"
          : "Re-assigned due to client requested changes",
      },
      { transaction: t },
    );

    job.status = "client_changes";
    job.current_stage = "client_changes";
    if (reassignedToOther && designer?.username) job.assigned_designer = designer.username;
    await job.save({ transaction: t });

    await advanceStage({
      job_no,
      new_stage: "client_changes",
      performed_by_id: req.user?.id || null,
      remarks: "( CRM ) Client requested changes",
      transaction: t,
    });

    await ActivityLog.create(
      {
        job_no,
        action: "Client requested changes",
        performed_by_id: req.user?.id || null,
        meta: {
          client_feedback: feedback,
          new_assignment_id: newAssignment.id,
          instance,
          previous_designer_id: previous.designer_id,
          designer_id: targetDesignerId,
          fallback: fallbackTier,
          estimated_completion_time: estimated,
          deadline_rule: deadlineRule,
        },
      },
      { transaction: t },
    );

    await t.commit();

    res.json({ message: "Client changes recorded successfully" });

    // ── Notifications (after commit; never affect the response) ───────────
    const push = (userId, title, body, url) =>
      sendPushToUser(userId, {
        title, body, icon: "/favicon.png", vibrate: [1000, 200, 1000, 200, 1000],
        requireInteraction: true, data: { url, tag: `job-${job_no}` },
      }).catch((err) => console.warn(`Push failed for user ${userId} on job ${job_no}:`, err.message));

    try {
      const coordinators = await User.findAll({
        where: { department: "Process Coordinator", isActive: true },
        attributes: ["id", "username", "email"],
      });

      let coordinatorNote = "The job has been reassigned for redesign/correction.";
      if (fallbackTier === "none_available") {
        coordinatorNote = `No active designer is available — the job is still with ${previousDesignerName ?? "the previous designer"}. Please reassign it manually.`;
      } else if (reassignedToOther) {
        coordinatorNote = `The previous designer${previousDesignerName ? ` (${previousDesignerName})` : ""} is inactive, so the job was reassigned to ${designer.username}.`;
      }
      coordinators.forEach((c) =>
        push(c.id, "Client Changes Requested", `Client has requested changes for Job #${job_no} · ${job.client_name}. ${coordinatorNote}`, "/job-fms/common"),
      );

      const redesignUser = designer && designer.isActive !== false ? designer : null;
      if (redesignUser) {
        push(
          redesignUser.id,
          "Job Reassigned for Redesign",
          `Client has requested changes for Job #${job_no} · ${job.client_name}. Please review the feedback and update the design.` +
            (estimated ? ` Estimated completion: ${fmtIST(estimated)}.` : ""),
          "/job-fms/designer",
        );
      }

      const attachments = [{ filename: "epo-logo.jpg", path: path.resolve("assets/epo-logo.jpg"), cid: "epo-logo" }];
      const dashboardUrl = `${process.env.LEADS_URL}/jobs/${job.job_no}`;

      for (const coordinator of coordinators) {
        if (!coordinator.email) continue;
        await sendMailForFMS({
          to: coordinator.email,
          subject: `Client Changes Requested - Job No ${job.job_no}`,
          html: clientChangesProcessTemplate({
            coordinatorName: coordinator.username, jobNo: job.job_no, clientName: job.client_name,
            crmName: job.order_handled_by, feedback, designerName: redesignUser?.username ?? previousDesignerName, dashboardUrl,
          }),
          attachments,
        }).catch((e) => console.error(`Client-changes mail failed for ${coordinator.username}:`, e.message));
      }

      if (redesignUser?.email) {
        await sendMailForFMS({
          to: redesignUser.email,
          subject: `Redesign Required - Job No ${job.job_no}`,
          html: designerRedesignTemplate({
            designerName: redesignUser.username, jobNo: job.job_no, clientName: job.client_name, feedback, dashboardUrl,
          }),
          attachments,
        }).catch((e) => console.error(`Redesign mail failed for ${redesignUser.username}:`, e.message));
      }
    } catch (notifyError) {
      console.error("Error sending client-changes notifications:", notifyError);
    }
  } catch (error) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error("Error handling client changes:", error);
    if (res.headersSent) return;
    res.status(500).json({ message: "Internal server error" });
  }
};
