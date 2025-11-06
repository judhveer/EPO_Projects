import { sequelize } from '../config/db.js';

// SalesPipeline
import LeadModel from './salesPipelineModels/Lead.model.js';
import ResearchEntryModel from './salesPipelineModels/ResearchEntry.model.js';
import ApprovalEntryModel from './salesPipelineModels/ApprovalEntry.model.js';
import TelecallEntryModel from './salesPipelineModels/TelecallEntry.model.js';
import MeetingEntryModel from './salesPipelineModels/MeetingEntry.model.js';
import CrmEntryModel from './salesPipelineModels/CrmEntry.model.js';
import StageHistoryModel from './salesPipelineModels/StageHistory.model.js';
import UserModel from './salesPipelineModels/User.model.js';

// Attendance
import AttendanceModel from './attendanceModels/attendance.model.js'
import TelegramUserModel from './attendanceModels/telegramuser.model.js'

// TaskBot
import DoerModel from './telegramTaskbotModels/Doer.model.js'
import TaskModel from './telegramTaskbotModels/Task.model.js'


import DiscResult from './discReport/DiscResult.model.js'


// jobFMS Models
import JobCardModel from './jobFmsModels/JobCard.model.js';
import JobItemModel from './jobFmsModels/JobItem.model.js';
import JobAssignmentModel from './jobFmsModels/JobAssignment.model.js';
import ClientApprovalModel from './jobFmsModels/ClientApproval.model.js';
import ProductionRecordModel from './jobFmsModels/ProductionRecord.model.js';
import FileAttachmentModel from './jobFmsModels/FileAttachment.model.js';
import NotificationModel from './jobFmsModels/Notification.model.js';
import StageTrackingModel from './jobFmsModels/StageTracking.model.js';
import ActivityLogModel from './jobFmsModels/ActivityLog.model.js';
import associateJobFmsModels from './jobFmsModels/associations.js';




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

const Disc = DiscResult(sequelize); 





// Job FMS Models
const JobCard = JobCardModel(sequelize);
const JobItem = JobItemModel(sequelize);
const JobAssignment = JobAssignmentModel(sequelize);
const ClientApproval = ClientApprovalModel(sequelize);
const ProductionRecord = ProductionRecordModel(sequelize);
const FileAttachment = FileAttachmentModel(sequelize);
const Notification = NotificationModel(sequelize);
const StageTracking = StageTrackingModel(sequelize);
const ActivityLog = ActivityLogModel(sequelize);

associateJobFmsModels({
  User,
  JobCard,
  JobItem,
  JobAssignment,
  ClientApproval,
  ProductionRecord,
  FileAttachment,
  Notification,
  StageTracking,
  ActivityLog,
});




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
    Task,
    Disc,

    // Job FMS Models
    JobCard,
    JobItem,
    JobAssignment,
    ClientApproval,
    ProductionRecord,
    FileAttachment,
    Notification,
    StageTracking,
    ActivityLog,
};
