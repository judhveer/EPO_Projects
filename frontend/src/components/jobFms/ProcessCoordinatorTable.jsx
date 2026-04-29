import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import api from "../../lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { DateTime } from "luxon";

// ── Delivery urgency helper ───────────────────────────────────────────────────
// Returns a colour + label based on how close the delivery date is to now.
const deliveryUrgency = (deliveryDate) => {
  if (!deliveryDate) return { color: "text-slate-400", label: "No date" };
  const now   = DateTime.now().setZone("Asia/Kolkata");
  const due   = DateTime.fromJSDate(new Date(deliveryDate)).setZone("Asia/Kolkata");
  const hours = due.diff(now, "hours").hours;

  if (hours < 0)    return { color: "text-red-700   bg-red-100   border-red-300",   label: "OVERDUE",      dot: "🔴" };
  if (hours < 24)   return { color: "text-red-600   bg-red-50    border-red-200",   label: "Due today",    dot: "🔴" };
  if (hours < 48)   return { color: "text-orange-600 bg-orange-50 border-orange-200", label: "Due tomorrow", dot: "🟠" };
  if (hours < 168)  return { color: "text-yellow-700 bg-yellow-50 border-yellow-200", label: "This week",   dot: "🟡" };
  return              { color: "text-green-700  bg-green-50   border-green-200",  label: "Later",        dot: "🟢" };
};


