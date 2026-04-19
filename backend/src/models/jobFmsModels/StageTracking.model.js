import { DataTypes } from "sequelize";

export default (sequelize) => {
  const StageTracking = sequelize.define(
    "StageTracking",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      job_no: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: {
          model: "jobfms_job_cards",
          key: "job_no",
        },
      },
      performed_by_id: {
        type: DataTypes.UUID,
        allowNull: true,   // ← must be true for SET NULL to work
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "SET NULL",  // ← was NO ACTION, which keeps the orphaned value
        onUpdate: "CASCADE",
      },
      stage_name: {
        type: DataTypes.ENUM(
          "created",
          "coordinator_review",
          "assigned_to_designer",
          "design_in_progress",
          "sent_for_approval",
          "awaiting_client_response",
          "client_changes",
          "approved",
          "production",
          "completed",
          "cancelled"
        ),
        allowNull: false,
      },
      started_at: {
        type: DataTypes.DATE,
      },
      ended_at: {
        type: DataTypes.DATE,
      },
      duration_minutes: {
        type: DataTypes.INTEGER,
      },
      remarks: {
        type: DataTypes.TEXT,
      },
    },
    {
      tableName: "jobfms_stage_tracking",
      underscored: true,
    }
  );

  return StageTracking;
};
