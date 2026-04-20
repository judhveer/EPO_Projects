// models/JobItem.js
import { DataTypes } from "sequelize";

export default (sequelize) => {
  const JobItem = sequelize.define(
    "JobItem",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      // Link to JobCard
      job_no: {
        type: DataTypes.BIGINT.UNSIGNED,    
        allowNull: false,
        references: {
          model: "jobfms_job_cards",
          key: "job_no",
        },
        onDelete: "CASCADE",
      },
      // Category selected
      category: {
        type: DataTypes.ENUM(
          "Single Sheet",
          "Multiple Sheet",
          "Wide Format",
          "Other"
        ),
        allowNull: false,
      },
      enquiry_for: {
        type: DataTypes.STRING,
        set(value) {
          this.setDataValue("enquiry_for", value ? value.toLowerCase() : null);
        },
      },


      // ── Single Sheet: one paper stored here ───
      // For Multiple Sheet this is kept null — papers live in inside_papers JSON.
      // Link to PaperMaster (e.g., Art Paper, Maplitho)

      // PAPER REFERENCES
      // selected_paper_id      → SINGLE SHEET only.
      // NULL for Multiple Sheet (papers live in inside_papers[]) and Wide Format.
      // selected_cover_paper_id → MULTIPLE SHEET only.
      // NULL for Single Sheet and Wide Format.
      // selected_wide_material_id → WIDE FORMAT only.
      // NULL for everything else.

      selected_paper_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        comment: "Single Sheet only — FK to PaperMaster. NULL for all other categories.",
        references: {
          model: "jobfms_paper_master",
          key: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },

      // Cover Paper 
      selected_cover_paper_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,     // null for Single Sheet, Wide Format, Other
        comment: "Multiple Sheet only — FK to PaperMaster for the cover paper.",
        references: { 
          model: "jobfms_paper_master", 
          key: "id" 
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },

      // Link to WideFormatMaterial
      selected_wide_material_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,  // null for Single Sheet, Multiple Sheet, Other
        comment: "Wide Format only — FK to WideFormatMaterial.",
        references: {
          model: "jobfms_wide_format_materials",
          key: "id",
        },
        onDelete: "SET NULL",
      },

    // ── NEW: Multiple Sheet inside papers ───
    /* Stores an array of up to 4 inside paper objects. 
    // Stores up to 4 inside-paper objects. Redundant display text
    // (paper_type, paper_gsm, best_sheet_name, dims) is intentionally
    // excluded — join PaperMaster on selected_paper_id to get those.
    Each object shape:
      {
        _id:               string,   ← frontend UUID, kept for React key stability
        selected_paper_id: number,   ← FK → PaperMaster (join for display name/GSM)
        to_print:          boolean,  ← whether this paper goes to press
        color_scheme:      string | null,
        press_type:        string | null,
        ups:               number,   ← raw UPS (before sides multiplier)
        effective_ups:     number,   ← UPS after sides multiplier
        sheets:            number,   ← sheets before wastage
        sheets_with_wastage: number,
        sheet_rate:        number,   ← ₹ per sheet
        sheet_cost:        number,   ← total sheet cost for this paper
        printing_cost:     number,   ← 0 when to_print = false
      }
    */
      inside_papers: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        comment:
          "Multiple Sheet only. Array of up to 4 slim paper objects. " +
          "Each carries selected_paper_id + calc numerics only. " +
          "Join PaperMaster for display text. NULL for all other categories.",
      },

      // PAGE COUNTS  (Multiple Sheet)
      inside_pages: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Multiple Sheet only — total pages in the book body.",
      },

      cover_pages: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          isIn: [[2, 4]],
        },
        comment: "Multiple Sheet only — 2 or 4 cover pages.",
      },

      // PRINTING DETAILS
      //
      // color_scheme  → Single Sheet only at item level.
      //                 Multiple Sheet: lives inside each inside_papers[] entry.
      //                 Wide Format / Other: null.
      //
      // press_type    → Single Sheet + Wide Format only.
      //                 Multiple Sheet: lives inside each inside_papers[] entry.
      //
      // cover_color_scheme / cover_press_type → Multiple Sheet cover only.

      // ── color_scheme: kept for Single Sheet ───
      // For Multiple Sheet, each inside paper has its own color_scheme inside
      color_scheme: {
        type: DataTypes.ENUM("Black and White", "Multicolor"),
        allowNull: true,
        comment: "Single Sheet only. Multiple Sheet per-paper color lives in inside_papers[].",
      },


      // ── press_type: used by Single Sheet and Wide Format ──────────────────
      // For Multiple Sheet, press_type lives inside each inside_papers[] entry.
      press_type: {
        type: DataTypes.ENUM("FLEX MACHINE", "DIGITAL BLACK WHITE", "DIGITAL MULTICOLOR", "HMT BLACK WHITE", "HMT MULTICOLOR", "AUTOPRINT","PLOTTER BLACK WHITE", "PLOTTER MULTICOLOR"),
        allowNull: true,
        comment: "Single Sheet + Wide Format only. Multiple Sheet per-paper press lives in inside_papers[].",
      },


      cover_color_scheme: {
        type: DataTypes.ENUM("Black and White", "Multicolor"),
        allowNull: true,
        comment: "Multiple Sheet cover only.",
      },

      cover_press_type: {
        type: DataTypes.ENUM("DIGITAL BLACK WHITE", "DIGITAL MULTICOLOR", "HMT BLACK WHITE", "HMT MULTICOLOR", "AUTOPRINT", ),
        allowNull: true,
        comment: "Multiple Sheet cover only.",
      },

      cover_to_print: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment:
          "Multiple Sheet only. true = cover goes to press (paper cost + printing cost). " +
          "false = paper cost only, no printing. cover_color_scheme and cover_press_type " +
          "must be NULL when false.",
      },



      // CALCULATION SNAPSHOT
      // Stores the server-side calculation output for Single Sheet and Wide Format so the full breakdown is preserved after save without adding many nullable columns.
      // Single Sheet shape:
      // {
      //   ups:                 number,
      //   sheets:              number,
      //   sheets_with_wastage: number,
      //   sheet_rate:          number,
      //   sheet_cost:          number,
      //   printing_cost:       number,
      //   binding_cost:        number,
      // }

      // Wide Format shape:
      // {
      //   calculation_type:    "roll" | "board" | "standee",
      //   rolls_or_boards_used: number | null,
      //   wastage_sqft:        number,
      //   ups:                 number | null,
      //   material_cost:       number,
      //   printing_cost:       number,
      //   binding_cost:        number,
      // }
      // Multiple Sheet → null (data lives in inside_papers[] + cover below).
      // Other          → null.
      // calculation_snapshot: {
      //   type: DataTypes.JSON,
      //   allowNull: true,
      //   defaultValue: null,
      //   comment:
      //     "Single Sheet: { ups, sheets, sheets_with_wastage, sheet_rate, sheet_cost, printing_cost, binding_cost }. " +
      //     "Wide Format:  { calculation_type, rolls_or_boards_used, wastage_sqft, ups, material_cost, printing_cost, binding_cost }. " +
      //     "Multiple Sheet: null (data lives in inside_papers[]). " +
      //     "Other: null.",
      // },

      // COVER SNAPSHOT  (Multiple Sheet only)
      //
      // Stores cover-paper calc numerics in the same style as inside_papers
      // entries so the full breakdown is available without extra queries.
      //
      // Shape:
      // {
      //   ups:                 number,
      //   sheets:              number,
      //   sheets_with_wastage: number,
      //   sheet_rate:          number,
      //   sheet_cost:          number,
      //   printing_cost:       number,
      // }
      // cover_snapshot: {
      //   type: DataTypes.JSON,
      //   allowNull: true,
      //   defaultValue: null,
      //   comment:
      //     "Multiple Sheet only. Cover-paper calc numerics. " +
      //     "Join PaperMaster on selected_cover_paper_id for display text.",
      // },
      








      // JOB DIMENSIONS
      sides: {
        type: DataTypes.ENUM("Single Side", "Both Side"),
        allowNull: true,
      },
      size: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "Finished size as entered by the user, e.g. '210x297 mm' or 'A4'.",
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      uom: {
        type: DataTypes.ENUM("Pc", "Nos", "Copies", "Books", "Sheets"),
        allowNull: false,
      },

      // BINDING
      binding_types: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Array of binding names selected, e.g. ['Matt Lamination (Single Side)', 'Cutting'].",
      },
      binding_targets: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        comment: "{ numbering_paper_ids: string[], perforation_paper_ids: string[] }"
      },
      no_of_foldings: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Single Sheet only — folds per sheet when Folding binding is selected.",
      },
      no_of_creases: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Single Sheet only — creases per sheet when Creasing binding is selected.",
      },
      // PRICING  (server-side computed, stored for display & reporting)
      unit_rate: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        allowNull: false,
        set(value) {
          this.setDataValue("unit_rate", parseFloat(value) || 0);
        },
      },
      item_total: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        allowNull: false,
        set(value) {
          this.setDataValue("item_total", parseFloat(value) || 0);
        },
      },
      // Add after the `item_total` field, before the closing of the fields object:
      item_instructions: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
        comment: "Per-item instructions from the job writer.",
      },
    },
    {
      tableName: "jobfms_job_items",
      underscored: true,
      indexes: [
        { fields: ["job_no"] },
        { fields: ["category"] },
        { fields: ["selected_paper_id"] },
        { fields: ["selected_wide_material_id"] },
      ]
    }
  );

  // Hooks
  JobItem.addHook("afterCreate", async (jobItems) => {
    const { ItemMaster } = sequelize.models;

    let enquiryItem = await ItemMaster.findOne({
      where: {
        item_name: jobItems.enquiry_for,
        category: jobItems.category,
      },
    });

    if (!enquiryItem) {
      await ItemMaster.create({
        item_name: jobItems.enquiry_for,
        category: jobItems.category,
      });
    }
  });

  JobItem.associate = (models) => {
    JobItem.belongsTo(models.JobCard, {
      as: "jobCard",
      foreignKey: "job_no",
    });
    JobItem.belongsTo(models.ItemMaster, {
      as: "itemMaster",
      foreignKey: "item_master_id",
    });
    // Single Sheet primary paper
    JobItem.belongsTo(models.PaperMaster, {
      as: "selectedPaper",
      foreignKey: "selected_paper_id",
    });
    // Cover paper
    JobItem.belongsTo(models.PaperMaster, {
      as: "selectedCoverPaper", // Cover paper
      foreignKey: "selected_cover_paper_id",
    });
    // Wide Format material — NULL for SS / MS / Other
    JobItem.belongsTo(models.WideFormatMaterial, {
      as:          "selectedWideMaterial",
      foreignKey:  "selected_wide_material_id",
    });
  };

  return JobItem;
};


