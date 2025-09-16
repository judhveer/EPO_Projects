import { NavLink } from 'react-router-dom';

const link = ({isActive}) => 
  `px-3 py-2 rounded-md text-sm font-medium ${isActive ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`;

export default function NavBar(){
  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex gap-3 items-center">
        <div className="font-bold text-lg">Sales Pipeline</div>
        <nav className="flex gap-2">
          <NavLink to="/sales/dashboard" className={link}>Dashboard</NavLink>
          <NavLink to="/sales/forms/research" className={link}>Research</NavLink>
          <NavLink to="/sales/forms/approval" className={link}>Approval</NavLink>
          <NavLink to="/sales/forms/telecall" className={link}>Tele-call</NavLink>
          <NavLink to="/sales/forms/meeting" className={link}>Meeting</NavLink>
          <NavLink to="/sales/forms/crm" className={link}>CRM</NavLink>
        </nav>
      </div>
    </header>
  );
}