// ── Job row shown inside designer card ───────────────────────────────────────
function JobRow({ job, label }) {
  const urgency = deliveryUrgency(job.delivery_date);
  return (
    <div className={`rounded border px-2.5 py-1.5 text-xs ${urgency.color}`}>
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <span className="font-semibold">
          {urgency.dot} #{job.job_no} — {job.client_name || "—"}
        </span>
        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
          job.priority === "Urgent"   ? "bg-red-200 text-red-800" :
          job.priority === "High"     ? "bg-orange-200 text-orange-800" :
          job.priority === "Medium"   ? "bg-yellow-200 text-yellow-800" :
                                        "bg-green-200 text-green-800"
        }`}>
          {job.priority}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 mt-1 text-[11px] opacity-80">
        <span>📦 {label}</span>
        <span>
          🗓 Delivery:{" "}
          {job.delivery_date
            ? DateTime.fromJSDate(new Date(job.delivery_date))
                .setZone("Asia/Kolkata")
                .toFormat("dd LLL yyyy, hh:mm a")
            : "—"}
        </span>
        {urgency.label !== "Later" && (
          <span className="font-semibold">{urgency.label}</span>
        )}
      </div>
    </div>
  );
}

// ── Designer card in the status modal ────────────────────────────────────────
function DesignerCard({ designer }) {
  const [expanded, setExpanded] = useState(false);

  // Derive the most urgent delivery from active + pending jobs
  const allJobs = [...designer.active_jobs, ...designer.pending_jobs];
  const mostUrgent = allJobs.reduce((acc, j) => {
    if (!j.delivery_date) return acc;
    if (!acc) return j;
    return new Date(j.delivery_date) < new Date(acc.delivery_date) ? j : acc;
  }, null);
  const mostUrgentUrgency = deliveryUrgency(mostUrgent?.delivery_date);

  return (
    <div className={`border rounded-xl overflow-hidden shadow-sm ${
      designer.status === "active"
        ? "border-blue-200 bg-blue-50"
        : "border-green-200 bg-green-50"
    }`}>
      {/* Card header */}
      <button
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-2"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-bold text-slate-800 text-sm">
            {designer.name}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            designer.status === "active"
              ? "bg-blue-200 text-blue-800"
              : "bg-green-200 text-green-800"
          }`}>
            {designer.status === "active" ? "🟡 Active" : "🟢 Idle"}
          </span>
          {designer.urgent_flag && (
            <span className="text-xs text-red-600 font-semibold">⚠ Has urgent</span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-500 shrink-0">
          {/* Pressure summary */}
          <div className="flex gap-2">
            <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
              Active: {designer.active_jobs.length}
            </span>
            <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
              Pending: {designer.pending_jobs.length}
            </span>
            <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
              Done today: {designer.today_completed}
            </span>
          </div>
          {/* Most urgent delivery */}
          {mostUrgent && (
            <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${mostUrgentUrgency.color}`}>
              Nearest delivery: {DateTime.fromJSDate(new Date(mostUrgent.delivery_date))
                .setZone("Asia/Kolkata")
                .toFormat("dd LLL, hh:mm a")}
            </span>
          )}
          <span className="text-slate-400">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Workload bar */}
      <div className="mx-4 mb-2">
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full ${
              designer.workload_score > 75 ? "bg-red-500" :
              designer.workload_score > 40 ? "bg-yellow-500" :
                                              "bg-green-500"
            }`}
            style={{ width: `${designer.workload_score}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5">
          Workload: {designer.workload_score}%
        </p>
      </div>

      {/* Expanded job list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2">
              {designer.active_jobs.length === 0 && designer.pending_jobs.length === 0 && (
                <p className="text-xs text-slate-400 italic">No active or pending jobs.</p>
              )}
              {designer.active_jobs.map((j) => (
                <JobRow key={j.job_no} job={j} label="In progress" />
              ))}
              {designer.pending_jobs.map((j) => (
                <JobRow key={j.job_no} job={j} label="Pending" />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Designer Status Modal ─────────────────────────────────────────────────────
function DesignerStatusModal({ designers, onClose }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 20 }}
        className="bg-white rounded-xl shadow-2xl w-[95%] max-w-3xl max-h-[85vh] flex flex-col"
      >
        <div className="flex justify-between items-center border-b px-6 py-4 shrink-0">
          <div>
            <h3 className="text-xl font-bold text-blue-700">
              👥 Designer Status Overview
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Expand a designer to see their jobs and delivery deadlines.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-red-500 hover:text-red-700 text-3xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {designers.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">
              No designer data available.
            </p>
          )}
          {designers.map((d) => (
            <DesignerCard key={d.designer_id} designer={d} />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}


export default function ProcessCoordinatorTable() {
  const [jobs, setJobs] = useState([]);
  const [designers, setDesigners] = useState([]);
  // const [openDropdownJob, setOpenDropdownJob] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDesignerStatus,    setShowDesignerStatus]    = useState(false);
  const [selectedJobForAssign, setSelectedJobForAssign] = useState(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [err, setErr] = useState("");
  const [assigning, setAssigning] = useState(false);

  // 📄 Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const startIdx = (page - 1) * limit;
  const endIdx = startIdx + limit;
  const paginatedJobs = jobs.slice(startIdx, endIdx);
  const totalPages = Math.ceil(jobs.length / limit);

  const assignLock = useRef(false);
  const [totalJobs, setTotalJobs] = useState(0);

  // Load jobs
  const fetchJobs = useCallback(async (signal) => {
    try {
      const { data } = await api.get("/api/fms/process-coordinator/jobs", {
        signal,
      });
      setJobs(Array.isArray(data) ? data : data.data || data.jobCards || []);
      setTotalJobs(data.total);
    } catch (error) {
      if (error.name === "CanceledError") return;
      console.error("Failed to fetch jobs", error);
      setErr("Unable to load jobs");
    }
  }, []);

  // Load designers with status
  const fetchDesigners = useCallback(async (signal) => {
    try {
      const { data } = await api.get(
        "/api/fms/process-coordinator/designers/status",
        { signal },
      );
      setDesigners(data);
    } catch (error) {
      if (error.name === "CanceledError") return;
      console.error("Failed to fetch designers", error);
      setErr("Unable to load designers");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;
    setLoading(true);

    Promise.allSettled([
      fetchJobs(controller.signal),
      fetchDesigners(controller.signal),
    ]).finally(() => {
      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      controller.abort(); // cancel all in-flight requests
    };
  }, [fetchJobs, fetchDesigners]);

  const assignDesigner = async (job_no, designer_id) => {
    if (!job_no || !designer_id || assignLock.current) return;

    const controller = new AbortController();
    assignLock.current = true;
    setAssigning(true);
    // if (assigning) return; // prevent multiple clicks
    // setAssigning(true);

    try {
      await api.patch(
        `/api/fms/process-coordinator/${job_no}/assign`,
        { designer_id },
        { signal: controller.signal },
      );

      setErr("");
      setSuccessMsg("✅ Job Assigned to Designer successfully!");
      setShowSuccessPopup(true);

      // setOpenDropdownJob(null);
      await Promise.all([
        fetchJobs(controller.signal),
        fetchDesigners(controller.signal),
      ]);

      // ⏳ Wait 2 seconds before closing modal (after popup)
      setTimeout(() => {
        setShowSuccessPopup(false);
        setShowAssignModal(false); // close modal AFTER popup
      }, 1500);

    } catch (error) {
      if (error.name === "CanceledError") return;
      console.error(error);
      setErr(error.response?.data?.message || "Failed to Assign Job Card");
    } finally {
      assignLock.current = false;
      setAssigning(false);
    }
  };

  const designerMap = React.useMemo(() => {
    const map = new Map();
    designers.forEach((d) => map.set(d.name, d));
    return map;
  }, [designers]);

  return (
    <div>
      {showSuccessPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-[500] bg-black/30 backdrop-blur-sm">
          <div className="bg-white shadow-2xl rounded-xl px-8 py-6 border border-green-200 animate-fade-in text-center">
            <h3 className="text-2xl font-semibold text-green-700 mb-2">
              🎉 Success!
            </h3>
            <p className="text-slate-600 text-sm">{successMsg}</p>
          </div>
        </div>
      )}
      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-blue-700">
          🧑‍💼 Process Coordinator Dashboard
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Designer status button — always visible */}
          <button
            onClick={() => setShowDesignerStatus(true)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-all active:scale-95"
          >
            👥 Designer Status
            {designers.some((d) => d.status === "active") && (
              <span className="bg-yellow-400 text-yellow-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">
                {designers.filter((d) => d.status === "active").length} active
              </span>
            )}
          </button>

          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
            <span className="text-xs text-blue-700 font-medium">Total Pending:</span>
            <span className="text-sm font-bold text-blue-800">{totalJobs}</span>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="hidden md:block relative overflow-auto border rounded-lg shadow max-h-[80vh]">
        <table className="w-full text-xs border-collapse border border-gray-300">
          <thead className="sticky top-0 bg-blue-700 text-white">
            <tr>
              <th className="p-2 border sticky left-0 bg-blue-800 z-40 text-center font-semibold">Job No</th>
              <th className="p-2 border">Job Created On</th>
              <th className="p-2 border">Client</th>
              <th className="p-2 border">Order Type</th>
              <th className="p-2 border">Order Handled By</th>
              <th className="p-2 border">Execution Location</th>
              <th className="p-2 border">Delivery Date</th>
              <th className="p-2 border max-w-[500px]">Delivery Location</th>
              <th className="p-2 border">Priority</th>
              <th className="p-2 border">Assign Designer</th>
            </tr>
          </thead>
          <tbody>
            {paginatedJobs.length === 0 && (
              <tr>
                <td colSpan="10" className="text-center p-4 text-gray-500">
                  {loading ? "Loading…" : "No jobs available"}
                </td>
              </tr>
            )}
            {paginatedJobs.map((job) => {
              const assignedDesigner = designerMap.get(job.assigned_designer);
              return (
                <tr key={job.job_no} className="hover:bg-blue-50">
                  <td className="border p-2 sticky left-0 bg-blue-800 z-40 text-center font-semibold text-white">
                    {job.job_no}
                  </td>
                  <td className="border p-2">
                    {job.createdAt
                      ? DateTime.fromJSDate(new Date(job.createdAt))
                          .setZone("Asia/Kolkata")
                          .toFormat("dd LLL yyyy, hh:mm a")
                      : "-"}
                  </td>
                  <td className="border p-2">{job.client_name}</td>
                  <td className="border p-2">{job.order_type}</td>
                  <td className="border p-2">{job.order_handled_by}</td>
                  <td className="border p-2">{job.execution_location}</td>
                  <td className="border p-2">
                    {job.delivery_date
                      ? DateTime.fromJSDate(new Date(job.delivery_date))
                          .setZone("Asia/Kolkata")
                          .toFormat("dd LLL yyyy, hh:mm a")
                      : "-"}
                  </td>
                  <td className="border px-2 max-w-[500px]">
                    {job.delivery_location?.replace(/_/g, " ")}
                    {job.delivery_address && (
                      <div className="text-[11px] text-gray-500 italic mt-1">
                        {job.delivery_address}
                      </div>
                    )}
                  </td>
                  <td className="border p-2">{job.task_priority}</td>
                  <td
                    className="border p-2 cursor-pointer"
                    onClick={() => { setSelectedJobForAssign(job); setShowAssignModal(true); }}
                  >
                    <div className="font-semibold text-blue-700">
                      {assignedDesigner ? assignedDesigner.name : "Click to Assign"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-300 p-3 flex justify-between items-center z-30 shadow-md">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Rows per page:</label>
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className="border rounded-md p-1 text-sm"
            >
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-100"
            >⬅ Prev</button>
            <span className="text-gray-700">Page {page} of {totalPages || 1}</span>
            <button
              disabled={page === totalPages || totalPages === 0}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-100"
            >Next ➡</button>
          </div>
        </div>
      </div>

      {/* ── Assign Designer Modal ── */}
      <AnimatePresence>
        {showAssignModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 20 }}
              className="bg-white rounded-xl shadow-2xl w-[90%] max-w-xl max-h-[80vh] overflow-y-auto p-6"
            >
              <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h3 className="text-xl font-semibold text-blue-700">
                  Assign Designer — Job #{selectedJobForAssign?.job_no}
                </h3>
                <button
                  onClick={() => setShowAssignModal(false)}
                  disabled={assigning}
                  className="text-red-600 hover:text-red-800 text-3xl leading-none disabled:opacity-50"
                >&times;</button>
              </div>

              <div className="space-y-3">
                {designers.map((designer) => (
                  <button
                    key={designer.designer_id}
                    disabled={assigning || designer.name === selectedJobForAssign?.assigned_designer}
                    onClick={() => assignDesigner(selectedJobForAssign.job_no, designer.designer_id)}
                    className="w-full text-left p-4 border rounded-lg hover:bg-blue-50 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-800">{designer.name}</span>
                      {designer.status === "idle"
                        ? <span className="text-green-600 text-sm">🟢 Idle</span>
                        : <span className="text-yellow-600 text-sm">🟡 Active</span>
                      }
                    </div>
                    <div className="w-full bg-gray-200 rounded h-2 mt-2">
                      <div
                        className="bg-blue-600 h-2 rounded"
                        style={{ width: `${designer.workload_score}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Active: {designer.active_jobs.length} | Pending: {designer.pending_jobs.length} | Done today: {designer.today_completed}
                    </div>
                    {/* ── Nearest delivery deadline (key decision info) ── */}
                    {(() => {
                      const allJobs = [...designer.active_jobs, ...designer.pending_jobs];
                      const nearest = allJobs.reduce((acc, j) => {
                        if (!j.delivery_date) return acc;
                        if (!acc) return j;
                        return new Date(j.delivery_date) < new Date(acc.delivery_date) ? j : acc;
                      }, null);
                      if (!nearest) return null;
                      const u = deliveryUrgency(nearest.delivery_date);
                      return (
                        <div className={`text-[11px] mt-1.5 px-2 py-1 rounded border font-medium ${u.color}`}>
                          {u.dot} Nearest deadline: #{nearest.job_no} —{" "}
                          {DateTime.fromJSDate(new Date(nearest.delivery_date))
                            .setZone("Asia/Kolkata")
                            .toFormat("dd LLL yyyy, hh:mm a")}
                          {" "}({u.label})
                        </div>
                      );
                    })()}
                    {designer.urgent_flag && (
                      <div className="text-[11px] text-red-500 font-medium mt-1">
                        ⚠ Has urgent tasks
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Designer Status Modal ── */}
      <AnimatePresence>
        {showDesignerStatus && (
          <DesignerStatusModal
            designers={designers}
            onClose={() => setShowDesignerStatus(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
