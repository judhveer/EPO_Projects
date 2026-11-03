import { DataTypes } from "sequelize";

/**
 * One row per continuous run of a production worker on a stage assignment.
 *   start  -> worker presses START or RESUME
 *   end    -> pause / done / force-complete / cancel / auto-pause (check-out, logout, sweep)
 * Open run = end_time IS NULL. Same idea as JobDesignTimeLog for designers.
 * Store-only for now (future reports); nothing reads it yet except the pause logic.
 */
export default (sequelize) => {
  const JobProductionWorkerTimeLog = sequelize.define(
    "JobProductionWorkerTimeLog",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      assignment_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "jobfms_production_stage_workers", key: "id" },
        onDelete: "CASCADE",
      },
      job_no: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      worker_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      stage_name: {
        type: DataTypes.STRING(30),
        allowNull: false,
      },
      start_time: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      end_time: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      duration_seconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // paused | completed | force_completed | defect_reported | cancelled |
      // auto_paused_other | auto_paused_logout | auto_paused_checkout |
      // auto_paused_auto_checkout | auto_paused_sweep | orphan_closed
      end_reason: {
        type: DataTypes.STRING(40),
        allowNull: true,
      },
    },
    {
      tableName: "jobfms_production_worker_time_logs",
      underscored: true,
      indexes: [
        { name: "idx_pwtl_assignment", fields: ["assignment_id"] },
        { name: "idx_pwtl_worker_start", fields: ["worker_id", "start_time"] },
        { name: "idx_pwtl_job", fields: ["job_no"] },
      ],
    }
  );

  return JobProductionWorkerTimeLog;
};