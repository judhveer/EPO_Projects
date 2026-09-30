import { useNavigate } from "react-router-dom";
import MyAttendance from "../attendance/MyAttendance.jsx";
import WorkerSwitcherHeader from "../../components/worker/WorkerSwitcherHeader.jsx";

export default function WorkerAttendancePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-100 pb-6">
      <WorkerSwitcherHeader title="Attendance" />
      <MyAttendance compact />

      {/* ── Secondary path to Leave — deliberately smaller and
          differently colored than the main switcher tabs above, since
          this is an occasional need, not a daily action. ── */}
      <div className="max-w-xl mx-auto px-4 mt-4">
        <button
          onClick={() => navigate("/worker-leave")}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-black text-lg transition shadow-md"
        >
          <span className="text-2xl">🌴</span>
          MY LEAVE
        </button>
      </div>
    </div>
  );
}