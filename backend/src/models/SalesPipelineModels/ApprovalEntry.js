import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const ApprovalEntry = sequelize.define('ApprovalEntry', {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true
        },
        ticketId: { 
            type: DataTypes.STRING(64), 
            allowNull: false, 
            field: 'ticket_id' 
        },

        approveStatus: { 
            type: DataTypes.STRING(24), 
            field: 'approve_status' 
        }, // PENDING/ACCEPTED/REJECTED
        approverRemark: { 
            type: DataTypes.TEXT, 
            field: 'approver_remark' 
        },
        telecallerAssignedTo: { 
            type: DataTypes.STRING(128), 
            field: 'telecaller_assigned_to' 
        },

        approvedBy: { 
            type: DataTypes.STRING(128), 
            field: 'approved_by' 
        }
    }, {
        tableName: 'approval_entries',
        underscored: true
    });
    return ApprovalEntry;
};
