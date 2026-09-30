import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// Two giant, icon-first tabs — deliberately icon+color as the PRIMARY
// cue, text as reinforcement only, not the thing someone has to read
// to know which tab is which. Matches the existing worker dashboards'
// established pattern (huge buttons, emoji, heavy color), just applied
// one level up as page-switching instead of job actions.
export default function WorkerSwitcherHeader({ title, onBeforeLogout }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  

  const workRoute = user?.department === "Delivery" ? "/delivery-dashboard" : "/worker";
  const isOnAttendance = location.pathname === "/worker-attendance" || location.pathname === "/worker-leave"; // ← was just the first check

  const handleLogout = () => {
    // If the caller supplied a gate function, ask it first — it
    // returns false to abort. No prop supplied = no gate, log out
    // immediately (Delivery's and the attendance page's behavior).
    if (onBeforeLogout && !onBeforeLogout()) return;
    logout();
  };

  return (
    <>
      <header className="bg-blue-700 text-white px-4 py-4 flex justify-between items-center shadow-md sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black tracking-tight">{title}</h1>
          <p className="text-xs text-blue-200 mt-0.5">
            Hello, <span className="font-semibold">{user?.username}</span>
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs bg-blue-600 hover:bg-blue-500 active:bg-blue-400 border border-blue-400 px-4 py-2 rounded-lg font-semibold transition"
        >
          Logout
        </button>
      </header>

      {/* ── The switcher — always visible, always the same two spots ── */}
      <div className="grid grid-cols-2 gap-2 p-3 bg-gray-100 sticky top-[72px] z-10 border-b border-gray-200">
        <button
          onClick={() => navigate(workRoute)}
          className={`flex flex-col items-center justify-center py-4 rounded-2xl font-black text-lg transition shadow-sm ${
            !isOnAttendance
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-500 border-2 border-gray-200"
          }`}
        >
          <span className="text-3xl mb-1">🛠️</span>
          MY WORK
        </button>
        <button
          onClick={() => navigate("/worker-attendance")}
          className={`flex flex-col items-center justify-center py-4 rounded-2xl font-black text-lg transition shadow-sm ${
            isOnAttendance
              ? "bg-green-600 text-white"
              : "bg-white text-gray-500 border-2 border-gray-200"
          }`}
        >
          <span className="text-3xl mb-1">🕐</span>
          ATTENDANCE
        </button>
      </div>
    </>
  );
}