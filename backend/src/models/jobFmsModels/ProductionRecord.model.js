import { DataTypes } from "sequelize";

export default (sequelize) => {
  const ProductionRecord = sequelize.define(
    "ProductionRecord",
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
      produced_by_id: {
        type: DataTypes.UUID,
      },
      production_started_at: {
        type: DataTypes.DATE,
      },
      production_completed_at: {
        type: DataTypes.DATE,
      },
      copies_produced: {
        type: DataTypes.INTEGER,
      },
      status: {
        type: DataTypes.ENUM("pending", "printing", "completed", "delivered"),
        defaultValue: "pending",
      },
      delivery_date: {
        type: DataTypes.DATE,
      },
    },
    {
      tableName: "jobfms_production_records",
      underscored: true,
    }
  );

  return ProductionRecord;
};
