import db from "../../models/index.js";
import { Op } from "sequelize";
import { advanceStage } from "../../utils/jobFms/stageTracking.js";
import { sendMailForFMS } from "../../email/sendMail.js";
import { DateTime } from "luxon";
import { orderConfirmationTemplate, crmJobAssignmentTemplate, coordinatorJobReviewTemplate } from "../../email/templates/emailTemplates.js";
import path from "path";


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
  WideFormatMaterial
} = db;


const calculateJobCompletionDeadline = (deliveryDateInput) => {
  // ⬅️ deliveryDateInput is already IST
  const deliveryIST = DateTime.fromISO(deliveryDateInput, {
    zone: "Asia/Kolkata",
  });
  console.log("deliveryIST: ", deliveryIST);

  if (!deliveryIST.isValid) {
    throw new Error("Invalid delivery date input");
  }

  const nowIST = DateTime.now().setZone("Asia/Kolkata");
  console.log("nowIST: ", nowIST);

  const todayIST = nowIST.startOf("day");
  console.log("todayIST: ", todayIST);
  const tomorrowIST = todayIST.plus({ days: 1 });
  console.log("tomorrowIST: ", tomorrowIST);

  const deliveryDayIST = deliveryIST.startOf("day");
  console.log("deliveryDayIST: ", deliveryDayIST);

  // ⏱ SAME DAY delivery → 2 hours before delivery
  if (deliveryDayIST.equals(todayIST)) {
    return deliveryIST.minus({ hours: 2 }).toJSDate();
  }

  // ⏭ NEXT DAY delivery
  if (deliveryDayIST.equals(tomorrowIST)) {
    const deliveryHour = deliveryIST.hour;

    // Before 1 PM IST
    if (deliveryHour < 13) {
      return todayIST
        .set({ hour: 19, minute: 0, second: 0, millisecond: 0 })
        .toJSDate();
    }

    // After 1 PM → 2 hours before delivery
    return deliveryIST.minus({ hours: 2 }).toJSDate();
  }

  // 📆 Day after tomorrow or later
  return deliveryDayIST
    .minus({ days: 1 })
    .set({ hour: 18, minute: 0, second: 0, millisecond: 0 })
    .toJSDate();
};


/**
 * CREATE JOB CARD + JOB ITEMS (in a single transaction)
 */
