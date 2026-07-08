// ══════════════════════════════════════════════════════════════════════
//  Admin Panel — Wide Format Material Management
//
//  GET    /api/admin/wide-format          — paginated list + filters
//  POST   /api/admin/wide-format          — add new material row
//  PATCH  /api/admin/wide-format/:id      — edit material_name + rate only
//  DELETE /api/admin/wide-format/:id      — hard delete, zero refs only
//
//  Material types (determined by fields sent):
//    roll    → roll_width_ft required, gsm optional, rate_per_sqft required
//    board   → board_width_ft + board_height_ft required, thickness_mm
//              optional, rate_per_sqft required
//    standee → board_width_ft + board_height_ft required, rate_per_pc required
//
//  Dimension fields are locked after creation — they drive the
//  calculation matching logic in itemMaster.controller.js and changing
//  them on a referenced row would silently corrupt historical costs.
// ══════════════════════════════════════════════════════════════════════


import { Op } from "sequelize";
import db from "../../models/index.js";
import { getWideFormatDeletionBlockers } from "../utils/wideFormatDeletionGuard.js";

const { WideFormatMaterial } = db;

function respondToError(res, error, fallbackMsg) {
  const status = error.statusCode || 500;
  if (status >= 500) console.error(fallbackMsg, error);
  return res.status(status).json({ message: error.message || fallbackMsg });
}

/**
 * Derives the material type from a model instance or plain row object.
 * Mirrors the check order in itemMaster.controller.js calculateItemController:
 *   1. rate_per_pc   → standee
 *   2. roll_width_ft → roll
 *   3. board dims    → board
 */

function getMaterialType(mat){
    if(mat.rate_per_pc !== null) return "standee";
    if(mat.roll_width_ft !== null) return "roll";
    if(mat.board_width_ft !== null) return "board";
    return "unknown";
}

// ─────────────────────────────────────────────────────────────────────
//  GET /api/admin/wide-format
// ─────────────────────────────────────────────────────────────────────
export const listWideFormats = async (req, res) => {
    try{
        const { page = 1, limit = 50, search, material_name, type } = req.query;
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
        const offset = (pageNum - 1) * limitNum;

        const where = {};

        if(material_name){
            where.material_name = material_name;
        }

        // Type filter — maps to which rate column is non-null
        if(type === "roll"){
            where.roll_width_ft  = { [Op.ne]: null };
            where.rate_per_pc    = null;
        }
        else if(type === "board"){
            where.board_width_ft = { [Op.ne]: null };
            where.rate_per_pc    = null;
            where.roll_width_ft  = null;
        }
        else if(type === "standee"){
            where.rate_per_pc    = { [Op.ne]: null };
        }

        const searchTerm = typeof search === "string" ? search.trim() : "";

        if(searchTerm){
            where[Op.ne] = [
                { material_name: { [Op.like]: `%${searchTerm}%` } },
            ]
        }

        const { rows, count } = await WideFormatMaterial.findAndCountAll({
            where,
            order: [
                ["material_name", "ASC"],
                ["roll_width_ft",  "ASC"],
                ["board_width_ft", "ASC"],
                ["thickness_mm",   "ASC"],
                ["gsm",            "ASC"],
            ],
            limit: limitNum,
            offset,
        });

        // Attach derived type to each row so the frontend doesn't have to re-derive it from nullable fields.
        const data = rows.map((r) => ({
            ...r.toJSON(),
            material_type: getMaterialType(r),
        }));

        // Distinct material names for the filter dropdown
        const distinctNames = await WideFormatMaterial.findAll({
            attributes: [
                [db.sequelize.fn("DISTINCT", db.sequelize.col("material_name")), "material_name"],
            ],
            order: [["material_name", "ASC"]],
            raw: true,
        });

        return res.json({
            total: count,
            page: pageNum,
            limit: limitNum,
            data,
            materialNames: distinctNames.map((r) => r.material_name),
        });

    }
    catch(error){
        return respondToError(res, error, "Unable to fetch wide format materials.");
    }
};

