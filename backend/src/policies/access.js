const SUPER = new Set(['BOSS','ADMIN']);
const SALES_ROLES = new Set(['RESEARCHER','COORDINATOR','TELECALLER','EXECUTIVE','CRM']);

// Treat anything starting with “sales” (any case) as a sales department
const isSalesDept = (dept) => typeof dept === 'string' && dept.trim().toLowerCase().startsWith('sales');

export function can(user, perm) {
  if (!user?.isActive) return false;
  if (SUPER.has(user.role)) return true;

  const role = user.role;
  const dept = user.department;

  switch (perm) {
    case 'attendance.view':
      return true;

    case 'ea.dashboard.view':
      return (dept === 'EA');

    case 'sales.dashboard.view':
      return isSalesDept(dept);

    case 'sales.research.view':
      return (isSalesDept(dept) && SALES_ROLES.has(role));
    case 'sales.research.mutate':
      return (isSalesDept(dept) && role === 'RESEARCHER');

    case 'sales.approval.view':
      return (isSalesDept(dept) && SALES_ROLES.has(role));
    case 'sales.approval.mutate':
      return (isSalesDept(dept) && role === 'COORDINATOR');

    case 'sales.telecall.view':
      return (isSalesDept(dept) && (role === 'TELECALLER' || role === 'COORDINATOR'));
    case 'sales.telecall.mutate':
      return (isSalesDept(dept) && role === 'TELECALLER');

    case 'sales.meeting.view':
      return (isSalesDept(dept) && (role === 'EXECUTIVE' || role === 'COORDINATOR'));
    case 'sales.meeting.mutate':
      return (isSalesDept(dept) && role === 'EXECUTIVE');

    case 'sales.crm.view':
      return (isSalesDept(dept) && (role === 'CRM' || role === 'COORDINATOR'));
    case 'sales.crm.mutate':
      return (isSalesDept(dept) && role === 'CRM');

    default:
      return false;
  }
}

