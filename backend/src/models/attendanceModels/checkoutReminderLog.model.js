import { DataTypes } from 'sequelize';

// One row per reminder actually SENT — not one row per person per day
// like AttendanceReminderLog (the morning one). This one fires
// repeatedly through the night, so there's no unique constraint here;
// the job itself decides whether enough time has passed since the
// most recent row before sending again.
export default (sequelize) => {
    const CheckoutReminderLog = sequelize.define('CheckoutReminderLog', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        employee_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
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
        // Distinguishes "this row represents the push+email combo" from
        // later push-only rows — needed so the job can answer "has the
        // one-time email already gone out for this person/date" without
        // a second table.
        email_sent: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
    }, {
        tableName: 'checkout_reminder_log',
        underscored: true,
        updatedAt: false,
        indexes: [
            // The job's core query every single run: "give me this person's
            // most recent reminder for this date" — always filtered on
            // exactly these three columns together.
            { fields: ['employee_id', 'shift_date', 'sent_at'] },
        ],
    });
    return CheckoutReminderLog;
};