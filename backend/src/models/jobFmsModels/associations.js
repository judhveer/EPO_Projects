// associations/jobFmsAssociations.js
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
    ClientDetails,
    ItemMaster,
    Quotation,
    JobCosting,
    BindingMaster,
    RateMaster,
    PaperMaster,
    UPSMaster,
    PaperCalculationMaster,
  } = models;

  // 🔗 JobCard ↔ JobItem
  JobCard.hasMany(JobItem, {
    as: "items",
    foreignKey: "job_no",
    onDelete: "CASCADE",
  });
  JobItem.belongsTo(JobCard, { as: "jobCard", foreignKey: "job_no" });

  // 🔗 JobItem ↔ ItemMaster
  ItemMaster.hasMany(JobItem, {
    as: "jobItems",
    foreignKey: "item_master_id",
  });
  JobItem.belongsTo(ItemMaster, { as: "itemMaster", foreignKey: "item_master_id" });


// 🔗 JobItem ↔ PaperMaster  (selected paper)
  JobItem.belongsTo(PaperMaster, {
    as: "selectedPaper",
    foreignKey: "selected_paper_id",
  });

// 🔗 JobCard ↔ JobAssignment
  JobCard.hasMany(JobAssignment, { as: "assignments", foreignKey: "job_no", onDelete: "CASCADE"});
  JobAssignment.belongsTo(JobCard, { as: "jobCard", foreignKey: "job_no" });




  // 🔗 JobAssignment ↔ User
  JobAssignment.belongsTo(User, { as: "designer", foreignKey: "designer_id" });
  JobAssignment.belongsTo(User, { as: "assignedBy", foreignKey: "assigned_by_id" });


  // 🔗 JobCard ↔ Quotation
  JobCard.hasOne(Quotation, { as: "quotation", foreignKey: "job_no" });
  Quotation.belongsTo(JobCard, { as: "jobCard", foreignKey: "job_no" });



  // 🔗 JobCard ↔ JobCosting
  JobCard.hasOne(JobCosting, { as: "costing", foreignKey: "job_card_id" });
  JobCosting.belongsTo(JobCard, {
    as: "jobCard",
    foreignKey: "job_card_id",
    targetKey: "job_no",
  });


  // 🔗 ClientApproval
  if (ClientApproval) {
    JobCard.hasOne(ClientApproval, { as: "approval", foreignKey: "job_no", onDelete: "CASCADE", });
    ClientApproval.belongsTo(JobCard, { as: "jobCard", foreignKey: "job_no" });
    ClientApproval.belongsTo(User, { as: "handledBy", foreignKey: "handled_by_id" });
  }


  // 🔗 ProductionRecord
  if (ProductionRecord) {
    JobCard.hasOne(ProductionRecord, { as: "production", foreignKey: "job_no", onDelete: "CASCADE", });
    ProductionRecord.belongsTo(JobCard, { as: "jobCard", foreignKey: "job_no" });
    ProductionRecord.belongsTo(User, { as: "producedBy", foreignKey: "produced_by_id" });
  }


   // 🔗 FileAttachment
  if (FileAttachment) {
    JobCard.hasMany(FileAttachment, { as: "attachments", foreignKey: "job_no", onDelete: "CASCADE", });
    FileAttachment.belongsTo(JobCard, { as: "jobCard", foreignKey: "job_no" });
    FileAttachment.belongsTo(User, { as: "uploadedBy", foreignKey: "uploaded_by_id" });
  }



  // 🔗 StageTracking
  if (StageTracking) {
    JobCard.hasMany(StageTracking, { as: "stages", foreignKey: "job_no", onDelete: "CASCADE", });
    StageTracking.belongsTo(JobCard, { as: "jobCard", foreignKey: "job_no" });
    StageTracking.belongsTo(User, { as: "performedBy", foreignKey: "performed_by_id" });
  }


  // 🔗 ActivityLog
  if (ActivityLog) {
    JobCard.hasMany(ActivityLog, { as: "activities", foreignKey: "job_no",  onDelete: "CASCADE", });
    ActivityLog.belongsTo(JobCard, { as: "jobCard", foreignKey: "job_no" });
    ActivityLog.belongsTo(User, { as: "performedBy", foreignKey: "performed_by_id" });
  }

  // 🔗 Notification belongs to user
  if (Notification) {
    Notification.belongsTo(User, { as: "user", foreignKey: "user_id" });
  }


  // 🔗 RateMaster ↔ ItemMaster & PaperMaster
  if (RateMaster) {
    RateMaster.belongsTo(ItemMaster, { as: "item", foreignKey: "item_id" });
    RateMaster.belongsTo(PaperMaster, { as: "paper", foreignKey: "paper_id" });
  }

  // 🔗 BindingMaster ↔ ItemMaster
  if (BindingMaster) {
    BindingMaster.belongsTo(ItemMaster, { as: "itemMaster", foreignKey: "item_master_id" });
  }


  // 🔗 PaperMaster ↔ PaperCalculationMaster
  if (PaperMaster && PaperCalculationMaster) {
    PaperMaster.hasMany(PaperCalculationMaster, { as: "calculations", foreignKey: "paper_id" });
    PaperCalculationMaster.belongsTo(PaperMaster, { as: "paper", foreignKey: "paper_id" });
  }


 // 🔗 UPSMaster ↔ PaperMaster
  if (UPSMaster) {
    UPSMaster.belongsTo(PaperMaster, { as: "paper", foreignKey: "paper_id" });
  }
}
