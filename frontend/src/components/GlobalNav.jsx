import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { can } from "../lib/permissions";

export default function GlobalNav() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const isBoss = user?.role === "BOSS";
  const isAdmin = user?.role === "ADMIN";
  const showAttendance = can(user, "attendance.view");
  const showSales = can(user, "sales.dashboard.view");
  const showEA = can(user, "ea.dashboard.view");

  const showJobFms =
    can(user, "jobfms.writer.view") ||
    can(user, "jobfms.coordinator.view") ||
    can(user, "jobfms.designer.view") ||
    can(user, "jobfms.crm.view");

  const link = (to, label) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2 rounded-lg text-sm font-medium ${
          isActive
            ? "bg-blue-700 text-white"
            : "text-gray-700 hover:bg-gray-100"
        }`
      }
    >
      {label}
    </NavLink>
  );

  return (
    <header className="bg-white border-b sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Put your logo file at /public/logo.png or adjust path */}
          <img
            src="/logo.png"
            alt="EPO"
            className="h-7 md:h-8 w-auto shrink-0"
          />
          <div className="leading-tight min-w-0">
            <div className="font-semibold tracking-wide text-lg md:text-sm truncate">
              EASTERN PANORAMA OFFSET
            </div>
            <div className="text-[10px] font-bold tracking-wide text-gray-500 truncate">
              Igniting Ideas &amp; Solutions, Across Borders.
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-2">
          {link("/home", "Home")}
          {showAttendance && link("/attendance", "Attendance")}
          {showEA && link("/task", "EA Dashboard")}
          {showSales && link("/sales", "Sales Dashboard")}
          {showJobFms && link("/job-fms/writer", "Job FMS")}
          {(isBoss || isAdmin) && link("/create-user", "Create User")}
        </nav>

        {/* User pill + logout */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right mr-2">
            <div className="text-xs font-bold text-gray-600">
              {user?.username}
            </div>
            <div className="text-[10px] font-bold text-gray-400">
              {user?.role} · {user?.department}
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              nav("/login", { replace: true });
            }}
            className="px-3 py-2 rounded-lg text-sm bg-rose-600 text-white hover:opacity-90"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="md:hidden border-t bg-white">
        <div className="px-3 py-2 flex flex-wrap gap-2">
          {link("/home", "Home")}
          {showAttendance && link("/attendance", "Attendance")}
          {showEA && link("/task", "EA Dashboard")}
          {showSales && link("/sales", "Sales Dashboard")}
          {showJobFms && link("/job-fms/writer", "Job FMS")}
          {(isBoss || isAdmin) && link("/create-user", "Create User")}
        </div>
      </nav>
    </header>
  );
}

