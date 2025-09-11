import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Doer = sequelize.define('Doer', {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      set(value) {
        this.setDataValue('name', value.toUpperCase());
      }
    },
    telegramId: {
      type: DataTypes.BIGINT, // Telegram chat/user ID
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    department: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Approval flow fields
    isApproved: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    approvalStatus: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
      defaultValue: 'APPROVED'
    },
    approvedBy: {
      type: DataTypes.STRING, // Stores approver's name (not telegramId)
      allowNull: true
    },


    // NEW — minimal state to support MIS queue/history
    requestType: {
      // Distinguish registration vs dept-change (so MIS can filter both)
      type: DataTypes.ENUM('NONE', 'REGISTRATION', 'DEPT_CHANGE'),
      allowNull: false,
      defaultValue: 'NONE'
    },
    pendingDepartment: {
      // For dept-change: store the requested NEW dept (so callbacks are not the only source)
      type: DataTypes.STRING,
      allowNull: true
    },
    departmentPrev: {
      // Remember the PREVIOUS (last approved) department for audit/MIS display
      type: DataTypes.STRING,
      allowNull: true
    },
    requestedAt: {
      // When the current approval request started
      type: DataTypes.DATE,
      allowNull: true
    },
    decisionAt: {
      // When MIS approved/rejected
      type: DataTypes.DATE,
      allowNull: true
    }

  });

  return Doer;
}
