import { DataTypes } from 'sequelize';
import bcrypt from 'bcryptjs';

export const DEPARTMENTS = ["Job Writer", "Accounts", "Admin", "CRM", "Designer", "EA", "Foundation", "HR", "MIS", "Office Assistant", "Process Coordinator", "Receptionist", "Sales dept", "Tender Executive", ["OWNER"]];

export const ROLES = [
  "BOSS", "ADMIN", "STAFF",
  'RESEARCHER', 'COORDINATOR', 'TELECALLER', 'EXECUTIVE', 'CRM',
  'EA'
];

function enforceRoleDeptConsistency(instance) {
  const salesRoles = new Set(['RESEARCHER', 'COORDINATOR', 'TELECALLER', 'EXECUTIVE', 'CRM']);
  const role = instance.role;
  const dept = instance.department;

  if (salesRoles.has(role) && dept !== "Sales dept") {
    // Don’t force a DB write; fail early
    throw new Error('Sales roles must have department="Sales dept"');
  }

  if (role === 'EA' && dept !== "EA") {
    throw new Error('EA role must have department="EA"');
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
      allowNull: false,
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
    ]
  });


  // Instance helpers
  User.prototype.checkPassword = async function (plain) {
    console.log("plain:", plain); 
    if (!this.passwordHash) return false;
    return bcrypt.compare(plain, this.passwordHash);
  };

  // Hash temp _password and enforce role/department consistency
  User.addHook('beforeCreate', async (user) => {
    if (user._password) {
      user.passwordHash = await bcrypt.hash(user._password, 10);
    }
    enforceRoleDeptConsistency(user);
  });

  User.addHook('beforeUpdate', async (user) => {
    if (user._password) {
      user.passwordHash = await bcrypt.hash(user._password, 10);
    }
    enforceRoleDeptConsistency(user);
  });

  return User;
};
