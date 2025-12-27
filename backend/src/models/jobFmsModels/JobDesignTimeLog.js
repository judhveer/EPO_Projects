import { DataTypes } from "sequelize";

export default (sequelize) => {
  const JobDesignTimeLog = sequelize.define(
    "JobDesignTimeLog",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      assignment_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "jobfms_job_assignments",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      start_time: {
        type: DataTypes.DATE,
        allowNull: false, 
      },
      end_time: {
        type: DataTypes.DATE,
      },
      duration_seconds: {
        type: DataTypes.INTEGER,
      }

    },
    {
      tableName: "jobfms_design_time_logs",
      underscored: true,
    }
  );

  JobDesignTimeLog.associate = (models) => {
    JobDesignTimeLog.belongsTo(models.JobAssignment, {
      foreignKey: "assignment_id",
      as: "assignment",
    });
  };

  return JobDesignTimeLog;
};
