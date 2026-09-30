import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const LeavePolicy = sequelize.define('LeavePolicy', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        leave_type_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'leave_types',
                key: 'id',
            }
        },

        // Full days per calendar year. DECIMAL, not INTEGER — pro-rated mid-year allocations (6-month eligibility gate) produce fractional results, e.g. 18 annual days / 12 months × 5 remaining months = 7.5. This does NOT reintroduce half-day leave requests — an employee still only ever consumes whole days — it just means a starting balance can legitimately be a fractional number like 7.5 before any days are taken out of it.
        annual_entitlement:{
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            validate: { min: 0 },
        },
        active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    }, {
        tableName: 'leave_policies',
        underscored: true,
        indexes: [
            { fields: ['leave_type_id'] },
        ],
    });

    return LeavePolicy;
}
