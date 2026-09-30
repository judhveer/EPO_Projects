import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import { authConfig } from "../config/auth.js";
import models from "../models/index.js";
import { sendMailForCreateUser } from "../email/sendMail.js";
import { userCreatedEmail } from "../email/templates/emailTemplates.js";
import path from "path";
import { deleteCache, delCachePattern, CACHE_KEYS, CACHE_PATTERNS } from "../utils/cache.js";
import {
  getLoginAttemptInfo,
  incrementLoginFailure,
  resetLoginAttempts,
  formatRetryAfter,
  LOGIN_LIMIT,
} from "../middlewares/rateLimiter.js";

import { OFFICES } from "../models/salesPipelineModels/User.model.js";



const { User } = models;

function sign(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      dept: user.department,
      username: user.username,
    },
    authConfig.jwtSecret,
    { expiresIn: authConfig.jwtExpiresIn }
  );
}

export async function login(req, res) {
  console.log("login controller called");
  try {
    const { identifier, password } = req.body;

    if (!identifier) {
      return res.status(400).json({
        message: "Email or Username is required",
        status: false,
        data: null,
      });
    }
    if (!password) {
      return res.status(400).json({
        message: "Password is required",
        status: false,
        data: null,
      });
    }

    // ── Step 1: Check if this account is already locked ───────────────────
    // Do this BEFORE hitting the database so a locked account never causes unnecessary DB queries from an attacker running automated scripts.
    const { count, ttl } = await getLoginAttemptInfo(identifier);
    if(count >= LOGIN_LIMIT){
      return res.status(429).json({
        message: `Too many failed login attempts. Please try again later.`,
        retryAfter: ttl,
        attemptsRemaining: 0,
        status: false,
        data: null,
      });
    }

    // ── Step 2: Find the user ─────────────────────────────────────────────
    const where = identifier.includes("@")
      ? { email: identifier }
      : { username: identifier };

    const user = await User.scope("withSecret").findOne({ where });

    if (!user || !user.isActive) {
      // Do NOT increment the counter for non-existent users —
      // it would let attackers enumerate valid usernames by watching which identifiers get locked and which do not.
      return res.status(400).json({
        message: "Invalid credentials or User is InActive",
        status: false,
        data: null,
      });
    }

    // ── Step 3: Check the password ────────────────────────────────────────
    const ok = await user.checkPassword(password);
    console.log(ok);
    if (!ok) {
      // Wrong password — increment failure counter for this account
      const { remaining, locked, ttl: newTtl } = await incrementLoginFailure(identifier);

      if (locked) {
        // This attempt pushed them over the limit — account now locked
        return res.status(429).json({
          message: `Too many failed login attempts. Please try again later.`,
          retryAfter: newTtl,
          attemptsRemaining: 0,
          status: false,
          data: null,
        });
      }

      // Still have attempts left — tell them how many
      return res.status(400).json({
        message: "Invalid credentials",
        attemptsRemaining: remaining,
        status: false,
        data: null,
      });
    }

    // ── Step 4: Successful login — reset failure counter ─────────────────
    // Critical: always reset on success so a legitimate user who eventually
    // gets their password right is never left with a stale failure counter.
    await resetLoginAttempts(identifier);

    user.lastLoginAt = new Date();
    await user.save();

    const token = sign(user);
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        department: user.department,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Login failed",
      status: false,
      data: null,
    });
  }
}

