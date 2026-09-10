import { DataTypes } from "sequelize";

export default (sequelize) => {
    const LeaveType = sequelize.define('LeaveType', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(64),
            allowNull: false,
            unique: true,           // "Casual Leave", "Emergency Leave", "Medical Leave", admin-defined
        },
        is_paid: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        // Governs the explicit LeaveRequest approval workflow only. Has no bearing on auto-deduction (a no-show auto-deduction is a system action, not a request — it never enters an approval queue by definition). Confirmed: every explicit request always requires approval, so this exists for future flexibility, not because any type is exempt today.
        requires_approval: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        // Whether this type is eligible for automatic no-show consumption (BR-004). Only meaningful together with auto_deduct_priority below.
        auto_deductible:{
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },

        // Lower = tried first when the resolution engine looks for an eligible type to auto-consume. Nullable — only required when auto_deductible is true, enforced in the validate hook below rather than a NOT NULL constraint (which would break for every non-auto-deductible type).
        auto_deduct_priority: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        // Retiring a leave type (e.g. discontinuing a category) must never hard-delete it if any LeaveAllocation/LeaveLedger/LeaveRequest row still references it — those are permanent business records. Set active=false instead; existing FKs stay intact, it just stops appearing as a selectable option for new allocations/requests.
        active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        created_by:{
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id',
            }
        },
    }, {
        tableName: 'leave_types',
        underscored: true,
        validate: {
            autoDeductPriorityRequiredWhenDeductible(){
                if(this.auto_deductible && this.auto_deduct_priority === null){
                    throw new Error('auto_deduct_priority is required when auto_deductible is true.');
                }
            },
        },
    });
    return LeaveType;
}





// fetch('http://localhost:3006/api/leave-config/recompute-allocation', {
//   method: 'POST',
//   headers: {
//     'Content-Type': 'application/json',
//     'Authorization': `Bearer ${localStorage.getItem('token')}`,
//   },
//   body: JSON.stringify({
//     employee_id: '25cfb074-f99d-473a-a57e-338de4df6aac',
//     leave_type_id: '7d09f46b-708b-45b9-998d-1b81f5f77924',
//     leave_year: 2026,
//     reason: 'Correcting pro-ration formula bug (/100 → /12)',
//   }),
// }).then(r => r.json()).then(console.log);