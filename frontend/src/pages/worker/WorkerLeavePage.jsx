import MyLeave from "../attendance/MyLeave.jsx";
import WorkerSwitcherHeader from "../../components/worker/WorkerSwitcherHeader.jsx";

export default function WorkerLeavePage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <WorkerSwitcherHeader title="Leave" />
      <MyLeave compact />
    </div>
  );
}