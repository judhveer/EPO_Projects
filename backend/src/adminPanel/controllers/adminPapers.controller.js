// ══════════════════════════════════════════════════════════════════════
//  Admin Panel — Paper Master Management
//
//  GET    /api/admin/papers            — paginated list with search/filter
//  POST   /api/admin/papers            — add new paper row
//  PATCH  /api/admin/papers/:id        — edit paper_name, size_category,
//                                        rate_per_sheet only.
//                                        gsm, size_name, width, height,
//                                        unit are locked after creation.
//  DELETE /api/admin/papers/:id        — hard delete, only if zero refs
// ══════════════════════════════════════════════════════════════════════

import { Op } from "sequelize";
import db from "../../models/index.js";
import { getPaperDeletionBlockers } from "../utils/paperDeletionGuard.js";

const { PaperMaster } = db;

function respondToError(res, error, fallbackMsg) {
  const status = error.statusCode || 500;
  if (status >= 500) console.error(fallbackMsg, error);
  return res.status(status).json({ message: error.message || fallbackMsg });
}

// ─────────────────────────────────────────────────────────────────────
//  GET /api/admin/papers
//  ?page, ?limit, ?search (name / size), ?paper_name (exact)
// ─────────────────────────────────────────────────────────────────────
export const listPapers = async (req, res) => {
    try{
        const { page = 1, limit = 50, search, paper_name } = req.query;
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
        const offset = (pageNum - 1) * limitNum;

        const where = {};

        // Exact filter by paper_name (used by the paper-name dropdown in filters)
        if (paper_name) {
            where.paper_name = paper_name;
        }

        // Free-text search across name, size_name, size_category
        const searchTerm = typeof search === "string" ? search.trim() : "";

        if(searchTerm) {
            where[Op.or] = [
                { paper_name:    { [Op.like]: `%${searchTerm}%` } },
                { size_name:     { [Op.like]: `%${searchTerm}%` } },
                { size_category: { [Op.like]: `%${searchTerm}%` } }
            ];
        }

        const { rows, count } = await PaperMaster.findAndCountAll({
            where,
            order: [
                ["paper_name", "ASC"],
                ["gsm", "ASC"],
                ["size_name", "ASC"]
            ],
            limit: limitNum,
            offset,
        });

        // Distinct paper names for the filter dropdown — derived from the full
        // table, not just the current page, so the dropdown is always complete.
        const distinctNames = await PaperMaster.findAll({
            attributes: [
                [db.sequelize.fn("DISTINCT", db.sequelize.col("paper_name")), "paper_name"],
            ],
            order: [["paper_name", "ASC"]],
            raw: true,
        });

        return res.json({
            total: count,
            page: pageNum,
            limit: limitNum,
            data: rows,
            paperNames: distinctNames.map(row => row.paper_name),
        });
    }
    catch(error){
        return respondToError(res, error, "Unable to fetch papers.");
    }

}

