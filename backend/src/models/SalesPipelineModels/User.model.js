import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    role: {
      type: DataTypes.STRING(32)
    }, // EXEC / COORDINATOR / CRM / TELECALLER
    name: {
      type: DataTypes.STRING(128)
    },
    email: {
      type: DataTypes.STRING(128)
    },
    // later: passwordHash, etc.
  }, {
    tableName: 'users',
    underscored: true
  });
  return User;
};
