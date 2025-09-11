import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Lead = sequelize.define('Lead', {
    ticketId: { 
        type: DataTypes.STRING(64), 
        primaryKey: true, 
        field: 'ticket_id' 
    },

    // Snapshot fields used for dashboard
    stage: { 
        type: DataTypes.STRING(24) 
    },                 // RESEARCH/APPROVAL/TELECALL/MEETING/CRM/CLOSED

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
    meetingAssignee: { 
        type: DataTypes.STRING(128), 
        field: 'meeting_assignee' 
    },
    crmAssignedTo: { 
        type: DataTypes.STRING(128), 
        field: 'crm_assigned_to' 
    },

    clientStatus: { 
        type: DataTypes.STRING(24), 
        field: 'client_status' 
    }, // OPEN/WON/LOST

    researchDate: { 
        type: DataTypes.DATE, 
        field: 'research_date' 
    },
    company: { 
        type: DataTypes.STRING(256) 
    },
    contactName: { 
        type: DataTypes.STRING(128), 
        field: 'contact_name' 
    },
    mobile: { 
        type: DataTypes.STRING(32) 
    },
    email: { 
        type: DataTypes.STRING(128) 
    },
    region: { 
        type: DataTypes.STRING(64) 
    },

    estimatedBudget: { 
        type: DataTypes.DECIMAL(15,2), 
        field: 'estimated_budget', 
        allowNull: true 
    },

    meetingType: { 
        type: DataTypes.STRING(24), 
        field: 'meeting_type' 
    }, // visit/phone call/video call
    meetingDateTime: { 
        type: DataTypes.DATE, 
        field: 'meeting_datetime' 
    },

    outcomeNotes: { 
        type: DataTypes.TEXT, 
        field: 'outcome_notes' 
    },
    outcomeStatus: { 
        type: DataTypes.STRING(24), 
        field: 'outcome_status' 
    }, // HOLD/APPROVE/REJECT
    newActualBudget: { 
        type: DataTypes.DECIMAL(15,2), 
        field: 'new_actual_budget', 
        allowNull: true 
    },

    lastFollowUpOn: { 
        type: DataTypes.DATE, 
        field: 'last_follow_up_on' 
    },
    nextFollowUpOn: { 
        type: DataTypes.DATE, 
        field: 'next_follow_up_on' 
    }
  }, {
    tableName: 'leads',
    underscored: true
  });
  return Lead;
};
