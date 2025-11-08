import { DataTypes } from "sequelize";

export default (sequelize) => {
  const EnquiryForItems = sequelize.define(
    "EnquiryForItems",
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      item: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        set(value) {
          this.setDataValue("item", value ? value.toLowerCase() : null);
        },
      },
    },
    {
      tableName: "jobfms_enquiry_for_items",
      underscored: true,
    }
  );

  return EnquiryForItems;
};
