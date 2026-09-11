import { DataTypes } from 'sequelize';

export const AUDIT_ENTITY_TYPES = ['ATTENDANCE', 'LEAVE_REQUEST', 'LEAVE_LEDGER', 'LEAVE_ALLOCATION', 'LEAVE_TYPE', 'LEAVE_POLICY', 'HOLIDAY', 'USER'];

export default (sequelize) => {
    const AuditLog = sequelize.define('AuditLog', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        entity_type: {
            type: DataTypes.ENUM(...AUDIT_ENTITY_TYPES),
            allowNull: false
        },
        entity_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        action: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        performed_by: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        }, // null = SYSTEM
        // Real JSON columns, not TEXT + manual stringify/parse — Sequelize
        // handles serialize/deserialize transparently. This sidesteps the
        // legacy safeParseJson pattern this codebase needed elsewhere
        // (where older columns were defined as STRING/TEXT) — a brand new
        // table has no reason to inherit that workaround.
        old_value: {
            type: DataTypes.JSON,
            allowNull: true
        },
        new_value: {
            type: DataTypes.JSON,
            allowNull: true
        },
        reason: {
            type: DataTypes.TEXT,
            allowNull: true
        },
    }, {
        tableName: 'audit_log',
        underscored: true,
        updatedAt: false, // append-only — matches LeaveLedger's exact reasoning, no row is ever edited after creation
        indexes: [
            { fields: ['entity_type', 'entity_id'] }, // "full history for this one record"
            { fields: ['performed_by'] },              // "everything this person did"
            { fields: ['created_at'] },                 // chronological activity feed
        ],
    });
    return AuditLog;
};