import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const TelecallEntry = sequelize.define('TelecallEntry', {
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

        meetingType: {
            type: DataTypes.STRING(24),
            field: 'meeting_type'
        }, // visit/phone call/video call
        meetingDateTime: {
            type: DataTypes.DATE,
            field: 'meeting_datetime'
        },
        meetingAssignee: {
            type: DataTypes.STRING(128),
            field: 'meeting_assignee'
        },

        createdBy: {
            type: DataTypes.STRING(128),
            field: 'created_by'
        }
    }, {
        tableName: 'telecall_entries',
        underscored: true
    });
    return TelecallEntry;
};
