import db from "../../models/index.js";
import { Op } from "sequelize";
import { advanceStage } from "../../utils/jobFms/stageTracking.js";
import { sendMailForFMS } from "../../email/sendMail.js";
import { DateTime } from "luxon";
import {
  orderConfirmationTemplate,
  crmJobAssignmentTemplate,
  coordinatorJobReviewTemplate,
} from "../../email/templates/emailTemplates.js";
import path, { resolve } from "path";
// ✅ Fix 2 — import Sequelize directly (most reliable)
import { Transaction } from "sequelize";

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
  JobItemCosting,
} = db;

const calculateJobCompletionDeadline = (deliveryDateInput) => {
  // ⬅️ deliveryDateInput is already IST
  const deliveryIST = DateTime.fromISO(deliveryDateInput, {
    zone: "Asia/Kolkata",
  });

  if (!deliveryIST.isValid) {
    throw new Error("Invalid delivery date input");
  }

  const nowIST = DateTime.now().setZone("Asia/Kolkata");

  const todayIST = nowIST.startOf("day");
  const tomorrowIST = todayIST.plus({ days: 1 });

  const deliveryDayIST = deliveryIST.startOf("day");

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
  const subtotal = parseFloat(Number(totalAmount || 0).toFixed(2));
  const disc = parseFloat(Math.min(Number(discount || 0), subtotal).toFixed(2));
  const afterDiscount = parseFloat((subtotal - disc).toFixed(2));
  const rate = gstPct ? Number(gstPct) : 0;
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
      outbound_sent_to = null, // if outbound then this fields will be required
      paper_ordered_from = null, // if outbound then this fields will be required
      receiving_date_for_mm = null, // if outbound then this fields will be required
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
      return res
        .status(400)
        .json({ message: "GST percentage must be 5 or 18" });
    }

    const { gst_amount, final_amount } = computeGST(
      total_amount,
      discount,
      gst_percentage,
    );

    // calculate job completion deadline
    const job_completion_deadline =
      calculateJobCompletionDeadline(delivery_date);

    const initialStage = is_direct_to_production
      ? "production"
      : "coordinator_review";

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
        outbound_sent_to, // if outbound then this fields will be required
        paper_ordered_from, // if outbound then this fields will be required
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
      { transaction: t },
    );

    const job_no = jobCard.job_no;

    // if job_items are provided, create them
    if (job_items && job_items.length > 0) {
      for (const item of job_items) {
        const normalizedEnquiryFor = item.enquiry_for
          ? item.enquiry_for
              .trim() // remove leading/trailing spaces
              .replace(/\s+/g, " ") // collapse multiple spaces into one: "big  book" → "big book"
              .toLowerCase() // "BOOK" → "book"
              .replace(/\b\w/g, (c) => c.toUpperCase()) // capitalize first letter of each word: "book" → "Book"
          : "";

        if (!normalizedEnquiryFor) {
          throw new Error(
            `enquiry_for is empty for a ${item.category} item. Cannot save.`,
          );
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
              normalizedEnquiryFor.toUpperCase(),
            ),
          },
          attributes: ["id"],
          transaction: t,
        });

        if (!item_master_id) {
          console.log(
            "ItemMaster not found for: ",
            item.category,
            item.enquiry_for,
            item_master_id,
          );
          // Create with the normalized (clean) version — not whatever the user typed
          item_master_id = await ItemMaster.create(
            {
              category: item.category,
              item_name: normalizedEnquiryFor, // "Book Writing" not "  BOOK   writing  "
            },
            { transaction: t },
          );
        } else {
          console.log(
            `ItemMaster found: [${item.category}] "${normalizedEnquiryFor}" → id: ${item_master_id.dataValues.id}`,
          );
        }

        item.item_master_id = item_master_id.dataValues.id;

        const cs = item.costing_snapshot;

        /* ── WIDE FORMAT ── */
        if (item.category === "Wide Format") {
          if (!cs?.wf_material_id) {
            throw new Error(
              `Wide Format material ID missing for item "${item.enquiry_for}". ` +
                `Please recalculate before saving.`,
            );
          }
          item.selected_wide_material_id = Number(cs.wf_material_id);
          // Clean unrelated fields
          item.selected_paper_id = null;
          item.selected_cover_paper_id = null;
          item.cover_paper_type = null;
          item.cover_paper_gsm = null;
          item.cover_color_scheme = null;
          item.cover_press_type = null;
          item.color_scheme = "Multicolor";
        } else if (item.category === "Other") {
        /* ── OTHER ── */
          item.selected_wide_material_id = null;
          item.selected_paper_id = null;
          item.selected_cover_paper_id = null;
          item.cover_paper_type = null;
          item.cover_paper_gsm = null;
          item.cover_color_scheme = null;
          item.cover_press_type = null;
          item.color_scheme = "Multicolor";
          item.sides = null;
        } else if (item.category === "Single Sheet") {
        /* ── SINGLE SHEET & MULTIPLE SHEET ── */
          if (!cs?.ss_paper_id) {
            throw new Error(
              `Paper ID missing for Single Sheet item "${item.enquiry_for}". ` +
                `Please recalculate before saving.`,
            );
          }
          // Use selected_paper_id from costing_snapshot (resolved during calculation)
          item.selected_paper_id = Number(cs.ss_paper_id);
          item.selected_wide_material_id = null;
          item.selected_cover_paper_id = null;
          item.cover_paper_type = null;
          item.cover_paper_gsm = null;
          item.cover_color_scheme = null;
          item.cover_press_type = null;
        } else if (item.category === "Multiple Sheet") {
          if (!cs?.ms_cover_paper_id) {
            throw new Error(
              `Cover paper ID missing for Multiple Sheet item "${item.enquiry_for}". ` +
                `Please recalculate before saving.`,
            );
          }
          // selected_paper_id is NULL for Multiple Sheet — papers are in inside_papers[]
          item.selected_paper_id = null; // papers live in inside_papers[] JSON
          item.selected_wide_material_id = null;
          item.selected_cover_paper_id = Number(cs.ms_cover_paper_id);
          item.inside_pages = Number(item.inside_pages);
          item.cover_pages = Number(item.cover_pages);
        }

        // ── STEP 3: Strip ALL fields that must never be sent to JobItem.create ──
        // Doing this by explicit delete is safest — it mutates the loop variable
        // so the subsequent spread is clean.
        //
        // Why both camelCase AND snake_case?
        // Frontend JSON uses snake_case (Sequelize underscored:true).
        // Belt-and-suspenders: strip both so no timestamp can ever leak through.
        const STRIP_FIELDS = [
          "id", // old UUID — Sequelize auto-generates a fresh one
          "_temp_id", // frontend-only tracking key
          "job_no", // set explicitly below — never trust client-sent value
          "created_at", // snake_case timestamp from JSON
          "updated_at", // snake_case timestamp from JSON
          "createdAt", // camelCase fallback
          "updatedAt", // camelCase fallback
          "costing_snapshot", // frontend calc data — goes to JobItemCosting, not JobItem
          "costing", // Sequelize association object — not a column
          "selectedPaper", // Sequelize eager-load — not a column
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
          "paper_type", // display name — FK is selected_paper_id
          "paper_gsm", // display value — FK is selected_paper_id
          "cover_paper_type", // display name — FK is selected_cover_paper_id
          "cover_paper_gsm", // display value
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
            cover_to_print: item.cover_to_print !== false, // default true
            no_of_foldings: item.folds_per_sheet
              ? Number(item.folds_per_sheet)
              : null,
            no_of_creases: item.creases_per_sheet
              ? Number(item.creases_per_sheet)
              : null,
            press_type:
              item.press_type === "" || item.press_type === undefined
                ? null
                : item.press_type,
            cover_press_type:
              item.cover_press_type === "" ||
              item.cover_press_type === undefined
                ? null
                : item.cover_press_type,
            cover_color_scheme:
              item.cover_color_scheme === "" ||
              item.cover_color_scheme === undefined
                ? null
                : item.cover_color_scheme,
            color_scheme: item.color_scheme?.trim() ? item.color_scheme : null,
          },
          { transaction: t },
        );

        if (cs && item.category !== "Other") {
          // For Wide Format, set wf_material_id from the resolved FK
          if (item.category === "Wide Format") {
            cs.wf_material_id = item.selected_wide_material_id;
          }
          await JobItemCosting.create(
            {
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
              ms_inside_costing: cs.ms_inside_costing ?? null,
              ms_total_inside_sheet_cost: cs.ms_total_inside_sheet_cost ?? null,
              ms_total_inside_printing_cost:
                cs.ms_total_inside_printing_cost ?? null,
              // Multiple Sheet cover fields
              ms_cover_paper_id: cs.ms_cover_paper_id ?? null,
              ms_cover_ups: cs.ms_cover_ups ?? null,
              ms_cover_sheets: cs.ms_cover_sheets ?? null,
              ms_cover_sheets_with_wastage:
                cs.ms_cover_sheets_with_wastage ?? null,
              ms_cover_sheet_rate: cs.ms_cover_sheet_rate ?? null,
              ms_cover_sheet_cost: cs.ms_cover_sheet_cost ?? null,
              ms_cover_printing_cost: cs.ms_cover_printing_cost ?? null,
              // Wide Format fields
              wf_material_id: cs.wf_material_id ?? null,
              wf_calculation_type: cs.wf_calculation_type ?? null,
              wf_rolls_or_boards_used: cs.wf_rolls_or_boards_used ?? null,
              wf_wastage_sqft: cs.wf_wastage_sqft ?? null,
              wf_ups: cs.wf_ups ?? null,
              wf_material_cost: cs.wf_material_cost ?? null,
              wf_printing_cost: cs.wf_printing_cost ?? null,
              // Binding
              binding_cost: cs.binding_cost ?? 0,
              binding_cost_per_copy: cs.binding_cost_per_copy ?? 0,
              // Summary
              total_sheet_cost: cs.total_sheet_cost ?? 0,
              total_printing_cost: cs.total_printing_cost ?? 0,
              sheet_cost_per_copy: cs.sheet_cost_per_copy ?? 0,
              printing_cost_per_copy: cs.printing_cost_per_copy ?? 0,
              unit_rate: Number(cs.unit_rate ?? 0),
              item_total: Number(cs.item_total ?? 0),
            },
            { transaction: t },
          );
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
      { transaction: t },
    );

    // 4. Create StageTracking entry
    await advanceStage({
      job_no,
      new_stage: initialStage,
      performed_by_id: req.user?.id || null,
      remarks: is_direct_to_production
        ? "(Job created -> Direct to Production) Job sent directly to production"
        : "(Job created -> Coordinator review) Job sent for coordinator review",
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
        dashboardUrl: dashboardUrl, // Computed above
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
      { assigned_designer: { [Op.like]: `%${search}%` } },
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
    binding_types: normalizeJsonField(json.binding_types),
    inside_papers: normalizeJsonField(json.inside_papers),
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
      return res
        .status(404)
        .json({ message: `No job found with Job No: ${job_no}` });
    }

    // Convert to plain object so we can safely mutate JSON fields
    const json = jobCard.toJSON();

    // Normalize every item's JSON columns — MariaDB 11.x returns them as strings
    json.items = (json.items || []).map(normalizeJobItem);

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
 * Safely parses a value that may be a JSON string.
 * MariaDB 11.x stores JSON columns as longtext — Sequelize returns them as raw strings.
 * Returns parsed array/object if valid JSON, otherwise returns the original value.
 * Safe for: already-parsed arrays, null, undefined, plain non-JSON strings.
 */
const safeParseJson = (v) => {
  if (v === null || v === undefined) return v;
  if (typeof v !== "string") return v; // already parsed — array, object, number, etc.
  const trimmed = v.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* invalid JSON — return as-is */
    }
  }
  return v;
};

