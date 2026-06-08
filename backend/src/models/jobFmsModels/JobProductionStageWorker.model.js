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
        comment: "The production stage this worker is assigned to.",
      },
      worker_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Username stored at assignment time — snapshot for history.",
      },
      worker_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "FK to users.id — the worker assigned to this stage.",
      },
      recorded_by_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "Production Coordinator who created this assignment.",
      },

      // ── Status & time-tracking ────────────────────────────────────────
      status: {
        type: DataTypes.ENUM(
          "assigned",
          "in_progress",
          "paused",
          "completed",
          "force_completed",
          "cancelled",
          "defect_reported",
        ),
        allowNull: false,
        defaultValue: "assigned",
        comment: "Current status of this worker assignment.",
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "When worker clicked START.",
      },
      paused_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Timestamp of the most recent PAUSE action.",
      },
      total_pause_duration_seconds: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment:
          "Accumulated pause time in seconds across all pause/resume cycles.",
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment:
          "When worker marked DONE or was force-completed by coordinator.",
      },
      force_completed_by_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "Coordinator user ID who force-completed this assignment.",
      },
      cancelled_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Set when stage was reverted — assignment cancelled mid-work.",
      },
      cancelled_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Why cancelled — typically coordinator reverted the stage.",
      },
      caused_rework: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Whether this assignment's output failed QC and caused rework.",
      }
    },
    {
      tableName: "jobfms_production_stage_workers",
      underscored: true,
    },
  );

  // NOTE: associate methods here are defined but associations.js is the
  // authoritative place. These are kept for reference only.
  JobProductionStageWorker.associate = (models) => {
    JobProductionStageWorker.belongsTo(models.JobCard, {
      foreignKey: "job_no",
      as: "jobCard",
    });
    
    JobProductionStageWorker.belongsTo(models.User, {
      foreignKey: "recorded_by_id",
      as: "recorder",
    });
    // worker_id now points to User (was ProductionWorkerMaster before)
    JobProductionStageWorker.belongsTo(models.User, {
      foreignKey: "worker_id",
      as: "worker",
    });
    // coordinator who force-completed
    JobProductionStageWorker.belongsTo(models.User, {
      foreignKey: "force_completed_by_id",
      as: "forceCompletedBy",
    });
  };

  return JobProductionStageWorker;
};
