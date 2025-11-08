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
          [Op.in]: ["CRM", "Sales"], // department is either CRM or Sales
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
