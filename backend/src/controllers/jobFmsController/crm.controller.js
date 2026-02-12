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
} from "../../email/templates/emailTemplates.js";

export const getAllJobsForCRM = async (req, res) => {
  console.log("Get All Jobs for CRM called by user:", req.user?.username);
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
  const t = await JobCard.sequelize.transaction();
  const { job_no } = req.params;

  if (!job_no) {
    return res.status(400).json({
      message: "Job number is required",
    });
  }

  try {
    const job = await JobCard.findOne({ where: { job_no } });
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    job.status = "awaiting_client_response";
    job.current_stage = "awaiting_client_response";
    await job.save({ transaction: t });

    // Track Stage
    await advanceStage({
      job_no,
      new_stage: "awaiting_client_response",
      performed_by_id: req.user?.id || null,
      started_at: new Date(),
      remarks: "( CRM ) Sent to client for approval",
      transaction: t,
    });

    const existingApproval = await ClientApproval.findOne({
      where: {
        job_no: job.job_no,
        status: "changes_requested",
      },
      order: [["instance", "DESC"]],
      transaction: t,
    });

    if (existingApproval) {
      await ClientApproval.create(
        {
          job_no: job.job_no,
          handled_by_id: req.user?.id || null,
          status: "pending",
          sent_at: new Date(),
          instance: existingApproval.instance + 1,
        },
        { transaction: t },
      );
    } else {
      await ClientApproval.create(
        {
          job_no: job.job_no,
          handled_by_id: req.user?.id || null,
          status: "pending",
          sent_at: new Date(),
        },
        { transaction: t },
      );
    }

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

    // Fetch Process Coordinators
    const coordinators = await User.findAll({
      where: { department: "Process Coordinator" },
    });

    const attachments = [
      {
        filename: "epo-logo.jpg",
        path: path.resolve("assets/epo-logo.jpg"),
        cid: "epo-logo",
      },
    ];

    if (coordinators.length > 0) {
      for (const coordinator of coordinators) {
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
        });
      }
    }
  } catch (error) {
    console.error("Error sending job to client:", error);
    await t.rollback();
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * ✅ PATCH - Client Approved
 */
export const approveJobByClient = async (req, res) => {
  const t = await JobCard.sequelize.transaction();
  const { job_no } = req.params;

  if (!job_no) {
    return res.status(400).json({
      message: "Job number is required",
    });
  }

  try {
    const job = await JobCard.findOne({ where: { job_no } });
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    job.status = "approved";
    job.current_stage = "approved";
    await job.save({ transaction: t });

    const [updatedCount] = await ClientApproval.update(
      {
        status: "approved",
        approved_at: new Date(),
      },
      {
        where: {
          job_no: job.job_no,
          // status: "pending",
        },
        transaction: t,
      },
    );

    if (updatedCount === 0) {
      console.log(
        "No pending Client Approval found for this job_no: ",
        job.job_no,
      );
    } else {
      console.log("ClientApproval updated successfully");
    }

    await advanceStage({
      job_no,
      new_stage: "approved",
      performed_by_id: req.user?.id || null,
      started_at: new Date(),
      remarks: "( CRM ) Client approved the job",
      transaction: t,
    });

    await ActivityLog.create(
      {
        job_no: job.job_no,
        action: "Client approved the job",
        performed_by_id: req.user?.id || null,
        meta: { action: "client_approved" },
      },
      { transaction: t },
    );

    await t.commit();

    res.json({ message: "Job approved successfully" });

    // 🔔 EMAIL NOTIFICATIONS
    try {
      // Fetch Process Coordinators
      const coordinators = await User.findAll({
        where: { department: "Process Coordinator" },
      });

      const designer = await User.findOne({
        where: {
          username: job.assigned_designer,
        },
      });

      const attachments = [
        {
          filename: "epo-logo.jpg",
          path: path.resolve("assets/epo-logo.jpg"),
          cid: "epo-logo",
        },
      ];

      const approvedAt = new Date().toLocaleString();
      const dashboardUrl = `${process.env.LEADS_URL}/jobs/${job.job_no}`;

      // Send to Process Coordinators
      for (const coordinator of coordinators) {
        await sendMailForFMS({
          to: coordinator.email,
          subject: `Client Approved - Job No ${job.job_no}`,
          html: clientApprovedTemplate({
            recipientName: coordinator.username,
            jobNo: job.job_no,
            clientName: job.client_name,
            crmName: job.order_handled_by,
            designerName: designer?.username,
            approvedAt,
            dashboardUrl,
          }),
          attachments,
        });
      }

      // Send to Assigned Designer
      if (designer) {
        await sendMailForFMS({
          to: designer.email,
          subject: `Client Approved - Job No ${job.job_no}`,
          html: clientApprovedTemplate({
            recipientName: designer.username,
            jobNo: job.job_no,
            clientName: job.client_name,
            crmName: job.order_handled_by,
            designerName: designer.username,
            approvedAt,
            dashboardUrl,
          }),
          attachments,
        });
      }
    } catch (emailError) {
      console.error("Error sending email notifications:", emailError);
    }
  } catch (error) {
    console.error("Error approving job:", error);
    await t.rollback();
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * 🔁 PATCH - Client Changes Requested
 */
export const clientChanges = async (req, res) => {
  console.log("Client Changes api called");
  const t = await JobCard.sequelize.transaction();
  const { job_no } = req.params;
  const { client_feedback } = req.body;

  if (!job_no) {
    return res.status(400).json({
      message: "Job number is required",
    });
  }

  if (!client_feedback?.trim()) {
    return res.status(400).json({
      message: "Client feedback is required",
    });
  }

  try {
    const job = await JobCard.findOne({ where: { job_no } });
    if (!job) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    const [updatedCount] = await ClientApproval.update(
      {
        status: "changes_requested",
        client_feedback: client_feedback,
      },
      {
        where: {
          job_no: job.job_no,
          status: "pending",
        },
        order: [["instance", "DESC"]],
      },
      { transaction: t },
    );

    if (updatedCount === 0) {
      console.log(
        "No pending Client Approval found for this job_no: ",
        job.job_no,
      );
    } else {
      console.log("ClientApproval updated to changes_requested successfully");
    }

    job.status = "client_changes";
    job.current_stage = "client_changes";
    await job.save({ transaction: t });

    const jobAssignmentsLatestEntry = await JobAssignment.findOne({
      where: {
        job_no: job.job_no,
      },
      order: [["instance", "DESC"]],
      transaction: t,
    });

    if (!jobAssignmentsLatestEntry) {
      throw new Error("Previous Job Assignment not found for the job");
    }

    await JobAssignment.create(
      {
        job_no: job.job_no,
        designer_id: jobAssignmentsLatestEntry.designer_id,
        assigned_by_id: jobAssignmentsLatestEntry.assigned_by_id,
        assigned_at: new Date(),
        status: "assigned",
        instance: jobAssignmentsLatestEntry.instance + 1,
        remarks: "Re-assigned due to client requested changes",
      },
      { transaction: t },
    );

    await advanceStage({
      job_no,
      new_stage: "client_changes",
      performed_by_id: req.user?.id || null,
      started_at: new Date(),
      remarks: "( CRM ) Client requested changes",
      transaction: t,
    });

    await ActivityLog.create(
      {
        job_no: job.job_no,
        action: "Client requested changes",
        performed_by_id: req.user?.id || null,
        meta: { client_feedback },
      },
      { transaction: t },
    );

    await t.commit();

    res.json({
      message: "Client changes recorded successfully",
    });

    // 🔔 EMAIL NOTIFICATIONS
    try {
      // Fetch Process Coordinators
      const coordinators = await User.findAll({
        where: { department: "Process Coordinator" },
      });

      const designer = await User.findOne({
        where: {
          username: job.assigned_designer,
        },
      });

      const attachments = [
        {
          filename: "epo-logo.jpg",
          path: path.resolve("assets/epo-logo.jpg"),
          cid: "epo-logo",
        },
      ];

      const dashboardUrl = `${process.env.LEADS_URL}/jobs/${job.job_no}`;
      if (coordinators.length > 0) {
        for (const coordinator of coordinators) {
          await sendMailForFMS({
            to: coordinator.email,
            subject: `Client Changes Requested - Job No ${job.job_no}`,
            html: clientChangesProcessTemplate({
              coordinatorName: coordinator.username,
              jobNo: job.job_no,
              clientName: job.client_name,
              crmName: job.order_handled_by,
              feedback: client_feedback,
              designerName: designer?.username,
              dashboardUrl,
            }),
            attachments,
          });
        }
      }

      // Assigned Designer (Redesign)
      if (designer) {
        await sendMailForFMS({
          to: designer.email,
          subject: `Redesign Required - Job No ${job.job_no}`,
          html: designerRedesignTemplate({
            designerName: designer.username,
            jobNo: job.job_no,
            clientName: job.client_name,
            feedback: client_feedback,
            dashboardUrl,
          }),
          attachments,
        });
      }
    } catch (emailError) {
      console.error("Error sending email notifications:", emailError);
    }
  } catch (error) {
    console.error("Error handling client changes:", error);
    await t.rollback();
    res.status(500).json({ message: "Internal server error" });
  }
};
