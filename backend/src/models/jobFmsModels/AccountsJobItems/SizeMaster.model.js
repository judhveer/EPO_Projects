import { DataTypes } from "sequelize";

export default (sequelize) => {
  const SizeMaster = sequelize.define("SizeMaster", {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,   // A4, A5, Legal, etc.
    },
    width: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    height: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    unit: {
      type: DataTypes.STRING,
      allowNull: false,  // inch
    },
  },{
      tableName: "jobfms_size_master",
      underscored: true,
    }
);

  return SizeMaster;
};
