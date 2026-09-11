import { DataTypes } from 'sequelize';

export const HOLIDAY_TYPES = ['MANDATORY', 'OPTIONAL'];

export default (sequelize) => {
    const Holiday = sequelize.define('Holiday', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING(128),
            allowNull: false
        },
        date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        holiday_type: {
            type: DataTypes.ENUM(...HOLIDAY_TYPES),
            allowNull: false,
            defaultValue: 'MANDATORY'
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        // Deactivate, never delete — a holiday that applied on a past date
        // must stay reconstructable even if later discontinued, since
        // Attendance rows marked HOLIDAY because of it are permanent
        // business records that reference this exact configuration.
        active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        created_by: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
    }, {
        tableName: 'holidays',
        underscored: true,
        indexes: [
            { fields: ['date'] },
            { fields: ['active'] },
            // Two DIFFERENT holidays CAN legitimately share a date (two
            // festivals for two different groups, same day) — so uniqueness
            // is on (name, date) together, not date alone.
            {
                unique: true,
                fields: ['name', 'date']
            },
        ],
    });
    return Holiday;
};