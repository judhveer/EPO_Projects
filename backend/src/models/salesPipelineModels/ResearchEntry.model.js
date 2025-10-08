import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const ResearchEntry = sequelize.define('ResearchEntry', {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true
        },
        ticketId: {
            type: DataTypes.STRING(64),
            allowNull: false,
            field: 'ticket_id',
            validate: {
                notEmpty: true,
            },
        },
        // research type enum
        researchType: {
            type: DataTypes.ENUM('TENDER', 'GENERAL'),
            field: 'research_type',
            allowNull: false,
            defaultValue: 'GENERAL',
            validate: {
                isIn: {
                    args: [['TENDER', 'GENERAL']],
                    msg: 'researchType must be TENDER or GENERAL',
                },
            },
        },
        researchDate: {
            type: DataTypes.DATE
        },

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

        company: {
            type: DataTypes.STRING(256),
            allowNull: false,
            validate: {
                notEmpty: { msg: 'company is required' },
            },
        },
        contactName: {
            type: DataTypes.STRING(128),
            field: 'contact_name'
        },
        mobile: {
            type: DataTypes.STRING(32)
        },
        email: {
            type: DataTypes.STRING(128),
            validate: {
                isEmail: { msg: 'Invalid email' },
            },
        },
        region: {
            type: DataTypes.STRING(64)
        },
        estimatedBudget: {
            type: DataTypes.DECIMAL(15, 2),
            field: 'estimated_budget',
            allowNull: true,
            validate: {
                min: 0,
            },
        },
        // free-text long fields
        requirements: {
            type: DataTypes.TEXT,
            allowNull: true,
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
        remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        createdBy: {
            type: DataTypes.STRING(128),
            field: 'created_by',
            allowNull: false,
        },

    }, {
        tableName: 'research_entries',
        underscored: true,
        indexes: [
            { name: 'idx_research_ticket_id', fields: ['ticket_id'] },
            { name: 'idx_research_created_by', fields: ['created_by'] },
            { name: 'idx_research_financial_period', fields: ['financial_period_year', 'financial_period_month'] },
            { name: 'idx_research_research_type', fields: ['research_type'] },
        ],
        validate: {
            tenderDatesOrder() {
                // Only validate when both provided
                if (this.tenderOpeningDate && this.tenderClosingDate) {
                    // DATEONLY values are strings in 'YYYY-MM-DD' format — convert to Date for comparison
                    const open = new Date(this.tenderOpeningDate);
                    const close = new Date(this.tenderClosingDate);
                    if (open > close) {
                        throw new Error('tenderOpeningDate must be on or before tenderClosingDate');
                    }
                }
            },
            financialPeriodConsistency() {
                const m = this.financialPeriodMonth;
                const y = this.financialPeriodYear;
                if ((m && !y) || (!m && y)) {
                    throw new Error('Both financialPeriodMonth and financialPeriodYear must be provided together');
                }
            },
        },
    });
    return ResearchEntry;
};
