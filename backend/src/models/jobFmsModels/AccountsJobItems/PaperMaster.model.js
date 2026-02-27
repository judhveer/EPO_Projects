// models/PaperMaster.js
import { DataTypes } from "sequelize";

export default (sequelize) => {
  const PaperMaster = sequelize.define(
    "PaperMaster",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      paper_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      gsm: {
        type: DataTypes.INTEGER,
      },
      size_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      width: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      height: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      unit: {
        type: DataTypes.STRING,
        defaultValue: "inches",
      },
      size_category:{
        type: DataTypes.STRING,
        allowNull: true
      },
      rate_per_sheet: {
        type: DataTypes.FLOAT,
      },
      category: {
        type: DataTypes.STRING, // Single Sheet, Multiple Sheet, WideFormat
      },

    },
    {
      tableName: "jobfms_paper_master",
      underscored: true,
    }
  );

  return PaperMaster;
};
