import React, { useEffect, useState, useCallback } from "react";
import api from "../../lib/api.js";
import { DateTime } from "luxon";
import JobItemsSidebar from "../../components/jobFms/commonDashboard/JobItemsSidebar";
import StageChip from "./production/StageChip.jsx";
import AdvanceStageModal from "./production/AdvanceStageModal.jsx";


const STAGE_PILLS = [
  { value: "", label: "All" },
  { value: "printing", label: "Printing" },
  { value: "binding", label: "Binding" },
  { value: "quality_check", label: "QC" },
  { value: "packaging", label: "Packaging" },
  { value: "ready_to_dispatch", label: "Ready to Dispatch" },
  { value: "out_for_delivery", label: "Out for Delivery" },
];

/**
 * Groups stageWorkers by stage_name and computes completion counts.
 * Cancelled assignments (from reverted stages) are excluded.
 *
 * activelyWorking = in_progress or paused (started but not done).
 * Used to distinguish "Not started" (all assigned, nobody pressed START)
 * from "0/3 done" (some workers are actively working).
 */
function getWorkerStageSummary(stageWorkers = []) {
  const map = {};
  for (const w of stageWorkers) {
    if (w.status === "cancelled") continue;
    if (!map[w.stage_name]) {
      map[w.stage_name] = { names: [], total: 0, done: 0, activelyWorking: 0 };
    }
    if (w.worker_name) map[w.stage_name].names.push(w.worker_name);
    map[w.stage_name].total++;
    if (["completed", "force_completed"].includes(w.status)) {
      map[w.stage_name].done++;
    } else if (["in_progress", "paused"].includes(w.status)) {
      map[w.stage_name].activelyWorking++;
    }
  }
  return map;
}

const STAGE_ICON = {
  printing: "🖨️",
  binding: "📎",
  quality_check: "🔍",
  packaging: "📦",
  out_for_delivery: "🚚",
};

const STAGE_DISPLAY_ORDER = ["printing", "binding", "quality_check", "packaging", "out_for_delivery"];


