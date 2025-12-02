// models/JobCosting.js
import { DataTypes } from "sequelize";

export default (sequelize) => {
  const JobCosting = sequelize.define(
    "JobCosting",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      job_card_id: {
  type: DataTypes.BIGINT.UNSIGNED,
  allowNull: false,
},
      paper_cost: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
      },
      printing_cost: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
      },
      binding_cost: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
      },
      designing_cost: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
      },
      total_cost: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
      },
      profit_margin: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
      },
      final_price: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
      },
    },
    {
      tableName: "jobfms_job_costing",
      underscored: true,
    }
  );

  JobCosting.associate = (models) => {
    JobCosting.belongsTo(models.JobCard, {
  foreignKey: "job_card_id",
  as: "jobCard",
});

  };

  return JobCosting;
};
