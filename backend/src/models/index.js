import { sequelize } from "../config/db.js";

// SalesPipeline
import LeadModel from "./salesPipelineModels/Lead.model.js";
import ResearchEntryModel from "./salesPipelineModels/ResearchEntry.model.js";
import ApprovalEntryModel from "./salesPipelineModels/ApprovalEntry.model.js";
import TelecallEntryModel from "./salesPipelineModels/TelecallEntry.model.js";
import MeetingEntryModel from "./salesPipelineModels/MeetingEntry.model.js";
import CrmEntryModel from "./salesPipelineModels/CrmEntry.model.js";
import StageHistoryModel from "./salesPipelineModels/StageHistory.model.js";
import UserModel from "./salesPipelineModels/User.model.js";

// Attendance
import AttendanceModel from "./attendanceModels/attendance.model.js";
import AttendanceSettingsModel from "./attendanceModels/attendanceSettings.model.js";
import TelegramUserModel from "./attendanceModels/telegramuser.model.js";
import LeaveTypeModel from "./attendanceModels/leaveType.model.js";
import LeavePolicyModel from "./attendanceModels/leavePolicy.model.js";
import LeaveAllocationModel from "./attendanceModels/leaveAllocation.model.js";
import LeaveRequestModel from "./attendanceModels/leaveRequest.model.js";
import LeaveLedgerModel from "./attendanceModels/leaveLedger.model.js";
import HolidayModel from "./attendanceModels/holiday.model.js";
import HolidayApplicabilityModel from "./attendanceModels/holidayApplicability.model.js";
import AuditLogModel from "./attendanceModels/auditLog.model.js";
import AttendanceReminderLogModel from "./attendanceModels/attendanceReminderLog.model.js";

// TaskBot
import DoerModel from "./telegramTaskbotModels/Doer.model.js";
import TaskModel from "./telegramTaskbotModels/Task.model.js";

import DiscResult from "./discReport/DiscResult.model.js";

// jobFMS Models
import JobCardModel from "./jobFmsModels/JobCard.model.js";
import JobItemModel from "./jobFmsModels/JobItem.model.js";
import JobAssignmentModel from "./jobFmsModels/JobAssignment.model.js";
import ClientApprovalModel from "./jobFmsModels/ClientApproval.model.js";
import StageTrackingModel from "./jobFmsModels/StageTracking.model.js";
import ActivityLogModel from "./jobFmsModels/ActivityLog.model.js";
import associateJobFmsModels from "./jobFmsModels/associations.js";
import ClientDetailsModel from "./jobFmsModels/ClientDetails.model.js";
import JobProductionStageWorkerModel from "./jobFmsModels/JobProductionStageWorker.model.js";
import DeliveryAssignmentModel from "./jobFmsModels/DeliveryAssignment.model.js";
import PushSubscriptionModel from "./jobFmsModels/PushSubscription.model.js";
import DesignerTransferRequestModel from "./jobFmsModels/DesignerTransferRequest.model.js";

// jobFMS job card accounts models:
import ItemMasterModel from "./jobFmsModels/AccountsJobItems/ItemMaster.model.js";
import PaperMasterModel from "./jobFmsModels/AccountsJobItems/PaperMaster.model.js";
import BindingMasterModel from "./jobFmsModels/AccountsJobItems/BindingMaster.model.js";
import SizeMasterModel from "./jobFmsModels/AccountsJobItems/SizeMaster.model.js";
import JobDesignTimeModel from "./jobFmsModels/JobDesignTimeLog.js";
import WideFormatMaterialModel from "./jobFmsModels/AccountsJobItems/WideFormatMaterial.model.js";
import PrintingRateMasterModel from "./jobFmsModels/AccountsJobItems/PrintingRateMaster.model.js";
import JobItemCostingModel from "./jobFmsModels/AccountsJobItems/JobItemCosting.model.js";
import QuotationModel from "./jobFmsModels/AccountsJobItems/Quotation.model.js";

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
const AttendanceSettings = AttendanceSettingsModel(sequelize);
const TelegramUser = TelegramUserModel(sequelize);
const LeaveType = LeaveTypeModel(sequelize);
const LeavePolicy = LeavePolicyModel(sequelize);
const LeaveAllocation = LeaveAllocationModel(sequelize);
const LeaveRequest = LeaveRequestModel(sequelize);
const LeaveLedger = LeaveLedgerModel(sequelize);
const Holiday = HolidayModel(sequelize);
const HolidayApplicability = HolidayApplicabilityModel(sequelize);
const AuditLog = AuditLogModel(sequelize);
const AttendanceReminderLog = AttendanceReminderLogModel(sequelize);

