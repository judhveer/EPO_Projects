import db from "../../models/index.js";
import { Op } from "sequelize";

const ALLOWED = ["Admin", "Production Coordinator"];
function ensureRole(req) {
  if (!req.user || !ALLOWED.includes(req.user.department)) {
    const e = new Error("Not authorized.");
    e.statusCode = 403;
    throw e;
  }
}

/**
 * GET /api/fms/workers?role=printing&active=true
 */
export const getWorkers = async (req, res) => {
  try {
    ensureRole(req);
    const { role, active = "true" } = req.query;

    const where = {};

    if (role) where.role = role;

    if (active !== "all") where.is_active = active === "true";

    const workers = await db.ProductionWorkerMaster.findAll({
      where,
      order: [["worker_code", "ASC"]],
    });
    return res.json(workers);
  } catch (err) {
    const s = err.statusCode || 500;
    return res.status(s).json({
      message: err.message || "Failed to fetch workers.",
    });
  }
};

/**
 * POST /api/fms/workers
 */
export const createWorker = async (req, res) => {
  try {
    ensureRole(req);
    const { worker_code, name, role, email, phone } = req.body;

    if (!worker_code?.trim()) {
      return res.status(400).json({
        message: "worker_code is required.",
      });
    }
    if (!name?.trim()) {
      return res.status(400).json({
        message: "name is required.",
      });
    }
    if (!role) {
      return res.status(400).json({
        message: "role is required.",
      });
    }
    if (role === "delivery" && !email?.trim()) {
      return res.status(400).json({
        message: "Email is required for delivery workers.",
      });
    }

    const exists = await db.ProductionWorkerMaster.findOne({
      where: {
        worker_code: worker_code.trim().toUpperCase(),
      },
    });
    if (exists) {
      return res.status(409).json({
        message: `Worker code ${worker_code} already exists.`,
      });
    }

    const worker = await db.ProductionWorkerMaster.create({
      worker_code: worker_code.trim().toUpperCase(),
      name: name.trim(),
      role,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      is_active: true,
    });
    return res.status(201).json(worker);
  } catch (err) {
    const s = err.statusCode || 500;
    return res.status(s).json({
      message: err.message || "Failed to create worker.",
    });
  }
};

/**
 * PATCH /api/fms/workers/:id
 */
export const updateWorker = async (req, res) => {
  try {
    ensureRole(req);
    const { id } = req.params;
    const { name, email, phone, is_active } = req.body;

    const worker = await db.ProductionWorkerMaster.findByPk(id);
    if (!worker) {
      return res.status(404).json({ message: "Worker not found." });
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined) updates.email = email?.trim() || null;
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (is_active !== undefined) updates.is_active = Boolean(is_active);

    if (
      worker.role === "delivery" &&
      updates.email === null &&
      email !== undefined
    ) {
      return res.status(400).json({
        message: "Email cannot be removed from a delivery worker.",
      });
    }

    await worker.update(updates);
    return res.json(worker);
  } catch (err) {
    const s = err.statusCode || 500;
    return res.status(s).json({
      message: err.message || "Failed to update worker.",
    });
  }
};
