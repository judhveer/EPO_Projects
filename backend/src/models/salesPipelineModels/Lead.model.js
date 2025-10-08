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
            type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'REJECTED'),
            // type: DataTypes.STRING(24),
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
            type: DataTypes.ENUM('OPEN', 'WON', 'LOST'),
            // type: DataTypes.STRING(24),
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
            type: DataTypes.DECIMAL(15, 2),
            field: 'estimated_budget',
            allowNull: true
        },

        // ---------- NEW SNAPSHOT FIELDS ----------
        researchType: {
            type: DataTypes.ENUM('TENDER', 'GENERAL'),
            allowNull: false,
            defaultValue: 'GENERAL',
            field: 'research_type'
        },

        // tender fields (nullable)
        tenderOpeningDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            field: 'tender_opening_date',

        },
        tenderClosingDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            field: 'tender_closing_date',
        },

        // financial period split into month + year (easy to filter / index)
        financialPeriodMonth: {
            type: DataTypes.TINYINT.UNSIGNED,
            allowNull: true,
            field: 'financial_period_month',
            validate: {
                min: 1,
                max: 12,
            },
        },
        financialPeriodYear: {
            type: DataTypes.SMALLINT.UNSIGNED,
            allowNull: true,
            field: 'financial_period_year',
            validate: {
                min: 1900,
                max: 9999,
            },
        },

        // free-text long fields
        requirements: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
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
            type: DataTypes.DECIMAL(15, 2),
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
        underscored: true,
        indexes: [
            { name: 'idx_lead_stage', fields: ['stage'] },
            { name: 'idx_lead_telecaller_assigned_to', fields: ['telecaller_assigned_to'] },
            { name: 'idx_lead_meeting_assignee', fields: ['meeting_assignee'] },
            { name: 'idx_lead_crm_assigned_to', fields: ['crm_assigned_to'] },
            // new helpful indexes:
            { name: 'idx_lead_research_type', fields: ['research_type'] },
            { name: 'idx_lead_financial_period', fields: ['financial_period_year', 'financial_period_month'] },
        ],
    });
    return Lead;
};
