import db from "../../models/index.js";
import { Op } from "sequelize";
import { advanceStage } from "../../utils/jobFms/stageTracking.js";
import { sendMailForFMS } from "../../email/sendMail.js";
import { DateTime } from "luxon";
import { orderConfirmationTemplate, crmJobAssignmentTemplate, coordinatorJobReviewTemplate } from "../../email/templates/emailTemplates.js";
import path, { resolve } from "path";


const {
  JobCard,
  JobItem,
  ClientApproval,
  JobAssignment,
  ActivityLog,
  ClientDetails,
  User,
  ItemMaster,
  PaperMaster,
  WideFormatMaterial,
  JobItemCosting
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




function computeGST(totalAmount, discount, gstPct) {
  const subtotal   = parseFloat(Number(totalAmount || 0).toFixed(2));
  const disc       = parseFloat(Math.min(Number(discount || 0), subtotal).toFixed(2));
  const afterDiscount = parseFloat((subtotal - disc).toFixed(2));
  const rate       = gstPct ? Number(gstPct) : 0;
  const gst_amount = parseFloat(((afterDiscount * rate) / 100).toFixed(2));
  const final_amount = parseFloat((afterDiscount + gst_amount).toFixed(2));
  return { afterDiscount, gst_amount, final_amount };
}

/**
 * CREATE JOB CARD + JOB ITEMS (in a single transaction)
 */
export const createJobCard = async (req, res) => {
  console.log("createJobCard called...");
  const t = await db.sequelize.transaction();
  try {

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
      delivery_location, 
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
      gst_percentage = null,
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

    // After the existing required-fields validation block:
    if (
      gst_percentage !== null &&
      gst_percentage !== undefined &&
      gst_percentage !== "" &&
      ![5, 18].includes(Number(gst_percentage))
    ) {
      return res.status(400).json({ message: "GST percentage must be 5 or 18" });
    }

    const { gst_amount, final_amount } = computeGST(total_amount, discount, gst_percentage);

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
        gst_percentage: gst_percentage ? Number(gst_percentage) : null,  
        gst_amount,      
        final_amount,     
      },
      { transaction: t }
    );

    const job_no = jobCard.job_no;

    // if job_items are provided, create them
    if (job_items && job_items.length > 0) {
      for (const item of job_items) {

        const normalizedEnquiryFor = item.enquiry_for
          ? item.enquiry_for
              .trim()                          // remove leading/trailing spaces
              .replace(/\s+/g, " ")           // collapse multiple spaces into one: "big  book" → "big book"
              .toLowerCase()                   // "BOOK" → "book"
              .replace(/\b\w/g, (c) => c.toUpperCase()) // capitalize first letter of each word: "book" → "Book"
          : "";

        if (!normalizedEnquiryFor) {
          throw new Error(`enquiry_for is empty for a ${item.category} item. Cannot save.`);
        }

        // ── Case-insensitive search using Sequelize Op.eq on UPPER() ─────────────
        // We use sequelize.fn("UPPER") so the comparison happens at DB level.
        // This handles: "book" == "BOOK" == "Book" == "  book  "
        let item_master_id = await ItemMaster.findOne({
          where: { 
            category: item.category, 
            // db.sequelize.fn("UPPER", ...) tells MySQL: WHERE UPPER(item_name) = UPPER(?)
            // So "Art Paper", "ART PAPER", "art paper" all match the same row.
            item_name: db.sequelize.where(
              db.sequelize.fn("UPPER", db.sequelize.col("item_name")),
              "=",
              normalizedEnquiryFor.toUpperCase()
            ),
          },
          attributes: ["id"],
          transaction: t,
        });


        if (!item_master_id) {
          console.log("ItemMaster not found for: ", item.category, item.enquiry_for, item_master_id);
          // Create with the normalized (clean) version — not whatever the user typed
          item_master_id = await ItemMaster.create({
              category: item.category,
              item_name: normalizedEnquiryFor, // "Book Writing" not "  BOOK   writing  "
          }, { transaction: t });
        }else {
          console.log(`ItemMaster found: [${item.category}] "${normalizedEnquiryFor}" → id: ${item_master_id.dataValues.id}`);
        }


        item.item_master_id = item_master_id.dataValues.id;

        const cs = item.costing_snapshot;

        /* ── WIDE FORMAT ── */
        if(item.category === "Wide Format") {
          if (!cs?.wf_material_id) {
            throw new Error(
              `Wide Format material ID missing for item "${item.enquiry_for}". ` +
              `Please recalculate before saving.`
            );
          }
          item.selected_wide_material_id = Number(cs.wf_material_id);
          // Clean unrelated fields          
          item.selected_paper_id         = null;
          item.selected_cover_paper_id   = null;
          item.cover_paper_type          = null;
          item.cover_paper_gsm           = null;
          item.cover_color_scheme        = null;
          item.cover_press_type          = null;
          item.color_scheme              = "Multicolor";
        }
        /* ── OTHER ── */
        else if(item.category === "Other"){
          item.selected_wide_material_id = null;
          item.selected_paper_id         = null;
          item.selected_cover_paper_id   = null;
          item.cover_paper_type          = null;
          item.cover_paper_gsm           = null;
          item.cover_color_scheme        = null;
          item.cover_press_type          = null;
          item.color_scheme              = "Multicolor";
          item.sides                     = null;
        }
        /* ── SINGLE SHEET & MULTIPLE SHEET ── */
        else if(item.category === "Single Sheet"){
          if (!cs?.ss_paper_id) {
            throw new Error(
              `Paper ID missing for Single Sheet item "${item.enquiry_for}". ` +
              `Please recalculate before saving.`
            );
          }
          // Use selected_paper_id from costing_snapshot (resolved during calculation)
          item.selected_paper_id = Number(cs.ss_paper_id);
          item.selected_wide_material_id = null;
          item.selected_cover_paper_id   = null;
          item.cover_paper_type          = null;
          item.cover_paper_gsm           = null;
          item.cover_color_scheme        = null;
          item.cover_press_type          = null;
        } else if(item.category === "Multiple Sheet"){
          if (!cs?.ms_cover_paper_id) {
            throw new Error(
              `Cover paper ID missing for Multiple Sheet item "${item.enquiry_for}". ` +
              `Please recalculate before saving.`
            );
          }
          // selected_paper_id is NULL for Multiple Sheet — papers are in inside_papers[]
          item.selected_paper_id         = null;  // papers live in inside_papers[] JSON
          item.selected_wide_material_id = null;
          item.selected_cover_paper_id   = Number(cs.ms_cover_paper_id);
          item.inside_pages              = Number(item.inside_pages);
          item.cover_pages               = Number(item.cover_pages);
        }

        // ── STEP 3: Strip ALL fields that must never be sent to JobItem.create ──
        // Doing this by explicit delete is safest — it mutates the loop variable
        // so the subsequent spread is clean.
        //
        // Why both camelCase AND snake_case?
        // Frontend JSON uses snake_case (Sequelize underscored:true).
        // Belt-and-suspenders: strip both so no timestamp can ever leak through.
        const STRIP_FIELDS = [
          "id",                // old UUID — Sequelize auto-generates a fresh one
          "_temp_id",          // frontend-only tracking key
          "job_no",            // set explicitly below — never trust client-sent value
          "created_at",        // snake_case timestamp from JSON
          "updated_at",        // snake_case timestamp from JSON
          "createdAt",         // camelCase fallback
          "updatedAt",         // camelCase fallback
          "costing_snapshot",  // frontend calc data — goes to JobItemCosting, not JobItem
          "costing",           // Sequelize association object — not a column
          "selectedPaper",     // Sequelize eager-load — not a column
          "selectedCoverPaper",
          "selectedWideMaterial",
          "itemMaster",
          "jobCard",
          // UI-only display fields (cleanJobItems should have stripped these,
          // but strip again here as a safety net)
          "best_inside_sheet",
          "best_inside_sheet_name",
          "best_inside_dimensions",
          "best_inside_ups",
          "best_cover_sheet",
          "best_cover_dimensions",
          "best_cover_ups",
          "selected_material",
          "calculation_type",
          "rolls_or_boards_used",
          "wastage_sqft",
          "wide_ups",
          "material_info",
          "available_items",
          "available_papers",
          "available_gsm",
          "available_gsm_cover",
          "available_bindings",
          "available_sizes",
          "available_wide_materials",
          "available_wide_gsm",
          "paper_type",        // display name — FK is selected_paper_id
          "paper_gsm",         // display value — FK is selected_paper_id
          "cover_paper_type",  // display name — FK is selected_cover_paper_id
          "cover_paper_gsm",   // display value
          "wide_material_name", // display name — FK is selected_wide_material_id
          "wide_material_gsm",
          "wide_material_thickness",
        ];

        for (const field of STRIP_FIELDS) {
          delete item[field];
        }

        const createdItem = await JobItem.create(
          {
            ...item,
            // Explicit overrides — always win over the spread
            job_no: jobCard.job_no,
            selected_paper_id: item.selected_paper_id ?? null,
            selected_cover_paper_id: item.selected_cover_paper_id ?? null,
            selected_wide_material_id: item.selected_wide_material_id ?? null,

            binding_types: Array.isArray(item.binding_types)
              ? item.binding_types
              : [],
            inside_pages: item.inside_pages ? Number(item.inside_pages) : null,
            cover_pages: item.cover_pages ? Number(item.cover_pages) : null,
            cover_to_print: item.cover_to_print !== false,  // default true
            no_of_foldings: item.folds_per_sheet ? Number(item.folds_per_sheet) : null,
            no_of_creases: item.creases_per_sheet ? Number(item.creases_per_sheet) : null,
            press_type: item.press_type === '' || item.press_type === undefined ? null : item.press_type,
            cover_press_type: item.cover_press_type === "" || item.cover_press_type === undefined ? null : item.cover_press_type,
            cover_color_scheme: item.cover_color_scheme === "" || item.cover_color_scheme === undefined ? null : item.cover_color_scheme,
            color_scheme: item.color_scheme?.trim() ? item.color_scheme : null,
          },
          { transaction: t }
        );

        if(cs && item.category !== "Other"){
          // For Wide Format, set wf_material_id from the resolved FK
          if(item.category === "Wide Format"){
            cs.wf_material_id = item.selected_wide_material_id;
          }
          await JobItemCosting.create({
            job_no,
            job_item_id: createdItem.id,
            category: item.category,
            // Single Sheet fields
            ss_paper_id: cs.ss_paper_id || null,
            ss_ups: cs.ss_ups || null,
            ss_sheets: cs.ss_sheets || null,
            ss_sheets_with_wastage: cs.ss_sheets_with_wastage || null,
            ss_sheet_rate: cs.ss_sheet_rate || null,
            ss_sheet_cost: cs.ss_sheet_cost || null,
            ss_printing_cost: cs.ss_printing_cost || null,
            // Multiple Sheet inside fields
            ms_inside_costing:              cs.ms_inside_costing              ?? null,
            ms_total_inside_sheet_cost:     cs.ms_total_inside_sheet_cost     ?? null,
            ms_total_inside_printing_cost:  cs.ms_total_inside_printing_cost  ?? null,
            // Multiple Sheet cover fields
            ms_cover_paper_id:            cs.ms_cover_paper_id             ?? null,
            ms_cover_ups:                 cs.ms_cover_ups                  ?? null,
            ms_cover_sheets:              cs.ms_cover_sheets               ?? null,
            ms_cover_sheets_with_wastage: cs.ms_cover_sheets_with_wastage  ?? null,
            ms_cover_sheet_rate:          cs.ms_cover_sheet_rate            ?? null,
            ms_cover_sheet_cost:          cs.ms_cover_sheet_cost            ?? null,
            ms_cover_printing_cost:       cs.ms_cover_printing_cost         ?? null,
            // Wide Format fields
            wf_material_id:         cs.wf_material_id          ?? null,
            wf_calculation_type:    cs.wf_calculation_type      ?? null,
            wf_rolls_or_boards_used: cs.wf_rolls_or_boards_used ?? null,
            wf_wastage_sqft:        cs.wf_wastage_sqft          ?? null,
            wf_ups:                 cs.wf_ups                   ?? null,
            wf_material_cost:       cs.wf_material_cost         ?? null,
            wf_printing_cost:       cs.wf_printing_cost         ?? null,
            // Binding
            binding_cost:           cs.binding_cost          ?? 0,
            binding_cost_per_copy:  cs.binding_cost_per_copy ?? 0,
            // Summary
            total_sheet_cost:       cs.total_sheet_cost       ?? 0,
            total_printing_cost:    cs.total_printing_cost    ?? 0,
            sheet_cost_per_copy:    cs.sheet_cost_per_copy    ?? 0,
            printing_cost_per_copy: cs.printing_cost_per_copy ?? 0,
            unit_rate:              Number(cs.unit_rate ?? 0),
            item_total:             Number(cs.item_total ?? 0), 
          }, { transaction: t });
        }
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
            { model: WideFormatMaterial, as: "selectedWideMaterial" },
            { model: ItemMaster, as: "itemMaster" },
          ],
        },
        { model: ClientApproval, as: "clientApprovals" },
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



// jobCard.controller.js

/**
 * GET /api/fms/jobcards/:job_no/form-load
 *
 * Lean read used exclusively by the "Load from Job No" search panel.
 * Only includes JobItem + its paper/material associations.
 * Does NOT include FileAttachment, ClientApproval, ProductionRecord, etc.
 * — those are only needed on the detail/timeline view, not the form.
 *
 * JobItemCosting IS included (as "costing") so rebuildCostingSnapshotFromDB
 * can reconstruct the snapshot. This prevents the "Cover paper ID missing"
 * error when the user saves a loaded job as new without recalculating.
 * (Recalculation is also triggered on the frontend as a second safety net.)
 */

// Pass defaultValue if you want {} instead of [] for object fields.
const normalizeJsonField = (value, defaultValue = []) => {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === "object") return value; // already parsed by MySQL/Node driver
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }
  return defaultValue;
};

