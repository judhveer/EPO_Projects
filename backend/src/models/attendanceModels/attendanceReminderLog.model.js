import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const AttendanceReminderLog = sequelize.define('AttendanceReminderLog', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        employee_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' }
        },
        shift_date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        sent_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
    }, {
        tableName: 'attendance_reminder_log',
        underscored: true,
        updatedAt: false,
        indexes: [
            // The actual "never send twice today" guarantee — DB-enforced,
            // same pattern as the Attendance table's own (employee_id,
            // shift_date) uniqueness.
            { unique: true, fields: ['employee_id', 'shift_date'] },
        ],
    });
    return AttendanceReminderLog;
};