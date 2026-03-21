const SALES_ROLES = new Set(['RESEARCHER', 'COORDINATOR', 'TELECALLER', 'EXECUTIVE', 'CRM']);
const SUPER = new Set(['BOSS', 'ADMIN']);
const isSalesDept = (dept) => typeof dept === 'string' && dept.trim().toLowerCase().startsWith('sales');

export function can(user, perm) {
    if (!user) {
        return false;
    }

    const { role, department: dept } = user;

    // 🔹 Boss/Admin can do everything
    if (SUPER.has(role)) {
        return true;
    }
    // Attendance – everyone logged in
    if (perm === 'attendance.view') {
        return true;
    }
    // EA Dashboard
    if (perm === 'ea.dashboard.view') {
        return (dept === 'EA') || SUPER.has(role);
    }
    // Sales dashboard
    if (perm === 'sales.dashboard.view') {
        return isSalesDept(dept) || dept === "CRM" || SUPER.has(role);
    }

    const SALES_VIEW = [
        'sales.research.view', 'sales.approval.view', 'sales.telecall.view', 'sales.meeting.view', 'sales.crm.view'
    ];

    if (SALES_VIEW.includes(perm)) {
        if(dept === 'CRM') {
            return true;
        }
        if (!isSalesDept(dept)) {
            return false;
        }
        return SALES_ROLES.has(role) || role === 'COORDINATOR'
    }

    // Mutations - Admin / Boss: view-only in UI
    switch (perm) {
        case 'sales.research.mutate': 
            return isSalesDept(dept) && role === 'RESEARCH';

        case 'sales.approval.mutate': 
            return isSalesDept(dept) && role === 'COORDINATOR';

        case 'sales.telecall.mutate': 
            return isSalesDept(dept) && role === 'TELECALLER';

        case 'sales.meeting.mutate': 
            return isSalesDept(dept) && role === 'EXECUTIVE';

        case 'sales.crm.mutate': 
            return ( isSalesDept(dept) && role === 'CRM' ) || dept === 'CRM';
    }         

    // 🔵 JOB FMS VIEW PERMISSIONS
     switch (perm) {
        case 'jobfms.common.view':
            return true; // everyone

        case 'jobfms.writer.view':
            return dept === 'Job Writer' || dept === 'Admin';

        case 'jobfms.coordinator.view':
            return dept === 'Process Coordinator';

        case 'jobfms.designer.view':
            return dept === 'Designer';

        case 'jobfms.crm.view':
            return (isSalesDept(dept) && role === "CRM") || dept === 'CRM';

        case 'jobfms.bills.view':
            return (isSalesDept(dept) && role === "CRM") || dept === 'CRM' || SUPER.has(role);

        default:
            return false;

     }


}