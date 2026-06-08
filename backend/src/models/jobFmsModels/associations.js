// associations/jobFmsAssociations.js
export default function associateJobFmsModels(models) {
  const {
    User,
    JobCard,
    JobItem,
    JobAssignment,
    ClientApproval,
    ProductionRecord,
    Notification,
    StageTracking,
    ActivityLog,
    ClientDetails,
    ItemMaster,
    Quotation,
    JobCosting,
    BindingMaster,
    PaperMaster,
    SizeMaster,
    WideFormatMaterial,
    JobItemCosting,
    JobProductionStageWorker,
    DeliveryAssignment,
    // ProductionWorkerMaster removed — table dropped, workers are now Users
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
  JobItem.belongsTo(ItemMaster, {
    as: "itemMaster",
    foreignKey: "item_master_id",
  });

  // 🔗 JobItem ↔ PaperMaster (selected paper)
  JobItem.belongsTo(PaperMaster, {
    as: "selectedPaper",
    foreignKey: "selected_paper_id",
  });

  // 🔗 JobItem ↔ WideFormatMaterial
  JobItem.belongsTo(WideFormatMaterial, {
    as: "selectedWideMaterial",
    foreignKey: "selected_wide_material_id",
  });
  WideFormatMaterial.hasMany(JobItem, {
    as: "jobItems",
    foreignKey: "selected_wide_material_id",
  });

  // 🔗 JobItem ↔ PaperMaster (selected cover paper)
  JobItem.belongsTo(PaperMaster, {
    as: "selectedCoverPaper",
    foreignKey: "selected_cover_paper_id",
  });

  // 🔗 JobCard ↔ JobAssignment
  JobCard.hasMany(JobAssignment, {
    as: "assignments",
    foreignKey: "job_no",
    onDelete: "CASCADE",
  });
  JobAssignment.belongsTo(JobCard, { as: "jobCard", foreignKey: "job_no" });

  // 🔗 JobAssignment ↔ User
  JobAssignment.belongsTo(User, {
    as: "designer",
    foreignKey: "designer_id",
  });
  JobAssignment.belongsTo(User, {
    as: "assignedBy",
    foreignKey: "assigned_by_id",
  });

  // 🔗 ClientApproval
  if (ClientApproval) {
    JobCard.hasMany(ClientApproval, {
      as: "clientApprovals",
      foreignKey: "job_no",
      onDelete: "CASCADE",
    });
    ClientApproval.belongsTo(JobCard, {
      as: "jobCard",
      foreignKey: "job_no",
    });
    ClientApproval.belongsTo(User, {
      as: "handledBy",
      foreignKey: "handled_by_id",
    });
  }

  // 🔗 ProductionRecord
  if (ProductionRecord) {
    JobCard.hasOne(ProductionRecord, {
      as: "production",
      foreignKey: "job_no",
      onDelete: "CASCADE",
    });
    ProductionRecord.belongsTo(JobCard, {
      as: "jobCard",
      foreignKey: "job_no",
    });
    ProductionRecord.belongsTo(User, {
      as: "producedBy",
      foreignKey: "produced_by_id",
    });
  }


  // 🔗 StageTracking
  if (StageTracking) {
    JobCard.hasMany(StageTracking, {
      as: "stages",
      foreignKey: "job_no",
      onDelete: "CASCADE",
    });
    StageTracking.belongsTo(JobCard, {
      as: "jobCard",
      foreignKey: "job_no",
    });
    StageTracking.belongsTo(User, {
      as: "performedBy",
      foreignKey: "performed_by_id",
    });
  }

  // 🔗 ActivityLog
  if (ActivityLog) {
    JobCard.hasMany(ActivityLog, {
      as: "activities",
      foreignKey: "job_no",
      onDelete: "CASCADE",
    });
    ActivityLog.belongsTo(JobCard, {
      as: "jobCard",
      foreignKey: "job_no",
    });
    ActivityLog.belongsTo(User, {
      as: "performedBy",
      foreignKey: "performed_by_id",
    });
  }

  // 🔗 Notification
  if (Notification) {
    Notification.belongsTo(User, { as: "user", foreignKey: "user_id" });
  }

  // 🔗 JobItem ↔ JobItemCosting
  JobItem.hasOne(models.JobItemCosting, {
    as: "costing",
    foreignKey: "job_item_id",
    onDelete: "CASCADE",
  });

  // 🔗 JobProductionStageWorker
  if (JobProductionStageWorker) {
    JobCard.hasMany(JobProductionStageWorker, {
      as: "stageWorkers",
      foreignKey: "job_no",
      onDelete: "CASCADE",
    });
    JobProductionStageWorker.belongsTo(JobCard, {
      as: "jobCard",
      foreignKey: "job_no",
    });
    // Coordinator who recorded/created the assignment
    JobProductionStageWorker.belongsTo(User, {
      as: "recorder",
      foreignKey: "recorded_by_id",
    });
    // The floor worker assigned to this stage (was ProductionWorkerMaster, now User)
    JobProductionStageWorker.belongsTo(User, {
      as: "worker",
      foreignKey: "worker_id",
    });
    // Coordinator who force-completed a stuck assignment
    JobProductionStageWorker.belongsTo(User, {
      as: "forceCompletedBy",
      foreignKey: "force_completed_by_id",
    });
  }

  // 🔗 DeliveryAssignment
  if (DeliveryAssignment) {
    JobCard.hasMany(DeliveryAssignment, {
      as: "deliveryAssignments",
      foreignKey: "job_no",
      onDelete: "CASCADE",
    });
    DeliveryAssignment.belongsTo(JobCard, {
      foreignKey: "job_no",
      as: "jobCard",
    });
    // Delivery worker (was ProductionWorkerMaster, now User)
    DeliveryAssignment.belongsTo(User, {
      foreignKey: "worker_id",
      as: "worker",
    });
    DeliveryAssignment.belongsTo(User, {
      foreignKey: "assigned_by_id",
      as: "assignedBy",
    });
    DeliveryAssignment.belongsTo(User, {
      foreignKey: "overridden_by_id",
      as: "overriddenBy",
    });
  }
}










