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
  User,
  ItemMaster,
  PaperMaster,
} = models;

// ✅ Helper: Safe email sender
async function sendMailSafe({ to, subject, html }) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      html,
    });
    console.log(`📧 Email sent successfully to ${to}`);
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err.message);
  }
}

/**
 * CREATE JOB CARD + JOB ITEMS (in a single transaction)
 */
export const createJobCard = async (req, res) => {
  console.log("createJobCard called...");
  const t = await JobCard.sequelize.transaction();
  try {
    console.log("req.body: ", req.body);
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

    console.log("job_items.length: ", job_items.length);

    if (!job_items || job_items.length === 0) {
      return res.status(400).json({
        message: "You have to entered at least one job item.",
      });
    }

    if(Number(no_of_files) !== job_items.length){
      return res.status(400).json({
        message: "No of files should be same as job items.",
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
        email_id: email_id === "" ? null : email_id,
        order_handled_by,
        execution_location,
        delivery_location,
        delivery_address,
        delivery_date,
        proof_date,
        task_priority,
        instructions,
        total_amount: Number(total_amount),
        advance_payment,
        mode_of_payment,
        payment_status,
        order_received_by,
        no_of_files: Number(no_of_files),
        status: "coordinator_review",
        stage_name: "coordinator_review",
      },
      { transaction: t }
    );

    const job_no = jobCard.job_no;

    // if job_items are provided, create them
    if (job_items && job_items.length > 0) {
      for (const item of job_items) {

        const item_master_id = await ItemMaster.findOne({
          where: {
            category: item.category,
            item_name: item.enquiry_for
          },
          attributes: ['id']
        });

        item.item_master_id = item_master_id.dataValues.id;

        const selected_paper_id = await PaperMaster.findOne({
          where: {
            paper_name: item.paper_type,
            gsm: Number(item.paper_gsm),
            size_name: item.best_inside_sheet
          },
          attributes: ['id']
        });
        item.selected_paper_id = selected_paper_id.dataValues.id;

        if (item.category !== "Multiple Sheet") {
          item.cover_paper_type = null;
          item.cover_paper_gsm = null;
          item.cover_color_scheme = null;
        }
        else{
          const selected_cover_paper_id = await PaperMaster.findOne({
            where: {
              paper_name: item.cover_paper_type,
              gsm: Number(item.cover_paper_gsm),
              size_name: item.best_cover_sheet
            },
            attributes: ['id']
          });
          item.selected_cover_paper_id = selected_cover_paper_id.dataValues.id;
        }
        await JobItem.create(
          {
            job_no: jobCard.job_no,
            ...item,
            binding_types: Array.isArray(item.binding_types)
              ? item.binding_types
              : [],
            inside_pages: item.inside_pages ? Number(item.inside_pages) : null,
            cover_pages: item.cover_pages ? Number(item.cover_pages) : null,
          
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
      new_stage: "coordinator_review",
      performed_by_id: req.user?.id || null,
      started_at: new Date(),
      remarks: "Job sent for coordinator review",
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

      await sendMailSafe({
        to: email_id,
        subject: `Welcome to EPO - Order Confirmation | Job No: ${jobCard.job_no}`,
        html: emailHTML,
      })

      // const mailOptions = {
      //   from: process.env.EMAIL_USER,
      //   to: email_id,
      //   subject: `Welcome to EPO - Order Confirmation | Job No: ${jobCard.job_no}`,
      //   html: emailHTML,
      // };

      // try {
      //   await transporter.sendMail(mailOptions);
      //   console.log(`✅ Order confirmation email sent to: ${email_id}`);
      // } catch (err) {
      //   console.error("❌ Failed to send client email:", err.message);
      // }
    }

    // 2️⃣ Notify the assigned CRM
    const crmUser = await User.findOne({
      where: { username: order_handled_by, department: "CRM" },
    });

    if (crmUser?.email) {
      const crmEmailHTML = `
      <div style="font-family:Arial, sans-serif; color:#333;">
        <h2 style="color:#0a4da2;">📋 New Job Assigned to You</h2>
        <p>Hello <strong>${crmUser.username}</strong>,</p>
        <p>A new JobCard has been assigned under your responsibility.</p>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:14px;">
          <tr><th align="left">Job No</th><td>${job_no}</td></tr>
          <tr><th align="left">Client</th><td>${client_name}</td></tr>
          <tr><th align="left">Order Type</th><td>${order_type}</td></tr>
          <tr><th align="left">Order Source</th><td>${order_source}</td></tr>
          <tr><th align="left">Execution Location</th><td>${execution_location}</td></tr>
          <tr><th align="left">Delivery Date</th><td>${new Date(
            delivery_date
          ).toLocaleString()}</td></tr>
          <tr><th align="left">Priority</th><td>${task_priority}</td></tr>
          <tr><th align="left">Total Amount</th><td>₹${total_amount}</td></tr>
        </table>
        <br/>
        <p style="color:#555;">Please log into the EPO FMS dashboard to review the details and coordinate with the Process Coordinator.</p>
        <hr style="border:none; border-top:1px solid #ccc; margin:20px 0;" />
        <p style="font-size:13px; color:#888;">-- Automated Notification | Eastern Panorama Offset</p>
      </div>
      `;

      await sendMailSafe({
        to: crmUser.email,
        subject: `New Job Assigned | Job No: ${job_no}`,
        html: crmEmailHTML,
      });
    }

    // 3️⃣ Notify all Process Coordinators
    const coordinators = await User.findAll({
      where: { department: "Process Coordinator" },
    });

    const coordinatorEmails = coordinators.map((u) => u.email).filter(Boolean);

    if (coordinatorEmails.length > 0) {
      const coordinatorEmailHTML = `
      <div style="font-family:Arial, sans-serif; color:#333;">
        <h2 style="color:#0a4da2;">🆕 New JobCard Created - Review Required</h2>
        <p>Hello Process Coordinator Team,</p>
        <p>A new job card has been created and requires your review in the FMS dashboard.</p>

        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:14px;">
          <tr><th align="left">Job No</th><td>${job_no}</td></tr>
          <tr><th align="left">Client</th><td>${client_name}</td></tr>
          <tr><th align="left">Order Type</th><td>${order_type}</td></tr>
          <tr><th align="left">Order Handled By (CRM)</th><td>${order_handled_by}</td></tr>
          <tr><th align="left">Execution Location</th><td>${execution_location}</td></tr>
          <tr><th align="left">Delivery Date</th><td>${new Date(
            delivery_date
          ).toLocaleString()}</td></tr>
          <tr><th align="left">Priority</th><td>${task_priority}</td></tr>
          <tr><th align="left">Total Amount</th><td>₹${total_amount}</td></tr>
        </table>

        <br/>
        <p style="color:#555;">Please log into the EPO FMS dashboard to start the coordination and approval process.</p>

        <hr style="border:none; border-top:1px solid #ccc; margin:20px 0;" />
        <p style="font-size:13px; color:#888;">-- Automated Notification | Eastern Panorama Offset</p>
      </div>
      `;

      await sendMailSafe({
        to: coordinatorEmails.join(","),
        subject: `New JobCard - Coordinator Review | Job No: ${job_no}`,
        html: coordinatorEmailHTML,
      });
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
        { 
          model: JobItem, 
          as: "items",
          include: [
            { model: PaperMaster, as: "selectedPaper" },   // <-- important
            { model: PaperMaster, as: "selectedCoverPaper" },  
            { model: ItemMaster, as: "itemMaster" }
          ]
        },
        { model: ClientApproval, as: "approval" },
        { model: ProductionRecord, as: "production" },
        { model: JobAssignment, as: "assignments" },
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
        { model: JobItem, 
          as: "items",
          include: [
            { model: PaperMaster, as: "selectedPaper" },   // <-- important
            { model: PaperMaster, as: "selectedCoverPaper" },  
            { model: ItemMaster, as: "itemMaster" }
          ] 
        },
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
  console.log("req.body: ", req.body);
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


        const item_master_id = await ItemMaster.findOne({
          where: {
            category: item.category,
            item_name: item.enquiry_for
          },
          attributes: ['id']
        });

        item.item_master_id = item_master_id.dataValues.id;

        const selected_paper_id = await PaperMaster.findOne({
          where: {
            paper_name: item.paper_type,
            gsm: Number(item.paper_gsm),
            size_name: item.best_inside_sheet
          },
          attributes: ['id']
        });
        item.selected_paper_id = selected_paper_id.dataValues.id;

        // CLEAN FIELDS LIKE CREATE API
        if (item.category !== "Multiple Sheet") {
          item.cover_paper_type = null;
          item.cover_paper_gsm = null;
          item.cover_color_scheme = null;
        }
        else{
          const selected_cover_paper_id = await PaperMaster.findOne({
            where: {
              paper_name: item.cover_paper_type,
              gsm: Number(item.cover_paper_gsm),
              size_name: item.best_cover_sheet
            },
            attributes: ['id']
          });
          item.selected_cover_paper_id = selected_cover_paper_id.dataValues.id;

          item.inside_pages = Number(item.inside_pages);
          item.cover_pages = Number(item.cover_pages);
        }

        item.binding_types = Array.isArray(item.binding_types)
          ? item.binding_types
          : [];

        await JobItem.update(item, { where: { id: item.id }, transaction: t });
      }
    }

    // Add new items
    const newItems = job_items.filter((i) => !i.id);
    if (newItems.length > 0) {
      const newItemData = await Promise.all(
        newItems.map( async (i) => {

          const item_master_id = await ItemMaster.findOne({
            where: {
              category: i.category,
              item_name: i.enquiry_for
            },
            attributes: ['id']
          });

          i.item_master_id = item_master_id.dataValues.id;


          const selected_paper_id = await PaperMaster.findOne({
            where: {
              paper_name: i.paper_type,
              gsm: Number(i.paper_gsm),
              size_name: i.best_inside_sheet
            },
            attributes: ['id']
          });
          console.log("selected_paper_id: ", selected_paper_id.dataValues.id);

          i.selected_paper_id = selected_paper_id.dataValues.id;


          if (i.category !== "Multiple Sheet") {
            i.cover_paper_type = null;
            i.cover_paper_gsm = null;
            i.cover_color_scheme = null;
          }
          else{
            const selected_cover_paper_id = await PaperMaster.findOne({
              where: {
                paper_name: i.cover_paper_type,
                gsm: Number(i.cover_paper_gsm),
                size_name: i.best_cover_sheet
              },
              attributes: ['id']
            });
            i.selected_cover_paper_id = selected_cover_paper_id.dataValues.id;
          }

          i.binding_types = Array.isArray(i.binding_types) ? i.binding_types : [];
          i.inside_pages = i.inside_pages ? Number(i.inside_pages) : null;
          i.cover_pages = i.cover_pages ? Number(i.cover_pages) : null;

          return { ...i, job_no };
        })
      );

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
      include: [
        { model: JobItem, as: "items" },
        { model: JobAssignment, as: "assignments" },
      ],
    });

    res.json({
      message: "JobCard and items updated successfully",
      updatedJobCard,
    });

    // 🔔 Notify CRM + Coordinators + Designer
    await sendJobNotificationEmail({
      job: updatedJobCard,
      subject: `JobCard Updated | Job No: ${job_no}`,
      actionType: "Updated",
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

    const jobCard = await JobCard.findByPk(job_no, {
      include: [{ model: JobAssignment, as: "assignments" }],
    });
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

    if (clientDetails) {
      if (clientDetails.total_jobs > 0) {
        clientDetails.total_jobs--;

        if (clientDetails.total_jobs <= 3) {
          clientDetails.client_relation = "NBD";
        }
      }
      await clientDetails.save();
    }

    res.json({
      message: "JobCard deleted successfully",
    });

    // 🔔 Notify CRM + Coordinators
    await sendJobNotificationEmail({
      job: jobCard,
      subject: `❌ JobCard Deleted | Job No: ${job_no}`,
      actionType: "deleted",
    });

    await jobCard.destroy(); // Cascade deletes all JobItems
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

    const job = await JobCard.findByPk(job_no, {
      include: [{ model: JobAssignment, as: "assignments" }],
    });

    if (!job) {
      return res.status(400).json({
        message: "Job not found",
      });
    }

    job.current_stage = "cancelled";
    job.status = "cancelled";

    await job.save();

    res.status(200).json({
      message: "Successfully cancelled the job",
    });

    // 🔔 Notify CRM + Coordinators + Designer
    await sendJobNotificationEmail({
      job,
      subject: `🚫 JobCard Cancelled | Job No: ${job_no}`,
      actionType: "cancelled",
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
  try {
    const { category } = req.query;

    let where = {};
    if (category) {
      where.category = category;
    }

    const items = await ItemMaster.findAll({ where });

    return res.json(items);
  } catch (err) {
    console.error("Failed to fetch enquiry items:", err);
    res.status(500).json({ message: "Failed to load enquiry items" });
  }
};

// =====================================================
// ✉️ Helper: Sends notification mail to CRM, Coordinators, Designer
// =====================================================
async function sendJobNotificationEmail({ job, subject, actionType }) {
  try {
    const {
      job_no,
      client_name,
      order_type,
      order_handled_by,
      execution_location,
      delivery_date,
      task_priority,
    } = job;

    // Fetch CRM
    const crmUser = await User.findOne({
      where: { username: order_handled_by, department: "CRM" },
    });

    // Fetch all Process Coordinators
    const coordinators = await User.findAll({
      where: { department: "Process Coordinator" },
    });

    // Fetch Designer (optional)
    const designer =
      job.assignments.length > 0
        ? await User.findOne({
            where: {
              id: job?.assignments?.designer_id,
              department: "Designer",
            },
          })
        : null;

    const recipients = [
      ...(crmUser?.email ? [crmUser.email] : []),
      ...coordinators.map((u) => u.email).filter(Boolean),
      ...(designer?.email ? [designer.email] : []),
    ];

    if (recipients.length === 0) {
      console.warn("⚠️ No recipients found for job notification.");
      return;
    }

    const actionLabel =
      actionType === "cancelled"
        ? "Cancelled"
        : actionType === "deleted"
        ? "Deleted"
        : "Updated";
    const color =
      actionType === "cancelled"
        ? "#ff4444"
        : actionType === "deleted"
        ? "#b71c1c"
        : "#0000FF";

    const emailHTML = `
      <div style="font-family:Arial, sans-serif; color:#333;">
        <h2 style="color:${color};">⚠️ JobCard ${actionLabel}</h2>
        <p>This is to inform you that the following job has been <strong>${actionLabel.toUpperCase()}</strong> by the Job Writer.</p>

        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:14px;">
          <tr><th align="left">Job No</th><td>${job_no}</td></tr>
          <tr><th align="left">Client</th><td>${client_name}</td></tr>
          <tr><th align="left">Order Type</th><td>${order_type}</td></tr>
          <tr><th align="left">Handled By (CRM)</th><td>${order_handled_by}</td></tr>
          <tr><th align="left">Execution Location</th><td>${execution_location}</td></tr>
          <tr><th align="left">Delivery Date</th><td>${new Date(
            delivery_date
          ).toLocaleString()}</td></tr>
          <tr><th align="left">Priority</th><td>${task_priority}</td></tr>
          <tr><th align="left">Action Performed By</th><td>${
            job.updatedBy || "Job Writer"
          }</td></tr>
          <tr><th align="left">Status</th><td style="color:${color}; font-weight:bold;">${actionLabel}</td></tr>
        </table>

        <br/>
        <p style="color:#555;">
          Please update related records or notify relevant departments if needed.<br/>
          This action is logged in the system for tracking purposes.
        </p>

        <hr style="border:none; border-top:1px solid #ccc; margin:20px 0;" />
        <p style="font-size:13px; color:#888;">-- Automated Notification | Eastern Panorama Offset</p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: recipients.join(","),
      subject,
      html: emailHTML,
    });

    console.log(`📧 ${actionLabel} notification sent to:`, recipients);
  } catch (err) {
    console.error("❌ Failed to send job notification email:", err.message);
  }
}
