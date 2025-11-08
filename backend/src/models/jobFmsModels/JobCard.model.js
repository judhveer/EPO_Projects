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
      client_name: {
        type: DataTypes.STRING,
        allowNull: false,
        set(value) {
          this.setDataValue("client_name", value ? value.toUpperCase() : null);
        },
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
        validate: {
          isEmail: true,
        },
      },
      order_received_by: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      order_handled_by: {
        type: DataTypes.STRING,
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
        type: DataTypes.ENUM("GST BILL", "PI", "UPI", "OTHER"),
      },
      payment_status: {
        type: DataTypes.ENUM("Paid", "Half Paid", "Un-paid"),
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
        defaultValue: "created",
      },
      current_stage: {
        type: DataTypes.STRING,
      },
      job_completion_deadline: {
        type: DataTypes.DATE,
      },
      no_of_files: {
        type: DataTypes.INTEGER,
      },
    },
    {
      tableName: "jobfms_job_cards",
      underscored: true,
    }
  );

  // Auto-generation
  JobCard.addHook("beforeCreate", async (job) => {
    if (!job.job_no) {
      const latest = await JobCard.findOne({
        order: [["job_no", "DESC"]],
      });
      const nextNo = latest ? Number(latest.job_no) + 1 : 1;
      job.job_no = nextNo;
    }
  });

  // Automatically create/update client record when a JobCard is created
  JobCard.addHook("afterCreate", async (job, options) => {
    const { ClientDetails } = sequelize.models;
    const transaction = options.transaction;

    let client = await ClientDetails.findOne({
      where: { client_name: job.client_name },
      transaction,
    });

    if (!client) {
      await ClientDetails.create(
        {
          client_name: job.client_name,
          client_type: job.client_type,
          address: job.address,
          contact_number: job.contact_number,
          email_id: job.email_id,
          total_jobs: 1,
        },
        { transaction }
      );
    } else {
      client.set({
        client_type: job.client_type,
        address: job.address,
        contact_number: job.contact_number,
        email_id: job.email_id,
        total_jobs: client.total_jobs + 1,
      });
      await client.save({ transaction });
    }
  });

  // Association via client_name
  JobCard.associate = (models) => {
    JobCard.belongsTo(models.ClientDetails, {
      foreignKey: "client_name",
      targetKey: "client_name",
      as: "client",
    });
  };

  return JobCard;
};
