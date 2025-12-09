// models/BindingMaster.js
import { DataTypes } from "sequelize";

export default (sequelize) => {
  const BindingMaster = sequelize.define(
    "BindingMaster",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      binding_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      rate_per_unit: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      category: {
        type: DataTypes.ENUM(
          "Single Sheet",
          "Multiple Sheet",
          "Wide Format",
          "Other",
          "Color Scheme",
          "Designing"
        ),
        allowNull: false,
      },

      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      unit: {
        type: DataTypes.STRING,
        allowNull: true,
        // values: per_page, per_hour, per_copy, per_100_pages, flat
      },
    },
    {
      tableName: "jobfms_binding_master",
      underscored: true,
    }
  );

  return BindingMaster;
};
