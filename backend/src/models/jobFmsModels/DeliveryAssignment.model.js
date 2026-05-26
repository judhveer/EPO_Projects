import { DataTypes } from "sequelize";

export default (sequelize) => {
  const DeliveryAssignment = sequelize.define(
    "DeliveryAssignment",
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
      worker_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      worker_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment:
          "Stored at assignment time — stays accurate if worker is later renamed",
      },
      worker_email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "Stored at assignment time",
      },
      upload_token: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        comment: "UUID powering the public /delivery/confirm/:token link",
      },
      token_expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      challan_no: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      challan_file_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      material_photo_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "Google Drive link for the delivery material photo. Optional.",
      },
      status: {
        type: DataTypes.ENUM("pending", "confirmed", "overridden"),
        allowNull: false,
        defaultValue: "pending",
      },
      confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      overridden_by_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      overridden_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      override_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      assigned_by_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      email_sent: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      email_sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "jobfms_delivery_assignments",
      underscored: true,
    },
  );

  DeliveryAssignment.associate = (models) => {
    DeliveryAssignment.belongsTo(models.JobCard, {
      foreignKey: "job_no",
      as: "jobCard",
    });
    DeliveryAssignment.belongsTo(models.ProductionWorkerMaster, {
      foreignKey: "worker_id",
      as: "worker",
    });
    DeliveryAssignment.belongsTo(models.User, {
      foreignKey: "assigned_by_id",
      as: "assignedBy",
    });
    DeliveryAssignment.belongsTo(models.User, {
      foreignKey: "overridden_by_id",
      as: "overriddenBy",
    });
  };

  return DeliveryAssignment;
};
