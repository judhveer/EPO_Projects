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
      // NEW: Designer timing fields
      designer_start_time: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      designer_end_time: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      designer_duration_minutes: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
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

  JobAssignment.associate = (models) => {
    JobAssignment.belongsTo(models.JobCard, {
      as: "jobCard",
      foreignKey: "job_no",
    });

    JobAssignment.belongsTo(models.User, {
      as: "designer",
      foreignKey: "designer_id",
    });

    JobAssignment.belongsTo(models.User, {
      as: "assignedBy",
      foreignKey: "assigned_by_id",
    });
  };

  return JobAssignment;
};
