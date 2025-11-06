import { DataTypes } from "sequelize";

export default (sequelize) => {
  const JobCard = sequelize.define(
    "JobCard",
    {
      job_no: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true, 
        allowNull: true,
        autoIncrement: false,
      },
      creation_date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      client_type: {
        type: DataTypes.ENUM("Govt", "Pvt", "Institution", "Other"),
        allowNull: false,
      },
      order_source: {
        type: DataTypes.ENUM(
          "Email",
          "WhatsApp",
          "ClientReference",
          "WalkIn",
          "Call"
        ),
        allowNull: false,
      },
      party_name: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      order_type: {
        type: DataTypes.ENUM(
          "Work Order",
          "Bulk Order",
          "Project Based Order",
          "Job Order"
        ),
        allowNull: false,
      },
      address: {
        type: DataTypes.TEXT,
      },
      contact_number: {
        type: DataTypes.BIGINT,
      },
      email_id: {
        type: DataTypes.STRING,
      },
      order_received_by: {
          type: DataTypes.ENUM('Anisha', 'Alvin', 'Kiran', 'Boss', 'Titu', 'Saphiiaibet', 'Fanny', 'Other'),
          allowNull: false,
      },
      order_handled_by: {
        type: DataTypes.ENUM("Fanny", "Saphiiaibet"),
        allowNull: false,
      },
      execution_location: {
        type: DataTypes.ENUM("In-Bound", "Out-Bound"),
        allowNull: false,
      },
      delivery_location: {
        type: DataTypes.ENUM(
          "EPO to Customer",
          "MM to Customer",
          "Delivery Address"
        ),
        allowNull: false,
      },
      delivery_address: {
        type: DataTypes.TEXT,
      },
      delivery_date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      proof_date: {
        type: DataTypes.DATE,
      },
      task_priority: {
        type: DataTypes.ENUM("Urgent", "Complete By Date"),
        allowNull: false,
      },
      instructions: {
        type: DataTypes.TEXT,
      },
      unit_rate: {
        type: DataTypes.DECIMAL(10, 2),
      },
      total_amount: {
        type: DataTypes.DECIMAL(12, 2),
      },
      advance_payment: {
        type: DataTypes.DECIMAL(10, 2),
      },
      mode_of_payment: {
        type: DataTypes.ENUM("Cashmemo", "Bill", "Other"),
      },
      status: {
        type: DataTypes.ENUM(
          "created",
          "coordinator_review",
          "assigned_to_designer",
          "design_in_progress",
          "sent_for_approval",
          "awaiting_client_response",
          "client_changes",
          "approved",
          "production",
          "completed",
          "cancelled"
        ),
        default: "created",
      },
      current_stage: {
        type: DataTypes.STRING,
      },
      job_completion_deadline: {
        type: DataTypes.DATE,
      },
      no_of_files: {
        type: DataTypes.INTEGER,
      }
    },
    {
      tableName: "jobfms_job_cards",
      underscored: true,
    }
  );


  // Auto-generation
JobCard.addHook('beforeCreate', async (job) => {
  if (!job.job_no) {
    const latest = await JobCard.findOne({
      order: [['job_no', 'DESC']],
    });
    const nextNo = latest ? Number(latest.job_no) + 1 : 1;
    job.job_no = nextNo;
  }
});


  return JobCard;
};




