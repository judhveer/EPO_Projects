import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const CrmEntry = sequelize.define('CrmEntry', {
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

        followupNotes: {
            type: DataTypes.TEXT,
            field: 'followup_notes'
        },
        status: {
            type: DataTypes.STRING(24)
        }, // HOLD | APPROVE | REJECT | RESCHEDULE_MEETING
        nextFollowUpOn: {
            type: DataTypes.DATE,
            field: 'next_follow_up_on'
        },

        // NEW: if CRM reschedules a meeting directly
        rescheduleMeetingType: { 
            type: DataTypes.STRING(32), allowNull: true 
        },
        rescheduleMeetingDateTime: { 
            type: DataTypes.DATE, allowNull: true 
        },
        rescheduleMeetingAssignee: { 
            type: DataTypes.STRING(128), allowNull: true 
        },

        createdBy: {
            type: DataTypes.STRING(128),
            field: 'created_by'
        }
    }, {
        tableName: 'crm_entries',
        underscored: true
    });
    return CrmEntry;
};