// TaskBot Models
const Doer = DoerModel(sequelize);
const Task = TaskModel(sequelize);

const Disc = DiscResult(sequelize);

// Job FMS Models
const JobCard = JobCardModel(sequelize);
const JobItem = JobItemModel(sequelize);
const JobAssignment = JobAssignmentModel(sequelize);
const ClientApproval = ClientApprovalModel(sequelize);
const StageTracking = StageTrackingModel(sequelize);
const ActivityLog = ActivityLogModel(sequelize);
const ClientDetails = ClientDetailsModel(sequelize);
const JobProductionStageWorker = JobProductionStageWorkerModel(sequelize);
const DeliveryAssignment = DeliveryAssignmentModel(sequelize);
const PushSubscription = PushSubscriptionModel(sequelize);
const DesignerTransferRequest = DesignerTransferRequestModel(sequelize);

// Job FMS job card accounts Models:
const ItemMaster = ItemMasterModel(sequelize);
const PaperMaster = PaperMasterModel(sequelize);
const BindingMaster = BindingMasterModel(sequelize);
const SizeMaster = SizeMasterModel(sequelize);
const JobDesignTime = JobDesignTimeModel(sequelize);
const WideFormatMaterial = WideFormatMaterialModel(sequelize);
const PrintingRateMaster = PrintingRateMasterModel(sequelize);
const JobItemCosting = JobItemCostingModel(sequelize);
const Quotation = QuotationModel(sequelize);

associateJobFmsModels({
  User,
  JobCard,
  JobItem,
  JobAssignment,
  ClientApproval,
  StageTracking,
  ActivityLog,
  ClientDetails,
  // NEW MODELS
  ItemMaster,
  PaperMaster,

  BindingMaster,
  SizeMaster,
  JobDesignTime,
  WideFormatMaterial,
  PrintingRateMaster,
  JobItemCosting,
  Quotation,
  JobProductionStageWorker,
  DeliveryAssignment,
  DesignerTransferRequest,
});

// Associations (ticketId attribute)
Lead.hasMany(ResearchEntry, {
  foreignKey: "ticketId",
  sourceKey: "ticketId",
  as: "researchEntries",
});
Lead.hasMany(ApprovalEntry, {
  foreignKey: "ticketId",
  sourceKey: "ticketId",
  as: "approvalEntries",
});
Lead.hasMany(TelecallEntry, {
  foreignKey: "ticketId",
  sourceKey: "ticketId",
  as: "telecallEntries",
});
Lead.hasMany(MeetingEntry, {
  foreignKey: "ticketId",
  sourceKey: "ticketId",
  as: "meetingEntries",
});
Lead.hasMany(CrmEntry, {
  foreignKey: "ticketId",
  sourceKey: "ticketId",
  as: "crmEntries",
});

Lead.hasMany(StageHistory, {
  foreignKey: "ticketId",
  sourceKey: "ticketId",
  as: "history",
});
StageHistory.belongsTo(Lead, {
  foreignKey: "ticketId",
  targetKey: "ticketId",
  as: "lead",
});


// Push subscriptions — cross-concern, not jobFms specific
User.hasMany(PushSubscription, {
  foreignKey: { name: "user_id", field: "user_id" },
  as: "pushSubscriptions", 
  onDelete: "CASCADE" 
});
PushSubscription.belongsTo(User, {
  foreignKey: { name: "user_id", field: "user_id" },
  as: "user" 
});


