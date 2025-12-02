// models/JobItem.js
import { DataTypes } from "sequelize";
import { JOB_ITEM_OPTION_TEMPLATES } from "../../constants/jobfms/jobItemOptions.js";

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

      // Link to ItemMaster (e.g., poster, leaflet)
      // item_master_id: {
      //   type: DataTypes.BIGINT.UNSIGNED,
      //   allowNull: true,
      // },

      // Category selected
      category: {
        type: DataTypes.ENUM(
          "SingleSheet",
          "MultipleSheet",
          "WideFormat",
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
      size: {
        type: DataTypes.STRING,
      },
      uom: {
        type: DataTypes.ENUM("Pc", "Nos", "Copies", "Books", "Sheets"),
      },
      quantity: {
        type: DataTypes.INTEGER,
      },

      // NEW: Selected paper and size ids used for costing & printing
      // selected_paper_id: {
      //   type: DataTypes.BIGINT.UNSIGNED,
      //   allowNull: true,
      // },

      // selected_size_id: {
      //   type: DataTypes.BIGINT.UNSIGNED,
      //   allowNull: true,
      // },

      // // Press / color options used in RateMaster lookup
      // press_type: {
      //   type: DataTypes.ENUM("offset", "digital"),
      //   allowNull: true,
      // },

      // color_type: {
      //   type: DataTypes.ENUM("single", "multi"),
      //   allowNull: true,
      // },

      // JSON field for storing all dynamic options based on category
      options: {
        type: DataTypes.JSON,
        comment: `
      Store category-specific options here. Example:
      {
        "SingleSheet": {
          "sides": "Both Side",
          "color_scheme": "Multi-color",
          "cover_pages": 2,
          "inside_pages": 10,
          "cover_paper_gsm": 300,
          "inside_paper_gsm": 120,
          "binding_types": ["Cutting", "Lamination", "Folding"]
        },
        "WideFormat": {
          "binding_types": ["Lamination", "Pasting"],
          "size": "A3"
        },
        "Other": {
          "binding_types": ["Pasting", "Cutting"]
        }
      }
      `,
      },

      // NEW: Calculated prices and breakdown (filled server-side)
      // unit_price: {
      //   type: DataTypes.DECIMAL(12, 2),
      //   defaultValue: 0,
      // },

      // line_total: {
      //   type: DataTypes.DECIMAL(12, 2),
      //   defaultValue: 0,
      // },

      // calculation_meta: {
      //   type: DataTypes.JSON,
      //   allowNull: true,
      // },
    },
    {
      tableName: "jobfms_job_items",
      underscored: true,
    }
  );

  // Auto-fill options template if not provided
  JobItem.addHook("beforeCreate", (item) => {
    if (!item.options || Object.keys(item.options).length === 0) {
      const template = JOB_ITEM_OPTION_TEMPLATES[item.category] || {};
      item.options = { ...template };
    }
  });

  // JobItem.addHook("afterCreate", async (jobItems) => {
  //   const { EnquiryForItems } = sequelize.models;

  //   let enquiryItem = await EnquiryForItems.findOne({
  //     where: { item: jobItems.enquiry_for },
  //   });

  //   if (!enquiryItem) {
  //     await EnquiryForItems.create({
  //       item: jobItems.enquiry_for,
  //     });
  //   }
  // });

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
    JobItem.belongsTo(models.SizeMaster, {
      as: "selectedSize",
      foreignKey: "selected_size_id",
    });
  };

  return JobItem;
};
