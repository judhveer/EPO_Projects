import { useState } from 'react';
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

  // NEW: Export Leads
  { key: 'export', label: 'Export Leads', to: '/sales/export-leads' },

  // Coordinator Dashboard (visible only to BOSS, ADMIN, SALES COORDINATOR)
  { key: 'coordinator', label: 'Coordinator Dashboard', to: '/sales/coordinator' },
];

function normalize(str = '') {
  return String(str).trim().toUpperCase();
}

function hasAccessToTab(user, tabKey) {
  if (!user) return false;

  const role = normalize(user.role);
  const dept = normalize(user.department);

  // Coordinator-specific tab
  if (tabKey === 'coordinator') {
    return ['BOSS', 'ADMIN', 'SALES COORDINATOR'].includes(role);
  }

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
  const { user } = useAuth(); // expects { role, department, ... }
  const [open, setOpen] = useState(false);

  // Filter visible tabs
  const visibleTabs = ALL_TABS.filter((t) => hasAccessToTab(user, t.key));

  // Close mobile menu on navigation
  const handleLinkClick = () => setOpen(false);

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between md:justify-around gap-3">
        <div className="flex items-center gap-4">
          <div className="font-bold text-lg">Sales Pipeline</div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-2 items-center">
          {visibleTabs.length === 0 ? (
            user ? (
              <NavLink to="/sales/dashboard" className={navClass}>
                Dashboard
              </NavLink>
            ) : null
          ) : (
            visibleTabs.map((t) => (
              <NavLink key={t.key} to={t.to} className={navClass}>
                {t.label}
              </NavLink>
            ))
          )}
        </nav>

        {/* Mobile actions: hamburger */}
        <div className="md:hidden flex items-center">
          {/* optionally show a small current-route label here */}
          <button
            onClick={() => setOpen((s) => !s)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex items-center justify-center p-2 rounded-md text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {/* hamburger / close icon */}
            {open ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      <div
        className={`md:hidden transition-max-h duration-200 ease-in-out overflow-hidden bg-white border-t border-slate-100 ${open ? 'max-h-screen' : 'max-h-0'
          }`}
      >
        <div className="px-4 py-3">
          <nav className="flex flex-col gap-1">
            {visibleTabs.length === 0 ? (
              user ? (
                <NavLink
                  to="/sales/dashboard"
                  className={({ isActive }) =>
                    `block px-3 py-2 rounded-md text-base font-medium ${isActive ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`
                  }
                  onClick={handleLinkClick}
                >
                  Dashboard
                </NavLink>
              ) : null
            ) : (
              visibleTabs.map((t) => (
                <NavLink
                  key={t.key}
                  to={t.to}
                  className={({ isActive }) =>
                    `block px-3 py-2 rounded-md text-base font-medium ${isActive ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`
                  }
                  onClick={handleLinkClick}
                >
                  {t.label}
                </NavLink>
              ))
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
