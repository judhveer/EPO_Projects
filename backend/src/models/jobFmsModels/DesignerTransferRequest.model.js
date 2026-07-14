import { DataTypes } from "sequelize";

export default (sequelize) => {
  const DesignerTransferRequest = sequelize.define(
    "DesignerTransferRequest",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      job_no: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: "jobfms_job_cards", key: "job_no" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      // The specific JobAssignment record being handed over.
      // Stored so the accept flow can cancel exactly this assignment
      // without re-querying for the active one.
      assignment_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "jobfms_job_assignments", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      from_designer_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      to_designer_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      status: {
        type: DataTypes.ENUM("pending", "accepted", "rejected", "cancelled"),
        allowNull: false,
        defaultValue: "pending",
      },

      // Why Designer A wants to transfer the job
      request_reason: {
        type: DataTypes.TEXT,
        allowNull: false,
      },

      // Why Designer B/C declined — null until rejected
      rejection_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      // Set by Designer A when they tap ✕ on a resolved notification.
      // NULL = still showing in their panel.
      // Only meaningful for accepted / rejected / cancelled rows.
      dismissed_by_requester_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment:
          "Set when Designer A dismisses a resolved notification from their panel. NULL = still visible.",
      },
    },
    {
      tableName: "jobfms_designer_transfer_requests",
      underscored: true,
      indexes: [
        { fields: ["job_no"] },
        { fields: ["from_designer_id"] },
        { fields: ["to_designer_id", "status"] },
        {
          name: "idx_dtr_job_from_to",
          fields: ["job_no", "from_designer_id", "to_designer_id"],
        },
        {
          name: "idx_dtr_from_dismissed",
          fields: ["from_designer_id", "dismissed_by_requester_at"],
        },
      ],

    }
  );

  return DesignerTransferRequest;
};