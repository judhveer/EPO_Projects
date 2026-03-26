import React, { useEffect, useState } from "react";
import api from "../../lib/api.js";
import Button from "../../components/salesPipeline/Button.jsx";
import { motion, AnimatePresence } from "framer-motion";
import { DateTime } from "luxon";
import JobItemsSidebar from "../../components/jobFms/commonDashboard/JobItemsSidebar";
// import DashboardFilters from "./commonDashboard/DashboardFilters.jsx";

export default function ProductionTable() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmComplete, setConfirmComplete] = useState(null); // store job to complete
  const [completing, setCompleting] = useState(false);
  const [itemSidebarJobNo, setItemSidebarJobNo] = useState(null);

  // Pagination & Sorting
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalJobs, setTotalJobs] = useState(0);

  // Fix pagination when totalJobs = 0
  const totalPages = totalJobs > 0 ? Math.ceil(totalJobs / limit) : 1;

  // Fetch jobs
  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/api/fms/production", {
        params: { page, limit, },
      });
      setJobs(data.data);
      setTotalJobs(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
      setError("Failed to load jobs. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchJobs();
    // Don't reset sidebar on page/limit change – user might be viewing items
    // setItemSidebarJobNo(null);
  }, [ page, limit, ]);

  // Close modals on ESC
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape") {
        if (confirmComplete) setConfirmComplete(null);
        if (itemSidebarJobNo) setItemSidebarJobNo(null);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [confirmComplete, itemSidebarJobNo]);

  const handleMarkCompleted = async (job) => {
    setCompleting(true);
    try {
      await api.patch(`/api/fms/production/${job.job_no}/complete`);
      // Optimistic update: remove the completed job from list
      setJobs((prev) => prev.filter((j) => j.job_no !== job.job_no));
      setTotalJobs((prev) => prev - 1);

      setConfirmComplete(null);
      // fetchJobs(); // refresh table
    } catch (err) {
      console.error("Failed to mark job as completed:",err);
      alert("Error marking job as completed: " + (err?.response?.data?.message ?? "Unknown error"));
    } finally {
      setCompleting(false);
    }
  };

    // Column count (for colSpan)
  const columnCount = 17; // adjust as needed

  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        {error}
        <button
          onClick={fetchJobs}
          className="ml-2 text-blue-600 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-blue-700">
          🏭 Production Coordinator Dashboard
        </h2>
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
          <span className="text-xs text-blue-700 font-medium">Total Jobs</span>
          <span className="text-sm font-bold text-blue-800">{totalJobs}</span>
        </div>
      </div>

      {/* Table */}
      <div className="relative overflow-auto border rounded-lg shadow max-h-[80vh]">
        <table
          className={
            loading
              ? "opacity-50 pointer-events-none"
              : "min-w-[3000px] max-w-[5000px] text-xs border-collapse border border-gray-300 table-fixed"
          }
        >
          <thead className="sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow-sm">
            <tr>
              <th className="border p-2 sticky left-0 bg-blue-800 z-40 text-center font-semibold">
                Job No
              </th>
              <th className="border p-2">Job Created On</th>
              <th className="border p-2">Client Name</th>
              <th className="border p-2">Client Type</th>
              <th className="border p-2">Order Type</th>
              <th className="border p-2">Contact</th>
              <th className="border p-2">Order Handled By</th>
              <th className="border p-2">Execution Location</th>
              <th className="border p-2">Delivery Date</th>
              <th className="border p-2 max-w-[500px]">Delivery Location</th>
              <th className="border p-2">Priority</th>
              <th className="border p-2">Instructions</th>
              <th className="border p-2">No of Files</th>
              <th className="border p-2">Status</th>
              <th className="border p-2">Job Completion Deadline</th>
              <th className="border p-2">Items</th>
              <th className="border p-2 sticky right-0 bg-blue-800 z-40">
                Stage Update
              </th>
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
                <tr
                  key={job.job_no}
                  className={`group border-b transition-all duration-200 ${
                    index % 2 === 0 ? "bg-white" : "bg-slate-300"
                  } hover:bg-blue-500 hover:text-white`}
                >
                  <td className="border p-2 sticky left-0 group-hover:bg-blue-500 bg-white z-20 text-center font-bold text-blue-700 group-hover:text-white">
                    {job.job_no}
                  </td>
                  <td className="border p-2 group-hover:text-white">
                    {DateTime.fromJSDate(new Date (job.createdAt))
                      .setZone("Asia/Kolkata")
                      .toFormat("dd LLL yyyy, hh:mm a")}
                  </td>
                  <td className="border p-2 group-hover:text-white">{job.client_name}</td>
                  <td className="border p-2 group-hover:text-white">{job.client_type}</td>
                  <td className="border p-2 group-hover:text-white">{job.order_type}</td>
                  <td className="border p-2 group-hover:text-white">{job.contact_number}</td>
                  <td className="border p-2 group-hover:text-white">{job.order_handled_by}</td>
                  <td className="border p-2 group-hover:text-white">{job.execution_location}</td>
                  <td className="border p-2 font-semibold text-blue-600 group-hover:text-white">
                    {DateTime.fromJSDate(new Date(job.delivery_date))
                      .setZone("Asia/Kolkata")
                      .toFormat("dd LLL yyyy, hh:mm a")}
                  </td>
                  <td className="border-r border-gray-200 px-2 max-w-[500px] group-hover:text-white">
                    {job.delivery_location?.replace(/_/g, " ")}
                    {job.delivery_address && (
                      <div className="text-[11px] text-gray-500 italic mt-1 group-hover:text-white">
                        {job.delivery_address}
                      </div>
                    )}
                  </td>
                  <td className="border p-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        job.task_priority === "Urgent"
                          ? "bg-red-100 text-red-700 group-hover:bg-red-200 group-hover:text-red-800"
                          : "bg-yellow-100 text-yellow-700 group-hover:bg-yellow-200 group-hover:text-yellow-800"
                      }`}
                    >
                      {job.task_priority}
                    </span>
                  </td>
                  <td className="border p-2 group-hover:text-white">{job.instructions}</td>
                  <td className="border p-2 group-hover:text-white">{job.no_of_files}</td>
                  <td className="border p-2">
<span
                      className={`px-2 py-1 rounded-md text-xs font-semibold ${
                        job.status === "completed"
                          ? "bg-blue-100 text-blue-700 group-hover:bg-blue-200 group-hover:text-blue-800"
                          : job.status === "cancelled"
                          ? "bg-gray-300 text-gray-600 group-hover:bg-gray-400 group-hover:text-gray-800"
                          : "bg-blue-100 text-blue-700 group-hover:bg-blue-200 group-hover:text-blue-800"
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="border p-2 group-hover:text-white">
                    {DateTime.fromJSDate(new Date(job.job_completion_deadline))
                      .setZone("Asia/Kolkata")
                      .toFormat("dd LLL yyyy, hh:mm a")}
                  </td>

                  <td className="border p-2 text-center text-xs group-hover:text-white">
                    {job.item_count || 0} items
                    {job.item_count > 0 && (
                      <button
                        onClick={() => setItemSidebarJobNo(job.job_no)}
                        className="ml-2 text-blue-600 hover:text-blue-800 underline text-xs cursor-pointer group-hover:text-white"
                      >
                        View
                      </button>
                    )}
                  </td>

                  {/* Simplified Actions: Single Mark Completed Button */}
      <td className="border p-2 sticky right-0 bg-white group-hover:bg-blue-500 z-10 text-center">
                    {job.status === "completed" || job.status === "cancelled" ? (
                      <button
                        disabled
                        className="px-3 py-1 rounded-md text-xs font-semibold bg-gray-400 text-white cursor-not-allowed"
                      >
                        {job.status === "completed" ? "Completed" : "Cancelled"}
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmComplete(job)}
                        className="px-3 py-1 rounded-md text-xs font-semibold shadow-sm transition-all bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Mark Completed
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columnCount} className="text-center py-4 text-gray-500">
                  No jobs found
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Sticky Pagination Controls */}
        <div className="sticky bottom-0 left-0 right-0 bg-gray-50 backdrop-blur-sm border-t border-gray-300 p-3 flex justify-between items-center z-30 shadow-md">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Rows per page:</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="border rounded-md p-1 text-sm"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
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
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page === totalPages || totalJobs === 0}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-100"
            >
              Next ➡
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Mark as Completed */}
      <AnimatePresence>
        {confirmComplete && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-md p-6 text-center"
            >
              <h3 className="text-xl font-semibold text-blue-600 mb-2">
                Mark as Completed
              </h3>
              <p className="text-slate-600 mb-4">
                Are you sure you want to mark{" "}
                <span className="font-semibold text-blue-700">
                  Job #{confirmComplete.job_no}
                </span>{" "}
                as <strong>Completed</strong>?
                <br />
                This action cannot be undone.
              </p>

              <div className="flex justify-center gap-3">
                <Button
                  className="bg-gray-500 hover:bg-gray-600 cursor-pointer"
                  onClick={() => setConfirmComplete(null)}
                >
                  No
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 cursor-pointer"
                  onClick={() => handleMarkCompleted(confirmComplete)}
                  disabled={completing}
                >
                  {completing ? "Processing..." : "Yes, Complete it!"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Items Sidebar */}
      <JobItemsSidebar
        jobNo={itemSidebarJobNo}
        onClose={() => setItemSidebarJobNo(null)}
      />
    </div>
  );
}

