import { DataTypes } from "sequelize";

export default (sequelize) => {
  const PushSubscription = sequelize.define(
    "PushSubscription",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      // The full push service URL — unique per browser+device combination
      endpoint: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // Browser's public key for encrypting the payload
      p256dh: {
        type: DataTypes.STRING(700),
        allowNull: false,
      },
      // Auth secret for encrypting the payload
      auth: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
    },
    {
      tableName: "push_subscriptions",
      underscored: true,
    }
  );

  return PushSubscription;
};