import { DataTypes } from "sequelize";

export default (sequelize) => {
    const LeaveAllocation = sequelize.define('LeaveAllocation', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        employee_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id',
            },
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
        // The actual entitlement for THIS employee THIS year — may equal LeavePolicy.annual_entitlement (if eligible the full year) or a pro-rated fraction of it (crossed the 6-month mark mid-year).
        allocated_amount: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            validate: { min: 0 },
        },
        source: {
            type: DataTypes.ENUM('POLICY', 'MANUAL_ADMIN_GRANT'),
            allowNull: false,
            defaultValue: 'POLICY',
        },
        created_by: {
            type: DataTypes.UUID,
            allowNull: true, // null for system-generated policy allocations, set for manual grants
            references: { model: 'users', key: 'id' },
        },
    }, {
        tableName: 'leave_allocations',
        underscored: true,
        indexes: [
            // One allocation per person, per type, per year — the databaseitself refuses a duplicate, not just application-level checking.
            { unique: true, fields: ['employee_id', 'leave_type_id', 'leave_year'] },
        ],
    });
    
    return LeaveAllocation;
}