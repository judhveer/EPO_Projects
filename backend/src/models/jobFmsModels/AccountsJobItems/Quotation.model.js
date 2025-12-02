// models/Quotation.js
import { DataTypes } from "sequelize";

export default (sequelize) => {
  const Quotation = sequelize.define(
    "Quotation",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      job_no: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      created_by: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("DRAFT", "FINAL", "SENT"),
        defaultValue: "DRAFT",
      },
      items: {
        type: DataTypes.JSON, // store item lines with full breakdown
      },
      subtotal: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
      },
      discount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
      },
      tax_amount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
      },
      final_amount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
      },
    },
    {
      tableName: "jobfms_quotation",
      underscored: true,
    }
  );

  Quotation.associate = (models) => {
    Quotation.belongsTo(models.JobCard, {
      foreignKey: "job_no",
      targetKey: "job_no",
      as: "jobCard",
    });
  };

  return Quotation;
};
