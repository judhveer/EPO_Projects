import { DataTypes } from 'sequelize';


export default (sequelize) => {
  const TelegramUser = sequelize.define("TelegramUser", {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    chat_id: {
      type: DataTypes.BIGINT,
      unique: true,
    }
  });

  return TelegramUser;
}
