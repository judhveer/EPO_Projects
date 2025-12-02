// models/ItemMaster.js
import { DataTypes } from "sequelize";

export default (sequelize) => {
  const ItemMaster = sequelize.define(
    "ItemMaster",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      item_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      category: {
        type: DataTypes.STRING, // Single Sheet, Wide Format, Multi Sheet, Other
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
      },
      default_size_id: {
        type: DataTypes.BIGINT.UNSIGNED,
      },
      default_paper_id: {
        type: DataTypes.BIGINT.UNSIGNED,
      },

      // NEW: allowed paper ids & allowed size ids (used by frontend to populate options)
      allowed_paper_ids: {
        type: DataTypes.JSON, // e.g. [1,2,3]
        allowNull: true,
      },

      allowed_size_ids: {
        type: DataTypes.JSON, // e.g. [1,4,6]
        allowNull: true,
      },
    },
    {
      tableName: "jobfms_item_master",
      underscored: true,
    }
  );

  ItemMaster.associate = (models) => {
    ItemMaster.hasMany(models.BindingMaster, {
      foreignKey: "item_master_id",
      as: "bindingOptions",
    });
    ItemMaster.hasMany(models.RateMaster, {
      foreignKey: "item_id",
      as: "rates",
    });
    ItemMaster.hasMany(models.JobItem, {
      foreignKey: "item_master_id",
      as: "jobItems",
    });
  };

  return ItemMaster;
};
