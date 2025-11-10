import models from "../../models/index.js";
import transporter from "../../email/transporter.js";
import { Sequelize } from "sequelize";
import { advanceStage } from "../../utils/jobFms/stageTracking.js";

const {
  JobCard,
  JobItem,
  FileAttachment,
  ClientApproval,
  JobAssignment,
  ProductionRecord,
  ActivityLog,
  ClientDetails,
  EnquiryForItems,
} = models;

/**
 * CREATE JOB CARD + JOB ITEMS (in a single transaction)
 */
export const createJobCard = async (req, res) => {
  console.log("createJobCard called...");
  const t = await JobCard.sequelize.transaction();
  try {
    const {
      client_type,
      order_source,
      client_name,
      order_type,
      address,
      contact_number,
      email_id,
      order_handled_by,
      execution_location,
      delivery_location, // ✅ fixed spelling
      delivery_address,
      delivery_date,
      proof_date,
      task_priority,
      instructions,
      unit_rate,
      total_amount,
      advance_payment,
      mode_of_payment,
      payment_status,
      order_received_by,
      no_of_files,
      job_items = [], // ✅ default empty array
    } = req.body;

    if (
      !client_type ||
      !order_source ||
      !client_name ||
      !order_type ||
      !order_handled_by ||
      !execution_location ||
      !delivery_location ||
      !delivery_date ||
      !proof_date ||
      !task_priority ||
      !total_amount ||
      !advance_payment ||
      !mode_of_payment ||
      !job_items ||
      !contact_number ||
      !payment_status
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    if (delivery_location === "Delivery Address") {
      if (!delivery_address) {
        return res.status(400).json({
          message: "Delivery Address is required.",
        });
      }
    }

    // ✅ 1. Create JobCard (auto-generates job_no via hook)
    const jobCard = await JobCard.create(
      {
        client_type,
        order_source,
        client_name,
        order_type,
        address,
        contact_number,
        email_id,
        order_handled_by,
        execution_location,
        delivery_location,
        delivery_address,
        delivery_date,
        proof_date,
        task_priority,
        instructions,
        unit_rate,
        total_amount,
        advance_payment,
        mode_of_payment,
        payment_status,
        order_received_by,
        no_of_files,
        stage_name: "created",
      },
      { transaction: t }
    );

    const job_no = jobCard.job_no;

    console.log("jobno:", job_no);

    // if job_items are provided, create them
    if (job_items && job_items.length > 0) {
      for (const item of job_items) {
        await JobItem.create(
          {
            ...item,
            job_no: jobCard.job_no,
          },
          { transaction: t }
        );
      }
    }

    // Log activity
    await ActivityLog.create(
      {
        job_no: job_no,
        action: "JobCard Created",
        performed_by_id: req.user?.id || null,
        meta: { job_no },
      },
      { transaction: t }
    );

    // 4. Create StageTracking entry
    await advanceStage({
      job_no,
      new_stage: "created",
      performed_by_id: req.user?.id || null,
      started_at: new Date(),
      remarks: "Job created successfully",
      transaction: t,
    });

    //  Commit transaction before sending email
    await t.commit();

    res.status(201).json({
      message: "JobCard created successfully",
      jobCard,
    });

    // Send Email to Client (if email_id exists)
    if (email_id) {
      const emailHTML = `
      <h2>Welcome to EPO – Order Confirmation & Contact Details</h2>

      <p>Hello <strong>${client_name}</strong>,</p>

      <p>Greetings from <strong>Eastern Panorama Offset!</strong></p>

      <p>We’re delighted to have you with us.<br/>
      Please find your order details below:</p>

      <ul>
        <li><strong>Job No:</strong> ${jobCard.job_no}</li>
        <li><strong>Assigned CRM:</strong> ${order_handled_by}</li>
        <li><strong>Order Value:</strong> ₹${total_amount || 0}</li>
        <li><strong>Order Specifications:</strong> ${instructions || "N/A"}</li>
      </ul>

      <p><em>(Please note: Our contact numbers are available from 10:00 AM to 6:00 PM.)</em></p>

      <hr/>

      <h3>Contact Matrix for Escalation</h3>

      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; font-size:14px;">
      <thead>
      <tr><th>Communication Level</th><th>Timelines</th><th>Contact Details</th></tr>
      </thead>
      <tbody>
      <tr>
      <td>1st Level of Communication</td>
      <td>Within 12 working hours</td>
      <td>
      Please contact your assigned CRMs:<br/>
      1. Fanny – Ph: 8259831001, Email: crm@easternpanorama.in<br/>
      2. Saphiiaibet – Ph: 8258947402, Email: crm2@easternpanorama.in
      </td>
      </tr>
      <tr>
      <td>2nd Level of Communication</td>
      <td>If no response from Level 1 within 24 working hours</td>
      <td>
      Ph: 8258947402, Email: ea@easternpanorama.in<br/>
      Ph: 8258934002, Email: ea2@easternpanorama.in<br/>
      Ph: 6909321443, Email: oa@easternpanorama.in
      </td>
      </tr>
      <tr>
      <td>3rd Level of Communication</td>
      <td>If no response from Level 2 within 24 working hours</td>
      <td>
      Email: harshjw@easternpanorama.in
      </td>
      </tr>
      </tbody>
      </table>

      <br/>
      <p>Warm regards,<br/>
      <strong>Team EPO</strong><br/>
      (Eastern Panorama Offset)</p>
      `;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email_id,
        subject: `Welcome to EPO - Order Confirmation | Job No: ${jobCard.job_no}`,
        html: emailHTML,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Order confirmation email sent to: ${email_id}`);
      } catch (err) {
        console.error("❌ Failed to send client email:", err.message);
      }
    }
  } catch (error) {
    console.error("❌ Error creating JobCard:", error);
    await t.rollback();
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * GET ALL JOB CARDS (with pagination & filters)
 */
export const getAllJobCards = async (req, res) => {
  console.log("getAllJobCards called...");
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) {
      whereClause.status = status;
    }

    const jobCards = await JobCard.findAndCountAll({
      where: whereClause,
      include: [
        { model: JobItem, as: "items" },
        { model: ClientApproval, as: "approval" },
        { model: ProductionRecord, as: "production" },
      ],
      limit: parseInt(limit),
      offset,
      order: [["created_at", "DESC"]],
    });

    res.json({
      total: jobCards.count,
      page: parseInt(page),
      limit: parseInt(limit),
      data: jobCards.rows,
    });
  } catch (error) {
    console.error("Error fetchig JobCards: ", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * GET SINGLE JOB CARD BY ID (with relations)
 */
export const getJobCardByJobNo = async (req, res) => {
  try {
    console.log("getJobCardByJobNo called...");
    const { job_no } = req.params;

    if (!job_no) {
      return res.status(400).json({
        message: "Job No is required",
      });
    }

    const jobCard = await JobCard.findByPk(job_no, {
      include: [
        { model: JobItem, as: "items" },
        { model: FileAttachment, as: "attachments" },
        { model: ClientApproval, as: "approval" },
        { model: ProductionRecord, as: "production" },
        { model: JobAssignment, as: "assignments" },
        { model: ActivityLog, as: "activities" },
      ],
    });

    if (!jobCard) {
      return res.status(404).json({
        message: "JobCard not found",
      });
    }

    return res.json(jobCard);
  } catch (error) {
    console.error("Error fetching JobCard:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * UPDATE JOB CARD
 */
export const updateJobCard = async (req, res) => {
  console.log("updateJobCard called...");
  const t = await JobCard.sequelize.transaction();
  try {
    const { job_no } = req.params;
    const { job_items = [], ...updates } = req.body;

    const jobCard = await JobCard.findByPk(job_no, {
      include: [{ model: JobItem, as: "items" }],
      transaction: t,
    });
    if (!jobCard) {
      await t.rollback();
      return res.status(404).json({
        message: "JobCard not found",
      });
    }

    await jobCard.update(updates, { transaction: t });

    // Handle JobItems changes
    const existingItems = jobCard.items.map((i) => i.id);

    const updatedItemIds = job_items.filter((i) => i.id).map((i) => i.id);

    // 1️ Delete items that are removed
    const itemsToDelete = existingItems.filter(
      (id) => !updatedItemIds.includes(id)
    );
    if (itemsToDelete.length > 0) {
      await JobItem.destroy({
        where: { id: itemsToDelete },
        transaction: t,
      });
    }

    // Update existing items
    for (const item of job_items) {
      if (item.id && existingItems.includes(item.id)) {
        await JobItem.update(item, { where: { id: item.id }, transaction: t });
      }
    }

    // Add new items
    const newItems = job_items.filter((i) => !i.id);
    if (newItems.length > 0) {
      const newItemData = newItems.map((i) => ({ ...i, job_no }));
      await JobItem.bulkCreate(newItemData, { transaction: t });
    }

    // Log activity
    await ActivityLog.create(
      {
        job_no,
        action: "JobCard Updated",
        performed_by_id: req.user?.id || null,
        meta: updates,
      },
      { transaction: t }
    );

    await t.commit();

    const updatedJobCard = await JobCard.findByPk(job_no, {
      include: [{ model: JobItem, as: "items" }],
    });

    res.json({
      message: "JobCard and items updated successfully",
      updatedJobCard,
    });
  } catch (error) {
    await t.rollback();
    console.error("Error updating JobCard:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * DELETE JOB CARD
 */
export const deleteJobCard = async (req, res) => {
  console.log("deleteJobCard called...");
  try {
    const { job_no } = req.params;

    if (!job_no) {
      return res.status(400).json({
        message: "Job number required",
      });
    }

    const jobCard = await JobCard.findByPk(job_no);
    if (!jobCard) {
      return res.status(404).json({
        message: "JobCard not found",
      });
    }

    await ActivityLog.create({
      job_no,
      action: "JobCard Deleted",
      performed_by_id: req.user?.id || null,
    });

    const clientDetails = await ClientDetails.findOne({
      where: {
        client_name: jobCard.client_name,
      },
    });

    await jobCard.destroy(); // Cascade deletes all JobItems

    if (clientDetails.total_jobs > 0) {
      clientDetails.total_jobs--;

      if (clientDetails.total_jobs <= 3) {
        clientDetails.client_relation = "NBD";
      }
    }
    await clientDetails.save();

    return res.json({
      message: "JobCard deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting JobCard:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * CANCEL JOB
 */

export const cancelJobCard = async (req, res) => {
  try {
    const { job_no } = req.params;
    if (!job_no) {
      return res.status(400).json({
        message: "Job number required",
      });
    }

    const job = await JobCard.findByPk(job_no);

    if (!job) {
      return res.status(400).json({
        message: "Job not found",
      });
    }

    job.current_stage = "cancelled";
    job.status = "cancelled";

    await job.save();

    return res.status(200).json({
      message: "Successfully cancelled the job",
    });
  } catch (error) {
    console.error("Error cancelling job: ", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getEnquiryForItems = async (req, res) => {
  console.log("getEnquiryForItems called...");
  const enquiryForItems = await EnquiryForItems.findAll({
    where: {},
  });
  return res.json(enquiryForItems);
};
