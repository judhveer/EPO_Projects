export default function associateJobFmsModels(models) {
  const {
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
    ClientDetails
  } = models;

  // 🔗 JobCard ↔ JobItem
  JobCard.hasMany(JobItem, {
    as: "items",
    foreignKey: "job_no",
    onDelete: "CASCADE", // ✅ remove all job items if job deleted
  });
  JobItem.belongsTo(JobCard, {
    as: "jobCard",
    foreignKey: "job_no",
  });

  // 🔗 JobCard ↔ JobAssignment
  JobCard.hasMany(JobAssignment, {
    as: "assignments",
    foreignKey: "job_no",
    onDelete: "CASCADE",
  });
  JobAssignment.belongsTo(JobCard, { as: "jobCard", foreignKey: "job_no" });

  // 🔗 JobCard ↔ ClientApproval
  JobCard.hasOne(ClientApproval, {
    as: "approval",
    foreignKey: "job_no",
    onDelete: "CASCADE",
  });
  ClientApproval.belongsTo(JobCard, { as: "jobCard", foreignKey: "job_no" });

  // 🔗 JobCard ↔ ProductionRecord
  JobCard.hasOne(ProductionRecord, {
    as: "production",
    foreignKey: "job_no",
    onDelete: "CASCADE",
  });
  ProductionRecord.belongsTo(JobCard, {
    as: "jobCard",
    foreignKey: "job_no",
  });

  // 🔗 JobCard ↔ FileAttachment
  JobCard.hasMany(FileAttachment, {
    as: "attachments",
    foreignKey: "job_no",
    onDelete: "CASCADE",
  });
  FileAttachment.belongsTo(JobCard, {
    as: "jobCard",
    foreignKey: "job_no",
  });

  // 🔗 JobCard ↔ StageTracking
  JobCard.hasMany(StageTracking, {
    as: "stages",
    foreignKey: "job_no",
    onDelete: "CASCADE",
  });
  StageTracking.belongsTo(JobCard, {
    as: "jobCard",
    foreignKey: "job_no",
  });

  // 🔗 JobCard ↔ ActivityLog
  JobCard.hasMany(ActivityLog, {
    as: "activities",
    foreignKey: "job_no",
    onDelete: "CASCADE",
  });
  ActivityLog.belongsTo(JobCard, {
    as: "jobCard",
    foreignKey: "job_no",
  });

  // 🔗 JobAssignment ↔ User
  JobAssignment.belongsTo(User, {
    as: "designer",
    foreignKey: "designer_id",
  });
  JobAssignment.belongsTo(User, {
    as: "assignedBy",
    foreignKey: "assigned_by_id",
  });

  // 🔗 ClientApproval handled by CRM/User
  ClientApproval.belongsTo(User, {
    as: "handledBy",
    foreignKey: "handled_by_id",
  });

  // 🔗 ProductionRecord handled by production team member
  ProductionRecord.belongsTo(User, {
    as: "producedBy",
    foreignKey: "produced_by_id",
  });

  // 🔗 File uploaded by user
  FileAttachment.belongsTo(User, {
    as: "uploadedBy",
    foreignKey: "uploaded_by_id",
  });

  // 🔗 Stage performed by user
  StageTracking.belongsTo(User, {
    as: "performedBy",
    foreignKey: "performed_by_id",
  });

  // 🔗 Activity performed by user
  ActivityLog.belongsTo(User, {
    as: "performedBy",
    foreignKey: "performed_by_id",
  });

  // 🔗 Notification belongs to user
  Notification.belongsTo(User, { as: "user", foreignKey: "user_id" });
}
