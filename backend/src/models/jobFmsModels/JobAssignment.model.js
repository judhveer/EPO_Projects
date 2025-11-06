import { DataTypes } from "sequelize";

export default (sequelize) => {
  const JobAssignment = sequelize.define(
    "JobAssignment",
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
      designer_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },

      assigned_by_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      assigned_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      estimated_completion_time: {
        type: DataTypes.DATE,
      },
      started_at: {
        type: DataTypes.DATE,
      },
      completed_at: {
        type: DataTypes.DATE,
      },
      actual_duration: {
        type: DataTypes.INTEGER,
      },
      status: {
        type: DataTypes.ENUM(
          "assigned",
          "in_progress",
          "completed",
          "returned_for_changes"
        ),
        defaultValue: "assigned",
      },
      remarks: {
        type: DataTypes.TEXT,
      },
    },
    {
      tableName: "jobfms_job_assignments",
      underscored: true,
    }
  );

  return JobAssignment;
};
