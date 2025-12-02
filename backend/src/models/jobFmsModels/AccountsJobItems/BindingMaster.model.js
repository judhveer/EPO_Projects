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
      category: {
        type: DataTypes.ENUM('Single Sheet','Multiple Sheet','Wide Format','Other'),
        allowNull: false
      },

      // Link to item master (optional)
      // item_master_id: {
      //   type: DataTypes.BIGINT.UNSIGNED,
      //   allowNull: true,
      // },

      // item_id: {
      //   type: DataTypes.BIGINT.UNSIGNED,
      //   allowNull: true,
      // },

      binding_type: {
        type: DataTypes.STRING, // staple, hardbound, center stitch, etc.
      },
      rate_per_unit: {
        type: DataTypes.FLOAT,
      },
      cover_paper_id: {
        type: DataTypes.BIGINT.UNSIGNED,
      },
      inner_paper_id: {
        type: DataTypes.BIGINT.UNSIGNED,
      },
    },
    {
      tableName: "jobfms_binding_master",
      underscored: true,
    }
  );

  BindingMaster.associate = (models) => {
    BindingMaster.belongsTo(models.ItemMaster, {
      foreignKey: "item_master_id",
      as: "itemMaster",
      targetKey: "id",
    });
  };

  return BindingMaster;
};
