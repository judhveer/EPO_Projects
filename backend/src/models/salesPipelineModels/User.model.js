import { DataTypes } from 'sequelize';
import bcrypt from 'bcryptjs';

export const DEPARTMENTS = ["Job Writer", "Accounts", "Admin", "CRM", "Designer", "EA", "Foundation", "HR", "MIS", "Office Assistant", "Process Coordinator", "Receptionist", "Sales dept", "Tender Executive", "OWNER", "Production Coordinator", "Production Worker", "Delivery"];

export const ROLES = [
  "BOSS", "ADMIN", "STAFF",
  'RESEARCHER', 'COORDINATOR', 'TELECALLER', 'EXECUTIVE', 'CRM',
  'EA'
];


// ── NEW: Attendance offices ─────────────────────────────────────────
// Every user except BOSS must be assigned to exactly one office.
// Kept as a plain validated STRING (same pattern as ROLES/DEPARTMENTS
// above) rather than a separate lookup table — both offices share
// identical shift timing today, so there's no relational data that
// would justify a foreign key. Extending this list later (e.g. if
// Dariln Tang or Hill Publication ever need attendance tracking) is
// a one-line change here, same as adding a new department already is.
export const OFFICES = ["EPO", "MM"];


// ── Admin Panel dropdown sources ──────────────────────────────────────
// "OWNER" and "BOSS" stay in the full lists above so the bootstrap BOSS
// account (created once by scripts/seedAdmin.mjs) keeps validating on
// every save — including the lastLoginAt update that runs on every
// login. These two filtered lists are what the Admin Panel actually
// offers and validates against, so neither value can ever be assigned
// through the dashboard, even via a direct API call.
export const ASSIGNABLE_DEPARTMENTS = DEPARTMENTS.filter((d) => d !== "OWNER");
export const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== "BOSS");

function enforceRoleDeptConsistency(instance) {
  const salesRoles = new Set(['RESEARCHER', 'COORDINATOR', 'TELECALLER', 'EXECUTIVE', 'CRM']);
  const role = instance.role;
  const dept = instance.department;

  if (salesRoles.has(role) && dept !== "Sales dept") {
    // Don’t force a DB write; fail early
    throw new Error('Sales roles must have department="Sales dept"');
  }

  if (role === 'EA' && dept !== "EA") {
    throw new Error('EA role must have department "EA"');
  }
}

// ── NEW: Attendance-eligibility fields must be present for everyone except BOSS. BOSS is the one role explicitly excluded from attendance tracking per business requirement — everyone else (Admin, HR, Sales, EA, Production, etc.) needs an office and a join date, since join_date drives the 6-month leave-eligibility gate and office drives which attendance/leave records a person shows up under.
function enforceAttendanceFieldsPresent(instance) {
  if (instance.role === 'BOSS') return; // BOSS is exempt — not tracked

  if (!instance.office) {
    throw new Error('office is required for all users except BOSS');
  }
  if (!OFFICES.includes(instance.office)) {
    throw new Error(`office must be one of: ${OFFICES.join(', ')}`);
  }
  if (!instance.join_date) {
    throw new Error('join_date is required for all users except BOSS');
  }
}


export default (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
      primaryKey: true
    },

    // NEW — unique username (used for login alongside email)
    username: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      validate: { len: [3, 64] }
    },
    role: {
      type: DataTypes.STRING(32),
      allowNull: false,
      validate: { isIn: [ROLES] },
      defaultValue: 'STAFF'
    }, // EXECUTIVE / COORDINATOR / CRM / TELECALLER / etc.

    email: {
      type: DataTypes.STRING(128),
      allowNull: true,
      unique: true,
      validate: { isEmail: true }
    },
    // NEW — department (validated against your list)
    department: {
      type: DataTypes.STRING(64),
      allowNull: false,
      validate: { isIn: [DEPARTMENTS] },
    },
    // NEW — password hash (kept out of default queries)
    passwordHash: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    // NEW — common account flags/metadata
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    createdBy: { 
      type: DataTypes.UUID, 
      allowNull: true 
    },

    // ── NEW: Attendance system fields ─────────────────────────────
    // Nullable at the DB level (so BOSS accounts, and any pre-existing
    // users during the transition window, don't break) but enforced
    // as required-unless-BOSS via the beforeCreate/beforeUpdate hooks
    // below — same pattern this file already uses for role/department
    // consistency, just extended to cover two more fields.
    office: {
      type: DataTypes.STRING(8),
      allowNull: true,
      validate: { isIn: [OFFICES] },
    },
    join_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    }

  }, {
    tableName: 'users',
    underscored: true,
    // Hide passwordHash unless you use the scope "withSecret"
    defaultScope: {
      attributes: {
        exclude: ['passwordHash']
      }
    },
    scopes: {
      withSecret: {} // includes everything
    },
    indexes: [
      { unique: true, fields: ['email'] },
      { unique: true, fields: ['username'] },
      { fields: ['role'] },
      { fields: ['department'] },
      { fields: ['office'] },
    ]
  });


  // Instance helpers
  User.prototype.checkPassword = async function (plain) {
    if (!this.passwordHash) return false;
    return bcrypt.compare(plain, this.passwordHash);
  };

  // Hash temp _password and enforce role/department consistency
  User.addHook('beforeCreate', async (user) => {
    if (user._password) {
      user.passwordHash = await bcrypt.hash(user._password, 10);
    }
    enforceRoleDeptConsistency(user);
    enforceAttendanceFieldsPresent(user);
  });

  User.addHook('beforeUpdate', async (user) => {
    if (user._password) {
      user.passwordHash = await bcrypt.hash(user._password, 10);
    }
    enforceRoleDeptConsistency(user);
    enforceAttendanceFieldsPresent(user);
  });

  return User;
};
