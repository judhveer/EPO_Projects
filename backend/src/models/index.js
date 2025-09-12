import { sequelize } from '../config/db.js';

// SalesPipeline
import LeadModel from './SalesPipelineModels/Lead.model.js';
import ResearchEntryModel from './SalesPipelineModels/ResearchEntry.model.js';
import ApprovalEntryModel from './SalesPipelineModels/ApprovalEntry.model.js';
import TelecallEntryModel from './SalesPipelineModels/TelecallEntry.model.js';
import MeetingEntryModel from './SalesPipelineModels/MeetingEntry.model.js';
import CrmEntryModel from './SalesPipelineModels/CrmEntry.model.js';
import StageHistoryModel from './SalesPipelineModels/StageHistory.model.js';
import UserModel from './SalesPipelineModels/User.model.js';

// Attendance
import AttendanceModel from './AttendanceModels/attendance.model.js'
import TelegramUserModel from './AttendanceModels/telegramuser.model.js'

// TaskBot
import DoerModel from './TelegramTaskbotModels/Doer.model.js'
import TaskModel from './TelegramTaskbotModels/Task.model.js'


// SalesPipeline Models
const Lead = LeadModel(sequelize);
const ResearchEntry = ResearchEntryModel(sequelize);
const ApprovalEntry = ApprovalEntryModel(sequelize);
const TelecallEntry = TelecallEntryModel(sequelize);
const MeetingEntry = MeetingEntryModel(sequelize);
const CrmEntry = CrmEntryModel(sequelize);
const StageHistory = StageHistoryModel(sequelize);
const User = UserModel(sequelize);

// Attendance Models
const Attendance = AttendanceModel(sequelize);
const TelegramUser = TelegramUserModel(sequelize);

// TaskBot Models
const Doer = DoerModel(sequelize);
const Task = TaskModel(sequelize);

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
    User,
    Attendance,
    TelegramUser,
    Doer,
    Task
};
