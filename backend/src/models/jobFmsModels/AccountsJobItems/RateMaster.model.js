// models/RateMaster.js
import { DataTypes } from "sequelize";

export default (sequelize) => {
  const RateMaster = sequelize.define(
    "RateMaster",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      item_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      size_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      rate_first_100: {
        type: DataTypes.FLOAT,
      },
      rate_next_100: {
        type: DataTypes.FLOAT,
      },
      side: {
        type: DataTypes.STRING, // one-side / both-side
      },
      color_type: {
        type: DataTypes.STRING, // single, multi
      },
      press_type: {
        type: DataTypes.STRING, // offset, digital
      },
      valid_from: {
        type: DataTypes.DATE,
      },
      valid_to: {
        type: DataTypes.DATE,
      },

      // NEW: UOM field so you can store whether rate is per Pc/Sheets/Books
      uom: {
        type: DataTypes.ENUM("Pc", "Nos", "Copies", "Books", "Sheets"),
        defaultValue: "Pc",
      },
    },
    {
      tableName: "jobfms_rate_master",
      underscored: true,
    }
  );

  RateMaster.associate = (models) => {
    RateMaster.belongsTo(models.ItemMaster, {
      foreignKey: "item_id",
      as: "item",
    });
    RateMaster.belongsTo(models.SizeMaster, {
      foreignKey: "size_id",
      as: "size",
    });
  };

  return RateMaster;
};
