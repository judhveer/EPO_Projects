import { DataTypes } from "sequelize";

export default (sequelize) => {
  const DiscResult = sequelize.define(
    "DiscResult",
    {
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      mobile: {
        type: DataTypes.STRING,
      },
      dob: {
        type: DataTypes.STRING,
      },
      D: {
        type: DataTypes.FLOAT,
      },
      I: {
        type: DataTypes.FLOAT,
      },
      S: {
        type: DataTypes.FLOAT,
      },
      C: {
        type: DataTypes.FLOAT,
      },
      primaryTrait: {
        type: DataTypes.STRING,
      },
      secondaryTrait: {
        type: DataTypes.STRING,
      },
      profileType: {
        type: DataTypes.STRING,
      },
      profileStrength: {
        type: DataTypes.STRING,
      },
      summary: {
        type: DataTypes.TEXT,
      },
    },
    { timestamps: true }
  );
  return DiscResult;
};
