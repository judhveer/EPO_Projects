import { DataTypes } from 'sequelize';

export const HOLIDAY_SCOPE_TYPES = ['ALL', 'OFFICE', 'DEPARTMENT', 'INDIVIDUAL'];

export default (sequelize) => {
    const HolidayApplicability = sequelize.define('HolidayApplicability', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        holiday_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'holidays',
                key: 'id'
            }
        },
        scope_type: {
            type: DataTypes.ENUM(...HOLIDAY_SCOPE_TYPES),
            allowNull: false
        },
        // Polymorphic, same idea as LeaveLedger.reference_id — but STRING
        // here rather than UUID, because the meaning genuinely varies by
        // type: null for ALL, an OFFICES value ('EPO'/'MM') for OFFICE, a
        // DEPARTMENTS value for DEPARTMENT, a real User.id (UUID string)
        // for INDIVIDUAL. STRING(64) comfortably fits all three shapes.
        scope_ref_id: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
    }, {
        tableName: 'holiday_applicability',
        underscored: true,
        indexes: [
            { fields: ['holiday_id'] },
            { fields: ['scope_type', 'scope_ref_id'] },
        ],
    });
    return HolidayApplicability;
};