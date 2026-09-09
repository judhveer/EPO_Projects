import express from "express";
import { body } from "express-validator";
import { OFFICES } from "../../models/salesPipelineModels/User.model.js"; 

import {
    listUsers,
    updateUser,
    toggleUserStatus,
    deleteUser,
} from "../controllers/adminUsers.controller.js";

const router = express.Router();

router.get("/", listUsers);

router.patch(
    "/:id",
    body("username").optional().isString().isLength({ min: 3, max: 64 }),
    body("email").optional({ checkFalsy: true }).isEmail(),
    body("password").optional({ checkFalsy: true }).isStrongPassword({ minLength: 8, minSymbols: 0 }),
    body("department").optional().isString(),
    body("role").optional().isString(),
    body("office").optional({ checkFalsy: true }).isIn(OFFICES),
    body("join_date").optional({ checkFalsy: true }).isISO8601(),
    updateUser
);

router.patch("/:id/status", body("isActive").isBoolean(), toggleUserStatus);

router.delete("/:id", deleteUser);

export default router;