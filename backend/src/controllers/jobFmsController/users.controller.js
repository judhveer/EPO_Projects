import models from "../../models/index.js";
import { Op } from "sequelize";
import { getCache, setCache, TTL, CACHE_KEYS } from "../../utils/cache.js";
import { getCheckedInIds } from "../../utils/jobFms/workerAttendance.js";

const { User } = models;



// All users except Boss
export const getNonBossUsers = async (req, res) => {
  try {

    const cacheKey = CACHE_KEYS.nonBossUsers;
    const cached = await getCache(cacheKey);

    if(cached){
      console.log("[getNonBossUsers] Cache hit");
      return res.json(cached);
    }

    const users = await User.findAll({
      where: { 
        role: { [Op.ne]: "Boss" },
        isActive: true,
      },
      attributes: ["id", "username", "department"],
    });

    await setCache(cacheKey, users, TTL.MASTER_DATA);

    res.json(users);
  } catch (error) {
    console.error("[getNonBossUsers error]", error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllCrms = async (req, res) => {
  try {

    const cacheKey = CACHE_KEYS.crmUsers;
    const cached = await getCache(cacheKey);

    if(cached){
      console.log("[getAllCrms] Cache hit");
      return res.json(cached);
    }

    const crms = await User.findAll({
      where: {
        department: {
          [Op.in]: ["CRM", "Sales dept"], // department is either CRM or Sales
        },
        role: {
          [Op.in]: ["Staff", "CRM"], // role is either Staff or CRM
        },
        isActive: true, // only active users
      },
      attributes: ["id", "username", "department", "role"], // add role for clarity
    });

    await setCache(cacheKey, crms, TTL.MASTER_DATA);

    res.json(crms);
  } catch (error) {
    console.error("[getAllCrms error]", error);
    res.status(500).json({ error: error.message });
  }
};


//  GET /api/users/workers?department=Production Worker
//  GET /api/users/workers?department=Delivery
//
//  CHANGED: Now filters by today's attendance.
//  Only returns workers who are currently PRESENT or LATE.
//  Redis cache REMOVED — attendance changes throughout the day.
//  A 10-min stale list would show absent workers as assignable.
// ─────────────────────────────────────────────────────────────────────────────
export const getWorkersByDepartment = async (req, res) => {
  try {
    const { department } = req.query;

    const ALLOWED_DEPARTMENTS = ["Production Worker", "Delivery"];

    if (!department) {
      return res.status(400).json({
        message: "department query param is required.",
      });
    }

    if (!ALLOWED_DEPARTMENTS.includes(department)) {
      return res.status(400).json({
        message: `Invalid department. Allowed values: ${ALLOWED_DEPARTMENTS.join(", ")}.`,
      });
    }

    const workers = await User.findAll({
      where: { 
        department, 
        isActive: true 
      },
      attributes: ["id", "username", "department"],
      order: [["username", "ASC"]],
    });

     // Keep only workers who are checked in right now (empty-list safe)
    const checkedIn = await getCheckedInIds(workers.map((w) => w.id));
    return res.json(workers.filter((w) => checkedIn.has(w.id)));

  } catch (error) {
    console.error("[getWorkersByDepartment error]", error);
    return res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/users/workers/for-delivery
//
//  NEW — used only for OUT_FOR_DELIVERY stage assignment.
//  Returns two separate groups so the UI can render them distinctly:
//    { delivery: [...], production: [...] }
//
//  Both groups are filtered by today's attendance (PRESENT or LATE only).
//  Email is included for Delivery workers (needed for challan email link).
//  Email is NOT included for Production Workers (they use their dashboard).
//
//  No Redis cache — same reason as getWorkersByDepartment above.
//
//  IMPORTANT: This route must be registered BEFORE /workers in the router
//  file — Express matches routes top-to-bottom and "/workers/for-delivery"
//  must be registered before "/workers" to avoid any ambiguity.
export const getWorkersForDelivery = async (req, res) => {
  try {
    // Run both queries in parallel — independent results
    const [deliveryWorkers, productionWorkers] = await Promise.all([
      User.findAll({
        where: { 
          department: "Delivery", 
          isActive: true 
        },
        // email included — Delivery workers receive the challan upload link by email
        attributes: ["id", "username", "department", "email"],
        order: [["username", "ASC"]],
      }),
      User.findAll({
        where: { 
          department: "Production Worker", 
          isActive: true 
        },
        // email NOT included — Production Workers use their dashboard, not email
        attributes: ["id", "username", "department"],
        order: [["username", "ASC"]],
      }),
    ]);

    // One attendance lookup covers both groups
    const checkedIn = await getCheckedInIds(
      [...deliveryWorkers, ...productionWorkers].map((w) => w.id)
    );

    return res.json({
      delivery: deliveryWorkers.filter((w) => checkedIn.has(w.id)),
      production: productionWorkers.filter((w) => checkedIn.has(w.id)),
    });
  } catch (error) {
    console.error("[getWorkersForDelivery error]", error);
    return res.status(500).json({ error: error.message });
  }
};




