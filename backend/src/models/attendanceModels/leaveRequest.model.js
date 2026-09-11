import { DataTypes } from 'sequelize';

export const LEAVE_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export default (sequelize) => {
  const LeaveRequest = sequelize.define('LeaveRequest', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    employee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    leave_type_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'leave_types', key: 'id' },
    },
    date_from: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    date_to: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    // No half-day support at all — confirmed excluded from scope.
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(...LEAVE_REQUEST_STATUSES),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    decided_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    decided_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    decision_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'leave_requests',
    underscored: true,
    indexes: [
      { fields: ['employee_id', 'status'] }, // "my pending/approved requests"
      { fields: ['status'] },                 // admin's pending-approval queue
      { fields: ['date_from', 'date_to'] },   // overlap-detection queries
    ],
    validate: {
      dateRangeValid() {
        if (this.date_from && this.date_to && this.date_to < this.date_from) {
          throw new Error('date_to cannot be before date_from.');
        }
      },
    },
  });

  return LeaveRequest;
};