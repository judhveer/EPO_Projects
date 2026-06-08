import { useEffect, useState, useCallback } from "react";
import api from "../../../lib/api.js";

const STAGE_LABELS = {
  printing:         "Printing",
  binding:          "Binding",
  quality_check:    "Quality Check",
  packaging:        "Packaging",
  ready_to_dispatch:"Ready to Dispatch",
  out_for_delivery: "Out for Delivery",
};

const POLL_INTERVAL_MS = 30_000;

// Current status config per worker
function getStatusConfig(current, department) {
  if (!current) return { label: "Idle", dot: "bg-gray-300", badge: "bg-gray-100 text-gray-500" };
  switch (current.status) {
    case "in_progress":
      return department === "Delivery"
        ? { label: "Delivering", dot: "bg-cyan-500 animate-pulse", badge: "bg-cyan-100 text-cyan-700" }
        : { label: "Working",    dot: "bg-green-500 animate-pulse", badge: "bg-green-100 text-green-700" };
    case "paused":
      return { label: "Paused",   dot: "bg-orange-400", badge: "bg-orange-100 text-orange-700" };
    case "assigned":
      return { label: "Assigned", dot: "bg-blue-400",   badge: "bg-blue-100 text-blue-700" };
    default:
      return { label: "Idle",     dot: "bg-gray-300",   badge: "bg-gray-100 text-gray-500" };
  }
}

export default function WorkerStats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const { data: res } = await api.get("/api/fms/production/worker-stats");
      setData(res);
      setLastRefreshed(new Date());
    } catch {
      if (!silent) setError("Failed to load worker stats.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Auto-refresh — worker statuses change as they work
  useEffect(() => {
    const interval = setInterval(() => fetchStats(true), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin h-8 w-8 border-b-2 border-blue-700 rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-600">
        {error}
        <button onClick={() => fetchStats()} className="ml-2 text-blue-600 underline">
          Retry
        </button>
      </div>
    );
  }

  const { workers = [], overview = {} } = data || {};

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-blue-700">👷 Worker Stats</h2>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-gray-400">
              Updated {lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => fetchStats()}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Overview cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Workers", value: overview.total, color: "blue" },
          { label: "Working Now",   value: overview.working, color: "green" },
          { label: "Paused",        value: overview.paused,  color: "orange" },
          { label: "Idle",          value: overview.idle,    color: "gray" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className={`bg-white rounded-xl border-2 p-4 text-center shadow-sm border-${color}-100`}
          >
            <p className={`text-3xl font-black text-${color}-600`}>{value ?? 0}</p>
            <p className="text-xs text-gray-500 font-medium mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Empty state ── */}
      {workers.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">👷</div>
          <p className="font-semibold">No Production Workers found.</p>
          <p className="text-sm mt-1">
            Create worker accounts via the Create User page with department{" "}
            <strong>"Production Worker"</strong>.
          </p>
        </div>
      )}

      {/* ── Per-worker table ── */}
      {workers.length > 0 && (
        <div className="border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-gradient-to-r from-blue-700 to-blue-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-semibold w-[160px]">Worker</th>
                <th className="px-4 py-3 text-left font-semibold w-[100px]">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Currently Working On</th>
                <th className="px-4 py-3 text-center font-semibold w-[80px]">
                  <span title="Jobs completed today">Today ✓</span>
                </th>
                <th className="px-4 py-3 text-center font-semibold w-[80px]">
                  <span title="All-time jobs completed by worker">Total ✓</span>
                </th>
                <th className="px-4 py-3 text-center font-semibold w-[80px]">
                  <span title="Times coordinator had to force-complete this worker">Force ✓</span>
                </th>
                <th className="px-4 py-3 text-center font-semibold w-[90px]">
                  <span title="Times this worker detected a defect during Quality Check — positive metric">
                    Defects Found
                  </span>
                </th>
                <th className="px-4 py-3 text-center font-semibold w-[90px]">
                  <span title="Times this worker's output failed Quality Check and required rework">
                    Rework Caused
                  </span>
                </th>
                <th className="px-4 py-3 text-center font-semibold w-[100px]">Total Jobs</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w, index) => {
                const sc = getStatusConfig(w.current, w.department);
                const stage = w.current
                  ? STAGE_LABELS[w.current.stage_name] || w.current.stage_name
                  : null;

                return (
                  <tr
                    key={w.id}
                    className={`border-t transition ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50"
                    } hover:bg-blue-50`}
                  >
                    {/* Worker name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`} />
                        <div>
                          <span className="font-bold text-gray-800 block">{w.username}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            w.department === "Delivery"
                              ? "bg-cyan-50 text-cyan-600"
                              : "bg-blue-50 text-blue-500"
                          }`}>
                            {w.department === "Delivery" ? "🚚 Delivery" : "🏭 Production"}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${sc.badge}`}>
                        {sc.label}
                      </span>
                    </td>

                    {/* Current job */}
                    <td className="px-4 py-3">
                      {w.current ? (
                        <div>
                          <div>
                            <span className="font-bold text-blue-700">
                              #{w.current.job_no}
                            </span>
                            <span className="text-gray-500 mx-1">·</span>
                            <span className="text-gray-700">{w.current.client_name}</span>
                          </div>
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {w.department === "Delivery" ? "🚚 Out for Delivery" : `Stage: ${stage}`}
                          </div>
                          {/* Show additional paused/assigned jobs if worker holds more than one */}
                          {w.current.additional_count > 0 && (
                            <div className="text-[11px] text-orange-500 font-semibold mt-0.5">
                              + {w.current.additional_count} more paused job{w.current.additional_count > 1 ? "s" : ""}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 italic">—</span>
                      )}
                    </td>

                    {/* Done today */}
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${w.stats.done_today > 0 ? "text-green-700" : "text-gray-400"}`}>
                        {w.stats.done_today}
                      </span>
                    </td>

                    {/* Total done */}
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-blue-700">{w.stats.total_done}</span>
                    </td>

                    {/* Force completed */}
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${w.stats.force_completed > 0 ? "text-purple-600" : "text-gray-400"}`}>
                        {w.stats.force_completed}
                      </span>
                    </td>
                    {/* Defects Found — positive metric for QC work */}
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${
                        w.stats.defects_reported > 0 ? "text-emerald-600" : "text-gray-400"
                      }`}>
                        {w.stats.defects_reported}
                      </span>
                    </td>

                    {/* Rework Caused — negative metric for producing work */}
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${
                        w.stats.rework_caused > 0 ? "text-red-500" : "text-gray-400"
                      }`}>
                        {w.stats.rework_caused}
                      </span>
                    </td>

                    {/* Total assignments */}
                    <td className="px-4 py-3 text-center text-gray-600 font-medium">
                      {w.stats.total_assignments}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Legend */}
          <div className="bg-gray-50 border-t border-gray-200 px-4 py-2 flex flex-wrap gap-4 text-[11px] text-gray-500">
            <span><strong className="text-green-700">Today ✓</strong> — jobs completed today</span>
            <span><strong className="text-blue-700">Total ✓</strong> — all-time completed</span>
            <span><strong className="text-purple-600">Force ✓</strong> — coordinator had to intervene</span>
            <span><strong className="text-emerald-600">Defects Found</strong> — defects correctly identified at QC (positive)</span>
            <span><strong className="text-red-500">Rework Caused</strong> — output failed QC and required rework</span>
          </div>
        </div>
      )}
    </div>
  );
}