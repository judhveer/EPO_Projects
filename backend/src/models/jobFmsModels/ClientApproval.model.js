import { DataTypes } from "sequelize";

export default (sequelize) => {
  const ClientApproval = sequelize.define(
    "ClientApproval",
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
      handled_by_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("pending", "approved", "changes_requested"),
        defaultValue: "pending",
      },
      client_feedback: {
        type: DataTypes.TEXT,     // CHANGE REQUEST TEXT
      },
      sent_at: {
        type: DataTypes.DATE,
      },
      approved_at: {
        type: DataTypes.DATE,
      },
      instance: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
    },
    {
      tableName: "jobfms_client_approvals",
      underscored: true,
      indexes: [
        { fields: ["job_no"] },
        { fields: ["instance"] },
        { fields: ["status"] },
        { fields: ["sent_at"] },
        { fields: ["approved_at"] },
      ]

    }
  );

  return ClientApproval;
};