// ─────────────────────────────────────────────────────────────────────
//  POST /api/admin/wide-format
// ─────────────────────────────────────────────────────────────────────
export const createWideFormat = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const {
            material_type,   // "roll" | "board" | "standee" — sent from frontend
            material_name,
            roll_width_ft,
            gsm,
            board_width_ft,
            board_height_ft,
            thickness_mm,
            rate_per_sqft,
            rate_per_pc,
        } = req.body || {};

        // ── material_type validation ──────────────────────────────────────
        if (!["roll", "board", "standee"].includes(material_type)) {
            throw Object.assign(
                new Error("material_type must be 'roll', 'board', or 'standee'."),
                { statusCode: 400 }
            );
        }

        if (!material_name?.trim()) {
            throw Object.assign(new Error("material_name is required."), { statusCode: 400 });
        }

        // ── Type-specific field validation ────────────────────────────────
        let createPayload = { material_name: material_name.trim() };

        if(material_type === "roll"){
            // Required: roll_width_ft, rate_per_sqft. Optional: gsm.
            if (roll_width_ft === undefined || roll_width_ft === "") {
                throw Object.assign(new Error("roll_width_ft is required for Roll materials."), { statusCode: 400 });
            }
            if (rate_per_sqft === undefined || rate_per_sqft === "") {
                throw Object.assign(new Error("rate_per_sqft is required for Roll materials."), { statusCode: 400 });
            }

            const rollW  = parseFloat(roll_width_ft);
            const rateS  = parseFloat(rate_per_sqft);
            const gsmVal = gsm !== undefined && gsm !== "" ? parseInt(gsm, 10) : null;

            if (isNaN(rollW) || rollW <= 0) {
                throw Object.assign(new Error("roll_width_ft must be a positive number."), { statusCode: 400 });
            }

            if (isNaN(rateS) || rateS < 0) {
                throw Object.assign(new Error("rate_per_sqft must be >= 0."), { statusCode: 400 });
            }
            if (gsmVal !== null && (isNaN(gsmVal) || gsmVal <= 0)) {
                throw Object.assign(new Error("gsm must be a positive integer."), { statusCode: 400 });
            }

            createPayload = {
                ...createPayload,
                roll_width_ft: rollW,
                gsm: gsmVal,
                rate_per_sqft: rateS,
                // Explicitly null — ensures calculation branch stays correct
                board_width_ft: null, board_height_ft: null,
                thickness_mm: null, rate_per_pc: null,
            };

            // Duplicate: same name + roll_width_ft + gsm
            const dupe = await WideFormatMaterial.findOne({
                where: {
                    material_name: createPayload.material_name,
                    roll_width_ft: rollW,
                    gsm: gsmVal,
                },
                transaction: t,
            });

            if (dupe) {
                throw Object.assign(
                    new Error(`A roll material "${createPayload.material_name}" with width ${rollW} ft${gsmVal ? ` and GSM ${gsmVal}` : ""} already exists (ID: ${dupe.id}).`),
                    { statusCode: 409 }
                );
            }

        }
        else if( material_type === "board"){
            // Required: board_width_ft, board_height_ft, rate_per_sqft. Optional: thickness_mm.
            if (board_width_ft === undefined || board_width_ft === ""){
                throw Object.assign(new Error("board_width_ft is required for Board materials."), { statusCode: 400 });
            }
            if (board_height_ft === undefined || board_height_ft === "") {
                throw Object.assign(new Error("board_height_ft is required for Board materials."), { statusCode: 400 });
            }
            if (rate_per_sqft === undefined || rate_per_sqft === "") {
                throw Object.assign(new Error("rate_per_sqft is required for Board materials."), { statusCode: 400 });
            }

            const bW   = parseFloat(board_width_ft);
            const bH   = parseFloat(board_height_ft);
            const rateS = parseFloat(rate_per_sqft);
            const thickVal = thickness_mm !== undefined && thickness_mm !== "" ? parseFloat(thickness_mm) : null;

            if (isNaN(bW) || bW <= 0){
                throw Object.assign(new Error("board_width_ft must be a positive number."), { statusCode: 400 });
            }
            if (isNaN(bH) || bH <= 0) {
                throw Object.assign(new Error("board_height_ft must be a positive number."), { statusCode: 400 });
            }
            if (isNaN(rateS) || rateS < 0){
                throw Object.assign(new Error("rate_per_sqft must be >= 0."), { statusCode: 400 });
            }
            if (thickVal !== null && (isNaN(thickVal) || thickVal <= 0)) {
                throw Object.assign(new Error("thickness_mm must be a positive number."), { statusCode: 400 });
            }

            createPayload = {
                ...createPayload,
                board_width_ft: bW,
                board_height_ft: bH,
                thickness_mm: thickVal,
                rate_per_sqft: rateS,
                roll_width_ft: null, gsm: null, rate_per_pc: null,
            };
            // Duplicate: same name + board dims + thickness
            const dupe = await WideFormatMaterial.findOne({
                where: {
                    material_name: createPayload.material_name,
                    board_width_ft: bW,
                    board_height_ft: bH,
                    thickness_mm: thickVal,
                    rate_per_pc: null,
                },
                transaction: t,
            });
            if (dupe) {
                throw Object.assign(
                    new Error(`A board material "${createPayload.material_name}" with dimensions ${bW}×${bH} ft${thickVal ? ` and thickness ${thickVal}mm` : ""} already exists (ID: ${dupe.id}).`),
                    { statusCode: 409 }
                );
            }

        }
        else if( material_type === "standee"){
            // Required: board_width_ft, board_height_ft, rate_per_pc. No thickness.
            if (board_width_ft === undefined || board_width_ft === ""){
                throw Object.assign(new Error("board_width_ft is required for Standee materials."), { statusCode: 400 });
            }
            if (board_height_ft === undefined || board_height_ft === ""){
                throw Object.assign(new Error("board_height_ft is required for Standee materials."), { statusCode: 400 });
            }
            if (rate_per_pc === undefined || rate_per_pc === ""){
                throw Object.assign(new Error("rate_per_pc is required for Standee materials."), { statusCode: 400 });
            }

            const bW    = parseFloat(board_width_ft);
            const bH    = parseFloat(board_height_ft);
            const rateP = parseFloat(rate_per_pc);

            if (isNaN(bW) || bW <= 0){
                throw Object.assign(new Error("board_width_ft must be a positive number."), { statusCode: 400 });
            }
            if (isNaN(bH) || bH <= 0){
                throw Object.assign(new Error("board_height_ft must be a positive number."), { statusCode: 400 });
            }
            if (isNaN(rateP) || rateP < 0){
                throw Object.assign(new Error("rate_per_pc must be >= 0."), { statusCode: 400 });
            }

            createPayload = {
                ...createPayload,
                board_width_ft: bW,
                board_height_ft: bH,
                rate_per_pc: rateP,
                roll_width_ft: null, gsm: null, thickness_mm: null, rate_per_sqft: null,
            };

            // Duplicate: same name + same standee dimensions
            const dupe = await WideFormatMaterial.findOne({
                where: {
                    material_name: createPayload.material_name,
                    board_width_ft: bW,
                    board_height_ft: bH,
                    rate_per_pc: { [Op.ne]: null },
                },
                transaction: t,
            });
            if (dupe) {
                throw Object.assign(
                    new Error(`A standee "${createPayload.material_name}" with dimensions ${bW}×${bH} ft already exists (ID: ${dupe.id}).`),
                    { statusCode: 409 }
                );
            }
        }

        const material = await WideFormatMaterial.create(createPayload, { transaction: t} );
        await t.commit();

        return res.json({
            message: "Material Added Successfully.",
            data: { 
                ...material.toJSON(), 
                material_type 
            },
        });
    }
    catch(error){
        await t.rollback().catch(() => {});
        respondToError(res, error, "Failed to Create Wide Format.");
    }
}

