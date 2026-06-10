import express from "express";
import models from "../../models/index.js";
import { Op } from "sequelize";
const { User } = models;

// All users except Boss
export const getNonBossUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { role: { [Op.ne]: "Boss" } },
      attributes: ["id", "username", "department"],
    });
    res.json(users);
  } catch (error) {
    console.error("[getNonBossUsers error]", error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllCrms = async (req, res) => {
  try {
    const crms = await User.findAll({
      where: {
        department: {
          [Op.in]: ["CRM", "Sales dept"], // department is either CRM or Sales
        },
        role: {
          [Op.in]: ["Staff", "CRM"], // role is either Staff or CRM
        },
      },
      attributes: ["id", "username", "department", "role"], // add role for clarity
    });


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

    const workers = await User.findAll({
      where: {
        department,
        isActive: true,
      },
      attributes: ["id", "username", "department"],
      order: [["username", "ASC"]],
    });

    return res.json(workers);
  } catch (error) {
    console.error("[getWorkersByDepartment error]", error);
    return res.status(500).json({ error: error.message });
  }
};