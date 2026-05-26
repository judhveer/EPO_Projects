import { DataTypes } from "sequelize";

export default (sequelize) => {
  const JobProductionStageWorker = sequelize.define(
    "JobProductionStageWorker",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      job_no: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      stage_name: {
        type: DataTypes.ENUM(
          "printing",
          "binding",
          "quality_check",
          "packaging",
          "out_for_delivery",
        ),
        allowNull: false,
        comment: "The production stage this worker performed.",
      },
      worker_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Name stored at write-time. Not linked to any user account.",
      },
      recorded_by_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment:
          "Production Coordinator who logged this entry — has a user account.",
      },
      worker_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment:
          "FK to jobfms_production_workers_master. NULL for legacy free-text workers.",
      },
    },
    {
      tableName: "jobfms_production_stage_workers",
      underscored: true,
    },
  );

  JobProductionStageWorker.associate = (models) => {
    JobProductionStageWorker.belongsTo(models.JobCard, {
      foreignKey: "job_no",
      as: "jobCard",
    });
    // Only recorder is linked to User — floor workers are not in the system
    JobProductionStageWorker.belongsTo(models.User, {
      foreignKey: "recorded_by_id",
      as: "recorder",
    });
  };

  return JobProductionStageWorker;
};