// ─────────────────────────────────────────────────────────────────────
//  PATCH /api/admin/wide-format/:id
//  Editable: material_name + rate fields only.
//  Locked:   all dimension fields.
// ─────────────────────────────────────────────────────────────────────
export const updateWideFormat = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const { id } = req.params;
        const { material_name, rate_per_sqft, rate_per_pc} = req.body || {};

        const material = await WideFormatMaterial.findByPk(id, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!material){
            throw Object.assign(new Error("Material not found."), { statusCode: 404 });
        }

        const type = getMaterialType(material);
        const updateData = {};

        if (material_name !== undefined) {
            const trimmed = material_name.trim();
            if (!trimmed) throw Object.assign(new Error("material_name cannot be empty."), { statusCode: 400 });
            updateData.material_name = trimmed;
        }

        // Only allow updating the rate field that belongs to this type
        if (rate_per_sqft !== undefined) {
            if (type === "standee") {
                throw Object.assign(
                    new Error("Standee materials use rate_per_pc, not rate_per_sqft."),
                    { statusCode: 400 }
                );
            }
            const r = parseFloat(rate_per_sqft);
            if (isNaN(r) || r < 0) throw Object.assign(new Error("rate_per_sqft must be >= 0."), { statusCode: 400 });
            updateData.rate_per_sqft = r;
        }

        if (rate_per_pc !== undefined) {
            if (type !== "standee") {
                throw Object.assign(
                    new Error("rate_per_pc can only be set on Standee materials."),
                    { statusCode: 400 }
                );
            }
            const r = parseFloat(rate_per_pc);
            if (isNaN(r) || r < 0) throw Object.assign(new Error("rate_per_pc must be >= 0."), { statusCode: 400 });
            updateData.rate_per_pc = r;
        }

        if (Object.keys(updateData).length === 0) {
            throw Object.assign(new Error("No editable fields provided."), { statusCode: 400 });
        }

        await material.update(updateData, { transaction: t });
        await t.commit();

        return res.json({
            message: "Material Updated",
            data: { 
                ...material.toJSON(), 
                material_type: type 
            },
        });
    }
    catch(error){
        await t.rollback().catch(() => {});
        return respondToError(res, error, "Failed to update material.");
    }
};

// ─────────────────────────────────────────────────────────────────────
//  DELETE /api/admin/wide-format/:id
// ─────────────────────────────────────────────────────────────────────
export const deleteWideFormat = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const { id } = req.params;
        
        const material = await WideFormatMaterial.findByPk(id, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!material){
            throw Object.assign(new Error("Material not found."), { statusCode: 404 });
        }

        const blockerMessage = await getWideFormatDeletionBlockers(id, t);
        if(blockerMessage){
            throw Object.assign(new Error(blockerMessage), { statusCode: 409 });
        }

        await material.destroy({ transaction: t });
        await t.commit();

        return res.json({
            message: "Material deleted.", 
            id: Number(id),
        });

    }
    catch(error){
        await t.rollback().catch(() => {});
        return respondToError(res, error, "Failed to delete material.");
    }
}