// Attendance — cross-concern, not jobFms specific (matches PushSubscription pattern above)
User.hasMany(Attendance, {
  foreignKey: { name: "employee_id", field: "employee_id" },
  as: "attendanceRecords",
  onDelete: "RESTRICT", // never cascade-delete attendance history if a user row is removed
});
Attendance.belongsTo(User, {
  foreignKey: { name: "employee_id", field: "employee_id" },
  as: "employee",
});
Attendance.belongsTo(User, {
  foreignKey: { name: "finalized_by", field: "finalized_by" },
  as: "finalizedBy",
});

// ── Leave module associations — cross-concern, same pattern as Attendance ──
Attendance.belongsTo(LeaveRequest, { foreignKey: 'leave_request_id', as: 'leaveRequest' });

LeaveType.hasMany(LeavePolicy,     { foreignKey: 'leave_type_id', as: 'policies' });
LeaveType.hasMany(LeaveAllocation, { foreignKey: 'leave_type_id', as: 'allocations' });
LeaveType.hasMany(LeaveRequest,    { foreignKey: 'leave_type_id', as: 'requests' });
LeaveType.hasMany(LeaveLedger,     { foreignKey: 'leave_type_id', as: 'ledgerEntries' });

LeavePolicy.belongsTo(LeaveType, { foreignKey: 'leave_type_id', as: 'leaveType' });
LeaveAllocation.belongsTo(LeaveType, { foreignKey: 'leave_type_id', as: 'leaveType' });
LeaveRequest.belongsTo(LeaveType,    { foreignKey: 'leave_type_id', as: 'leaveType' });
LeaveLedger.belongsTo(LeaveType,     { foreignKey: 'leave_type_id', as: 'leaveType' });

User.hasMany(LeaveAllocation, { foreignKey: 'employee_id', as: 'leaveAllocations', onDelete: 'RESTRICT' });
User.hasMany(LeaveRequest,    { foreignKey: 'employee_id', as: 'leaveRequests',    onDelete: 'RESTRICT' });
User.hasMany(LeaveLedger,     { foreignKey: 'employee_id', as: 'leaveLedgerEntries', onDelete: 'RESTRICT' });

LeaveAllocation.belongsTo(User, { foreignKey: 'employee_id', as: 'employee' });
LeaveRequest.belongsTo(User,    { foreignKey: 'employee_id', as: 'employee' });
LeaveRequest.belongsTo(User,    { foreignKey: 'decided_by',  as: 'decidedBy' });
LeaveLedger.belongsTo(User,     { foreignKey: 'employee_id', as: 'employee' });
LeaveLedger.belongsTo(User,     { foreignKey: 'created_by',  as: 'createdBy' });

// ── Holiday module associations ─────────────────────────────────────
// onDelete: 'CASCADE' here — deliberately different from RESTRICT used
// elsewhere. Applicability rows have no independent meaning without
// their parent Holiday; they're configuration metadata about it, not
// a standalone historical transaction record the way Attendance/
// LeaveLedger rows are. If a Holiday is ever hard-deleted (rare —
// deactivation is the normal path), its scope rows should go with it.
Holiday.hasMany(HolidayApplicability, { foreignKey: 'holiday_id', as: 'applicability', onDelete: 'CASCADE' });
HolidayApplicability.belongsTo(Holiday, { foreignKey: 'holiday_id', as: 'holiday' });
AuditLog.belongsTo(User, { foreignKey: 'performed_by', as: 'performedByUser' });

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
  // For Attendance
  Attendance,
  AttendanceSettings,
  LeaveAllocation,
  LeaveLedger,
  LeavePolicy,
  LeaveRequest,
  LeaveType,
  Holiday,
  HolidayApplicability,
  AuditLog,
  AttendanceReminderLog,

  TelegramUser,
  Doer,
  Task,
  Disc,

  // Job FMS Models
  JobCard,
  JobItem,
  JobAssignment,
  ClientApproval,
  StageTracking,
  ActivityLog,
  ClientDetails,
  JobProductionStageWorker,
  DeliveryAssignment,
  PushSubscription,
  DesignerTransferRequest,

  // Job FMS job card accounts Models:
  ItemMaster,
  PaperMaster,
  BindingMaster,
  SizeMaster,
  JobDesignTime,
  WideFormatMaterial,
  PrintingRateMaster,
  JobItemCosting,
  Quotation
};
