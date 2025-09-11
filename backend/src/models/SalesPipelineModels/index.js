import { sequelize } from '../config/db.js';
import LeadModel from './Lead.js';
import ResearchEntryModel from './ResearchEntry.js';
import ApprovalEntryModel from './ApprovalEntry.js';
import TelecallEntryModel from './TelecallEntry.js';
import MeetingEntryModel from './MeetingEntry.js';
import CrmEntryModel from './CrmEntry.js';
import StageHistoryModel from './StageHistory.js';
import UserModel from './User.js';

const Lead = LeadModel(sequelize);
const ResearchEntry = ResearchEntryModel(sequelize);
const ApprovalEntry = ApprovalEntryModel(sequelize);
const TelecallEntry = TelecallEntryModel(sequelize);
const MeetingEntry = MeetingEntryModel(sequelize);
const CrmEntry = CrmEntryModel(sequelize);
const StageHistory = StageHistoryModel(sequelize);
const User = UserModel(sequelize);

// Associations (ticketId attribute)
Lead.hasMany(ResearchEntry, {
    foreignKey: 'ticketId',
    sourceKey: 'ticketId',
    as: 'researchEntries'
});
Lead.hasMany(ApprovalEntry, {
    foreignKey: 'ticketId',
    sourceKey: 'ticketId',
    as: 'approvalEntries'
});
Lead.hasMany(TelecallEntry, {
    foreignKey: 'ticketId',
    sourceKey: 'ticketId',
    as: 'telecallEntries'
});
Lead.hasMany(MeetingEntry, {
    foreignKey: 'ticketId',
    sourceKey: 'ticketId',
    as: 'meetingEntries'
});
Lead.hasMany(CrmEntry, {
    foreignKey: 'ticketId',
    sourceKey: 'ticketId',
    as: 'crmEntries'
});

Lead.hasMany(StageHistory, {
    foreignKey: 'ticketId',
    sourceKey: 'ticketId',
    as: 'history'
});
StageHistory.belongsTo(Lead, {
    foreignKey: 'ticketId',
    targetKey: 'ticketId',
    as: 'lead'
});


export default {
    sequelize,
    Lead,
    ResearchEntry,
    ApprovalEntry,
    TelecallEntry,
    MeetingEntry,
    CrmEntry,
    StageHistory,
    User
};
