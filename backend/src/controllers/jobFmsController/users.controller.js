import express from "express";
import models from "../../models/index.js";
import { Op } from "sequelize";
import { getCache, setCache, TTL, CACHE_KEYS } from "../../utils/cache.js";
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

/**
 * GET /api/users/workers?department=Production Worker
 * GET /api/users/workers?department=Delivery
 *
 * Returns all active users belonging to the given worker department.
 * Used by WorkerSelect component when coordinator assigns workers to a stage.
 * Only "Production Worker" and "Delivery" are valid departments here.
 */
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

    const cacheKey = CACHE_KEYS.workersByDept(department);
    const cached = await getCache(cacheKey);

    if(cached){
      console.log(`[getWorkersByDepartment] Cache hit for department: ${department}`);
      return res.json(cached);
    }

    const workers = await User.findAll({
      where: {
        department,
        isActive: true,
      },
      attributes: ["id", "username", "department"],
      order: [["username", "ASC"]],
    });

    await setCache(cacheKey, workers, TTL.WORKERS);

    return res.json(workers);
  } catch (error) {
    console.error("[getWorkersByDepartment error]", error);
    return res.status(500).json({ error: error.message });
  }
};