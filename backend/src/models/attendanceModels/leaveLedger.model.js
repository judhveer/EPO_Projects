import { DataTypes } from 'sequelize';

export const LEDGER_TRANSACTION_TYPES = [
  'ALLOCATION', 'CONSUMPTION', 'REVERSAL', 'MANUAL_ADJUSTMENT', 'EXPIRY'
];
export const LEDGER_REFERENCE_TYPES = [
  'LEAVE_REQUEST', 'AUTO_DEDUCTION', 'ADMIN_CORRECTION', 'POLICY_ALLOCATION', 'MANUAL_GRANT'
];

export default (sequelize) => {
  const LeaveLedger = sequelize.define('LeaveLedger', {
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
    leave_year: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    transaction_type: {
      type: DataTypes.ENUM(...LEDGER_TRANSACTION_TYPES),
      allowNull: false,
    },
    // Signed. Positive for ALLOCATION/REVERSAL, negative for
    // CONSUMPTION/EXPIRY. MANUAL_ADJUSTMENT can be either sign — an
    // admin correction might add or remove days. Current balance for
    // any employee/type/year is always SUM(amount) over matching rows,
    // never a stored number anywhere.
    amount: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: false,
    },
    // The specific calendar day this entry pertains to — for a
    // CONSUMPTION entry tied to a 10-day approved leave, this is ONE of
    // those 10 days, not the request's start date. This granularity is
    // exactly what makes a single-day holiday-collision reversal
    // possible without touching the other 9 days.
    effective_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    reference_type: {
      type: DataTypes.ENUM(...LEDGER_REFERENCE_TYPES),
      allowNull: false,
    },
    // Polymorphic — points to LeaveRequest.id, Attendance.id (auto
    // deduction), or LeaveAllocation.id, depending on reference_type.
    // No formal FK constraint here (a single column can't FK to three
    // different tables) — reference_type disambiguates which table to
    // look in. Same pattern the architecture uses for the generic
    // AuditLog table.
    reference_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    // NULL = the automated resolution engine/nightly job did this.
    // Set = a specific admin performed a manual correction.
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'leave_ledger',
    underscored: true,
    updatedAt: false, // ← deliberate: append-only table, no row is ever updated after creation
    indexes: [
      // The single most important index in this table — every balance
      // calculation runs this exact filter.
      { fields: ['employee_id', 'leave_type_id', 'leave_year'] },
      // Needed to find "which ledger entries came from this specific
      // request/attendance row" for targeted reversal.
      { fields: ['reference_type', 'reference_id'] },
      { fields: ['effective_date'] },
    ],
  });

  return LeaveLedger;
};