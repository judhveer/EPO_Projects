import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navClass = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${isActive ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`;


// central tab definitions (key used for permission checks)
const ALL_TABS = [
  { key: 'dashboard', label: 'Dashboard', to: '/sales/dashboard' },
  { key: 'research', label: 'Research', to: '/sales/forms/research' },
  { key: 'approval', label: 'Research Approval', to: '/sales/forms/approval' },
  { key: 'telecall', label: 'Tele-call', to: '/sales/forms/telecall' },
  { key: 'meeting', label: 'Meeting', to: '/sales/forms/meeting' },
  { key: 'crm', label: 'CRM', to: '/sales/forms/crm' },
];

function normalize(str = '') {
  return String(str).trim().toUpperCase();
}

function hasAccessToTab(user, tabKey) {
  if (!user) {
    return false;
  }

  const role = normalize(user.role);
  const dept = normalize(user.department);

  // Boss & Admin see everything
  if (['BOSS', 'ADMIN'].includes(role)) {
    return true;
  }

  // Only users in Sales department get the Sales tabs
  if (!dept.includes('SALES')) {
    return false;
  }

  // Role-based access inside Sales dept
  switch (role) {
    case 'RESEARCHER':
      return ['dashboard', 'research'].includes(tabKey);
    case 'SALES COORDINATOR':
    case 'COORDINATOR':
    case 'RESEARCH COORDINATOR':
      return ['dashboard', 'approval'].includes(tabKey);
    case 'TELECALLER':
      return ['dashboard', 'telecall'].includes(tabKey);
    case 'EXECUTIVE':
    case 'SALES EXECUTIVE':
      return ['dashboard', 'meeting'].includes(tabKey);
    case 'CRM':
    case 'CRM EXECUTIVE':
      return ['dashboard', 'crm'].includes(tabKey);
    default:
      return false;
  }
}


export default function NavBar() {

  const { user } = useAuth(); // expects { user: role, department, ... } }

  // Filter visible tabs
  const visibleTabs = ALL_TABS.filter(t => hasAccessToTab(user, t.key));

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex gap-3 items-center">
        <div className="font-bold text-lg">Sales Pipeline</div>

        <nav className="flex gap-2">
          {visibleTabs.length === 0 ? (
            // fallback: show nothing or a minimal dashboard link for authenticated users
            user ? (
              <NavLink to="/sales/dashboard" className={navClass}>Dashboard</NavLink>
            ) : null
          ) : (
            visibleTabs.map(t => (
              <NavLink key={t.key} to={t.to} className={navClass}>{t.label}</NavLink>
            ))
          )}
        </nav>
      </div>
    </header>
  );
}