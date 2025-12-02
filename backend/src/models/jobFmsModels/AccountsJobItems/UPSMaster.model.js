// models/UPSMaster.js
import { DataTypes } from "sequelize";

export default (sequelize) => {
  const UPSMaster = sequelize.define(
    "UPSMaster",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      item_size_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      ups: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      tableName: "jobfms_ups_master",
      underscored: true,
    }
  );

  UPSMaster.associate = (models) => {
    UPSMaster.belongsTo(models.PaperMaster, {
  foreignKey: "paper_size_id",
  as: "paperSize"
});

  };

  return UPSMaster;
};
