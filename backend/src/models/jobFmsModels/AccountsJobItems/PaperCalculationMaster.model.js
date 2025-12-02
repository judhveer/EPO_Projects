// models/PaperCalculationMaster.js
import { DataTypes } from "sequelize";

export default (sequelize) => {
  const PaperCalculationMaster = sequelize.define(
    "PaperCalculationMaster",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      paper_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      wastage_sheets: {
        type: DataTypes.INTEGER,
        defaultValue: 20,
      },
      cutting_pattern: {
        type: DataTypes.STRING,
      },
      notes: {
        type: DataTypes.STRING,
      },
    },
    {
      tableName: "jobfms_paper_calculation_master",
      underscored: true,
    }
  );

  PaperCalculationMaster.associate = (models) => {
    PaperCalculationMaster.belongsTo(models.PaperMaster, {
      foreignKey: "paper_id",
      as: "paper",
    });
  };

  return PaperCalculationMaster;
};
