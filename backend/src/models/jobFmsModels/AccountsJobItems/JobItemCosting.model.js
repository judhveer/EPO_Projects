// models/JobItemCosting.js
//
// PURPOSE: stores "what it costs / how it is produced" for every JobItem.
//
// JobItem       → what was ordered (paper FK, size, qty, press, color, bindings)
// JobItemCosting → calc output     (UPS, sheets, rates, costs)
//
// WHY SEPARATE:
//   1. JobItem stays lean. No JSON blobs of calc data mixed with config.
//   2. Indexed FK columns (ss_paper_id, ms_cover_paper_id, wf_material_id)
//      let the Outbound Orders Dashboard run simple aggregation JOINs:
//
//      -- Which papers are needed across all active jobs?
//      SELECT pm.paper_name, pm.gsm, pm.size_name,
//             SUM(jic.ss_sheets_with_wastage) AS total_sheets
//      FROM   jobfms_job_item_costings  jic
//      JOIN   jobfms_paper_master       pm ON pm.id = jic.ss_paper_id
//      JOIN   jobfms_job_cards          jc ON jc.job_no = jic.job_no
//      WHERE  jic.category = 'Single Sheet'
//      AND    jc.status IN ('coordinator_review','production')
//      GROUP  BY pm.id;
//
//   3. One UPSERT (on job_item_id) keeps it in sync whenever a job is recalculated.

import { DataTypes } from "sequelize";

export default (sequelize) => {
  const JobItemCosting = sequelize.define(
    "JobItemCosting",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      // ── Parent references ─────────────────────────────────────────────────
      job_no: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: "jobfms_job_cards", key: "job_no" },
        onDelete: "CASCADE",
        comment: "Indexed — dashboard filters by job status via this join.",
      },
      job_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,         // one costing row per job item, enables UPSERT
        references: { model: "jobfms_job_items", key: "id" },
        onDelete: "CASCADE",
      },
      category: {
        type: DataTypes.ENUM("Single Sheet", "Multiple Sheet", "Wide Format", "Other"),
        allowNull: false,
      },

      // ══════════════════════════════════════════════════════════════════════
      // SINGLE SHEET  (null for other categories)
      // ══════════════════════════════════════════════════════════════════════
      ss_paper_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: "jobfms_paper_master", key: "id" },
        onDelete: "SET NULL",
        comment: "Indexed FK — outbound dashboard JOINs PaperMaster for paper name/GSM/size.",
      },
      ss_ups: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Finished pieces per press sheet.",
      },
      ss_sheets: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Sheets before +5% wastage.",
      },
      ss_sheets_with_wastage: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "KEY column — coordinator orders this many sheets.",
      },
      ss_sheet_rate: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "₹ per sheet from PaperMaster.",
      },
      ss_sheet_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        comment: "ss_sheets_with_wastage × ss_sheet_rate.",
      },
      ss_printing_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },

      // ══════════════════════════════════════════════════════════════════════
      // MULTIPLE SHEET — INSIDE PAPERS  (null for other categories)
      //
      // Slim JSON — no display text. JOIN PaperMaster on paper_id for names.
      // Element shape:
      //   { paper_id, ups, effective_ups, sheets, sheets_with_wastage,
      //     sheet_rate, sheet_cost, printing_cost, to_print,
      //     color_scheme, press_type }
      // ══════════════════════════════════════════════════════════════════════
      ms_inside_costing: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Multiple Sheet inside papers calc output. No display text — JOIN PaperMaster on paper_id.",
      },
      ms_total_inside_sheet_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      ms_total_inside_printing_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },

      // ── Multiple Sheet — Cover ─────────────────────────────────────────────
      ms_cover_paper_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: "jobfms_paper_master", key: "id" },
        onDelete: "SET NULL",
        comment: "Indexed FK — outbound dashboard can aggregate cover paper needs.",
      },
      ms_cover_ups: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      ms_cover_sheets: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      ms_cover_sheets_with_wastage: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "KEY column — coordinator orders this many cover sheets.",
      },
      ms_cover_sheet_rate: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      ms_cover_sheet_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      ms_cover_printing_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },

      // ══════════════════════════════════════════════════════════════════════
      // WIDE FORMAT  (null for other categories)
      // ══════════════════════════════════════════════════════════════════════
      wf_material_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: "jobfms_wide_format_materials", key: "id" },
        onDelete: "SET NULL",
        comment: "Indexed FK — outbound dashboard aggregates materials needed.",
      },
      wf_calculation_type: {
        type: DataTypes.ENUM("roll", "board", "standee"),
        allowNull: true,
      },
      wf_rolls_or_boards_used: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "KEY column — coordinator orders this many rolls/boards.",
      },
      wf_wastage_sqft: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      wf_ups: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Pieces per board (board type only).",
      },
      wf_material_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        comment: "Material area cost (before printing and binding).",
      },
      wf_printing_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },

      // ══════════════════════════════════════════════════════════════════════
      // BINDING  (all categories)
      // ══════════════════════════════════════════════════════════════════════
      binding_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      binding_cost_per_copy: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0,
      },

      // ══════════════════════════════════════════════════════════════════════
      // SUMMARY TOTALS  (all categories)
      // ══════════════════════════════════════════════════════════════════════
      total_sheet_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      total_printing_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      sheet_cost_per_copy: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0,
      },
      printing_cost_per_copy: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0,
      },
      unit_rate: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        set(v) { this.setDataValue("unit_rate", parseFloat(v) || 0); },
      },
      item_total: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        set(v) { this.setDataValue("item_total", parseFloat(v) || 0); },
      },
    },
    {
      tableName: "jobfms_job_item_costings",
      underscored: true,
      indexes: [
        { fields: ["job_no"] },
        { fields: ["category"] },
        { fields: ["ss_paper_id"] },
        { fields: ["ms_cover_paper_id"] },
        { fields: ["wf_material_id"] },
        { unique: true, fields: ["job_item_id"] },  // enforces one costing per item
      ],
    },
  );

  JobItemCosting.associate = (models) => {
    JobItemCosting.belongsTo(models.JobCard,  { 
      as: "jobCard",     
      foreignKey: "job_no" 
    });
    JobItemCosting.belongsTo(models.JobItem,  {
      as: "jobItem",     
      foreignKey: "job_item_id" 
    });
    JobItemCosting.belongsTo(models.PaperMaster, { 
      as: "ssPaper",      
      foreignKey: "ss_paper_id"
    });
    JobItemCosting.belongsTo(models.PaperMaster, { 
      as: "msCoverPaper", 
      foreignKey: "ms_cover_paper_id" 
    });
    JobItemCosting.belongsTo(models.WideFormatMaterial, { 
      as: "wfMaterial", 
      foreignKey: "wf_material_id" 
    });
  };

  return JobItemCosting;
};