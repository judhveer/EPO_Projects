import { DataTypes } from 'sequelize';


export default (sequelize) => {
  const Attendance = sequelize.define("Attendance", {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['IN', 'OUT']],
      }
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true
    },
    check_in_time: {
      type: DataTypes.STRING,
      allowNull: false
    },
    check_out_time: {
      type: DataTypes.STRING,
      allowNull: true
    },
    shift_time: {
      type: DataTypes.STRING,
      allowNull: true
    },
    photo_url: {
      type: DataTypes.STRING,
      allowNull: true
    },
    date: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      // type: DataTypes.STRING, // 'PRESENT', 'LATE', 'ABSENT'
      type: DataTypes.ENUM('PRESENT', 'LATE', 'ABSENT'),
      allowNull: true
    },
    late_minutes: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'attendance',
    indexes: [
      { fields: ['name'] },
      { fields: ['date'] }
    ],
    defaultScope: {
      order: [['date', 'DESC']]
    }
  });
  return Attendance;
}

