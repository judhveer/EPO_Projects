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
        onDelete: "CASCADE", // ✅ auto-remove items if job deleted
      },
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
          "type_of_print": "Flex Machine",
          "binding_types": ["Lamination", "Pasting"],
          "size": "A3"
        },
        "Other": {
          "binding_types": ["Pasting", "Cutting"]
        }
      }
      `,
      },
    },
    {
      tableName: "jobfms_job_items",
      underscored: true,
    }
  );

  // ✅ Auto-fill options template if not provided
  JobItem.addHook("beforeCreate", (item) => {
    if (!item.options || Object.keys(item.options).length === 0) {
      const template = JOB_ITEM_OPTION_TEMPLATES[item.category] || {};
      item.options = { ...template };
    }
  });

  return JobItem;
};