export async function createUser(req, res) {
  try {
    console.log("createUser called");
    // Only Admin/Boss routes call this (middleware enforced)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        errors: errors.array(),
      });
    }

    const { email, username, role, department, password, office, join_date } = req.body;

    if (!username || !role || !department || !password) {
      return res.status(400).json({
        message: "Username, role, department and password are required",
        status: false,
        data: null,
      });
    }

    // Email required except for Production Worker
    if (department !== "Production Worker" && !email) {
      return res.status(400).json({
        message: `Email is required for ${department}`,
        status: false,
        data: null,
      });
    }

    // ── NEW: office/join_date required for everyone except BOSS ────────
    // Mirrors User.model.js's enforceAttendanceFieldsPresent hook — the hook is the last line of defense, but validating here first means the admin gets a clean, specific 400 instead of a generic model-hook error surfacing as a 500.
    if(role !== 'BOSS'){
      if(!office){
        return res.status(400).json({
          message: "Office is required for all roles except BOSS.",
          status: false,
          data: null,
        });
      }

      if(!OFFICES.includes(office)) {
        return res.status(400).json({
          message: `Office must be one of: ${OFFICES.join(", ")}`,
          status: false,
          data: null,
        });
      }

      if(!join_date){
        return res.status(400).json({
          message: "Join date is required for all roles except BOSS.",
          status: false,
          data: null,
        });
      }

      if(isNaN(new Date(join_date).getTime())){
        return res.status(400).json({
          message: "Join date is not a valid date.",
          status: false,
          data: null,
        });
      }
    }

    // Check email only if provided
    if (email) {
      const exists = await User.findOne({
        where: { email },
      });

      if (exists) {
        return res.status(409).json({
          message: "Email already in use",
          status: false,
          data: null,
        });
      }
    }

    const userNameExists = await User.findOne({
      where: { username },
    });

    if (userNameExists) {
      return res.status(409).json({
        message: "Username already in use",
        status: false,
        data: null,
      });
    }

    const user = await User.scope("withSecret").create({
      email,
      username,
      role,
      department,
      office: role === "BOSS" ? null : office,
      join_date: role === "BOSS" ? null : join_date,
      createdBy: req.user.id,
      passwordHash: password,
    });

    user._password = password;
    await user.save();

    await deleteCache(
      CACHE_KEYS.nonBossUsers,
      CACHE_KEYS.crmUsers,
    );
    await delCachePattern(CACHE_PATTERNS.allWorkersDept);

    res.status(201).json({
      message: "User created successfully",
      status: true,
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        department: user.department,
        office: user.office,
        join_date: user.join_date,
      },
    });

    /* ---------------- EMAIL SENDING ---------------- */
    if (email) {
      try {
        const { subject, text, html } = userCreatedEmail({
          username,
          email,
          password,
          role,
          department,
          createdByName: req.user?.username || "Admin",
        });

        await sendMailForCreateUser({
          to: email,
          subject,
          text,
          html,
          attachments: [
            {
              filename: "epo-logo.jpg",
              path: path.resolve("assets/epo-logo.jpg"),
              cid: "epo-logo",
            },
          ],
        });
      } catch (mailError) {
        console.error(
          "Email failed but user created:",
          mailError.message
        );
      }
    }

    /* ------------------------------------------------ */
  } catch (error) {
    console.error("createUser error:", error);
    return res.status(500).json({
      message: error.message || "User creation failed",
      status: false,
      data: null,
    });
  }
}

export async function me(req, res) {
  return res.json({
    user: req.user,
  });
}

export async function getTelecallers(req, res) {
  try {
    const users = await User.findAll({
      where: {
        department: "Sales dept",
        role: "TELECALLER",
        is_active: true, // optional
      },
      attributes: ["id", "username", "email"],
      order: [["username", "ASC"]],
    });
    res.status(200).json(users);
  } catch (err) {
    console.error("getTelecallers error", err);
    res.status(500).json({ error: "Failed to fetch telecallers" });
  }
}

export async function getExecutives(req, res) {
  try {
    const users = await User.findAll({
      where: {
        department: "Sales dept",
        role: "EXECUTIVE",
        is_active: true,
      },
      attributes: ["id", "username", "email"],
      order: [["username", "ASC"]],
    });

    res.status(200).json(users);
  } catch (err) {
    console.error("getExecutives error", err);
    res.status(500).json({ error: "Failed to fetch Executives" });
  }
}


