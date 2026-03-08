import { DataTypes } from "sequelize";

export default (sequelize) => {
  const PrintingRateMaster = sequelize.define(
    "PrintingRateMaster",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },

      press_type: {
        type: DataTypes.ENUM(
          "FLEX MACHINE",
          "DIGITAL BLACK WHITE",
          "DIGITAL MULTICOLOR",
          "HMT",
          "AUTOPRINT",
          "PLOTTER PRINTING",
        ),
        allowNull: false,
      },
      rate_type: {
        type: DataTypes.ENUM("per_sheet", "per_sqft", "slab"),
        allowNull: false,
      },

      min_qty: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      max_qty: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      rate: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },

      notes: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "jobfms_printing_rate_master",
      underscored: true,
      timestamps: true,
    },
  );

  return PrintingRateMaster;
};