const normalizeJobItem = (json) => {
  const costing = json.costing
    ? {
        ...json.costing,
        // ms_inside_costing is a JSON array of per-paper calc objects
        ms_inside_costing: normalizeJsonField(json.costing.ms_inside_costing),
      }
    : null;

  return {
    ...json,
    // JSON array columns
    binding_types:   normalizeJsonField(json.binding_types),
    inside_papers:   normalizeJsonField(json.inside_papers),
    // binding_targets is a JSON object, not an array — default {}
    binding_targets: normalizeJsonField(json.binding_targets, {
      numbering_paper_ids: [],
      perforation_paper_ids: [],
    }),
    // Boolean — MariaDB sometimes returns 0/1 instead of true/false
    cover_to_print: json.cover_to_print !== false && json.cover_to_print !== 0,
    costing,
  };
};




export const getJobCardForFormLoad = async (req, res) => {
  try {
    const { job_no } = req.params;

    if (!job_no || !/^\d+$/.test(job_no)) {
      return res.status(400).json({ message: "Valid Job No is required." });
    }

    const jobCard = await JobCard.findByPk(job_no, {
      include: [
        {
          model: JobItem,
          as: "items",
          include: [
            { model: PaperMaster, as: "selectedPaper" },
            { model: PaperMaster, as: "selectedCoverPaper" },
            { model: ItemMaster, as: "itemMaster" },
            { model: WideFormatMaterial, as: "selectedWideMaterial" },
            // ← CRITICAL: costing must be included so rebuildCostingSnapshotFromDB works
            { model: JobItemCosting, as: "costing" },
          ],
        },
      ],
    });

    if (!jobCard) {
      return res.status(404).json({ message: `No job found with Job No: ${job_no}` });
    }

    // Convert to plain object so we can safely mutate JSON fields
    const json = jobCard.toJSON();

    // Normalize every item's JSON columns — MariaDB 11.x returns them as strings
    json.items = (json.items || []).map(normalizeJobItem);

    console.log("getJobCardForFormLoad - normalized response: ", json);
    return res.json(json);
  } catch (error) {
    console.error("Error in getJobCardForFormLoad:", error);
    return res.status(500).json({
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


    // ── Handle Ready → Production transition ──
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

    // Recompute GST whenever billing-related fields change
    const billingFieldChanged =
      "total_amount"    in updates ||
      "discount"        in updates ||
      "gst_percentage"  in updates;

    if (billingFieldChanged) {
      // Validate GST if it was sent
      if (
        updates.gst_percentage !== undefined &&
        updates.gst_percentage !== null &&
        updates.gst_percentage !== "" &&
        ![5, 18].includes(Number(updates.gst_percentage))
      ) {
        await t.rollback();
        return res.status(400).json({ message: "GST percentage must be 5 or 18" });
      }

      // Use updated values if present, otherwise fall back to current DB values
      const latestTotal  = Number(updates.total_amount  ?? jobCard.total_amount  ?? 0);
      const latestDisc   = Number(updates.discount       ?? jobCard.discount       ?? 0);
      const latestGstPct =
        "gst_percentage" in updates
          ? updates.gst_percentage
          : jobCard.gst_percentage;

      const { gst_amount, final_amount } = computeGST(latestTotal, latestDisc, latestGstPct);

      await jobCard.update({ gst_amount, final_amount }, { transaction: t });
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


    // ── Resolve paper IDs — shared helper ──────────────────────────────────
    // [FIX 2] Centralised so the same logic applies to both update-existing
    // and add-new paths, keeping both DRY.
    async function resolvePaperIds(item) {
      const cs = item.costing_snapshot;
      if (item.category === "Wide Format") {
        if (!cs?.wf_material_id) {
          throw new Error(
            `Wide Format material ID missing for item "${item.enquiry_for}". ` +
            `Please recalculate before saving.`
          );
        }
        item.selected_wide_material_id = Number(cs.wf_material_id);
        item.selected_paper_id         = null;
        item.selected_cover_paper_id   = null;
        item.cover_paper_type          = null;
        item.cover_paper_gsm           = null;
        item.cover_color_scheme        = null;
        item.cover_press_type          = null;
        item.color_scheme              = "Multicolor";
        return;
      }

      if (item.category === "Other") {
        item.selected_wide_material_id = null;
        item.selected_paper_id         = null;
        item.selected_cover_paper_id   = null;
        item.cover_paper_type          = null;
        item.cover_paper_gsm           = null;
        item.cover_color_scheme        = null;
        item.cover_press_type          = null;
        item.color_scheme              = "Multicolor";
        item.sides                     = null;
        return;
      }
      if(item.category === "Single Sheet"){
        if (!cs?.ss_paper_id) {
          throw new Error(
            `Paper ID missing for Single Sheet item "${item.enquiry_for}". ` +
            `Please recalculate before saving.`
          );
        }
        item.selected_paper_id         = Number(cs.ss_paper_id);
        item.selected_wide_material_id = null;
        item.selected_cover_paper_id   = null;
        item.cover_paper_type          = null;
        item.cover_paper_gsm           = null;
        item.cover_color_scheme        = null;
        item.cover_press_type          = null;
        return;
      }
      if(item.category === "Multiple Sheet"){
        if (!cs?.ms_cover_paper_id) {
          throw new Error(
            `Cover paper ID missing for Multiple Sheet item "${item.enquiry_for}". ` +
            `Please recalculate before saving.`
          );
        }
        item.selected_paper_id         = null;    // Multiple Sheet doesn't have single selected_paper_id — papers are in inside_papers[]
        item.selected_wide_material_id = null;
        item.selected_cover_paper_id   = Number(cs.ms_cover_paper_id);
        item.inside_pages              = Number(item.inside_pages);
        item.cover_pages               = Number(item.cover_pages);
        return;
      }
    }

    // ── Shared: upsert JobItemCosting ──
    async function upsertCosting(jobItemId, item) {
      const cs = item.costing_snapshot;
      if (!cs || item.category === "Other") return;
      if (item.category === "Wide Format") cs.wf_material_id = item.selected_wide_material_id;

      const costingData = {
        job_no, job_item_id: jobItemId, category: item.category,
        ss_paper_id:            cs.ss_paper_id            ?? null,
        ss_ups:                 cs.ss_ups                  ?? null,
        ss_sheets:              cs.ss_sheets               ?? null,
        ss_sheets_with_wastage: cs.ss_sheets_with_wastage  ?? null,
        ss_sheet_rate:          cs.ss_sheet_rate            ?? null,
        ss_sheet_cost:          cs.ss_sheet_cost            ?? null,
        ss_printing_cost:       cs.ss_printing_cost         ?? null,
        ms_inside_costing:              cs.ms_inside_costing              ?? null,
        ms_total_inside_sheet_cost:     cs.ms_total_inside_sheet_cost     ?? null,
        ms_total_inside_printing_cost:  cs.ms_total_inside_printing_cost  ?? null,
        ms_cover_paper_id:            cs.ms_cover_paper_id             ?? null,
        ms_cover_ups:                 cs.ms_cover_ups                  ?? null,
        ms_cover_sheets:              cs.ms_cover_sheets               ?? null,
        ms_cover_sheets_with_wastage: cs.ms_cover_sheets_with_wastage  ?? null,
        ms_cover_sheet_rate:          cs.ms_cover_sheet_rate            ?? null,
        ms_cover_sheet_cost:          cs.ms_cover_sheet_cost            ?? null,
        ms_cover_printing_cost:       cs.ms_cover_printing_cost         ?? null,
        wf_material_id:          cs.wf_material_id          ?? null,
        wf_calculation_type:     cs.wf_calculation_type      ?? null,
        wf_rolls_or_boards_used: cs.wf_rolls_or_boards_used  ?? null,
        wf_wastage_sqft:         cs.wf_wastage_sqft           ?? null,
        wf_ups:                  cs.wf_ups                    ?? null,
        wf_material_cost:        cs.wf_material_cost          ?? null,
        wf_printing_cost:        cs.wf_printing_cost          ?? null,
        binding_cost:            cs.binding_cost           ?? 0,
        binding_cost_per_copy:   cs.binding_cost_per_copy  ?? 0,
        total_sheet_cost:        cs.total_sheet_cost        ?? 0,
        total_printing_cost:     cs.total_printing_cost     ?? 0,
        sheet_cost_per_copy:     cs.sheet_cost_per_copy     ?? 0,
        printing_cost_per_copy:  cs.printing_cost_per_copy  ?? 0,
        unit_rate:               Number(cs.unit_rate ?? 0),
        item_total:              Number(cs.item_total ?? 0),
      };

      // Upsert via unique constraint on job_item_id
      const existing = await JobItemCosting.findOne({ where: { job_item_id: jobItemId }, transaction: t });
      if (existing) {
        await existing.update(costingData, { transaction: t });
      } else {
        await JobItemCosting.create(costingData, { transaction: t });
      }
    }

    // ── Strip DB-unknown fields helper ──
    const toSafeItem = (item) => {
      const {
        // ── DB identity — never trust client-sent values ──────────────────────
        id:            _id,
        _temp_id:      _tempId,
        job_no:        _jobNo,
        created_at:    _ca,
        updated_at:    _ua,
        createdAt:     _Cat,
        updatedAt:     _Uat,
        item_master_id: _imi,   // resolved fresh below

        // ── Sequelize eager-load association objects — not columns ────────────
        selectedPaper:        _sp,
        selectedCoverPaper:   _scp,
        selectedWideMaterial: _swm,
        itemMaster:           _im,
        jobCard:              _jc,
        costing:              _costing,
        // ── Frontend calc snapshot — goes to JobItemCosting, not JobItem ──────
        costing_snapshot: _cs,

        // ── UI-only dropdown caches — never sent to DB ────────────────────────
        available_items:          _ai,
        available_papers:         _ap,
        available_gsm:            _ag,
        available_gsm_cover:      _agc,
        available_bindings:       _ab,
        available_sizes:          _as,
        available_wide_materials: _awm,
        available_wide_gsm:       _awg,

        // ── Calc display fields — stored in JobItemCosting, not JobItem ───────
        best_inside_sheet:      _bis,
        best_inside_sheet_name: _bisn,
        best_inside_dimensions: _bid,
        best_inside_ups:        _biu,
        best_cover_sheet:       _bcs,
        best_cover_dimensions:  _bcd,
        best_cover_ups:         _bcu,
        selected_material:      _sm,
        calculation_type:       _ct,
        rolls_or_boards_used:   _rbu,
        wastage_sqft:           _ws,
        wide_ups:               _wu,
        material_info:          _mi,
        // ── Keep all remaining fields ───────
        ...safe
      } = item;
      return safe;
    };    


    // ── Delete removed items ──
    const existingItemIds = jobCard.items.map((i) => i.id);
    const updatedItemIds  = job_items.filter((i) => i.id).map((i) => i.id);
    const itemsToDelete   = existingItemIds.filter(
      (id) => !updatedItemIds.includes(id),
    );

    if (itemsToDelete.length > 0) {
      await JobItem.destroy({ where: { id: itemsToDelete }, transaction: t });
    }

    // Sanitizes fields that are MySQL ENUMs — empty string is not a valid ENUM value.
    // Applies to both update-existing and add-new item paths.
    const sanitizeItemEnums = (item) => ({
      ...item,
      press_type:        item.press_type        || null,
      color_scheme:      item.color_scheme?.trim() ? item.color_scheme : null,
      cover_press_type:  item.cover_press_type   || null,
      cover_color_scheme: item.cover_color_scheme || null,
      cover_to_print:    item.cover_to_print !== false, // ensure boolean, never undefined
      no_of_foldings:    item.folds_per_sheet  ? Number(item.folds_per_sheet)  : null,
      no_of_creases:     item.creases_per_sheet ? Number(item.creases_per_sheet) : null,
    });

    // ── Update existing items ──
    for (const item of job_items) {
      if (!item.id || !existingItemIds.includes(item.id)) continue;

      // ── Normalize enquiry_for (same as createJobCard) ─────────────────────
      const normalizedEnquiryFor = item.enquiry_for
        ? item.enquiry_for
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase())
        : "";


      let item_master_id = await ItemMaster.findOne({
        where: {
          category: item.category,
          item_name: db.sequelize.where(
            db.sequelize.fn("UPPER", db.sequelize.col("item_name")),
            "=",
            normalizedEnquiryFor.toUpperCase()
          ),
        },
        attributes: ["id"],
        transaction: t,
      });

        if (!item_master_id) {
          item_master_id = await ItemMaster.create(
            { category: item.category, item_name: normalizedEnquiryFor },
            { transaction: t }
          );
        }

      item.item_master_id = item_master_id?.dataValues.id;

      await resolvePaperIds(item);

      item.binding_types = Array.isArray(item.binding_types)
        ? item.binding_types
        : [];
      // ── sanitize before update — prevents ENUM validation errors ──
      await JobItem.update(
        sanitizeItemEnums(toSafeItem(item)), {
        where: { id: item.id },
        transaction: t,
      });

      await upsertCosting(item.id, item);
    }

    // Add new items
    const newItems = job_items.filter((i) => !i.id);

    if (newItems.length > 0) {
      console.log("adding new Job items: ", newItems);

      for (const item of newItems) {

        // ── Normalize enquiry_for ─────────────────────────────────────────────
        const normalizedEnquiryFor = item.enquiry_for
          ? item.enquiry_for
              .trim()
              .replace(/\s+/g, " ")
              .toLowerCase()
              .replace(/\b\w/g, (c) => c.toUpperCase())
          : "";

        if (!normalizedEnquiryFor) {
          throw new Error(`enquiry_for is empty for a ${item.category} item. Cannot save.`);
        }

        let item_master_id = await ItemMaster.findOne({
          where: {
            category: item.category,
            item_name: db.sequelize.where(
              db.sequelize.fn("UPPER", db.sequelize.col("item_name")),
              "=",
              normalizedEnquiryFor.toUpperCase()
            ),
          },
          attributes: ["id"],
          transaction: t,
        });

        if (!item_master_id) {
          console.log("ItemMaster not found for: ", item.category, item.enquiry_for);
          item_master_id = await ItemMaster.create({
            category: item.category,
            item_name: normalizedEnquiryFor,
          }, { transaction: t });
        }
        item.item_master_id = item_master_id.dataValues.id;

        await resolvePaperIds(item);
        item.binding_types = Array.isArray(item.binding_types)
            ? item.binding_types
            : [];
        item.inside_pages = item.inside_pages ? Number(item.inside_pages) : null;
        item.cover_pages = item.cover_pages ? Number(item.cover_pages) : null;

        const safeItem = sanitizeItemEnums(toSafeItem(item));
        const created = await JobItem.create({
          ...safeItem,
          job_no
        }, { transaction: t });

        await upsertCosting(created.id, item);
        
      }
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

    await JobAssignment.update(
      { status: "cancelled" },
      { where: { 
        job_no: job_no,
        status: ["assigned", "in_progress"],
      }, transaction: t }
    );

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
