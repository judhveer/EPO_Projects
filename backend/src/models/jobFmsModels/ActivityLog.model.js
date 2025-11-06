import { DataTypes } from "sequelize";

export default (sequelize) => {
  const ActivityLog = sequelize.define(
    "ActivityLog",
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
      },
      action: {
        type: DataTypes.STRING,
      },
      meta: {
        type: DataTypes.JSON,
      },
    },
    {
      tableName: "jobfms_activity_logs",
      underscored: true,
    }
  );

  return ActivityLog;
};
