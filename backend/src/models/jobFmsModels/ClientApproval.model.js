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
      },
      approval_token: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "approved", "changes_requested"),
        defaultValue: "pending",
      },
      feedback: {
        type: DataTypes.TEXT,
      },
      approved_at: {
        type: DataTypes.DATE,
      },
      responded_by: {
        type: DataTypes.STRING,
      },
      sent_at: {
        type: DataTypes.DATE,
      },
    },
    {
      tableName: "jobfms_client_approvals",
      underscored: true,
    }
  );

  return ClientApproval;
};
