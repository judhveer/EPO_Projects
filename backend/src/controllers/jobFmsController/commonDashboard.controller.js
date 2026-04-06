import { Op, fn, col, literal } from "sequelize";
import db from "../../models/index.js";

const {
  JobCard,
  JobAssignment,
  ClientApproval,
  User,
  JobItem,
  PaperMaster,
  ItemMaster,
  WideFormatMaterial,
  JobItemCosting,
} = db;

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
export const getDashboardJobs = async (req, res) => {
  console.log("getDashboardJobs called...");

  try {
    const { page = 1, limit = 50 } = req.query;

    const offset = (page - 1) * limit;

    const whereClause = buildWhereClause(req.query);
    // 1️⃣ COUNT (FAST)
    const total = await JobCard.count({
      where: whereClause,
    });

    // 2️⃣ DATA (with joins)
    const jobs = await JobCard.findAll({
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
        // {
        //   model: JobItem,
        //   as: "items",
        //   include: [
        //     { model: PaperMaster, as: "selectedPaper" }, // <-- important
        //     { model: PaperMaster, as: "selectedCoverPaper" },
        //     { model: ItemMaster, as: "itemMaster" },
        //   ],
        // },
        {
          model: ClientApproval,
          as: "clientApprovals",
          separate: true,
          limit: 1,
          order: [["instance", "DESC"]],
          required: false,
        },
        {
          model: JobAssignment,
          as: "assignments",
          separate: true,
          order: [["instance", "DESC"]],
        },
      ],
      limit: parseInt(limit),
      offset,
      order: [["created_at", "DESC"]],
    });

    res.json({
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
      },
      data: jobs,
    });
  } catch (error) {
    console.error("Error fetchig jobs: ", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getDashboardJobDetails = async (req, res) => {
  try {
    const { jobNo } = req.params;

    const job = await JobCard.findOne({
      where: { job_no: jobNo },
      attributes: ["job_no"],
      include: [
        {
          model: JobAssignment,
          as: "assignments",
          include: [
            { model: User, as: "designer", attributes: ["username"] },
            { model: User, as: "assignedBy", attributes: ["username"] },
          ],
          order: [["assigned_at", "ASC"]],
        },
        {
          model: ClientApproval,
          as: "clientApprovals",
          include: [{ model: User, as: "handledBy", attributes: ["username"] }],
          order: [["instance", "ASC"]],
        },
      ],
    });

    if (!job) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    res.json(job);
  } catch (err) {
    console.error("Dashboard job details error:", err);
    res.status(500).json({ message: "Failed to load job details" });
  }
};

export const getJobItemsByJobNo = async (req, res) => {
  try {
    const { jobNo } = req.params;

    const items = await JobItem.findAll({
      where: { job_no: jobNo },
      include: [
        { model: PaperMaster, as: "selectedPaper" },
        { model: PaperMaster, as: "selectedCoverPaper" },
        { model: ItemMaster, as: "itemMaster" },
        { model: WideFormatMaterial, as: "selectedWideMaterial" },
        { model: JobItemCosting, as: "costing" }, 
      ],
      order: [["id", "ASC"]],
    });

    const normalizeBindingTypes = (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      }
      return [];
    };

    const cleanedItems = items.map(item => {
      const json = item.toJSON();

      // Normalize costing JSON sub-fields so sidebar never crashes on null
      const costing = json.costing
        ? {
            ...json.costing,
            ms_inside_costing: Array.isArray(json.costing.ms_inside_costing)
              ? json.costing.ms_inside_costing
              : [],
          }
        : null;

        return {
          ...json,
          binding_types:  normalizeBindingTypes(json.binding_types),
          inside_papers:  Array.isArray(json.inside_papers) ? json.inside_papers : [],
          cover_to_print: json.cover_to_print !== false, // normalize to boolean
          costing,
        }
    });

    console.log("Fetched job items: ", cleanedItems);

    res.json(cleanedItems);
  } catch (err) {
    console.error("Job items fetch error:", err);
    res.status(500).json({ message: "Failed to load job items" });
  }
};
