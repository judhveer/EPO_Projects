import { DataTypes } from "sequelize";

export default (sequelize) => {
  const FileAttachment = sequelize.define(
    "FileAttachment",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      job_no: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: {
          model: "jobfms_job_cards",
          key: "job_no",
        },
      },
      uploaded_by_id: {
        type: DataTypes.UUID,
      },
      file_name: {
        type: DataTypes.STRING,
      },
      file_path: {
        type: DataTypes.STRING,
      },
      mime_type: {
        type: DataTypes.STRING,
      },
      size: {
        type: DataTypes.INTEGER,
      },
      stage_tag: {
        type: DataTypes.ENUM("design_file", "approval_file", "production_file"),
      },
    },
    {
      tableName: "jobfms_file_attachments",
      underscored: true,
    }
  );

  return FileAttachment;
};
