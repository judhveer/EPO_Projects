import React, { useEffect, useState, useMemo } from "react";
import api from "../../lib/api.js";
import Button from "../../components/salesPipeline/Button.jsx";
import JobCardForm from "../jobFms/JobCardForm.jsx"; // 👈 Import your form component
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";



export default function JobWriterTable({ refresh }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null); // 👈 For modal
  const [showModal, setShowModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // store job to delete
  const [deleting, setDeleting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(null); // store job to delete
  const [cancelling, setCancelling] = useState(false);
  const [openActionDropdown, setOpenActionDropdown] = useState(null);

  useEffect(() => {
  if (!openActionDropdown) return;

  const handleClickOutside = (e) => {
    // Close if clicking outside of any dropdown or button
    if (!e.target.closest(".action-dropdown")) {
      setOpenActionDropdown(null);
    }
  };

  const handleScroll = () => {
    // Close on scroll (for any scrollable parent)
    setOpenActionDropdown(null);
  };

  window.addEventListener("click", handleClickOutside);
  window.addEventListener("scroll", handleScroll, true); // true = capture phase (detects scrolls inside nested containers)

  return () => {
    window.removeEventListener("click", handleClickOutside);
    window.removeEventListener("scroll", handleScroll, true);
  };
}, [openActionDropdown]);



  const [showItemsPanel, setShowItemsPanel] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedJobNo, setSelectedJobNo] = useState(null);
  // 🎛️ Filter Panel Visibility
  const [showFilters, setShowFilters] = useState(false);

  // 🔍 Filters & Search
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    client_type: "",
    order_type: "",
    order_source: "",
    order_handled_by: "",
    execution_location: "",
    deliveryStart: "",
    deliveryEnd: "",
    createdStart: "",
    createdEnd: "",
  });

  // 📄 Pagination & Sorting
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState("asc");

  const filteredJobs = useMemo(() => {
    return jobs
      .filter((job) => {
        // 🔍 Global search
        const searchLower = search.toLowerCase();
        if (
          search &&
          !Object.values(job).join(" ").toLowerCase().includes(searchLower)
        ) {
          return false;
        }

        // 🎯 Dropdown filters
        for (const key of [
          "client_type",
          "order_type",
          "order_source",
          "order_handled_by",
          "execution_location",
        ]) {
          if (filters[key] && job[key] !== filters[key]) return false;
        }

        // 📅 Date range filters
        const created = new Date(job.createdAt);
        const delivery = new Date(job.delivery_date);

        if (filters.createdStart && created < new Date(filters.createdStart))
          return false;
        if (filters.createdEnd && created > new Date(filters.createdEnd))
          return false;

        if (filters.deliveryStart && delivery < new Date(filters.deliveryStart))
          return false;
        if (filters.deliveryEnd && delivery > new Date(filters.deliveryEnd))
          return false;

        return true;
      })
      .sort((a, b) => {
        if (!sortField) return 0;
        const valA = a[sortField] ?? "";
        const valB = b[sortField] ?? "";
        if (sortDir === "asc") return valA > valB ? 1 : -1;
        return valA < valB ? 1 : -1;
      });
  }, [jobs, search, filters, sortField, sortDir]);

  const startIdx = (page - 1) * limit;
  const endIdx = startIdx + limit;
  const paginatedJobs = filteredJobs.slice(startIdx, endIdx);
  const totalPages = Math.ceil(filteredJobs.length / limit);

  // ✅ Fetch jobs
  const fetchJobs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/fms/jobcards");
      setJobs(Array.isArray(data) ? data : data.data || data.jobCards || []);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [refresh]);

  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape") {
        // Close edit modal (if open)
        if (showModal) handleCloseModal();

        // Close delete confirmation (if open)
        if (confirmDelete) setConfirmDelete(null);

        // Close cancel confirmation (if open)
        if (confirmCancel) setConfirmCancel(null);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [showModal, confirmDelete, confirmCancel]);

  const handleEditClick = (job) => {
    setSelectedJob(job);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedJob(null);
  };

  const handleJobUpdated = () => {
    handleCloseModal();
    fetchJobs(); // refresh table
  };

  const handleViewItems = (job) => {
    if (showItemsPanel && selectedJobNo === job.job_no) {
      // Close if already open for same job
      setShowItemsPanel(false);
      setSelectedItems([]);
      setSelectedJobNo(null);
    } else {
      // Open panel for new job
      setSelectedItems(job.items || []);
      setSelectedJobNo(job.job_no);
      setShowItemsPanel(true);
    }
  };

  if (loading)
    return (
      <div className="text-center py-10 text-slate-600 text-lg">
        Loading job cards...
      </div>
    );

  return (
    <div className="">
      {/* 🎛️ Filter Toggle Button */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-blue-700">
          📋 Job Writer Dashboard
        </h2>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition"
        >
          {showFilters ? "Hide Filters ▲" : "Show Filters ▼"}
        </button>
      </div>

      {/* 🔍 Collapsible Filter Section */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-slate-100 rounded-lg shadow mb-4">
              <div className="flex flex-wrap gap-3 items-center">
                <input
                  type="text"
                  placeholder="🔍 Search all columns..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border rounded-md p-2 w-64"
                />

                {/* Dropdown Filters */}
                {[
                  { key: "client_type", label: "Client Type" },
                  { key: "order_type", label: "Order Type" },
                  { key: "order_source", label: "Order Source" },
                  { key: "order_handled_by", label: "Order Handled By" },
                  { key: "execution_location", label: "Execution Location" },
                ].map(({ key, label }) => (
                  <select
                    key={key}
                    value={filters[key]}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, [key]: e.target.value }))
                    }
                    className="border rounded-md p-2 bg-white"
                  >
                    <option value="">{label}</option>
                    {[...new Set(jobs.map((j) => j[key]).filter(Boolean))].map(
                      (opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      )
                    )}
                  </select>
                ))}

                {/* Date Range Filters */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Created:</label>
                  <input
                    type="date"
                    value={filters.createdStart}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        createdStart: e.target.value,
                      }))
                    }
                    className="border rounded-md p-2"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={filters.createdEnd}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, createdEnd: e.target.value }))
                    }
                    className="border rounded-md p-2"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Delivery:</label>
                  <input
                    type="date"
                    value={filters.deliveryStart}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        deliveryStart: e.target.value,
                      }))
                    }
                    className="border rounded-md p-2"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={filters.deliveryEnd}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, deliveryEnd: e.target.value }))
                    }
                    className="border rounded-md p-2"
                  />
                </div>

                {/* Sorting */}
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value)}
                  className="border rounded-md p-2 bg-white"
                >
                  <option value="">Sort By...</option>
                  <option value="client_name">Client Name</option>
                  <option value="createdAt">Created Date</option>
                  <option value="delivery_date">Delivery Date</option>
                  <option value="order_type">Order Type</option>
                </select>

                <select
                  value={sortDir}
                  onChange={(e) => setSortDir(e.target.value)}
                  className="border rounded-md p-2 bg-white"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>

                {/* Reset Button */}
                <button
                  className="px-3 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  onClick={() => {
                    setFilters({
                      client_type: "",
                      order_type: "",
                      order_source: "",
                      order_handled_by: "",
                      execution_location: "",
                      deliveryStart: "",
                      deliveryEnd: "",
                      createdStart: "",
                      createdEnd: "",
                    });
                    setSearch("");
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ✅ Table */}
      <div className="relative overflow-auto border rounded-lg shadow max-h-[80vh]">
        <table className="min-w-[4000px] max-w-[6000px] text-xs border-collapse border border-gray-300 table-fixed">
          <thead className="sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow-sm">
            <tr>
              <th className="border p-2 sticky left-0 bg-blue-800 z-40  text-center font-semibold">
                Job No
              </th>
              <th className="border p-2"> Job Created On</th>
              <th className="border p-2">Client Name</th>
              <th className="border p-2">Client Type</th>
              <th className="border p-2">Order Type</th>
              <th className="border p-2">Order Source</th>
              <th className="border p-2">Address</th>
              <th className="border p-2">Contact</th>
              <th className="border p-2">Email</th>
              <th className="border p-2">Order Handled By</th>
              <th className="border p-2">Execution Location</th>
              <th className="border p-2">Delivery Date</th>
              <th className="border p-2 max-w-[500px] ">Delivery Location</th>
              <th className="border p-2">Proof Date</th>
              <th className="border p-2">Priority</th>
              <th className="border p-2">Instructions</th>
              <th className="border p-2">No of Files</th>
              <th className="border p-2">Unit Rate</th>
              <th className="border p-2">Total Amount</th>
              <th className="border p-2">Advance</th>
              <th className="border p-2">Mode of Payment</th>
              <th className="border p-2">Payment Status</th>
              <th className="border p-2">Status</th>
              <th className="border p-2">Job Completion Deadline</th>
              <th className="border p-2">Items</th>
              <th className="border p-2 sticky right-0 bg-blue-800 z-40">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {paginatedJobs.length > 0 ? (
              paginatedJobs.map((job, index) => (
               <tr
  key={job.job_no}
  className={`border-b transition-all duration-200 ${
    index % 2 === 0 ? "bg-white" : "bg-slate-300"
  } hover:bg-blue-500 hover:text-white`}
>


                  <td className="border p-2 sticky left-0 bg-white z-20 text-center font-bold text-blue-700">
                    {job.job_no}
                  </td>
                  <td className="border p-2">
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                  <td className="border p-2">
                    {job.client_name}
                  </td>
                  <td className="border p-2">
                    {job.client_type}
                  </td>
                  <td className="border p-2 ">{job.order_type}</td>
                  <td className="border p-2 ">
                    {job.order_source}
                  </td>
                  <td className="border p-2 ">{job.address}</td>
                  <td className="border p-2">
                    {job.contact_number}
                  </td>
                  <td className="border p-2">{job.email_id}</td>
                  <td className="border p-2">
                    {job.order_handled_by}
                  </td>
                  <td className="border p-2">
                    {job.execution_location}
                  </td>
                  <td className="border p-2 font-semibold text-blue-600 hover:text-white">
                    {new Date(job.delivery_date).toLocaleString()}
                  </td>
                  <td className="border-r border-gray-200 px-2  max-w-[500px]">
                    {job.delivery_location}
                    {job.delivery_location === "Delivery Address" && (
                      <div className=" text-[11px] text-gray-500 italic mt-1">
                        {job.delivery_address}
                      </div>
                    )}
                  </td>
                  <td className="border p-2 ">
                    {new Date(job.proof_date).toLocaleDateString()}
                  </td>
                  <td className="border p-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        job.task_priority === "Urgent"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {job.task_priority}
                    </span>
                  </td>
                  <td className="border p-2">
                    {job.instructions}
                  </td>
                  <td className="border p-2">
                    {job.no_of_files}
                  </td>
                  <td className="border p-2">{job.unit_rate}</td>
                  <td className="border p-2 font-semibold text-blue-700 hover:text-white">
                    {job.total_amount}
                  </td>
                  <td className="border p-2">
                    {job.advance_payment}
                  </td>
                  <td className="border p-2">
                    {job.mode_of_payment}
                  </td>
                  <td className="border p-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        job.payment_status === "Paid"
                          ? "bg-green-100 text-green-700"
                          : job.payment_status === "Half Paid"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {job.payment_status}
                    </span>
                  </td>
                  <td className="border p-2">
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-semibold ${
                        job.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : job.status === "cancelled"
                          ? "bg-gray-300 text-gray-600"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="border p-2">
                    {new Date(job.job_completion_deadline).toLocaleString()}
                  </td>

                  <td className="border p-2 text-center text-gray-500 text-xs italic">
                    {job.items?.length || 0} items{" "}
                    {job.items?.length > 0 && (
                      <button
                        onClick={() => handleViewItems(job)}
                        className="ml-2 text-blue-600 hover:text-blue-800 underline text-xs cursor-pointer"
                      >
                        {showItemsPanel && selectedJobNo === job.job_no
                          ? "Hide"
                          : "View"}
                      </button>
                    )}
                  </td>

<td className="border p-2 sticky right-0 bg-white z-10 text-center relative action-dropdown">
  <div className="relative inline-block text-left action-dropdown">
    {/* Main button */}
    <button
      onClick={(e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setOpenActionDropdown(
          openActionDropdown &&
          openActionDropdown.job_no === job.job_no
            ? null
            : { job_no: job.job_no, rect }
        );
      }}
      className={`px-3 py-1 rounded-md text-xs font-semibold shadow-sm transition-all ${
        job.status === "cancelled"
          ? "bg-gray-400 text-white cursor-not-allowed"
          : "bg-blue-600 text-white hover:bg-blue-700"
      }`}
      disabled={job.status === "cancelled"}
    >
      {job.status === "cancelled" ? "Cancelled" : "Active ▾"}
    </button>
  </div>

  {/* Portal dropdown to body */}
  {openActionDropdown?.job_no === job.job_no &&
    job.status !== "cancelled" &&
    createPortal(
      <AnimatePresence>
        <motion.div
          key={job.job_no}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed bg-white border border-gray-200 rounded-xl shadow-2xl z-[99999] w-36 overflow-hidden action-dropdown"
          style={{
            top: `${openActionDropdown.rect.bottom}px`,
            left: `${openActionDropdown.rect.right - 200}px`,
          }}
        >
          <button
            onClick={() => {
              setOpenActionDropdown(null);
              handleEditClick(job);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-700 transition-all flex items-center gap-2"
          >
            ✏️ Edit
          </button>

          <button
            onClick={() => {
              setOpenActionDropdown(null);
              setConfirmDelete(job);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-red-100 hover:text-red-700 transition-all flex items-center gap-2"
          >
            🗑️ Delete
          </button>

          <button
            onClick={() => {
              setOpenActionDropdown(null);
              setConfirmCancel(job);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-yellow-100 hover:text-yellow-700 transition-all flex items-center gap-2"
          >
            🚫 Cancel
          </button>
        </motion.div>
      </AnimatePresence>,
      document.body
    )}
</td>



                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="15" className="text-center py-4 text-gray-500">
                  No jobs found
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 📄 Sticky Pagination Controls */}
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
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-100"
            >
              Next ➡
            </button>
          </div>
        </div>
      </div>

      {/* ✅ Edit Modal */}
      <AnimatePresence>
        {showModal && (
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
              className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-6xl h-[90vh] overflow-y-auto relative"
            >
              <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white z-10">
                <h3 className="text-xl font-semibold text-blue-700">
                  ✏️ Edit Job #{selectedJob.job_no}
                </h3>
                <button
                  onClick={handleCloseModal}
                  className="text-red-600 hover:text-red-800 text-3xl leading-none"
                >
                  &times;
                </button>
              </div>

              <div className="p-4">
                <JobCardForm
                  existingJob={selectedJob}
                  onUpdated={handleJobUpdated}
                  isEditMode
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🧾 Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDelete && (
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
              <h3 className="text-xl font-semibold text-red-600 mb-2">
                Confirm Deletion
              </h3>
              <p className="text-slate-600 mb-4">
                Are you sure you want to delete{" "}
                <span className="font-semibold text-blue-700">
                  Job #{confirmDelete.job_no}
                </span>
                ?<br />
                This action cannot be undone.
              </p>

              <div className="flex justify-center gap-3">
                <Button
                  className="bg-gray-500 hover:bg-gray-600 cursor-pointer"
                  onClick={() => setConfirmDelete(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 cursor-pointer"
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await api.delete(
                        `/api/fms/jobcards/${confirmDelete.job_no}`
                      );
                      setConfirmDelete(null);
                      fetchJobs();
                    } catch (err) {
                      console.error("Failed to delete job:", err);
                      alert("Error deleting job");
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmCancel && (
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
              <h3 className="text-xl font-semibold text-red-600 mb-2">
                Confirm Cancel
              </h3>
              <p className="text-slate-600 mb-4">
                Are you sure you want to Canel{" "}
                <span className="font-semibold text-blue-700">
                  Job #{confirmCancel.job_no}
                </span>
                ?<br />
                This action cannot be undone.
              </p>

              <div className="flex justify-center gap-3">
                <Button
                  className="bg-gray-500 hover:bg-gray-600 cursor-pointer"
                  onClick={() => setConfirmCancel(null)}
                >
                  No
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 cursor-pointer"
                  onClick={async () => {
                    setCancelling(true);
                    try {
                      await api.patch(
                        `/api/fms/jobcards/${confirmCancel.job_no}/cancel`
                      );
                      setConfirmCancel(null);
                      fetchJobs();
                    } catch (err) {
                      console.error("Failed to cancel job:", err);
                      alert("Error cancelling job");
                    } finally {
                      setCancelling(false);
                    }
                  }}
                  disabled={cancelling}
                >
                  {cancelling ? "Cancelling..." : "Yes. Cancel it!"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showItemsPanel && (
          <>
            {/* 🔹 Semi-transparent backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowItemsPanel(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 cursor-pointer"
            />

            {/* 🔹 Slide-in Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 180, damping: 22 }}
              className="fixed top-0 right-0 h-full w-[35%] bg-white shadow-2xl z-50 overflow-y-auto"
            >
              {/* Header */}
              <div className="sticky top-0 bg-blue-600 text-white flex justify-between items-center p-4">
                <h3 className="text-lg font-semibold">
                  🧾 Items for Job #{selectedJobNo}
                </h3>
                <button
                  onClick={() => setShowItemsPanel(false)}
                  className="text-white text-2xl hover:text-gray-200"
                >
                  &times;
                </button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-4">
                {selectedItems.length === 0 ? (
                  <p className="text-gray-500 text-sm">No items available.</p>
                ) : (
                  selectedItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="border rounded-xl p-4 shadow-sm bg-slate-50"
                    >
                      <h4 className="font-semibold text-blue-700 mb-1">
                        Item {index + 1}: {item.category}
                      </h4>

                      <p className="text-gray-700 mb-2">
                        <span className="font-medium">Enquiry For:</span>{" "}
                        {item.enquiry_for || "—"} |{" "}
                        <span className="font-medium">Size:</span>{" "}
                        {item.size || "—"} |{" "}
                        <span className="font-medium">Qty:</span>{" "}
                        {item.quantity || 0} {item.uom || ""}
                      </p>

                      {/* Category-specific options */}
                      {item.options && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                          {Object.entries(
                            item.options[item.category] || item.options
                          )
                            .filter(([_, val]) =>
                              Array.isArray(val)
                                ? val.length > 0
                                : val !== null && val !== "" && val !== 0
                            )
                            .map(([key, val]) => (
                              <div key={key} className="flex flex-col">
                                <span className="font-medium capitalize">
                                  {key.replaceAll("_", " ")}:
                                </span>
                                <span className="text-gray-700">
                                  {Array.isArray(val)
                                    ? val.join(", ")
                                    : val.toString()}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
