import db from "../../models/index.js";

// Departments that can hold a delivery assignment. Production Workers keep
// their own department — this only lets them see/confirm deliveries that
// were assigned to them.
const DELIVERY_ELIGIBLE_DEPARTMENTS = ["Delivery", "Production Worker"];

/**
 * GET /api/fms/delivery-worker/assignments
 * Returns all pending delivery assignments for the logged-in delivery worker.
 * Includes job card details needed to display the delivery card.
 * upload_token is included so the frontend can call the existing public
 * confirm endpoint — reusing all Drive upload and confirmation logic.
 */
export const getMyDeliveryAssignments = async (req, res) => {
  try {
    if (!req.user || !DELIVERY_ELIGIBLE_DEPARTMENTS.includes(req.user.department)) {
      return res.status(403).json({
        message: "Delivery assignments are available to Delivery and Production Worker accounts only.",
      });
    }

    const assignments = await db.DeliveryAssignment.findAll({
      where: {
        worker_id: req.user.id,
        status: "pending",
      },
      attributes: [
        "id",
        "job_no",
        "worker_name",
        "upload_token",       // needed to call the public confirm endpoint
        "token_expires_at",
        "status",
        "created_at",
      ],
      include: [
        {
          model: db.JobCard,
          as: "jobCard",
          attributes: [
            "job_no",
            "client_name",
            "delivery_location",
            "delivery_address",
          ],
        },
      ],
      order: [["created_at", "ASC"]],
    });

    return res.json(assignments);
  } catch (err) {
    console.error("[getMyDeliveryAssignments error]", err);
    return res
      .status(500)
      .json({ message: "Failed to fetch delivery assignments." });
  }
};