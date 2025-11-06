import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Notification = sequelize.define('Notification', {
    id: { 
        type: DataTypes.UUID, 
        defaultValue: DataTypes.UUIDV4, 
        primaryKey: true 
    },
    user_id: { 
        type: DataTypes.UUID, 
        allowNull: false 
    },
    type: { 
        type: DataTypes.STRING 
    },
    payload: { 
        type: DataTypes.JSON 
    },
    is_read: { 
        type: DataTypes.BOOLEAN, 
        defaultValue: false 
    },
  }, {
    tableName: 'jobfms_notifications',
    underscored: true,
  });

  return Notification;
};