export const createJobCard = async (req, res) => {
  console.log("createJobCard called...");
  const t = await db.sequelize.transaction();
  try {
    // console.log("req.body: ", req.body);
    const {
      client_type,
      order_source,
      client_name,
      department,
      reference,
      order_type,
      address,
      contact_number,
      email_id,
      order_handled_by,
      execution_location,
      outbound_sent_to = null,       // if outbound then this fields will be required
      paper_ordered_from = null,     // if outbound then this fields will be required
      receiving_date_for_mm = null,   // if outbound then this fields will be required
      delivery_location, // ✅ fixed spelling
      delivery_address,
      delivery_date,
      proof_date,
      task_priority,
      instructions,
      total_amount,
      advance_payment,
      mode_of_payment,
      payment_status,
      order_received_by,
      no_of_files,
      is_direct_to_production = false,
      discount = 0,
      job_items = [], // ✅ default empty array
    } = req.body;


    console.log("required details: ", client_type, order_source, client_name, order_type, order_handled_by, execution_location, delivery_location, delivery_date, proof_date, task_priority, total_amount, advance_payment, mode_of_payment, contact_number, payment_status, job_items);

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

    if (Number(no_of_files) !== job_items.length) {
      return res.status(400).json({
        message: "No of files should be same as job items.",
      });
    }

    // if (delivery_location === "Delivery Address") {
    //   if (!delivery_address) {
    //     return res.status(400).json({
    //       message: "Delivery Address is required.",
    //     });
    //   }
    // }

    // calculate job completion deadline
    const job_completion_deadline = calculateJobCompletionDeadline(delivery_date);
    console.log("job completion deadline: ", job_completion_deadline);

    const initialStage = is_direct_to_production ? "production" : "coordinator_review";

    // ✅ 1. Create JobCard (auto-generates job_no via hook)
    const jobCard = await JobCard.create(
      {
        client_name,
        department: department ?? null,
        reference: reference ?? null,
        client_type,
        order_type,
        order_source,
        address,
        contact_number,
        email_id: email_id === "" ? null : email_id,
        order_received_by,
        order_handled_by,
        execution_location,
        outbound_sent_to,       // if outbound then this fields will be required
        paper_ordered_from,    // if outbound then this fields will be required
        receiving_date_for_mm,
        delivery_date,
        delivery_location,
        delivery_address,
        proof_date,
        task_priority,
        instructions,
        total_amount: Number(total_amount),
        advance_payment,
        mode_of_payment,
        payment_status,
        is_direct_to_production,
        no_of_files: Number(no_of_files),
        status: initialStage,
        current_stage: initialStage,
        job_completion_deadline,
        discount: Number(discount) || 0,
      },
      { transaction: t }
    );

    const job_no = jobCard.job_no;

    // if job_items are provided, create them
    if (job_items && job_items.length > 0) {
      for (const item of job_items) {
        let item_master_id = await ItemMaster.findOne({
          where: {
            category: item.category,
            item_name: item.enquiry_for,
          },
          attributes: ["id"],
        });

        if (!item_master_id) {
          console.log("ItemMaster not found for: ", item.category, item.enquiry_for);
          item_master_id = await ItemMaster.create({
              category: item.category,
              item_name: item.enquiry_for,
          }, { transaction: t });
        }

        item.item_master_id = item_master_id.dataValues.id;

          /* ===================================================== WIDE FORMAT CASE ===================================================== */

        if(item.category === "Wide Format") {
          const wideMaterial = await WideFormatMaterial.findByPk(item.material_info.id, { attributes: ["id"] });
          if (!wideMaterial) {
            throw new Error("Wide format material not found");
          }
          item.selected_wide_material_id = wideMaterial.dataValues.id;
          // Clean unrelated fields          
          item.cover_paper_type = null;
          item.cover_paper_gsm = null;
          item.cover_color_scheme = null;
          item.color_scheme = "Multicolor";
        }
        else if(item.category === "Other"){
          item.selected_wide_material_id = null;
          item.cover_paper_type = null;
          item.cover_paper_gsm = null;
          item.cover_color_scheme = null;
          item.color_scheme = "Multicolor";
          item.sides = null;
        }
        /* =========================================== SINGLE SHEET AND MULTIPLE SHEET CASE ============================================ */
        else{
          item.selected_wide_material_id = null;

          const selected_paper_id = await PaperMaster.findOne({
            where: {
              paper_name: item.paper_type,
              gsm: Number(item.paper_gsm),
              size_name: item.best_inside_sheet,
            },
            attributes: ["id"],
          });

          if (!selected_paper_id) {
            throw new Error(`Paper not found: ${item.paper_type}, ${item.paper_gsm}, ${item.best_inside_sheet}`);
          }

          item.selected_paper_id = selected_paper_id.dataValues.id;

          if (item.category !== "Multiple Sheet") {
            item.cover_paper_type = null;
            item.cover_paper_gsm = null;
            item.cover_color_scheme = null;
          } else {
            const selected_cover_paper_id = await PaperMaster.findOne({
              where: {
                paper_name: item.cover_paper_type,
                gsm: Number(item.cover_paper_gsm),
                size_name: item.best_cover_sheet,
              },
              attributes: ["id"],
            });
            item.selected_cover_paper_id = selected_cover_paper_id.dataValues.id;
          }

        }


        await JobItem.create(
          {
            job_no: jobCard.job_no,
            ...item,
            selected_paper_id: item.selected_paper_id ?? null,
            selected_cover_paper_id: item.selected_cover_paper_id ?? null,
            selected_wide_material_id: item.selected_wide_material_id ?? null,

            binding_types: Array.isArray(item.binding_types)
              ? item.binding_types
              : [],
            inside_pages: item.inside_pages ? Number(item.inside_pages) : null,
            cover_pages: item.cover_pages ? Number(item.cover_pages) : null,
            no_of_foldings: item.folds_per_sheet ? Number(item.folds_per_sheet) : null,
            no_of_creases: item.creases_per_sheet ? Number(item.creases_per_sheet) : null,
            press_type: item.press_type === '' || item.press_type === undefined ? null : item.press_type,
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
        new_stage: initialStage,
        performed_by_id: req.user?.id || null,
        remarks: is_direct_to_production ? "(Job created -> Direct to Production) Job sent directly to production" : "(Job created -> Coordinator review) Job sent for coordinator review",
        transaction: t,
      });



    //  Commit transaction before sending email
    await t.commit();

    res.status(201).json({
      message: "JobCard created successfully",
      jobCard,
    });

    const attachments = [
      {
        filename: "epo-logo.jpg",
        path: path.resolve("assets/epo-logo.jpg"),
        cid: "epo-logo",
      },
    ];

    // Send Email to Client (if email_id exists)
    // if (email_id) {
    //   const emailHTML = orderConfirmationTemplate({
    //     clientName: client_name,
    //     jobNo: jobCard.job_no,
    //     orderHandledBy: order_handled_by,
    //     totalAmount: total_amount,
    //     instructions,
    //   });

    //   await sendMailForFMS({
    //     to: email_id,
    //     subject: `Welcome to EPO - Order Confirmation | Job No: ${jobCard.job_no}`,
    //     html: emailHTML,
    //   });
    // }

    // 2️⃣ Notify the assigned CRM
    const crmUser = await User.findOne({
      where: { username: order_handled_by },
    });

    if (crmUser?.email) {
      const dashboardUrl = `${process.env.LEADS_URL}/jobs/${jobCard.job_no}`;

      // 2. Pass all required fields to the template
      const crmEmailHTML = crmJobAssignmentTemplate({
        crmName: order_handled_by,
        jobNo: jobCard.job_no,
        clientName: client_name,
        contactNumber: contact_number,
        clientType: client_type, 
        orderType: order_type,
        orderSource: order_source,
        orderReceivedBy: order_received_by,   
        executionLocation: execution_location,
        deliveryDate: delivery_date,
        deliveryLocation: delivery_location, 
        taskPriority: task_priority,
        totalAmount: total_amount,
        advancePayment: advance_payment || 0, // Fallback to 0 if undefined
        paymentStatus: payment_status,    
        dashboardUrl: dashboardUrl,           // Computed above
      });

      await sendMailForFMS({
        to: crmUser.email,
        subject: `New Job Assigned | Job No: ${job_no}`,
        html: crmEmailHTML,
        attachments,
      });
    }

    // 3️⃣ Notify all Process Coordinators
    const coordinators = await User.findAll({
      where: { department: "Process Coordinator" },
    });

    const coordinatorEmails = coordinators.map((u) => u.email).filter(Boolean);

    if (coordinatorEmails.length > 0) {
      const coordinatorEmailHTML = coordinatorJobReviewTemplate({
        jobNo: job_no,
        clientName: client_name,
        orderType: order_type,
        crmName: order_handled_by,
        executionLocation: execution_location,
        deliveryLocation: delivery_location,
        deliveryDate: delivery_date,
        taskPriority: task_priority,
        paymentStatus: payment_status,
        dashboardUrl: `${process.env.LEADS_URL}/jobs/${job_no}`,
      });

      await sendMailForFMS({
        to: coordinatorEmails.join(","),
        subject: `New JobCard - Coordinator Review | Job No: ${job_no}`,
        html: coordinatorEmailHTML,
        attachments,
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







const buildWhereClause = (query) => {
  const {
    status,
    order_type,
    order_handled_by,
    execution_location,
    payment_status,
    is_direct_to_production,
    search,
  } = query;

  const where = {};

  if (status) where.status = status;
  if (order_type) where.order_type = order_type;
  if (order_handled_by) where.order_handled_by = order_handled_by;
  if (execution_location) where.execution_location = execution_location;
  if (payment_status) where.payment_status = payment_status;
  if (is_direct_to_production !== undefined && is_direct_to_production !== "") {
    where.is_direct_to_production = is_direct_to_production === "true";
  }

  // SIMPLE search (LIKE) — since no FULLTEXT
  if (search) {
    where[Op.or] = [
        { job_no: { [Op.eq]: Number(search) || -1 } },
        { client_name: { [Op.like]: `%${search}%` } },
        { order_handled_by: { [Op.like]: `%${search}%` } },
        { contact_number: { [Op.like]: `%${search}%` } },
        { email_id: { [Op.like]: `%${search}%` } },
        {assigned_designer: { [Op.like]: `%${search}%`} },
    ];
  }

  if (query.delivery_from || query.delivery_to) {
    where.delivery_date = {};

    if (query.delivery_from) {
      where.delivery_date[Op.gte] = new Date(query.delivery_from);
    }

    if (query.delivery_to) {
      where.delivery_date[Op.lte] = new Date(query.delivery_to);
    }
  }

  if (query.created_from || query.created_to) {
    where.created_at = {};

    if (query.created_from) {
      where.created_at[Op.gte] = new Date(query.created_from);
    }

    if (query.created_to) {
      where.created_at[Op.lte] = new Date(query.created_to);
    }
  }



  return where;
};



/**
 * GET ALL JOB CARDS (with pagination & filters)
 */
export const getAllJobCards = async (req, res) => {
  console.log("getAllJobCards called...");
  try {
    const { page = 1, limit = 50 } = req.query;
    console.log("req.query: ", req.query);
    const offset = (page - 1) * limit;

    const whereClause = buildWhereClause(req.query);

    // Count fast
    const total = await JobCard.count({
      where: whereClause,
    });


    const jobCards = await JobCard.findAll({
      where: whereClause,
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
      //   { model: ClientApproval, 
      //     as: "clientApprovals", 
      //     separate: true,
      //     limit: 1,
      //     order: [["instance", "DESC"]],
      //     required: false,
      //   },
      //   { model: ProductionRecord, as: "production" },
        { model: JobAssignment, as: "assignments" },
      ],
      limit: parseInt(limit),
      offset,
      order: [["created_at", "DESC"]],
    });

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      data: jobCards,
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
        {
          model: JobItem,
          as: "items",
          include: [
            { model: PaperMaster, as: "selectedPaper" }, // <-- important
            { model: PaperMaster, as: "selectedCoverPaper" },
            { model: ItemMaster, as: "itemMaster" },
          ],
        },
        { model: FileAttachment, as: "attachments" },
        { model: ClientApproval, as: "clientApprovals" },
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
  // console.log("req.body: ", req.body);
  const t = await db.sequelize.transaction();
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

    // ==============================
    // STEP 1: SNAPSHOT OLD DATA
    // ==============================

    // Old JobCard snapshot (exclude status & current_stage later)
    // const oldJobCard = jobCard.toJSON();

    // Old JobItems snapshot
    // const oldJobItems = jobCard.items.map(item => ({
    //   id: item.id,
    //   category: item.category,
    //   enquiry_for: item.enquiry_for,
    //   selected_paper_id: item.selected_paper_id,
    //   inside_pages: item.inside_pages,
    //   color_scheme: item.color_scheme,
    //   selected_cover_paper_id: item.selected_cover_paper_id,
    //   cover_pages: item.cover_pages,
    //   cover_color_scheme: item.cover_color_scheme,
    //   sides: item.sides,
    //   size: item.size,
    //   quantity: item.quantity,
    //   binding_types: JSON.stringify(item.binding_types || []),
    // }));


    // 🔥 HANDLE READY → PRODUCTION TRANSITION
    if (updates.is_direct_to_production === true && jobCard.is_direct_to_production === false) {
      console.log("Job marked as Ready for Production");

      updates.status = "production";
      updates.current_stage = "production";

      await advanceStage({
        job_no,
        new_stage: "production",
        performed_by_id: req.user?.id || null,
        remarks: "(Job updated → Direct to Production)",
        transaction: t,
      });
    }

    if(jobCard.delivery_date !== req.body.delivery_date){
      console.log("Delivery date has changed. Recalculating deadline...");
      const job_completion_deadline = calculateJobCompletionDeadline(req.body.delivery_date);
      console.log("job completion deadline: ", job_completion_deadline);
      updates.job_completion_deadline = job_completion_deadline;
    }

    await jobCard.update(updates, { transaction: t });


    // ==============================
    // STEP 2: JOB CARD FIELD CHANGES
    // ==============================

    // function normalizeValue(value) {
    //   if (value === null || value === undefined) return value;

    //   // Dates → timestamp
    //   if (value instanceof Date) {
    //     return value.getTime();
    //   }

    //   // Numbers / decimals → Number
    //   if (!isNaN(value)) {
    //     return Number(value);
    //   }

    //   return value;
    // }


    // const jobCardChanges = {};

    // const ignoredFields = ["status", "current_stage"];
    // const ignoredFields = [
    //   "status",
    //   "current_stage",
    //   "updatedAt",
    //   "createdAt",
    //   "items",
    // ];

    // Object.keys(updates).forEach(field => {
    //   if (ignoredFields.includes(field)) return;

    //   const oldValue = oldJobCard[field];
    //   const newValue = jobCard[field];

    //   const oldNormalized = normalizeValue(oldValue);
    //   const newNormalized = normalizeValue(newValue);

    //   if (oldNormalized !== newNormalized) {
    //     jobCardChanges[field] = {
    //       from: oldValue,
    //       to: newValue,
    //     };
    //   }
    // });


    // console.log("🟡 JobCard changes:", jobCardChanges);




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
      console.log("Processing item: ", item);
      if (item.id && existingItems.includes(item.id)) {
        const item_master_id = await ItemMaster.findOne({
          where: {
            category: item.category,
            item_name: item.enquiry_for,
          },
          attributes: ["id"],
        });

        item.item_master_id = item_master_id.dataValues.id;


        if(item.category === "Wide Format") {
          const wideMaterial = await WideFormatMaterial.findByPk(
            item.material_info?.id,
            { attributes: ["id"] }
          );

          if (!wideMaterial) {
            throw new Error("Wide format material not found");
          }

          item.selected_wide_material_id = wideMaterial.dataValues.id;

          // Clean unrelated fields
          item.selected_paper_id = null;
          item.selected_cover_paper_id = null;
          item.cover_paper_type = null;
          item.cover_paper_gsm = null;
          item.cover_color_scheme = null;
          item.color_scheme = "Multicolor";
        }
        else if (item.category === "Other") {
          item.selected_wide_material_id = null;
          item.selected_paper_id = null;
          item.selected_cover_paper_id = null;

          item.cover_paper_type = null;
          item.cover_paper_gsm = null;
          item.cover_color_scheme = null;

          item.color_scheme = "Multicolor";
          item.sides = null;
        }
        else{

          if (item.paper_type && item.paper_gsm && item.best_inside_sheet) {
            const selected_paper_id = await PaperMaster.findOne({
              where: {
                paper_name: item.paper_type,
                gsm: Number(item.paper_gsm),
                size_name: item.best_inside_sheet,
              },
              attributes: ["id"],
            });
            if (selected_paper_id) {
              item.selected_paper_id = selected_paper_id.dataValues.id;
            }
          }

          // CLEAN FIELDS LIKE CREATE API
          if (item.category !== "Multiple Sheet") {
            item.cover_paper_type = null;
            item.cover_paper_gsm = null;
            item.cover_color_scheme = null;
          } else {
            if (
              item.cover_paper_type &&
              item.cover_paper_gsm &&
              item.best_cover_sheet
            ) {
              const selected_cover_paper_id = await PaperMaster.findOne({
                where: {
                  paper_name: item.cover_paper_type,
                  gsm: Number(item.cover_paper_gsm),
                  size_name: item.best_cover_sheet,
                },
                attributes: ["id"],
              });

              if (selected_cover_paper_id) {
                item.selected_cover_paper_id =
                  selected_cover_paper_id.dataValues.id;
              }
            }

            item.inside_pages = Number(item.inside_pages);
            item.cover_pages = Number(item.cover_pages);
          }
          
        }


        item.binding_types = Array.isArray(item.binding_types)
          ? item.binding_types
          : [];

        const {
          selectedPaper,
          selectedCoverPaper,
          itemMaster,
          available_items,
          available_papers,
          available_gsm,
          available_gsm_cover,
          available_bindings,
          ...safeItem
        } = item;

        await JobItem.update(safeItem, {
          where: { id: item.id },
          transaction: t,
        });
      }
    }

    // Add new items
    const newItems = job_items.filter((i) => !i.id);

    if (newItems.length > 0) {
      console.log("adding new Job items: ", newItems);
      const newItemData = await Promise.all(
        newItems.map(async (i) => {
          let item_master_id = await ItemMaster.findOne({
            where: {
              category: i.category,
              item_name: i.enquiry_for,
            },
            attributes: ["id"],
          });

          if (!item_master_id) {
            console.log("ItemMaster not found for: ", i.category, i.enquiry_for);
            item_master_id = await ItemMaster.create({
              category: i.category,
              item_name: i.enquiry_for,
            }, { transaction: t });
          }

          i.item_master_id = item_master_id.dataValues.id;

          if(i.category === "Wide Format") {
            const wideMaterial = await WideFormatMaterial.findByPk(
              i.material_info?.id,
              { attributes: ["id"] }
            );

            if (!wideMaterial) {
              throw new Error("Wide format material not found");
            }

            i.selected_wide_material_id = wideMaterial.id;
            i.selected_paper_id = null;
            i.selected_cover_paper_id = null;

            i.cover_paper_type = null;
            i.cover_paper_gsm = null;
            i.cover_color_scheme = null;
            i.color_scheme = "Multicolor";
          }
          else if (i.category === "Other") {
            i.selected_wide_material_id = null;
            i.selected_paper_id = null;
            i.selected_cover_paper_id = null;

            i.cover_paper_type = null;
            i.cover_paper_gsm = null;
            i.cover_color_scheme = null;

            i.color_scheme = "Multicolor";
            i.sides = null;
          }
          else{

            if (i.paper_type && i.paper_gsm && i.best_inside_sheet){
              const selected_paper_id = await PaperMaster.findOne({
                where: {
                  paper_name: i.paper_type,
                  gsm: Number(i.paper_gsm),
                  size_name: i.best_inside_sheet,
                },
                attributes: ["id"],
              });
              console.log("selected_paper_id: ", selected_paper_id.dataValues.id);

              if(selected_paper_id){
                i.selected_paper_id = selected_paper_id.dataValues.id;
              }
            }


            if (i.category !== "Multiple Sheet") {
              i.cover_paper_type = null;
              i.cover_paper_gsm = null;
              i.cover_color_scheme = null;
            } else {

              if (i.cover_paper_type && i.cover_paper_gsm && i.best_cover_sheet){
                const selected_cover_paper_id = await PaperMaster.findOne({
                  where: {
                    paper_name: i.cover_paper_type,
                    gsm: Number(i.cover_paper_gsm),
                    size_name: i.best_cover_sheet,
                  },
                  attributes: ["id"],
                });
                if(selected_cover_paper_id){
                  i.selected_cover_paper_id = selected_cover_paper_id.dataValues.id;
                }
              }
              
            }

          }

          i.binding_types = Array.isArray(i.binding_types)
            ? i.binding_types
            : [];
          i.inside_pages = i.inside_pages ? Number(i.inside_pages) : null;
          i.cover_pages = i.cover_pages ? Number(i.cover_pages) : null;

          return { ...i, job_no };
        })
      );
      await JobItem.bulkCreate(newItemData, { transaction: t });
    }


    // ==============================
    // STEP 3: FETCH NEW JOB ITEMS
    // ==============================

    // const newJobItems = await JobItem.findAll({
    //   where: { job_no },
    //   transaction: t,
    // });

    // ==============================
    // STEP 4: JOB ITEM CHANGES
    // ==============================

    // const jobItemChanges = {
    //   added: [],
    //   removed: [],
    //   modified: [],
    // };

    // const oldMap = new Map(oldJobItems.map(i => [i.id, i]));
    // const newMap = new Map(
    //   newJobItems.map(i => [
    //     i.id,
    //     {
    //       id: i.id,
    //       category: i.category,
    //       enquiry_for: i.enquiry_for,
    //       selected_paper_id: i.selected_paper_id,
    //       inside_pages: i.inside_pages,
    //       color_scheme: i.color_scheme,
    //       selected_cover_paper_id: i.selected_cover_paper_id,
    //       cover_pages: i.cover_pages,
    //       cover_color_scheme: i.cover_color_scheme,
    //       sides: i.sides,
    //       size: i.size,
    //       quantity: i.quantity,
    //       binding_types: JSON.stringify(i.binding_types || []),
    //     }
    //   ])
    // );

    // // ➕ Added items
    // newMap.forEach((item, id) => {
    //   if (!oldMap.has(id)) {
    //     jobItemChanges.added.push(item.enquiry_for);
    //   }
    // });

    // // ➖ Removed items
    // oldMap.forEach((item, id) => {
    //   if (!newMap.has(id)) {
    //     jobItemChanges.removed.push(item.enquiry_for);
    //   }
    // });

    // // ✏️ Modified items (FIELD LEVEL)
    // newMap.forEach((newItem, id) => {
    //   if (!oldMap.has(id)) return;

    //   const oldItem = oldMap.get(id);
    //   const fieldChanges = {};

    //   Object.keys(newItem).forEach((field) => {
    //     if (newItem[field] !== oldItem[field]) {
    //       fieldChanges[field] = {
    //         from: oldItem[field],
    //         to: newItem[field],
    //       };
    //     }
    //   });

    //   if (Object.keys(fieldChanges).length > 0) {
    //     jobItemChanges.modified.push({
    //       enquiry_for: newItem.enquiry_for,
    //       changes: fieldChanges,
    //     });
    //   }
    // });

    // console.log("🟢 JobItem changes:", jobItemChanges);

    // Log activity
    await ActivityLog.create(
      {
        job_no,
        action: updates.is_direct_to_production ? "Job marked Ready for Production" : "JobCard Updated",
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
    // await sendJobNotificationEmail({
    //   job: updatedJobCard,
    //   subject: `JobCard Updated | Job No: ${job_no}`,
    //   actionType: "updated",
    //   jobCardChanges,
    //   jobItemChanges,
    // });
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
 * CANCEL JOB
 */
export const cancelJobCard = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { job_no } = req.params;
    if (!job_no) {
      return res.status(400).json({
        message: "Job number required",
      });
    }

    const job = await JobCard.findByPk(job_no, {
      include: [{ model: JobAssignment, as: "assignments" }],
      transaction: t,
    });

    if (!job) {
      return res.status(400).json({
        message: "Job not found",
      });
    }

    job.current_stage = "cancelled";
    job.status = "cancelled";

    await job.save();

    await advanceStage({
      job_no,
      new_stage: "cancelled",
      performed_by_id: req.user?.id || null,
      remarks: "(Job cancelled) Job has been cancelled by Job Writer",
      transaction: t,
    });

    await t.commit();

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
    if(!t.finished){
      await t.rollback();
    }
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




function renderCancelledEmail(job, color) {
  return `
    <h2 style="color:${color};">❌ JobCard Cancelled</h2>
    <p>
      The following job has been <strong>CANCELLED</strong>.
      Please stop all further processing.
    </p>
  `;
}


function prettyFieldName(field) {
  const FIELD_LABELS = {
    execution_location: "Execution Location",
    delivery_date: "Delivery Date",
    task_priority: "Priority",
    total_amount: "Total Amount",
    advance_payment: "Advance Payment",
    quantity: "Quantity",
    size: "Size",
    color_scheme: "Color Scheme",
    binding_types: "Binding Type",
  };

  return FIELD_LABELS[field] || field.replace(/_/g, " ");
}

function formatValue(value) {
  if (value === null || value === undefined) return "-";

  if (value instanceof Date) {
    return value.toLocaleDateString("en-IN");
  }

  if (typeof value === "number") {
    return value;
  }

  return value;
}


function renderUpdatedChanges(jobCardChanges, jobItemChanges) {
  const hasJobCardChanges = Object.keys(jobCardChanges).length > 0;
  const hasItemChanges =
    Array.isArray(jobItemChanges.modified) &&
    jobItemChanges.modified.length > 0;

  // If NOTHING meaningful changed
  if (!hasJobCardChanges && !hasItemChanges) {
    return `
      <h3>ℹ️ No business-critical fields were changed</h3>
      <p>
        Minor or system-level updates were made.
      </p>
    `;
  }

  let html = `<h3>🔄 What was updated</h3>`;

  // =====================
  // JobCard Changes
  // =====================
  if (hasJobCardChanges) {
    html += `<h4>Job Details</h4><ul>`;

    Object.entries(jobCardChanges).forEach(([field, { from, to }]) => {
      html += `
        <li>
          <strong>${prettyFieldName(field)}</strong>:
          ${formatValue(from)} → ${formatValue(to)}
        </li>
      `;
    });

    html += `</ul>`;
  }

  // =====================
  // JobItem Changes (MODIFIED ONLY)
  // =====================
  if (hasItemChanges) {
    html += `<h4>Item Modifications</h4>`;

    jobItemChanges.modified.forEach(item => {
      html += `<p><strong>${item.enquiry_for}</strong></p><ul>`;

      Object.entries(item.changes).forEach(([field, { from, to }]) => {
        html += `
          <li>
            ${prettyFieldName(field)}:
            ${formatValue(from)} → ${formatValue(to)}
          </li>
        `;
      });

      html += `</ul>`;
    });
  }

  return html;
}









// =====================================================
// 4. ✉️ Helper: Sends notification mail to CRM, Coordinators, Designer for Updated / Cancelled Job
// =====================================================
async function sendJobNotificationEmail({ job, subject, actionType, jobCardChanges = {}, jobItemChanges = {}, }) {
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

    const isCancelled = actionType === "cancelled";
    const isUpdated = actionType === "updated";


    // Fetch CRM
    const crmUser = await User.findOne({
      where: { username: order_handled_by},
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
              id: job?.assignments[0]?.designer_id,
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

    // ✅ Allowed actions only
    const actionConfig = {
      cancelled: {
        label: "Cancelled",
        color: "#ff4444",
      },
      updated: {
        label: "Updated",
        color: "#2563eb",
      },
    };

    const action =
      actionConfig[actionType] || actionConfig.updated;

    const { label, color } = action;

    // const emailHTML = `
    //   <div style="font-family:Arial, sans-serif; color:#333; line-height:1.6">

    //     <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

    //     <h2 style="color:${color};">⚠️ JobCard ${label}</h2>

    //     <p>
    //       This is to inform you that the following job has been
    //       <strong>${label.toUpperCase()}</strong> by the Job Writer.
    //     </p>

    //     <table border="1" cellpadding="8" cellspacing="0"
    //       style="border-collapse:collapse; width:100%; font-size:14px;">
    //       <tr><th align="left">Job No</th><td>${job_no}</td></tr>
    //       <tr><th align="left">Client</th><td>${client_name}</td></tr>
    //       <tr><th align="left">Order Type</th><td>${order_type}</td></tr>
    //       <tr><th align="left">Handled By (CRM)</th><td>${order_handled_by}</td></tr>
    //       <tr><th align="left">Execution Location</th><td>${execution_location}</td></tr>
    //       <tr>
    //         <th align="left">Delivery Date</th>
    //         <td>${new Date(delivery_date).toLocaleString()}</td>
    //       </tr>
    //       <tr><th align="left">Priority</th><td>${task_priority}</td></tr>
    //       <tr>
    //         <th align="left">Action Performed By</th>
    //         <td>${job.updatedBy || "Job Writer"}</td>
    //       </tr>
    //       <tr>
    //         <th align="left">Status</th>
    //         <td style="color:${color}; font-weight:bold;">
    //           ${label}
    //         </td>
    //       </tr>
    //     </table>

    //     <p style="margin-top:20px; color:#555;">
    //       Please update related records or notify relevant departments if needed.
    //       This action is logged in the system for tracking purposes.
    //     </p>

    //     <hr style="border:none; border-top:1px solid #ccc; margin:20px 0;" />

    //     <p style="font-size:13px; color:#888;">
    //       — Automated Notification | Eastern Panorama Offset
    //     </p>

    //   </div>
    // `;

    const hasJobCardChanges = Object.keys(jobCardChanges).length > 0;
    const hasItemChanges =
      Array.isArray(jobItemChanges.modified) &&
      jobItemChanges.modified.length > 0;


    const mainContent = isCancelled ? renderCancelledEmail(job, color) : renderUpdatedChanges(jobCardChanges, jobItemChanges);

    const emailHTML = `
      <div style="font-family:Arial, sans-serif; color:#333; line-height:1.6">

        <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

        ${mainContent}

        <table border="1" cellpadding="8" cellspacing="0"
          style="border-collapse:collapse; width:100%; font-size:14px; margin-top:20px;">
          <tr><th align="left">Job No</th><td>${job.job_no}</td></tr>
          <tr><th align="left">Client</th><td>${job.client_name}</td></tr>
          <tr><th align="left">Order Type</th><td>${job.order_type}</td></tr>
          <tr><th align="left">Handled By</th><td>${job.order_handled_by}</td></tr>
        </table>

        <hr style="border:none; border-top:1px solid #ccc; margin:20px 0;" />

        <p style="font-size:13px; color:#888;">
          — Automated Notification | Eastern Panorama Offset
        </p>
      </div>
    `;

   const attachments = [
      {
        filename: "epo-logo.jpg",
        path: path.resolve("assets/epo-logo.jpg"),
        cid: "epo-logo",
      },
    ];

    await sendMailForFMS({
      to: recipients,
      subject,
      html: emailHTML,
      attachments,
    });

    console.log(`📧 Job ${label} notification sent to:`, recipients);
  } catch (err) {
    console.error("❌ Failed to send job notification email:", err.message);
  }
}


/**
 * DELETE JOB CARD
 */
// export const deleteJobCard = async (req, res) => {
//   console.log("deleteJobCard called...");
//   try {
//     const { job_no } = req.params;

//     if (!job_no) {
//       return res.status(400).json({
//         message: "Job number required",
//       });
//     }

//     const jobCard = await JobCard.findByPk(job_no, {
//       include: [{ model: JobAssignment, as: "assignments" }],
//     });
//     if (!jobCard) {
//       return res.status(404).json({
//         message: "JobCard not found",
//       });
//     }

//     await ActivityLog.create({
//       job_no,
//       action: "JobCard Deleted",
//       performed_by_id: req.user?.id || null,
//     });

//     const clientDetails = await ClientDetails.findOne({
//       where: {
//         client_name: jobCard.client_name,
//       },
//     });

//     if (clientDetails) {
//       if (clientDetails.total_jobs > 0) {
//         clientDetails.total_jobs--;

//         if (clientDetails.total_jobs <= 3) {
//           clientDetails.client_relation = "NBD";
//         }
//       }
//       await clientDetails.save();
//     }

//     res.json({
//       message: "JobCard deleted successfully",
//     });

//     // 🔔 Notify CRM + Coordinators
//     await sendJobNotificationEmail({
//       job: jobCard,
//       subject: `❌ JobCard Deleted | Job No: ${job_no}`,
//       actionType: "deleted",
//     });

//     await jobCard.destroy(); // Cascade deletes all JobItems
//   } catch (error) {
//     console.error("Error deleting JobCard:", error);
//     res.status(500).json({
//       message: "Internal server error",
//       error: error.message,
//     });
//   }
// };
