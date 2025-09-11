import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const ResearchEntry = sequelize.define('ResearchEntry', {
        id: { 
            type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, 
            primaryKey: true 
        },
        ticketId: { 
            type: DataTypes.STRING(64), 
            allowNull: false, 
            field: 'ticket_id' 
        },

        researchDate: { 
            type: DataTypes.DATE 
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
        createdBy: { 
            type: DataTypes.STRING(128), 
            field: 'created_by' 
        },

    }, {
        tableName: 'research_entries',
        underscored: true
    });
    return ResearchEntry;
};