/**
 * UPDATE JOB CARD
 */
export const updateJobCard = async (req, res) => {
  console.log("updateJobCard called...");
  const { job_no } = req.params;
  const { job_items = [], ...updates } = req.body;

  // PRE-FLIGHT READS (outside transaction — no locks held yet)
  // Fetching the current state before we start writing keeps the
  // transaction window narrow and prevents long-held read locks from
  // blocking other writers.
  let jobCard;
  try {
    jobCard = await JobCard.findByPk(job_no, {
      include: [
        {
          model: JobItem,
          as: "items",
          include: [
            {
              model: PaperMaster,
              as: "selectedPaper",
              attributes: ["id", "paper_name", "gsm"],
            },
            {
              model: PaperMaster,
              as: "selectedCoverPaper",
              attributes: ["id", "paper_name", "gsm"],
            },
            {
              model: WideFormatMaterial,
              as: "selectedWideMaterial",
              attributes: ["id", "material_name", "gsm", "thickness_mm"],
            },
          ],
        },
        { model: JobAssignment, as: "assignments" },
      ],
    });
  } catch (readErr) {
    console.error("Pre-flight read failed:", readErr);
    return res
      .status(500)
      .json({ message: "Failed to read job card", error: readErr.message });
  }

  if (!jobCard) {
    return res.status(404).json({
      message: "JobCard not found",
    });
  }

  // ── Snapshot old state for diff (pure JS, no DB) ─────────────────────────
  const oldJobCardData = jobCard.toJSON();
  const TRACKED_JOBCARD_FIELDS = [
    "client_name",
    "client_type",
    "order_type",
    "order_source",
    "address",
    "contact_number",
    "email_id",
    "department",
    "reference",
    "execution_location",
    "delivery_location",
    "delivery_address",
    "delivery_date",
    "proof_date",
    "task_priority",
    "instructions",
    "total_amount",
    "advance_payment",
    "mode_of_payment",
    "payment_status",
    "no_of_files",
    "order_received_by",
    "order_handled_by",
    "is_direct_to_production",
    "outbound_sent_to",
    "paper_ordered_from",
    "receiving_date_for_mm",
    "discount",
    "gst_percentage",
  ];

  // ── Epoch bounds — any number in this range is treated as a date, not an amount
  // Jan 1 2000 → Jan 1 2100. Guards against quantities/amounts being mis-read as dates.
  const EPOCH_MIN = 946684800000; // new Date("2000-01-01").getTime()
  const EPOCH_MAX = 4102444800000; // new Date("2100-01-01").getTime()
  // ── Fields that store date-only (no time component) ───────────────────────────
  // These compare/display only the YYYY-MM-DD part, ignoring time.
  const DATE_ONLY_FIELDS = new Set(["proof_date", "receiving_date_for_mm"]);

  // ── Place this ONCE, before jobCardChanges and before modifiedItems ───────────
  // Normalizes a value for equality comparison:
  //   - null / undefined / "" → sentinel "__EMPTY__"
  //   - Numeric strings / decimals → Number (0.00 === 0, 494.00 === 494)
  //   - Date strings / Date objects → UTC epoch ms (same moment = same number)
  //   - Arrays → sorted JSON string
  //   - Everything else → trimmed string
  const normForDiff = (v, fieldName = "") => {
    if (v === null || v === undefined || v === "") return "__EMPTY__";

    // ── Arrays ────────────────────────────────────────────────────────────────
    if (Array.isArray(v)) return JSON.stringify([...v].sort());

    // ── JSON array/object string (MariaDB stores JSON columns as longtext) ────
    if (
      typeof v === "string" &&
      (v.trim().startsWith("[") || v.trim().startsWith("{"))
    ) {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return JSON.stringify([...parsed].sort());
        if (typeof parsed === "object") return JSON.stringify(parsed);
      } catch {
        /* not valid JSON — fall through */
      }
    }

    if (typeof v === "boolean") return String(v);

    // ── Epoch number → treat as date ──────────────────────────────────────────
    // MUST come before Number() check — epoch ms is a valid number but should
    // be compared as a date, not as a quantity.
    // new Date(epochMs) is the cleanest way to convert.
    if (typeof v === "number" && v >= EPOCH_MIN && v <= EPOCH_MAX) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) {
        // Date-only fields: compare just YYYY-MM-DD (ignore time zone shifts)
        if (DATE_ONLY_FIELDS.has(fieldName))
          return d.toISOString().slice(0, 10);
        // Datetime: round to minute — frontend datetime-local has minute precision only
        return String(Math.floor(d.getTime() / 60000));
      }
    }

    // ── Date string ───────────────────────────────────────────────────────────
    // Covers: "2026-04-17T18:03", "Fri Apr 17 2026 18:03:00 GMT+0530...", "2026-04-16"
    // new Date(string) handles all of these natively.
    if (typeof v === "string" && /\d{4}/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) {
        if (DATE_ONLY_FIELDS.has(fieldName))
          return d.toISOString().slice(0, 10);
        return String(Math.floor(d.getTime() / 60000));
      }
    }

    // ── Date object ───────────────────────────────────────────────────────────
    if (v instanceof Date && !isNaN(v.getTime())) {
      if (DATE_ONLY_FIELDS.has(fieldName)) return v.toISOString().slice(0, 10);
      return String(Math.floor(v.getTime() / 60000));
    }

    // ── Regular number / decimal ──────────────────────────────────────────────
    // "0.00" → 0, "494.00" → 494, "3694" → 3694
    const asNum = Number(v);
    if (!isNaN(asNum) && String(v).trim() !== "") return String(asNum);

    return String(v).trim();
  };

  // Build readable field-level diff for JobCard
  const jobCardChanges = {};
  TRACKED_JOBCARD_FIELDS.forEach((field) => {
    const oldVal = oldJobCardData[field];
    const newVal = updates[field];
    if (newVal === undefined) return; // field not sent — unchanged
    if (normForDiff(oldVal, field) !== normForDiff(newVal, field)) {
      jobCardChanges[field] = { from: oldVal ?? null, to: newVal ?? null };
    }
  });

  // Build item diff maps for email
  // Flatten association-derived fields into the item snapshot so diff works correctly.
  // paper_type / paper_gsm / wide_material_name are NOT DB columns — they live in
  // the eager-loaded association objects. Without this, old values always appear
  // "empty" causing false-positive diffs on every save.
  const oldItemMap = new Map(
    (jobCard.items || []).map((i) => {
      const raw = i.toJSON();
      return [
        i.id,
        {
          ...raw,
          // Flatten association → flat field (same keys the frontend sends)
          paper_type: raw.selectedPaper?.paper_name ?? null,
          paper_gsm: raw.selectedPaper?.gsm ?? null,
          cover_paper_type: raw.selectedCoverPaper?.paper_name ?? null,
          cover_paper_gsm: raw.selectedCoverPaper?.gsm ?? null,
          wide_material_name: raw.selectedWideMaterial?.material_name ?? null,
          wide_material_gsm: raw.selectedWideMaterial?.gsm ?? null,
          wide_material_thickness:
            raw.selectedWideMaterial?.thickness_mm ?? null,
        },
      ];
    }),
  );
  const incomingItemMap = new Map(
    job_items.filter((i) => i.id).map((i) => [i.id, i]),
  );

  const existingItemIds = [...oldItemMap.keys()];
  const updatedItemIds = [...incomingItemMap.keys()];
  const itemsToDelete = existingItemIds.filter(
    (id) => !updatedItemIds.includes(id),
  );
  const newItems = job_items.filter((i) => !i.id);
  // Diff for modified items (field level, human-readable)
  const TRACKED_ITEM_FIELDS = [
    "category",
    "enquiry_for",
    "size",
    "quantity",
    "uom",
    "sides",
    "paper_type",
    "paper_gsm",
    "color_scheme",
    "press_type",
    "inside_pages",
    "cover_pages",
    "cover_paper_type",
    "cover_paper_gsm",
    "cover_color_scheme",
    "cover_press_type",
    "cover_to_print",
    "binding_types",
    "unit_rate",
    "item_total",
    "wide_material_name",
    "wide_material_gsm",
    "wide_material_thickness",
    "item_instructions",
  ];
  const modifiedItems = [];
  incomingItemMap.forEach((newItem, id) => {
    if (!oldItemMap.has(id)) return;
    const oldItem = oldItemMap.get(id);
    const changes = {};

    TRACKED_ITEM_FIELDS.forEach((field) => {
      let oldVal = oldItem[field];
      let newVal = newItem[field];

      // MariaDB stores JSON columns (binding_types, binding_targets, inside_papers)
      // as longtext strings. Parse both sides so comparison works correctly.
      if (
        field === "binding_types" ||
        field === "binding_targets" ||
        field === "inside_papers"
      ) {
        oldVal = safeParseJson(oldVal);
        newVal = safeParseJson(newVal);
      }

      if (normForDiff(oldVal, field) !== normForDiff(newVal, field)) {
        changes[field] = { from: oldVal ?? null, to: newVal ?? null };
      }
    });

    if (Object.keys(changes).length > 0) {
      modifiedItems.push({
        enquiry_for: newItem.enquiry_for || oldItem.enquiry_for,
        changes,
      });
    }
  });

  const removedItems = itemsToDelete.map((id) => ({
    enquiry_for: oldItemMap.get(id)?.enquiry_for || `Item #${id}`,
    category: oldItemMap.get(id)?.category || "",
  }));

  const addedItems = newItems.map((i) => ({
    enquiry_for: i.enquiry_for || "(unnamed)",
    category: i.category || "",
  }));

  const jobItemChanges = {
    added: addedItems,
    removed: removedItems,
    modified: modifiedItems,
  };
  // ── Determine stage transition ────────────────────────────────────────────
  const wasDirectToProduction = jobCard.is_direct_to_production === true;
  const nowDirectToProduction = updates.is_direct_to_production === true;
  const nowRevertedFromProd =
    wasDirectToProduction && updates.is_direct_to_production === false;
  const nowMovingToProduction = !wasDirectToProduction && nowDirectToProduction;

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSACTION — writes only
  // ─────────────────────────────────────────────────────────────────────────
  const t = await db.sequelize.transaction({
    // READ COMMITTED prevents phantom reads causing unnecessary lock escalation.
    // SERIALIZABLE would be correct but causes far more deadlocks under load.
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    // ── Stage transitions ──────────────────────────────────────────────────
    if (nowMovingToProduction) {
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

    if (nowRevertedFromProd) {
      // Revert: production → coordinator_review
      updates.status = "coordinator_review";
      updates.current_stage = "coordinator_review";
      await advanceStage({
        job_no,
        new_stage: "coordinator_review",
        performed_by_id: req.user?.id || null,
        remarks:
          "(Job updated → Direct to Production unchecked, reverted to Coordinator Review)",
        transaction: t,
      });
    }

    // ── Delivery date change → recalculate deadline ───────────────────────
    if (
      updates.delivery_date &&
      updates.delivery_date !== oldJobCardData.delivery_date
    ) {
      updates.job_completion_deadline = calculateJobCompletionDeadline(
        updates.delivery_date,
      );
    }

    // ── GST recompute ─────────────────────────────────────────────────────
    const billingFieldChanged =
      "total_amount" in updates ||
      "discount" in updates ||
      "gst_percentage" in updates;

    if (billingFieldChanged) {
      // Validate GST if it was sent
      if (
        updates.gst_percentage !== undefined &&
        updates.gst_percentage !== null &&
        updates.gst_percentage !== "" &&
        ![5, 18].includes(Number(updates.gst_percentage))
      ) {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "GST percentage must be 5 or 18" });
      }

      // Use updated values if present, otherwise fall back to current DB values
      const latestTotal = Number(
        updates.total_amount ?? jobCard.total_amount ?? 0,
      );
      const latestDisc = Number(updates.discount ?? jobCard.discount ?? 0);
      const latestGstPct =
        "gst_percentage" in updates
          ? updates.gst_percentage
          : jobCard.gst_percentage;

      const { gst_amount, final_amount } = computeGST(
        latestTotal,
        latestDisc,
        latestGstPct,
      );

      updates.gst_amount = gst_amount;
      updates.final_amount = final_amount;
    }
    // ── JobCard update — single write, lock acquired here ─────────────────
    await jobCard.update(updates, { transaction: t });

    // ── Helpers (defined inside try so they share transaction `t`) ─────────
    async function resolvePaperIds(item) {
      const cs = item.costing_snapshot;
      if (item.category === "Wide Format") {
        if (!cs?.wf_material_id) {
          throw new Error(
            `Wide Format material ID missing for item "${item.enquiry_for}". ` +
              `Please recalculate before saving.`,
          );
        }
        item.selected_wide_material_id = Number(cs.wf_material_id);
        item.selected_paper_id = null;
        item.selected_cover_paper_id = null;
        item.cover_paper_type = null;
        item.cover_paper_gsm = null;
        item.cover_color_scheme = null;
        item.cover_press_type = null;
        item.color_scheme = "Multicolor";
        return;
      }

      if (item.category === "Other") {
        item.selected_wide_material_id = null;
        item.selected_paper_id = null;
        item.selected_cover_paper_id = null;
        item.cover_paper_type = null;
        item.cover_paper_gsm = null;
        item.cover_color_scheme = null;
        item.cover_press_type = null;
        item.color_scheme = "Multicolor";
        item.sides = null;
        return;
      }
      if (item.category === "Single Sheet") {
        if (!cs?.ss_paper_id) {
          throw new Error(
            `Paper ID missing for Single Sheet item "${item.enquiry_for}". ` +
              `Please recalculate before saving.`,
          );
        }
        item.selected_paper_id = Number(cs.ss_paper_id);
        item.selected_wide_material_id = null;
        item.selected_cover_paper_id = null;
        item.cover_paper_type = null;
        item.cover_paper_gsm = null;
        item.cover_color_scheme = null;
        item.cover_press_type = null;
        return;
      }
      if (item.category === "Multiple Sheet") {
        if (!cs?.ms_cover_paper_id) {
          throw new Error(
            `Cover paper ID missing for Multiple Sheet item "${item.enquiry_for}". ` +
              `Please recalculate before saving.`,
          );
        }
        item.selected_paper_id = null; // Multiple Sheet doesn't have single selected_paper_id — papers are in inside_papers[]
        item.selected_wide_material_id = null;
        item.selected_cover_paper_id = Number(cs.ms_cover_paper_id);
        item.inside_pages = Number(item.inside_pages);
        item.cover_pages = Number(item.cover_pages);
        return;
      }
    }

    // ── Shared: upsert JobItemCosting ──
    async function upsertCosting(jobItemId, item) {
      const cs = item.costing_snapshot;
      if (!cs || item.category === "Other") return;
      if (item.category === "Wide Format")
        cs.wf_material_id = item.selected_wide_material_id;

      const costingData = {
        job_no,
        job_item_id: jobItemId,
        category: item.category,
        ss_paper_id: cs.ss_paper_id ?? null,
        ss_ups: cs.ss_ups ?? null,
        ss_sheets: cs.ss_sheets ?? null,
        ss_sheets_with_wastage: cs.ss_sheets_with_wastage ?? null,
        ss_sheet_rate: cs.ss_sheet_rate ?? null,
        ss_sheet_cost: cs.ss_sheet_cost ?? null,
        ss_printing_cost: cs.ss_printing_cost ?? null,
        ms_inside_costing: cs.ms_inside_costing ?? null,
        ms_total_inside_sheet_cost: cs.ms_total_inside_sheet_cost ?? null,
        ms_total_inside_printing_cost: cs.ms_total_inside_printing_cost ?? null,
        ms_cover_paper_id: cs.ms_cover_paper_id ?? null,
        ms_cover_ups: cs.ms_cover_ups ?? null,
        ms_cover_sheets: cs.ms_cover_sheets ?? null,
        ms_cover_sheets_with_wastage: cs.ms_cover_sheets_with_wastage ?? null,
        ms_cover_sheet_rate: cs.ms_cover_sheet_rate ?? null,
        ms_cover_sheet_cost: cs.ms_cover_sheet_cost ?? null,
        ms_cover_printing_cost: cs.ms_cover_printing_cost ?? null,
        wf_material_id: cs.wf_material_id ?? null,
        wf_calculation_type: cs.wf_calculation_type ?? null,
        wf_rolls_or_boards_used: cs.wf_rolls_or_boards_used ?? null,
        wf_wastage_sqft: cs.wf_wastage_sqft ?? null,
        wf_ups: cs.wf_ups ?? null,
        wf_material_cost: cs.wf_material_cost ?? null,
        wf_printing_cost: cs.wf_printing_cost ?? null,
        binding_cost: cs.binding_cost ?? 0,
        binding_cost_per_copy: cs.binding_cost_per_copy ?? 0,
        total_sheet_cost: cs.total_sheet_cost ?? 0,
        total_printing_cost: cs.total_printing_cost ?? 0,
        sheet_cost_per_copy: cs.sheet_cost_per_copy ?? 0,
        printing_cost_per_copy: cs.printing_cost_per_copy ?? 0,
        unit_rate: Number(cs.unit_rate ?? 0),
        item_total: Number(cs.item_total ?? 0),
      };

      // findOrCreate avoids INSERT + UPDATE race — safe under concurrency.
      const [existing, created] = await JobItemCosting.findOrCreate({
        where: { job_item_id: jobItemId },
        defaults: costingData,
        transaction: t,
      });
      if (!created) {
        await existing.update(costingData, { transaction: t });
      }
    }

    // ── Strip DB-unknown fields helper ──
    const toSafeItem = (item) => {
      const {
        // ── DB identity — never trust client-sent values ──────────────────────
        id: _id,
        _temp_id: _tempId,
        job_no: _jobNo,
        created_at: _ca,
        updated_at: _ua,
        createdAt: _Cat,
        updatedAt: _Uat,
        item_master_id: _imi, // resolved fresh below

        selectedPaper,
        selectedCoverPaper,
        selectedWideMaterial,
        itemMaster,
        jobCard: _jc,
        costing,
        costing_snapshot,
        available_items,
        available_papers,
        available_gsm,
        available_gsm_cover,
        available_bindings,
        available_sizes,
        available_wide_materials,
        available_wide_gsm,
        best_inside_sheet,
        best_inside_sheet_name,
        best_inside_dimensions,
        best_inside_ups,
        best_cover_sheet,
        best_cover_dimensions,
        best_cover_ups,
        selected_material,
        calculation_type,
        rolls_or_boards_used,
        wastage_sqft,
        wide_ups,
        material_info,
        is_calculating,
        calc_error,
        ...safe
      } = item;
      return safe;
    };

    // Sanitizes fields that are MySQL ENUMs — empty string is not a valid ENUM value.
    // Applies to both update-existing and add-new item paths.
    const sanitizeItemEnums = (item) => ({
      ...item,
      press_type: item.press_type || null,
      color_scheme: item.color_scheme?.trim() ? item.color_scheme : null,
      cover_press_type: item.cover_press_type || null,
      cover_color_scheme: item.cover_color_scheme || null,
      cover_to_print: item.cover_to_print !== false, // ensure boolean, never undefined
      no_of_foldings: item.folds_per_sheet
        ? Number(item.folds_per_sheet)
        : null,
      no_of_creases: item.creases_per_sheet
        ? Number(item.creases_per_sheet)
        : null,
    });

    const normalizeEnquiryFor = (raw) =>
      (raw || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());

    // ── Delete removed items ──
    // Sort ascending so MySQL locks rows in a predictable order → fewer deadlocks.
    const sortedItemsToDelete = [...itemsToDelete].sort((a, b) => a - b);
    if (sortedItemsToDelete.length > 0) {
      await JobItem.destroy({
        where: { id: sortedItemsToDelete },
        transaction: t,
      });
    }
    // ── Update existing items (ascending id order — consistent lock order) ──
    const sortedExistingUpdates = job_items
      .filter((i) => i.id && existingItemIds.includes(i.id))
      .sort((a, b) => a.id - b.id);

    for (const item of sortedExistingUpdates) {
      const enquiryFor = normalizeEnquiryFor(item.enquiry_for);

      // findOrCreate: safe under concurrency — unique constraint on (category, item_name)
      const [itemMaster] = await ItemMaster.findOrCreate({
        where: { category: item.category, item_name: enquiryFor },
        defaults: { category: item.category, item_name: enquiryFor },
        transaction: t,
      });
      item.item_master_id = itemMaster.id;

      await resolvePaperIds(item);
      item.binding_types = Array.isArray(item.binding_types)
        ? item.binding_types
        : [];

      await JobItem.update(sanitizeItemEnums(toSafeItem(item)), {
        where: { id: item.id },
        transaction: t,
      });

      await upsertCosting(item.id, item);
    }

    // ── Add new items ──
    for (const item of newItems) {
      const enquiryFor = normalizeEnquiryFor(item.enquiry_for);
      if (!enquiryFor)
        throw new Error(
          `enquiry_for is empty for a ${item.category} item. Cannot save.`,
        );

      const [itemMaster] = await ItemMaster.findOrCreate({
        where: { category: item.category, item_name: enquiryFor },
        defaults: { category: item.category, item_name: enquiryFor },
        transaction: t,
      });
      item.item_master_id = itemMaster.id;

      await resolvePaperIds(item);
      item.binding_types = Array.isArray(item.binding_types)
        ? item.binding_types
        : [];
      item.inside_pages = item.inside_pages ? Number(item.inside_pages) : null;
      item.cover_pages = item.cover_pages ? Number(item.cover_pages) : null;

      const created = await JobItem.create(
        { ...sanitizeItemEnums(toSafeItem(item)), job_no },
        { transaction: t },
      );

      await upsertCosting(created.id, item);
    }

    // ── Activity log ─────────────────────────────────────────────────────
    let actionLabel = "JobCard Updated";
    if (nowMovingToProduction) actionLabel = "Job marked Direct to Production";
    if (nowRevertedFromProd) actionLabel = "Job reverted to Coordinator Review";

    await ActivityLog.create(
      {
        job_no,
        action: actionLabel,
        performed_by_id: req.user?.id || null,
        meta: {
          jobCardChanges,
          jobItemChanges,
          stage_transition: nowMovingToProduction
            ? "pending → production"
            : nowRevertedFromProd
              ? "production → coordinator_review"
              : null,
        },
      },
      { transaction: t },
    );

    await t.commit();

    // ── Fetch final state for response + email (outside transaction) ──────
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

    // ── Email notification (fire-and-forget — never blocks response) ──────
    const hasAnyChange =
      Object.keys(jobCardChanges).length > 0 ||
      addedItems.length > 0 ||
      removedItems.length > 0 ||
      modifiedItems.length > 0;

    if (hasAnyChange || nowMovingToProduction || nowRevertedFromProd) {
      sendJobNotificationEmail({
        job: updatedJobCard,
        subject: `JobCard Updated | Job No: ${job_no}`,
        actionType: "updated",
        jobCardChanges,
        jobItemChanges,
        stageTransition: nowMovingToProduction
          ? "production"
          : nowRevertedFromProd
            ? "coordinator_review"
            : null,
        performedBy: req.user?.username || "Job Writer",
      }).catch((emailErr) => {
        // Email failure must NEVER fail the API response
        console.error("Email send failed (non-fatal):", emailErr.message);
      });
    }
  } catch (error) {
    // t.rollback() is safe to call even if already committed — Sequelize no-ops it
    await t.rollback().catch(() => {});
    console.error("Error updating JobCard:", error);
    return res.status(500).json({
      message:
        error.message?.includes("missing") || error.message?.includes("empty")
          ? error.message // business rule error — safe to surface
          : "Internal server error",
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
      {
        where: {
          job_no: job_no,
          status: ["assigned", "in_progress"],
        },
        transaction: t,
      },
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
    if (!t.finished) {
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

/**
 * Renders the "what changed" section of the update email.
 * Produces a human-readable HTML block showing:
 *   - Stage transition (if any)
 *   - JobCard field changes
 *   - Items added
 *   - Items removed
 *   - Items modified (field level)
 */
function renderUpdatedChanges(
  job,
  jobCardChanges,
  jobItemChanges,
  stageTransition,
  performedBy,
) {
  const sections = [];

  // ── Stage transition banner ───────────────────────────────────────────
  if (stageTransition === "production") {
    sections.push(`
      <div style="background:#fef9c3;border:1px solid #eab308;border-radius:6px;padding:12px;margin-bottom:16px">
        <p style="margin:0;font-weight:bold;color:#713f12">
          🏭 This job has been marked <span style="color:#16a34a">Direct to Production</span>
          and moved to the Production stage.
        </p>
      </div>
    `);
  } else if (stageTransition === "coordinator_review") {
    sections.push(`
      <div style="background:#fef9c3;border:1px solid #eab308;border-radius:6px;padding:12px;margin-bottom:16px">
        <p style="margin:0;font-weight:bold;color:#713f12">
          🔄 "Direct to Production" was <span style="color:#dc2626">unchecked</span>.
          This job has been <strong>reverted to Coordinator Review</strong>.
        </p>
      </div>
    `);
  }

  // Fields to display without time
  const DATE_ONLY_DISPLAY = new Set(["proof_date", "receiving_date_for_mm"]);

  // ── Epoch bounds — any number in this range is treated as a date, not an amount
  // Jan 1 2000 → Jan 1 2100. Guards against quantities/amounts being mis-read as dates.
  const EPOCH_MIN = 946684800000; // new Date("2000-01-01").getTime()
  const EPOCH_MAX = 4102444800000; // new Date("2100-01-01").getTime()

  // ── Helper: format a value for display ────────────────────────────────
  const fmt = (v, fieldName = "") => {
    if (v === null || v === undefined || v === "") {
      return '<em style="color:#aaa">empty</em>';
    }
    if (typeof v === "boolean") return v ? "Yes" : "No";

    if (Array.isArray(v)) {
      return v.length > 0 ? v.join(", ") : '<em style="color:#aaa">none</em>';
    }

    // JSON array/object string (MariaDB longtext)
    if (
      typeof v === "string" &&
      (v.trim().startsWith("[") || v.trim().startsWith("{"))
    ) {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) {
          return parsed.length > 0
            ? parsed.join(", ")
            : '<em style="color:#aaa">none</em>';
        }
      } catch {
        /* fall through */
      }
    }

    // ── NEW: Date object (Sequelize toJSON() returns DATE columns as Date instances) ──
    // MUST come before Number() check — Number(new Date()) = epoch ms = raw number if missed.
    if (v instanceof Date && !isNaN(v.getTime())) {
      if (DATE_ONLY_DISPLAY.has(fieldName)) {
        return v.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        });
      }
      return v.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
      });
    }

    // Epoch number (e.g. stored as bigint in some MariaDB configs)
    if (typeof v === "number" && v >= EPOCH_MIN && v <= EPOCH_MAX) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) {
        if (DATE_ONLY_DISPLAY.has(fieldName)) {
          return d.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "Asia/Kolkata",
          });
        }
        return d.toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        });
      }
    }

    // Date string
    if (typeof v === "string" && /\d{4}/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) {
        if (DATE_ONLY_DISPLAY.has(fieldName)) {
          return d.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "Asia/Kolkata",
          });
        }
        return d.toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        });
      }
    }

    // Regular number — strip unnecessary decimal zeros
    const asNum = Number(v);
    if (!isNaN(asNum) && String(v).trim() !== "") {
      return asNum % 1 === 0 ? String(asNum) : asNum.toFixed(2);
    }

    return String(v);
  };

  // ── JobCard field changes ─────────────────────────────────────────────
  const fieldEntries = Object.entries(jobCardChanges);
  if (fieldEntries.length > 0) {
    const rows = fieldEntries
      .map(([field, { from, to }]) => {
        const label = field
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        return `
        <tr>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;font-weight:600;white-space:nowrap">
            ${label}
          </td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;color:#dc2626;text-decoration:line-through">
            ${fmt(from, field)}
          </td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;color:#16a34a;font-weight:600">
            ${fmt(to, field)}
          </td>
        </tr>
      `;
      })
      .join("");

    sections.push(`
      <h3 style="color:#2563eb;margin-bottom:6px">📋 Job Card Changes</h3>
      <table border="0" cellpadding="0" cellspacing="0"
        style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left">Field</th>
            <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left">Old Value</th>
            <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left">New Value</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  }

  // ── Added items ───────────────────────────────────────────────────────
  if (jobItemChanges.added?.length > 0) {
    const rows = jobItemChanges.added
      .map(
        (i) => `
      <tr>
        <td style="padding:6px 8px;border:1px solid #e2e8f0">
          <span style="color:#16a34a;font-weight:bold">➕ Added</span>
        </td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0">${i.enquiry_for}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;color:#64748b">${i.category}</td>
      </tr>
    `,
      )
      .join("");

    sections.push(`
      <h3 style="color:#16a34a;margin-bottom:6px">➕ Items Added (${jobItemChanges.added.length})</h3>
      <table border="0" cellpadding="0" cellspacing="0"
        style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
        <thead>
          <tr style="background:#f0fdf4">
            <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left">Action</th>
            <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left">Item</th>
            <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left">Category</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  }

  // ── Removed items ─────────────────────────────────────────────────────
  if (jobItemChanges.removed?.length > 0) {
    const rows = jobItemChanges.removed
      .map(
        (i) => `
      <tr>
        <td style="padding:6px 8px;border:1px solid #e2e8f0">
          <span style="color:#dc2626;font-weight:bold">➖ Removed</span>
        </td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0">${i.enquiry_for}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;color:#64748b">${i.category}</td>
      </tr>
    `,
      )
      .join("");

    sections.push(`
      <h3 style="color:#dc2626;margin-bottom:6px">➖ Items Removed (${jobItemChanges.removed.length})</h3>
      <table border="0" cellpadding="0" cellspacing="0"
        style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
        <thead>
          <tr style="background:#fef2f2">
            <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left">Action</th>
            <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left">Item</th>
            <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left">Category</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  }

  // ── Modified items ────────────────────────────────────────────────────
  if (jobItemChanges.modified?.length > 0) {
    const itemBlocks = jobItemChanges.modified
      .map((modItem) => {
        const fieldRows = Object.entries(modItem.changes)
          .map(([field, { from, to }]) => {
            const label = field
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());
            return `
        <tr>
          <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:12px">${label}</td>
          <td style="padding:5px 8px;border:1px solid #e2e8f0;color:#dc2626;text-decoration:line-through;font-size:12px">
            ${fmt(from, field)}
          </td>
          <td style="padding:5px 8px;border:1px solid #e2e8f0;color:#16a34a;font-weight:600;font-size:12px">
            ${fmt(to, field)}
          </td>
        </tr>
      `;
          })
          .join("");

        return `
        <div style="margin-bottom:12px">
          <p style="margin:0 0 4px;font-weight:bold;color:#1e40af">
            ✏️ ${modItem.enquiry_for}
          </p>
          <table border="0" cellpadding="0" cellspacing="0"
            style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f8fafc">
                <th style="padding:5px 8px;border:1px solid #e2e8f0;text-align:left">Field</th>
                <th style="padding:5px 8px;border:1px solid #e2e8f0;text-align:left">Old</th>
                <th style="padding:5px 8px;border:1px solid #e2e8f0;text-align:left">New</th>
              </tr>
            </thead>
            <tbody>${fieldRows}</tbody>
          </table>
        </div>
      `;
      })
      .join("");

    sections.push(`
      <h3 style="color:#d97706;margin-bottom:8px">✏️ Items Modified (${jobItemChanges.modified.length})</h3>
      <div style="margin-bottom:16px">${itemBlocks}</div>
    `);
  }

  // ── No changes (should not happen since we guard before calling, but safe fallback) ──
  if (sections.length === 0) {
    sections.push(
      `<p style="color:#64748b">No field-level changes detected. Job metadata was updated.</p>`,
    );
  }

  return `
    <h2 style="color:#2563eb">🔄 Job Card Updated — Job No: ${job.job_no}</h2>
    <p style="color:#64748b;margin-bottom:16px">
      The following changes were made to Job <strong>#${job.job_no}</strong>
      (Client: <strong>${job.client_name}</strong>) by <strong>${performedBy}</strong>:
    </p>
    ${sections.join("")}
  `;
}

/**
 * Stage → which roles receive the notification email.
 *
 * "coordinator_review" → Process Coordinators + CRM
 * "production"         → Production team + Process Coordinators + CRM
 * null / other         → Process Coordinators + CRM + Designer (if assigned)
 */
const STAGE_ROLE_MAP = {
  production: ["Production", "Process Coordinator", "CRM"],
  coordinator_review: ["Process Coordinator", "CRM"],
};

// =====================================================
// 4. ✉️ Helper: Sends notification mail to CRM, Coordinators, Designer for Updated / Cancelled Job
// =====================================================
async function sendJobNotificationEmail({
  job,
  subject,
  actionType,
  jobCardChanges = {},
  jobItemChanges = {},
  stageTransition = null,
  performedBy = "System",
}) {
  try {
    const {
      job_no,
      order_handled_by,
      delivery_date,
      task_priority,
      // client_name,
      // order_type,
      // execution_location,
    } = job;

    // ── Resolve recipient roles based on new stage ────────────────────────
    const targetRoles = STAGE_ROLE_MAP[stageTransition] || [
      "Process Coordinator",
      "CRM",
    ];
    const includeDesigner = !stageTransition; // only include designer on plain updates

    // ── Fetch CRM user (the person named in order_handled_by) ─────────────
    const crmUser = order_handled_by
      ? await User.findOne({ where: { username: order_handled_by } })
      : null;

    // ── Fetch Process Coordinators ─────────────────────────────────────────
    const coordinators = targetRoles.includes("Process Coordinator")
      ? await User.findAll({ where: { department: "Process Coordinator" } })
      : [];

    // ── Fetch Production team ──────────────────────────────────────────────
    const productionUsers = targetRoles.includes("Production")
      ? await User.findAll({ where: { department: "Production" } })
      : [];

    // ── Fetch Designer (only if assigned and stage warrants it) ───────────
    let designerUser = null;
    if (
      includeDesigner &&
      Array.isArray(job.assignments) &&
      job.assignments.length > 0
    ) {
      const designerAssignment = job.assignments[0];
      designerUser = designerAssignment?.designer_id
        ? await User.findOne({ where: { id: designerAssignment.designer_id } })
        : null;
    }

    // ── Deduplicate recipients ─────────────────────────────────────────────
    const seen = new Set();
    const recipients = [
      ...(crmUser?.email ? [crmUser.email] : []),
      ...coordinators.map((u) => u.email).filter(Boolean),
      ...productionUsers.map((u) => u.email).filter(Boolean),
      ...(designerUser?.email ? [designerUser.email] : []),
    ].filter((email) => {
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });

    if (recipients.length === 0) {
      console.warn("⚠️ No recipients found for job notification.");
      return;
    }

    // ── Build HTML ─────────────────────────────────────────────────────────
    const isCancelled = actionType === "cancelled";
    const mainContent = isCancelled
      ? renderCancelledEmail(job)
      : renderUpdatedChanges(
          job,
          jobCardChanges,
          jobItemChanges,
          stageTransition,
          performedBy,
        );

    const emailHTML = `
      <div style="font-family:Arial,sans-serif;color:#333;line-height:1.6;max-width:720px;margin:auto">
        <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

        ${mainContent}

        <table border="1" cellpadding="8" cellspacing="0"
          style="border-collapse:collapse;width:100%;font-size:14px;margin-top:20px">
          <tr><th align="left">Job No</th>        <td>${job.job_no}</td></tr>
          <tr><th align="left">Client</th>         <td>${job.client_name}</td></tr>
          <tr><th align="left">Order Type</th>     <td>${job.order_type}</td></tr>
          <tr><th align="left">Handled By</th>     <td>${job.order_handled_by}</td></tr>
          <tr><th align="left">Delivery Date</th>  <td>${delivery_date ? new Date(delivery_date).toLocaleString() : "—"}</td></tr>
          <tr><th align="left">Priority</th>       <td>${task_priority}</td></tr>
          <tr><th align="left">Updated By</th>     <td>${performedBy}</td></tr>
        </table>

        <hr style="border:none;border-top:1px solid #ccc;margin:20px 0" />
        <p style="font-size:13px;color:#888">— Automated Notification | Eastern Panorama Offset</p>
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
    console.log(`📧 Job update notification sent to: ${recipients.join(", ")}`);
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
