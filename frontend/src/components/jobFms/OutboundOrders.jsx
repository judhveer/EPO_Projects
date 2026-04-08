import React, { useEffect, useState } from "react";
import api from "../../lib/api.js";
import { DateTime } from "luxon";
import JobItemsSidebar from "./commonDashboard/JobItemsSidebar.jsx";

export default function OutboundOrders({ refresh }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedJobNo, setSelectedJobNo] = useState(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalJobs, setTotalJobs] = useState(0);

  const startIdx = (page - 1) * limit;
  const paginatedJobs = jobs.slice(startIdx, startIdx + limit);
  const totalPages = Math.ceil(jobs.length / limit);

  // Close dropdown on outside click / scroll
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest(".action-dropdown")) {
        // nothing to close yet, kept for future actions
      }
    };
    const handleScroll = () => {};
    window.addEventListener("click", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("click", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  const fetchJobs = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await api.get("/api/fms/outbound/jobs");
      const jobCards = res.data.data || [];
      setJobs(jobCards);
      setTotalJobs(res.data.total || jobCards.length);
    } catch (e) {
      console.error("Failed to fetch outbound jobs:", e);
      setErr("Failed to load outbound jobs. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [refresh]);

  if (loading)
    return (
      <div className="text-center py-10 text-slate-600 text-lg">
        Loading outbound jobs...
      </div>
    );

  return (
    <div>
      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">
          {err}
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-blue-700">
          🚚 Outbound Orders
        </h2>
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
          <span className="text-xs text-blue-700 font-medium">
            Total Outbound Jobs:
          </span>
          <span className="text-sm font-bold text-blue-800">{totalJobs}</span>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block relative overflow-auto border rounded-lg shadow max-h-[80vh]">
        <table className="min-w-[2000px] text-[11px] sm:text-xs border-collapse border border-gray-300 table-fixed">
          <thead className="sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow-sm">
            <tr>
              {/* Sticky left */}
              <th className="border p-1 sm:p-2 sticky left-0 bg-blue-800 z-40 text-center font-semibold min-w-[90px] shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                Job No
              </th>
              <th className="border p-1 sm:p-2 min-w-[150px]">Job Created On</th>
              <th className="border p-1 sm:p-2 min-w-[140px]">Client Name</th>
              <th className="border p-1 sm:p-2 min-w-[130px]">Order Handled By</th>
              <th className="border p-1 sm:p-2 min-w-[160px]">Delivery Date</th>
              <th className="border p-1 sm:p-2 min-w-[200px]">Delivery Location</th>
              <th className="border p-1 sm:p-2 min-w-[80px] text-center">Priority</th>
              <th className="border p-1 sm:p-2 min-w-[180px]">Instructions</th>
              <th className="border p-1 sm:p-2 min-w-[40px]">Files</th>
              <th className="border p-1 sm:p-2 min-w-[160px]">Completion Deadline</th>
              <th className="border p-1 sm:p-2 min-w-[150px]">Status</th>
              <th className="border p-1 sm:p-2 min-w-[80px]">Items</th>
              {/* Outbound-specific — sticky right group */}
              <th className="border p-1 sm:p-2 bg-blue-800 sticky right-[320px] min-w-[140px] z-50 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                Outbound Sent To
              </th>
              <th className="border p-1 sm:p-2 bg-blue-800 sticky right-[160px] min-w-[160px] z-50 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                Paper Ordered From
              </th>
              <th className="border p-1 sm:p-2 bg-blue-800 sticky right-0 min-w-[160px] z-50 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                Receiving Date (MM)
              </th>
            </tr>
          </thead>

          <tbody>
            {paginatedJobs.length > 0 ? (
              paginatedJobs.map((job, index) => (
                <tr
                  key={job.job_no}
                  className={`group border-b transition-all duration-200 ${
                    index % 2 === 0 ? "bg-white" : "bg-slate-50"
                  } hover:bg-blue-500 hover:text-white`}
                >
                  {/* Sticky left: Job No */}
                  <td className="border p-1 sm:p-2 sticky left-0 bg-white z-20 text-center font-bold text-blue-700 group-hover:bg-blue-500 group-hover:text-white shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                    {job.job_no}
                  </td>

                  <td className="border p-1 sm:p-2">
                    {job.createdAt
                      ? DateTime.fromJSDate(new Date(job.createdAt))
                          .setZone("Asia/Kolkata")
                          .toFormat("dd LLL yyyy, hh:mm a")
                      : "—"}
                  </td>

                  <td className="border p-1 sm:p-2">{job.client_name}</td>
                  <td className="border p-1 sm:p-2">{job.order_handled_by}</td>

                  <td className="border p-1 sm:p-2 font-semibold text-blue-600 group-hover:text-white">
                    {job.delivery_date
                      ? DateTime.fromJSDate(new Date(job.delivery_date))
                          .setZone("Asia/Kolkata")
                          .toFormat("dd LLL yyyy, hh:mm a")
                      : "—"}
                  </td>

                  <td className="border p-1 sm:p-2">
                    {job.delivery_location?.replace(/_/g, " ")}
                    {job.delivery_address && (
                      <div className="text-[11px] text-gray-500 italic mt-1 group-hover:text-blue-100">
                        {job.delivery_address}
                      </div>
                    )}
                  </td>

                  <td className="border p-1 sm:p-2 text-center">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        job.task_priority === "Urgent"
                          ? "bg-red-100 text-red-700"
                          : job.task_priority === "High"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {job.task_priority}
                    </span>
                  </td>

                  <td className="border p-1 sm:p-2">{job.instructions || "—"}</td>
                  <td className="border p-1 sm:p-2 text-center">{job.no_of_files ?? "—"}</td>

                  <td className="border p-1 sm:p-2">
                    {job.job_completion_deadline
                      ? DateTime.fromJSDate(new Date(job.job_completion_deadline))
                          .setZone("Asia/Kolkata")
                          .toFormat("dd LLL yyyy, hh:mm a")
                      : "Not Set"}
                  </td>

                  <td className="border p-1 sm:p-2 text-center">{job.status ?? "—"}</td>

                  <td className="border p-1 sm:p-2 text-center text-gray-500 text-xs italic group-hover:text-white">
                    {job.item_count || 0} items{" "}
                    {job.item_count > 0 && (
                      <button
                        onClick={() => setSelectedJobNo(job.job_no)}
                        className="ml-1 text-blue-600 group-hover:text-white underline text-xs cursor-pointer"
                      >
                        View
                      </button>
                    )}
                  </td>

                  {/* Outbound-specific sticky right cells */}
                  <td className="border p-1 sm:p-2 sticky right-[320px] bg-white z-20 min-w-[140px] group-hover:bg-blue-500 group-hover:text-white shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                    {job.outbound_sent_to || (
                      <span className="text-gray-400 italic">Not set</span>
                    )}
                  </td>

                  <td className="border p-1 sm:p-2 sticky right-[160px] bg-white z-20 min-w-[160px] group-hover:bg-blue-500 group-hover:text-white shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                    {job.paper_ordered_from || (
                      <span className="text-gray-400 italic">Not set</span>
                    )}
                  </td>

                  <td className="border p-1 sm:p-2 sticky right-0 bg-white z-20 min-w-[160px] group-hover:bg-blue-500 group-hover:text-white shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                    {job.receiving_date_for_mm
                      ? DateTime.fromJSDate(new Date(job.receiving_date_for_mm))
                          .setZone("Asia/Kolkata")
                          .toFormat("dd LLL yyyy")
                      : <span className="text-gray-400 italic">Not set</span>}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="16" className="text-center py-8 text-gray-500">
                  No outbound jobs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="sticky bottom-0 left-0 right-0 bg-gray-50 border-t border-gray-300 p-3 flex justify-between items-center z-30 shadow-md">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Rows per page:</label>
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className="border rounded-md p-1 text-sm"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-100"
            >
              ⬅ Prev
            </button>
            <span className="text-gray-700">
              Page {page} of {totalPages || 1}
            </span>
            <button
              disabled={page === totalPages || totalPages === 0}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-100"
            >
              Next ➡
            </button>
          </div>
        </div>
      </div>

      {/* Mobile View */}
      <div className="md:hidden space-y-4">
        {paginatedJobs.map((job) => (
          <div
            key={job.job_no}
            className="border rounded-xl p-4 shadow bg-white space-y-2"
          >
            <div className="flex justify-between items-center">
              <span className="font-bold text-blue-700">Job #{job.job_no}</span>
              <span className="text-xs text-gray-500">
                {job.createdAt
                  ? new Date(job.createdAt).toLocaleDateString()
                  : "—"}
              </span>
            </div>
            <div className="text-sm"><b>Client:</b> {job.client_name}</div>
            <div className="text-sm"><b>Order Type:</b> {job.order_type}</div>
            <div className="text-sm">
              <b>Delivery:</b>{" "}
              {job.delivery_date
                ? new Date(job.delivery_date).toLocaleDateString()
                : "—"}
            </div>
            <div className="text-sm">
              <b>Items:</b> {job.item_count || 0}
            </div>
            <div className="border-t pt-2 mt-1 space-y-1">
              <div className="text-sm">
                <b>Sent To:</b> {job.outbound_sent_to || <span className="text-gray-400 italic">Not set</span>}
              </div>
              <div className="text-sm">
                <b>Paper From:</b> {job.paper_ordered_from || <span className="text-gray-400 italic">Not set</span>}
              </div>
              <div className="text-sm">
                <b>Receiving Date (MM):</b>{" "}
                {job.receiving_date_for_mm
                  ? new Date(job.receiving_date_for_mm).toLocaleDateString()
                  : <span className="text-gray-400 italic">Not set</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <JobItemsSidebar
        jobNo={selectedJobNo}
        onClose={() => setSelectedJobNo(null)}
        viewMode="outbound"
      />
    </div>
  );
}