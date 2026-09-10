import { DataTypes } from 'sequelize';

// ── Attendance status values ────────────────────────────────────────
// PRESENT / LATE remain mutually exclusive top-level statuses (not a separate boolean layered on top) — this matches how the existing frontend (AttendanceTable.jsx) already branches on record.status directly, so nothing there needs to change shape.
// HOLIDAY / WEEK_OFF / LEAVE / ABSENT are the new statuses the resolution engine (built in a later phase) will assign.
// UNRESOLVED is a placeholder for "today, not yet finalized" — it should never appear on a historical (past) date once the nightly job has run.

export const ATTENDANCE_STATUSES = [
  "PRESENT", "LATE", "HOLIDAY", "WEEK_OFF", "LEAVE", "ABSENT", "UNRESOLVED"
];


export default (sequelize) => {
  const Attendance = sequelize.define("Attendance", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // ── Identity — FK replaces the old free-text `name` column ─────
    employee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
    },

    // Denormalized from User.office at write-time. Kept directly on the row (not looked up via join every read) because every report in Section T of the architecture filters/groups by office, and this table will be read far more than the user's office will ever change mid-record.
    office: {
      type: DataTypes.STRING(8),
      allowNull: false,
    },
    // ── The logical work day — NOT the calendar date of check_out_time ── This is what fixes the cross-midnight bug: an MM employee who checks in at 9 PM and checks out at 1 AM still belongs to the shift_date they checked IN on, regardless of what calendar date the checkout timestamp falls on.
    shift_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    check_in_time: {
      type: DataTypes.DATE,   // real DATETIME now, not a formatted string
      allowNull: true,        // null until the resolution engine or the employee actually writes a value
    },
    check_out_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(...ATTENDANCE_STATUSES),
      allowNull: false,
      defaultValue: 'UNRESOLVED',
    },

    // Numeric now (was a formatted string like "2h 15min") — this is what makes SUM()/AVG() and payroll-facing overtime reports possible at all. Display formatting moves to the frontend.
    late_minutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },

    // NEW — did not exist before. Minutes worked past 8 hours from actual check_in_time, per the confirmed business rule. Purely informational for payroll; never drives attendance status.
    overtime_minutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },

    // Who finalized this row's status. NULL = the nightly resolution engine did it automatically. Set = a specific admin/BOSS/HR user manually corrected it (used together with is_manual_override below, and always paired with an AuditLog entry when set).
    finalized_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "users", key: 'id' },
    },
    is_manual_override: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    leave_request_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'leave_requests', key: 'id' },
    },


    // name: {
    //   type: DataTypes.STRING,
    //   allowNull: false
    // },
    // action: {
    //   type: DataTypes.STRING,
    //   allowNull: false,
    //   validate: {
    //     isIn: [['IN', 'OUT']],
    //   }
    // },
    // location: {
    //   type: DataTypes.STRING,
    //   allowNull: true
    // },
    // check_in_time: {
    //   type: DataTypes.STRING,
    //   allowNull: false
    // },
    // check_out_time: {
    //   type: DataTypes.STRING,
    //   allowNull: true
    // },
    // shift_time: {
    //   type: DataTypes.STRING,
    //   allowNull: true
    // },
    // photo_url: {
    //   type: DataTypes.STRING,
    //   allowNull: true
    // },
    // date: {
    //   type: DataTypes.STRING,
    //   allowNull: true
    // },
    // status: {
    //   // type: DataTypes.STRING, // 'PRESENT', 'LATE', 'ABSENT'
    //   type: DataTypes.ENUM('PRESENT', 'LATE', 'ABSENT'),
    //   allowNull: true
    // },
    // late_minutes: {
    //   type: DataTypes.STRING,
    //   allowNull: true
    // }
  }, {
    tableName: 'attendance',
    underscored: true,

    indexes: [
      { fields: ['employee_id'] },
      { fields: ['office'] },
      { fields: ['shift_date'] },
      { fields: ['status'] },
      // ── This is what makes duplicate attendance structurally impossible, not just UI-discouraged: one row per employee per logical work day, enforced by the database itself.
      { unique: true, fields: ['employee_id', 'shift_date'] },

      // { fields: ['name'] },
      // { fields: ['date'] }
    ],
    defaultScope: {
      order: [['shift_date', 'DESC']]
    }
  });

  return Attendance;
}