export default function ProductionTable() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [itemSidebarJobNo, setItemSidebarJobNo] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalJobs, setTotalJobs] = useState(0);
  const [stageFilter, setStageFilter] = useState("");

  const resetPage = () => setPage(1);

  // 🔹 Filters (backend-driven)
  const [filters, setFilters] = useState({
    search: "",
    execution_location: "",
    status: "",
    delivery_location: "",
  });
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  const update = (key, value) => {
    resetPage();
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const emptyFilters = {
    search: "",
    execution_location: "",
    status: "",
    delivery_location: "",
  };

  const clearFilters = () => {
    resetPage();
    setFilters(emptyFilters);
    setDebouncedSearch(""); // clear instantly instead of waiting for the 300ms debounce
  };

  const totalPages = totalJobs > 0 ? Math.ceil(totalJobs / limit) : 1;

  const fetchJobs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = { page, limit };
      if (stageFilter) params.stage = stageFilter;
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.execution_location) params.execution_location = filters.execution_location;
      if (filters.status) params.status = filters.status;
      if (filters.delivery_location) params.delivery_location = filters.delivery_location;
      const { data } = await api.get("/api/fms/production", { params });
      setJobs(data.data);
      setTotalJobs(data.total || 0);
    } catch (err) {
      console.error("Failed:", err);
      setError("Failed to load jobs.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, stageFilter, debouncedSearch, filters.status, filters.execution_location, filters.delivery_location]);

  // Single source of truth: fetchJobs is recreated whenever anything it
  // reads changes, and this effect just reacts to that. Don't reintroduce
  // a second effect with its own hand-maintained dependency list — that's
  // exactly what caused stageFilter changes to silently stop refetching.
  useEffect(() => { 
    fetchJobs(); 
  }, [fetchJobs]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300); // 300ms is ideal for dashboards

    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape") {
        if (activeJob) setActiveJob(null);
        if (itemSidebarJobNo) setItemSidebarJobNo(null);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [activeJob, itemSidebarJobNo]);

  const columnCount = 15;

  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        {error}
        <button onClick={fetchJobs} className="ml-2 text-blue-600 underline">Retry</button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center flex-wrap mb-3 gap-2">
        <div className="bg-white p-2 shadow-sm grid grid-cols-5 gap-2 sticky top-0 z-20">
          {/* SEARCH */}
          <input
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
            placeholder="🔍 Job No, Client, Designer Name, CRM"
            className="col-span-1 border rounded px-2 py-1 text-xs"
          />

          {/* EXECUTION LOCATION */}
          <select
            value={filters.execution_location}
            onChange={(e) => update("execution_location", e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="">Execution Location</option>
            <option value="In-Bound">In-Bound</option>
            <option value="Out-Bound">Out-Bound</option>
          </select>

          {/* STATUS / STAGE */}
          <select
            value={filters.status}
            onChange={(e) => update("status", e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="">Stage</option>
            <option value="ready_for_production">Ready For Production</option>
            <option value="in_production">Production</option>
          </select>

          {/* DELIVERY LOCATION */}
          <select
            value={filters.payment_status}
            onChange={(e) => update("delivery_location", e.target.value)}
            className="border rounded px-1 py-1 text-xs"
          >
            <option value="">Delivery Location</option>
            <option value="EPO_TO_CUSTOMER_SHIPMENT">EPO To Customer (Shipment)</option>
            <option value="EPO_TO_CUSTOMER_PICKUP">EPO To Customer (Pickup)</option>
            <option value="MM_TO_CUSTOMER_SHIPMENT">MM To Customer (Shipment)</option>
            <option value="MM_TO_CUSTOMER_PICKUP">MM To Customer (Pickup)</option>
            <option value="MM_TO_EPO_TO_CUSTOMER_SHIPMENT">MM To EPO To Customer (Shipment)</option>
            <option value="MM_TO_EPO_TO_CUSTOMER_PICKUP">MM To EPO To Customer (Pickup)</option>
          </select>

          {/* CLEAR */}
          <button
            onClick={clearFilters}
            className="bg-gray-300 hover:bg-gray-500 hover:text-white rounded px-2 py-2 text-xs col-span-1"
          >
            Clear
          </button>

        </div>
        
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
          <span className="text-xs text-blue-700 font-medium">Total Jobs</span>
          <span className="text-sm font-bold text-blue-800">{totalJobs}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {STAGE_PILLS.map((p) => (
          <button
            key={p.value}
            onClick={() => { setStageFilter(p.value); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
              stageFilter === p.value
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-blue-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="relative overflow-auto border rounded-lg shadow max-h-[75vh]">
        <table className={loading ? "opacity-50 pointer-events-none" : "min-w-[2400px] text-xs border-collapse border border-gray-300 table-fixed"}>
          <thead className="sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow-sm">
            <tr>
              <th className="border p-2 sticky left-0 bg-blue-800 z-40 text-center font-semibold w-[80px]">Job No</th>
              <th className="border p-2 w-[140px]">Current Stage</th>
              <th className="border p-2 w-[220px]">
                {stageFilter && STAGE_DISPLAY_ORDER.includes(stageFilter)
                  ? `${stageFilter.replace(/_/g, " ")} Workers`.replace(/\b\w/g, (c) => c.toUpperCase())
                  : "Workers"}
              </th>
              <th className="border p-2 w-[150px]">Created On</th>
              <th className="border p-2 w-[180px]">Client</th>
              <th className="border p-2 w-[100px]">Items</th>
              <th className="border p-2 w-[170px]">Delivery Date</th>
              <th className="border p-2 w-[180px]">Delivery Location</th>
              <th className="border p-2 w-[130px]">Status</th>
              <th className="border p-2 w-[100px]">Priority</th>
              <th className="border p-2 w-[150px]">Order Handled By</th>
              <th className="border p-2 w-[110px]">Execution</th>
              <th className="border p-2 w-[80px]">Files</th>
              <th className="border p-2 w-[170px]">Deadline</th>
              <th className="border p-2 sticky right-0 bg-blue-800 z-40 w-[140px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columnCount} className="text-center py-6">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
                  </div>
                </td>
              </tr>
            ) : jobs.length > 0 ? (
              jobs.map((job, index) => (
                <tr key={job.job_no}
                  className={`group border-b ${index % 2 === 0 ? "bg-white" : "bg-slate-100"} hover:bg-blue-50`}>
                  <td className="border p-2 sticky left-0 group-hover:bg-blue-50 bg-inherit z-20 text-center font-bold text-blue-700">{job.job_no}</td>
                  <td className="border p-2">
                    <StageChip
                      value={job.production_stage}
                      fallback={job.status === "ready_for_production" ? "Not Started" : "—"}
                    />
                  </td>

                  <td className="border p-2 align-top">
                    {(() => {
                      const currentStage = job.production_stage;

                      // ── Special case: out_for_delivery ───────────────────────────────
                      // Delivery workers live in DeliveryAssignment, not JobProductionStageWorker.
                      // Show delivery confirmation status instead of stage worker summary.
                      if (currentStage === "out_for_delivery") {
                        const das = job.deliveryAssignments || [];
                        if (das.length === 0) {
                          return <span className="text-gray-400 text-xs italic">—</span>;
                        }
                        const total = das.length;
                        const done = das.filter((da) =>
                          ["confirmed", "overridden"].includes(da.status)
                        ).length;
                        const allConfirmed = done === total;

                        return (
                          <div className="text-xs">
                            <div className="flex items-center gap-1 flex-wrap mb-0.5">
                              <span className="shrink-0">🚚</span>
                              <span className="font-semibold text-blue-700">Out for Delivery</span>
                              <span
                                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                                  allConfirmed
                                    ? "bg-green-100 text-green-700"
                                    : "bg-orange-100 text-orange-700"
                                }`}
                              >
                                {allConfirmed ? "All confirmed ✓" : `${done}/${total} confirmed`}
                              </span>
                            </div>
                            <div className="pl-4 text-[11px] text-gray-700 leading-snug">
                              {das.map((da) => da.worker_name).join(", ")}
                            </div>
                          </div>
                        );
                      }

                      // ── All other production stages ───────────────────────────────────
                      const stageMap = getWorkerStageSummary(job.stageWorkers);

                      const activeStages = stageFilter
                        ? STAGE_DISPLAY_ORDER.filter(
                            (s) => s === stageFilter && stageMap[s]
                          )
                        : STAGE_DISPLAY_ORDER.filter((s) => stageMap[s]);

                      if (activeStages.length === 0) {
                        return <span className="text-gray-400 text-xs italic">—</span>;
                      }

                      return (
                        <div className="space-y-2">
                          {activeStages.map((s) => {
                            const info = stageMap[s];
                            const isCurrent = s === currentStage;
                            const allDone = info.total > 0 && info.done === info.total;

                            // FIX: "Not started" only when ALL workers are still on 'assigned'
                            // (nobody has pressed START yet). If any are in_progress or paused,
                            // they have started — show "X/Y done" in orange instead.
                            const noneStarted =
                              info.total > 0 &&
                              info.done === 0 &&
                              info.activelyWorking === 0;

                            return (
                              <div key={s} className="text-xs">
                                <div className="flex items-center gap-1 flex-wrap mb-0.5">
                                  <span className="shrink-0">{STAGE_ICON[s]}</span>
                                  <span
                                    className={`font-semibold capitalize ${
                                      isCurrent ? "text-blue-700" : "text-gray-400"
                                    }`}
                                  >
                                    {s.replace(/_/g, " ")}
                                  </span>

                                  {/* Pill shown only for current active stage */}
                                  {isCurrent && info.total > 0 && (
                                    <span
                                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                                        allDone
                                          ? "bg-green-100 text-green-700"
                                          : noneStarted
                                          ? "bg-gray-100 text-gray-500"
                                          : "bg-orange-100 text-orange-700"
                                      }`}
                                    >
                                      {allDone
                                        ? "All done ✓"
                                        : noneStarted
                                        ? "Not started"
                                        : `${info.done}/${info.total} done`}
                                    </span>
                                  )}
                                </div>

                                {info.names.length > 0 && (
                                  <div
                                    className={`pl-4 text-[11px] leading-snug ${
                                      isCurrent ? "text-gray-700" : "text-gray-400"
                                    }`}
                                  >
                                    {info.names.join(", ")}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </td>

                  <td className="border p-2">
                    {DateTime.fromJSDate(new Date(job.createdAt)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a")}
                  </td>
                  <td className="border p-2">{job.client_name}</td>
                  <td className="border p-2 text-center">
                    {job.item_count || 0}
                    {job.item_count > 0 && (
                      <button onClick={() => setItemSidebarJobNo(job.job_no)}
                        className="ml-2 text-blue-600 hover:underline text-xs">View</button>
                    )}
                  </td>
                  <td className="border p-2 font-semibold text-blue-600">
                    <span className="bg-yellow-300 text-blue-900 rounded-md font-bold p-1">
                      {job.delivery_date
                        ? DateTime.fromJSDate(new Date(job.delivery_date)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a")
                        : "—"}
                    </span>
                  </td>
                  <td className="border p-2">
                    {job.delivery_location?.replace(/_/g, " ")}
                    {job.delivery_address && (
                      <div className="text-[11px] text-gray-500 italic mt-1">{job.delivery_address}</div>
                    )}
                  </td>
                  <td className="border p-2"><StageChip value={job.status} /></td>
                  <td className="border p-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      job.task_priority === "Urgent" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {job.task_priority}
                    </span>
                  </td>
                  <td className="border p-2">{job.order_handled_by}</td>
                  <td className="border p-2">{job.execution_location}</td>
                  <td className="border p-2 text-center">{job.no_of_files}</td>
                  <td className="border p-2">
                    {job.job_completion_deadline
                      ? DateTime.fromJSDate(new Date(job.job_completion_deadline)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a")
                      : "—"}
                  </td>
                  <td className="border p-2 sticky right-0 bg-inherit group-hover:bg-blue-50 z-10 text-center">
                    <button onClick={() => setActiveJob(job)}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm">
                      Update Stage
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columnCount} className="text-center py-4 text-gray-500">No jobs found</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="sticky bottom-0 left-0 right-0 bg-gray-50 border-t border-gray-300 p-3 flex justify-between items-center z-30 shadow-md">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Rows:</label>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="border rounded-md p-1 text-sm">
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button disabled={page === 1} onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-100">⬅ Prev</button>
            <span className="text-gray-700">Page {page} of {totalPages}</span>
            <button disabled={page === totalPages || totalJobs === 0} onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-100">Next ➡</button>
          </div>
        </div>
      </div>

      {activeJob && (
        <AdvanceStageModal job={activeJob} onClose={() => setActiveJob(null)} onSuccess={fetchJobs} />
      )}
      <JobItemsSidebar jobNo={itemSidebarJobNo} onClose={() => setItemSidebarJobNo(null)} />
    </div>
  );
}
