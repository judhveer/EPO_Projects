import { DataTypes } from "sequelize";

export default (sequelize) => {
  const WideFormatMaterial = sequelize.define(
    "WideFormatMaterial",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },

      material_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      // Roll materials (Flex / Vinyl)
      roll_width_ft: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      gsm: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      // Board materials (Sunboard)
      board_width_ft: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      board_height_ft: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      thickness_mm: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      rate_per_sqft: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      rate_per_pc: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
    },
    {
      tableName: "jobfms_wide_format_materials",
      underscored: true,
      timestamps: true,
    }
  );

  return WideFormatMaterial;
};