// ─────────────────────────────────────────────────────────────────────
//  POST /api/admin/papers
// ─────────────────────────────────────────────────────────────────────
export const createPaper = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const { paper_name, gsm, width, height, size_category, rate_per_sheet } = req.body || {};

        // ── Validate required fields ──────────────────────────────────────
        // size_name is intentionally excluded — it is auto-generated from
        // width and height: "${width}x${height}". Never accept it from the
        // client to avoid format inconsistencies.
        const missing = [];
        if(!paper_name?.trim()){
            missing.push("paper_name");
        }
        if (gsm === undefined || gsm === ""){
            missing.push("gsm");
        }
        if (width === undefined || width === ""){
            missing.push("width");
        }
        if (height === undefined || height === ""){
            missing.push("height");
        }
        if (rate_per_sheet === undefined || rate_per_sheet === ""){
            missing.push("rate_per_sheet");
        }

        if(missing.length > 0){
            throw Object.assign(
                new Error(`Missing required fields: ${missing.join(", ")}.`),
                { statusCode: 400 }
            );
        }

        // ── Type checks ───────────────────────────────────────────────────
        const gsmNum = parseInt(gsm, 10);
        const widthNum  = parseFloat(width);
        const heightNum = parseFloat(height);
        const rateNum   = parseFloat(rate_per_sheet);

        if(isNaN(gsmNum) || gsmNum <= 0){
            throw Object.assign(
                new Error("gsm must be a positive integer."),
                { statusCode: 400 }
            );
        }

        if(isNaN(widthNum) || widthNum <= 0){
            throw Object.assign(
                new Error("width must be a positive number."),  
                { statusCode: 400 }
            );
        }
        
        if (isNaN(heightNum) || heightNum <= 0){
            throw Object.assign(
                new Error("height must be a positive number."), 
                { statusCode: 400 }
            );
        }

        if (isNaN(rateNum) || rateNum < 0){
            throw Object.assign(
                new Error("rate_per_sheet must be >= 0."),
                { statusCode: 400 }
            );
        }

        // ── Auto-generate size_name ───────────────────────────────────────
        // parseFloat drops trailing zeros so 12.00 → "12", 17.50 → "17.5",
        // matching the format already used throughout the paper master table.
        const size_name = `${parseFloat(widthNum)}x${parseFloat(heightNum)}`;

        // ── Duplicate check ───────────────────────────────────────────────
        // A row is considered a duplicate when paper_name + gsm + size_name
        // all match — that's the same combination the quotation/job form uses when looking up a paper, so a duplicate would silently return the wrong row to pricers.
        const existing = await PaperMaster.findOne({
            where: {
                paper_name: paper_name.trim(),
                gsm: gsmNum,
                size_name,
            },
            transaction: t,
        });

        if(existing){
            throw Object.assign(
                new Error(`A paper with name "${paper_name.trim()}", GSM ${gsmNum}, and size "${size_name}" already exists (ID: ${existing.id}).`),
                { statusCode: 409 }
            );
        }

        const paper = await PaperMaster.create({
            paper_name:    paper_name.trim(),
            gsm:           gsmNum,
            size_name,
            width:         widthNum,
            height:        heightNum,
            unit:          "inches",  // always inches — locked per requirement
            size_category: size_category?.trim() || null,
            rate_per_sheet: rateNum,
        }, { transaction: t });

        await t.commit();
        return res.status(201).json({
            message: "Paper Added Successfully.",
            data: paper,
        });

    }
    catch(error){
        await t.rollback().catch( () => {});
        return respondToError(res, error, "Failed to create paper.");
    }
}


// ─────────────────────────────────────────────────────────────────────
//  PATCH /api/admin/papers/:id
//  Editable: paper_name, size_category, rate_per_sheet
//  Locked:   gsm, size_name, width, height, unit
// ─────────────────────────────────────────────────────────────────────
export const updatePaper = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const { id } = req.params;
        console.log("id", id);
        const { paper_name, size_category, rate_per_sheet } = req.body || {};

        const paper = await PaperMaster.findByPk(id, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!paper){
            throw Object.assign(
                new Error("Paper not found."), 
                { statusCode: 404 }
            );
        }

        const updateData = {};

        if(paper_name !== undefined){
            const trimmed = paper_name?.trim();
            if(!trimmed){
                throw Object.assign(
                    new Error("paper_name cannot be empty."), 
                    { statusCode: 400 }
                );
            }
            updateData.paper_name = trimmed;
        }

        if(size_category !== undefined){
            updateData.size_category = size_category?.trim() || null;
        }

        if(rate_per_sheet !== undefined){
            const rateNum = parseFloat(rate_per_sheet);
            if(isNaN(rateNum) || rateNum < 0){
                throw Object.assign(
                    new Error("rate_per_sheet must be >= 0."), 
                    { statusCode: 400 }
                );
            }
            updateData.rate_per_sheet = rateNum;
        }

        if(Object.keys(updateData).length === 0){
            throw Object.assign(
                new Error("No editable fields provided."), 
                { statusCode: 400 }
            );
        }

        await paper.update(updateData, { transaction: t });
        await t.commit();

        return res.json({
            message: "Paper updated successfully.",
            data: paper,
        });
        
    }
    catch(error){
        await t.rollback().catch( () => {});
        return respondToError(res, error, "Failed to update paper.");
    }
}

// ─────────────────────────────────────────────────────────────────────
//  DELETE /api/admin/papers/:id
// ─────────────────────────────────────────────────────────────────────
export const deletePaper = async (req, res) => {
    const t = await db.sequelize.transaction();
    try{
        const { id } = req.params;

        const paper = await PaperMaster.findByPk(id, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if(!paper){
            throw Object.assign(
                new Error("Paper not found."), 
                { statusCode: 404 }
            );
        }

        const blockerMessage = await getPaperDeletionBlockers(paper.id);
        if(blockerMessage){
            throw Object.assign(
                new Error(blockerMessage),
                { statusCode: 409 }
            );
        }

        await paper.destroy({ transaction: t });
        await t.commit();
        return res.json({
            message: "Paper deleted successfully.",
            id: Number(id),
        });
    }
    catch(error){
        await t.rollback().catch( () => {});
        return respondToError(res, error, "Failed to delete paper.");
    }
}