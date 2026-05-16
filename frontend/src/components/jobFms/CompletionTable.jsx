import React, { useEffect, useState, useCallback } from "react";
import api from "../../lib/api.js";
import { DateTime } from "luxon";
import JobItemsSidebar from "./commonDashboard/JobItemsSidebar.jsx";
import CompleteJobModal from "./production/CompleteJobModal.jsx";

export default function CompletionTable() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [itemSidebarJobNo, setItemSidebarJobNo] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalJobs, setTotalJobs] = useState(0);
  const totalPages = totalJobs > 0 ? Math.ceil(totalJobs / limit) : 1;

  const fetchJobs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await api.get("/api/fms/production/completion-list", { params: { page, limit } });
      setJobs(data.data);
      setTotalJobs(data.total || 0);
    } catch (err) {
      console.error("Failed:", err);
      setError("Failed to load delivered jobs.");
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

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

  const columnCount = 9;

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
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-emerald-700">✅ Completion</h2>
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
          <span className="text-xs text-emerald-700 font-medium">Pending Completion</span>
          <span className="text-sm font-bold text-emerald-800">{totalJobs}</span>
        </div>
      </div>

      <div className="relative overflow-auto border rounded-lg shadow max-h-[75vh]">
        <table className={loading ? "opacity-50 pointer-events-none" : "min-w-[1600px] text-xs border-collapse border border-gray-300 table-fixed"}>
          <thead className="sticky top-0 z-30 bg-gradient-to-r from-emerald-700 to-emerald-600 text-white shadow-sm">
            <tr>
              <th className="border p-2 sticky left-0 bg-emerald-800 z-40 text-center font-semibold w-[80px]">Job No</th>
              <th className="border p-2 w-[200px]">Client</th>
              <th className="border p-2 w-[100px]">Items</th>
              <th className="border p-2 w-[200px]">Delivery Type</th>
              <th className="border p-2 w-[170px]">Delivered On</th>
              <th className="border p-2 w-[180px]">Delivery Persons</th>
              <th className="border p-2 w-[150px]">Order Handled By</th>
              <th className="border p-2 w-[100px]">Priority</th>
              <th className="border p-2 sticky right-0 bg-emerald-800 z-40 w-[150px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columnCount} className="text-center py-6">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-700"></div>
                  </div>
                </td>
              </tr>
            ) : jobs.length > 0 ? (
              jobs.map((job, index) => {
                const isPickup = job.delivery_location?.endsWith("_PICKUP");
                return (
                  <tr key={job.job_no}
                    className={`group border-b ${index % 2 === 0 ? "bg-white" : "bg-slate-100"} hover:bg-emerald-50`}>
                    <td className="border p-2 sticky left-0 group-hover:bg-emerald-50 bg-inherit z-20 text-center font-bold text-emerald-700">{job.job_no}</td>
                    <td className="border p-2">{job.client_name}</td>
                    <td className="border p-2 text-center">
                      {job.item_count || 0}
                      {job.item_count > 0 && (
                        <button onClick={() => setItemSidebarJobNo(job.job_no)}
                          className="ml-2 text-blue-600 hover:underline text-xs">View</button>
                      )}
                    </td>
                    <td className="border p-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        isPickup ? "bg-amber-100 text-amber-800" : "bg-cyan-100 text-cyan-800"
                      }`}>
                        {isPickup ? "🚶 Pickup" : "🚚 Shipment"}
                      </span>
                      <div className="text-[11px] text-gray-500 mt-1">{job.delivery_location?.replace(/_/g, " ")}</div>
                    </td>
                    <td className="border p-2">
                      {job.delivered_at
                        ? DateTime.fromJSDate(new Date(job.delivered_at)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a")
                        : "—"}
                    </td>
                    <td className="border p-2">
                      {job.delivery_persons_name || (isPickup ? <span className="text-gray-400 italic">N/A (Pickup)</span> : "—")}
                    </td>
                    <td className="border p-2">{job.order_handled_by}</td>
                    <td className="border p-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        job.task_priority === "Urgent" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {job.task_priority}
                      </span>
                    </td>
                    <td className="border p-2 sticky right-0 bg-inherit group-hover:bg-emerald-50 z-10 text-center">
                      <button onClick={() => setActiveJob(job)}
                        className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm">
                        Complete Job
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={columnCount} className="text-center py-4 text-gray-500">No delivered jobs awaiting completion.</td>
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

      {activeJob && <CompleteJobModal job={activeJob} onClose={() => setActiveJob(null)} onSuccess={fetchJobs} />}
      <JobItemsSidebar jobNo={itemSidebarJobNo} onClose={() => setItemSidebarJobNo(null)} />
    </div>
  );
}