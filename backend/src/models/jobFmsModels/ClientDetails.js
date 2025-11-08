import { DataTypes } from "sequelize";

export default (sequelize) => {
    const ClientDetails = sequelize.define("ClientDetails", {
        id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        client_name: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            set(value) {
                this.setDataValue("client_name", value ? value.toUpperCase() : null);
            },
        },
        client_type: {
            type: DataTypes.ENUM("Govt", "Pvt", "Institution", "Other"),
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
            allowNull: false,
        },
        contact_number: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        email_id: {
            type: DataTypes.STRING,
            validate: {
                isEmail: true,
            },
        },
        total_jobs: {
            type: DataTypes.INTEGER,
        },
        client_relation: {
            type: DataTypes.ENUM("NBD", "CRR"),
            allowNull: false,
            defaultValue: "NBD",
        },
        
    },
    {
        tableName: 'jobfms_client_details',
        underscored: true,
    }, 
);

    /**
   * Hook to automatically update client_relation
   * whenever total_jobs changes.
   */
  ClientDetails.addHook('beforeSave', (client) => {
        client.client_relation = client.total_jobs > 3 ? "CRR" : "NBD";
  });

  /**
   * Associations:
   * A Client can have many JobCards
   */
  ClientDetails.associate = (models) => {
    ClientDetails.hasMany(models.JobCard, {
        sourceKey: "client_name",
        foreignKey: "client_name",
        as: "jobs",
        onDelete: "CASCADE",
    });
  };

  return ClientDetails;

}