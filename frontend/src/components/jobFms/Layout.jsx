import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

// Utility for styling active/inactive nav links
const navClass = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive
      ? "bg-blue-600 text-white"
      : "text-slate-700 hover:bg-slate-200"
  }`;

// Define the available tabs
const JOB_FMS_TABS = [
  { key: "common", label: "Common Dashboard", to: "/job-fms/common" },
  { key: "writer", label: "Job Writer", to: "/job-fms/writer" },
  { key: "coordinator", label: "Process Coordinator", to: "/job-fms/coordinator" },
  { key: "designer", label: "Designer", to: "/job-fms/designer" },
  { key: "crm", label: "CRM", to: "/job-fms/crm" },
];

export default function JobFmsLayout() {
  const [open, setOpen] = useState(false);

  const handleLinkClick = () => setOpen(false);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header / Navbar */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-screen mx-auto px-4 py-3 flex items-center justify-between md:justify-around gap-3">
          {/* Left section / Title */}
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-lg">Job FMS Module</h1>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex gap-2 items-center">
            {JOB_FMS_TABS.map((tab) => (
              <NavLink key={tab.key} to={tab.to} className={navClass}>
                {tab.label}
              </NavLink>
            ))}
          </nav>

          {/* Mobile Hamburger */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setOpen((s) => !s)}
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              className="inline-flex items-center justify-center p-2 rounded-md text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {open ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Panel */}
        <div
          className={`md:hidden transition-max-h duration-200 ease-in-out overflow-hidden bg-white border-t border-slate-100 ${
            open ? "max-h-screen" : "max-h-0"
          }`}
        >
          <div className="px-4 py-3">
            <nav className="flex flex-col gap-1">
              {JOB_FMS_TABS.map((tab) => (
                <NavLink
                  key={tab.key}
                  to={tab.to}
                  className={({ isActive }) =>
                    `block px-3 py-2 rounded-md text-base font-medium ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-slate-700 hover:bg-slate-50"
                    }`
                  }
                  onClick={handleLinkClick}
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 max-w-screen mx-auto w-full p-4">
        <div className="bg-white shadow-md rounded-lg p-4 border border-slate-200">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
