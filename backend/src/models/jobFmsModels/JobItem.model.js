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

      // Link to PaperMaster (e.g., Art Paper, Maplitho)
      // NEW: Selected paper and size ids used for costing & printing
      selected_paper_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: {
          model: "jobfms_paper_master",
          key: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
      inside_pages: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      color_scheme: {
        type: DataTypes.ENUM("Black and White", "Multicolor"),
        allowNull: false,
        defaultValue: "Multicolor",
      },
      selected_cover_paper_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
      },
      cover_pages: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          isIn: [[2, 4]],
        },
      },
      // Link to WideFormatMaterial
      selected_wide_material_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: {
          model: "jobfms_wide_format_materials",
          key: "id",
        },
        onDelete: "SET NULL",
      },
      cover_color_scheme: {
        type: DataTypes.ENUM("Black and White", "Bi-Color", "Tri-Color", "Multicolor"),
        allowNull: true,
      },

      sides: {
        type: DataTypes.ENUM("Single Side", "Both Side"),
        allowNull: true,
      },
      size: {
        type: DataTypes.STRING,
      },
      quantity: {
        type: DataTypes.INTEGER,
      },
      uom: {
        type: DataTypes.ENUM("Pc", "Nos", "Copies", "Books", "Sheets"),
      },

      press_type: {
        type: DataTypes.ENUM("FLEX MACHINE", "DIGITAL BLACK WHITE", "DIGITAL MULTICOLOR", "HMT BLACK WHITE", "HMT MULTICOLOR", "AUTOPRINT","PLOTTER BLACK WHITE", "PLOTTER MULTICOLOR"),
        allowNull: true,
      },

      cover_press_type: {
        type: DataTypes.ENUM("DIGITAL BLACK WHITE", "DIGITAL MULTICOLOR", "HMT BLACK WHITE", "HMT MULTICOLOR", "AUTOPRINT", ),
        allowNull: true,
      },

      binding_types: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      no_of_foldings: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      no_of_creases: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // NEW: Calculated prices and breakdown (filled server-side)
      unit_rate: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        set(value) {
          this.setDataValue("unit_rate", parseFloat(value));
        },
      },
      item_total: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        set(value) {
          this.setDataValue("item_total", parseFloat(value));
        },
      },
    },
    {
      tableName: "jobfms_job_items",
      underscored: true,
      indexes: [
        { fields: ["job_no"] },
      ]
    }
  );

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
    JobItem.belongsTo(models.PaperMaster, {
      as: "selectedPaper",
      foreignKey: "selected_paper_id",
    });
    JobItem.belongsTo(models.PaperMaster, {
      as: "selectedCoverPaper", // Cover paper
      foreignKey: "selected_cover_paper_id",
    });
  };

  return JobItem;
};
