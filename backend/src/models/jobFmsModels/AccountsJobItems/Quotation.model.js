import { DataTypes } from "sequelize";

export default (sequelize) => {
    const Quotation = sequelize.define("Quotation", {
        // ── Primary Key ────────────────────────────────────────────────────────
        // MySQL AUTO_INCREMENT starts from 10001 (set in CREATE TABLE).
        // Sequelize autoIncrement:true tells it to let MySQL assign the value —
        // never pass this field in create(), MySQL fills it automatically.
        quotation_ref_no: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        // ── Firm + Year ───────────
        firm_key: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        year: {
            type: DataTypes.SMALLINT,
            allowNull: false,
        },
        // ── Client Details ────────
        client_name: {
            type: DataTypes.STRING,
            allowNull: false,
            set(v) {
                this.setDataValue("client_name", v ? v.toUpperCase() : null);
            },
        },
        department: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        client_address: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        // ── Items (full snapshot) ───────
        items: {
            type: DataTypes.JSON,
            allowNull: false,
            get() {
                const raw = this.getDataValue("items");
                if (!raw) return [];
                if (typeof raw === "string") {
                    try { return JSON.parse(raw); } catch { return []; }
                }
                return raw; // already parsed (MySQL 8 / local)
            },
        },
        // ── Billing ───────
        subtotal: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0,
        },
        discount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0,
        },
        gst_percentage: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: true,
            defaultValue: null,
            validate: {
                isIn: {
                    args: [[null, 5, 18]],
                    msg: "GST percentage must be 5, 18, or null",
                }
            }
        },
        gst_amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0,
        },
        final_amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0,
        },
        // ── Approval ─────
        is_approved: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        // ── Audit ───────
        created_by_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: "users",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        },
    },
    {
        tableName: "jobfms_quotations",
        underscored: true,          // created_at / updated_at auto-managed by Sequelize
        indexes: [
            {fields: ["firm_key"]},
            {fields: ["year"]},
            {fields: ["is_approved"]},
            {fields: ["created_at"]},
        ],
    },);

    Quotation.addHook("beforeCreate", async (quotation) => {
        if (!quotation.quotation_ref_no) {
            const latest = await Quotation.findOne({
                order: [["quotation_ref_no", "DESC"]],
            });
            const nextNo = latest ? Number(latest.quotation_ref_no) + 1 : 10001;
            quotation.quotation_ref_no = nextNo;
        }
    });

    Quotation.associate = (models) => {
        Quotation.belongsTo(models.User, {
            as: "createdBy",
            foreignKey: "created_by_id",
        });
        
        Quotation.hasMany(models.JobCard, {
            foreignKey: "quotation_ref_no",
            as: "jobCards",
        });
    };

    return Quotation;
}