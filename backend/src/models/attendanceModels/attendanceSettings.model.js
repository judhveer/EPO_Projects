import { DataTypes } from "sequelize";

// ── Fixed singleton ID ──────────────────────────────────────────────
// This table must always contain exactly one row. Rather than relying
// on application code to "remember" to check before inserting a second
// row (fragile — one missed check anywhere and you have two conflicting
// configs), every read/write targets this exact, well-known ID. There
// is structurally no way to end up with two "real" settings rows.

export const ATTENDANCE_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export default (sequelize) => {
    const AttendanceSettings = sequelize.define("AttendanceSettings", {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: ATTENDANCE_SETTINGS_ID,
        },
        // ── Shift start — both offices confirmed identical: 10:00 AM ────
        shift_start_hour: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 10,
            validate: { min: 0, max: 23 },
        },
        shift_start_minute: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: { min: 0, max: 59 },
        },

        // Minutes of grace after shift_start before a check-in counts as LATE. Default 15 matches the legacy hardcoded "10:15" cutoff that was inline in the old sync controller — preserving existing behaviour on cutover rather than silently changing it, while now making it admin-editable without a code deploy.
        grace_minutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 15,
            validate: { min: 0 },
        },
        // Minutes worked (from actual check-in, not a fixed clock time) before overtime starts accruing. Confirmed: 8 hours = 480.
        overtime_threshold_minutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 480,
            validate: { min: 1 },
        },
        // Minutes after shift_start before the "you haven't checked in" push notification fires. Confirmed: 3 hours = 180 (→ 1:00 PM).
        reminder_delay_minutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 180,
            validate: { min: 0 },
        },
        // Lightweight trace of the last admin to change these values. Full before/after audit history is deferred to the AuditLog table (a later phase) — noted here explicitly, not silently dropped. This column alone is enough to answer "who touched this last" even before AuditLog exists.
        updated_by: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: "users", key: "id" },
        },
    }, {
        tableName: 'attendance_settings',
        underscored: true,
    });

    return AttendanceSettings;
};