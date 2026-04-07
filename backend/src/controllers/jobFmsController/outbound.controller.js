import db from "../../models/index.js";
const { JobCard, JobItem } = db;
import { Op, fn, col, literal } from "sequelize";

export const getOutboundJobs = async (req, res) => {
  try {
    const jobs = await JobCard.findAll({
      where: {
        execution_location: "Out-Bound",
        status: {
          // Exclude fully completed or cancelled — adjust to your workflow
          [Op.notIn]: ["completed", "cancelled"],
        },
      },
      attributes: [
        "job_no",
        "client_name",
        "order_handled_by",
        "delivery_date",
        "delivery_location",
        "delivery_address",
        "task_priority",
        "instructions",
        "no_of_files",
        "job_completion_deadline",
        "status",
        "outbound_sent_to",
        "paper_ordered_from",
        "receiving_date_for_mm",
        "created_at",
      ],
      attributes: {
        include: [
          // item count without loading all rows
          [
            literal(
              `(SELECT COUNT(*) FROM jobfms_job_items WHERE jobfms_job_items.job_no = JobCard.job_no)`
            ),
            "item_count",
          ],
        ],
        exclude: [], // keep all JobCard attributes above
      },
      order: [["created_at", "DESC"]],
    });

    return res.json({
      success: true,
      total: jobs.length,
      data: jobs,
    });
  } catch (err) {
    console.error("getOutboundJobs error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch outbound jobs",
    });
  }
};