import { DataTypes } from "sequelize";

export default (sequelize) => {
  const ProductionWorkerMaster = sequelize.define(
    "ProductionWorkerMaster",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      worker_code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment:
          "e.g. W001, W002, D001 — unique code to distinguish same-name workers",
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM(
          "printing",
          "binding",
          "quality_check",
          "packaging",
          "delivery",
        ),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment:
          "Only required for delivery role — used to send challan upload link",
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "jobfms_production_workers_master",
      underscored: true,
    },
  );

  ProductionWorkerMaster.associate = (models) => {
    ProductionWorkerMaster.hasMany(models.JobProductionStageWorker, {
      foreignKey: "worker_id",
      as: "stageAssignments",
    });
    ProductionWorkerMaster.hasMany(models.DeliveryAssignment, {
      foreignKey: "worker_id",
      as: "deliveryAssignments",
    });
  };

  return ProductionWorkerMaster;
};
