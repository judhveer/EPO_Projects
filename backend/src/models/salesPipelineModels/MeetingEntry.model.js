import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const MeetingEntry = sequelize.define('MeetingEntry', {
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

        outcomeNotes: {
            type: DataTypes.TEXT,
            field: 'outcome_notes'
        },
        status: {
            type: DataTypes.STRING(32)
        }, // APPROVE | REJECT | CRM_FOLLOW_UP | RESCHEDULE_MEETING
        newActualBudget: {
            type: DataTypes.DECIMAL(15, 2),
            field: 'new_actual_budget',
            allowNull: true
        },

        // NEW: when meeting is being rescheduled from MEETING stage
        rescheduleMeetingType: { 
            type: DataTypes.STRING(32), 
            allowNull: true 
        },
        rescheduleMeetingDateTime: { 
            type: DataTypes.DATE, 
            allowNull: true 
        },
        rescheduleMeetingAssignee: { 
            type: DataTypes.STRING(128), 
            allowNull: true 
        },

        // NEW: when sending to CRM follow-up from MEETING stage
        nextFollowUpOn: { 
            type: DataTypes.DATEONLY, 
            allowNull: true 
        },

        createdBy: {
            type: DataTypes.STRING(128),
            field: 'created_by'
        }
    }, {
        tableName: 'meeting_entries',
        underscored: true
    });
    return MeetingEntry;
};
