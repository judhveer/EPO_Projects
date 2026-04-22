import React, { useEffect, useState } from "react";
import api from "../../lib/api.js";
import Button from "../../components/salesPipeline/Button.jsx";
import JobCardForm from "../jobFms/JobCardForm.jsx"; // 👈 Import your form component
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { DateTime } from "luxon";
import JobItemsSidebar from "../../components/jobFms/commonDashboard/JobItemsSidebar";
import DashboardFilters from "./commonDashboard/DashboardFilters.jsx";

export default function JobWriterTable() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null); // 👈 For modal
  const [showModal, setShowModal] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(null); // store job to cancel
  const [cancelling, setCancelling] = useState(false);
  const [openActionDropdown, setOpenActionDropdown] = useState(null);

  const [itemSidebarJobNo, setItemSidebarJobNo] = useState(null);
  // CRM Users
  const [crmUsers, setCrmUsers] = useState([]);

  // 📄 Pagination & Sorting
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalJobs, setTotalJobs] = useState(0);

  const paginatedJobs = jobs; // backend already paginated
  const totalPages = Math.ceil(totalJobs / limit);

  // 🔹 Filters (backend-driven)
  const [filters, setFilters] = useState({
    search: "",
    order_type: "",
    order_handled_by: "",
    execution_location: "",
    payment_status: "",
    status: "",
    is_direct_to_production: "",
    // client_type: "",
    delivery_range: "",
    delivery_from: "",
    delivery_to: "",
    created_range: "",
    created_from: "",
    created_to: "",
  });

  const cleanFilters = Object.fromEntries(
    Object.entries(filters).filter(([_, v]) => v !== "" && v !== null),
  );

  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  // Fetch jobs (backend pagination)
  const fetchJobs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/fms/jobcards", {
        params: {
          page,
          limit,
          ...cleanFilters,
          search: debouncedSearch,
        },
      });
      setJobs(data.data);
      setTotalJobs(data.total || jobs.length || 0);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  // fetch crms
  const fetchCrmUsers = async () => {
    try {
      const { data } = await api.get("/api/users/crm");
      setCrmUsers(data);
    } catch (err) {
      console.error("Failed to fetch CRM users", err);
    }
  };

  useEffect(() => {
    fetchJobs();
    setItemSidebarJobNo(null);
  }, [
    page,
    limit,
    debouncedSearch,
    filters.status,
    filters.order_type,
    filters.order_handled_by,
    filters.execution_location,
    filters.payment_status,
    filters.is_direct_to_production,
    filters.delivery_from,
    filters.delivery_to,
    filters.created_from,
    filters.created_to,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300); // 300ms is ideal for dashboards

    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    fetchCrmUsers();
  }, []);

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

  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape") {
        // Close edit modal (if open)
        if (showModal) handleCloseModal();
        // Close cancel confirmation (if open)
        if (confirmCancel) setConfirmCancel(null);
        // Close items side bar(if open)
        if (itemSidebarJobNo) setItemSidebarJobNo(null);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [showModal, confirmCancel, itemSidebarJobNo]);

  const handleEditClick = async (job) => {
    // 1️⃣ Fetch items for this job
    const { data: items } = await api.get(
      `/api/fms/common-dashboard/jobs/${job.job_no}/items`,
    );
    // 2️⃣ Create a NEW object (no mutation)
    const jobWithItems = {
      ...job,
      items, // 👈 EXACT key JobCardForm expects
    };
    setSelectedJob(jobWithItems);
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

  return (
    <div className="">
      {/* 🎛️ Filter Toggle Button */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-blue-700">
          📋 Job Writer Dashboard
        </h2>

        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
          <span className="text-xs text-blue-700 font-medium">Total Jobs</span>
          <span className="text-sm font-bold text-blue-800">{totalJobs}</span>
        </div>
      </div>

      {/* Filters */}
      <DashboardFilters
        filters={filters}
        setFilters={setFilters}
        resetPage={() => setPage(1)}
        crmUsers={crmUsers}
      />

      {/* ✅ Table */}
      <div className="relative overflow-auto border rounded-lg shadow max-h-[80vh]">
        <table
          className={
            loading
              ? "opacity-50 pointer-events-none"
              : "min-w-[4000px] max-w-[6000px] text-xs border-collapse border border-gray-300 table-fixed"
          }
        >
          <thead className="sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow-sm">
            <tr>
              <th className="border p-2 sticky left-0 bg-blue-800 z-40  text-center font-semibold">
                Job No
              </th>
              <th className="border p-2 min-w-[170px]"> Job Created On</th>
              <th className="border p-2">Client Name</th>
              <th className="border p-2">Items</th>
              <th className="border p-2">Client Type</th>
              <th className="border p-2">Order Type</th>
              <th className="border p-2">Order Source</th>
              <th className="border p-2">Address</th>
              <th className="border p-2">Contact</th>
              <th className="border p-2">Email</th>
              <th className="border p-2">Order Handled By</th>
              <th className="border p-2">Execution Location</th>
              <th className="border p-2 min-w-[170px]">Delivery Date</th>
              <th className="border p-2 max-w-[500px] ">Delivery Location</th>
              <th className="border p-2">Proof Date</th>
              <th className="border p-2">Priority</th>
              <th className="border p-2">Instructions</th>
              <th className="border p-2">No of Files</th>
              <th className="border p-2">Total Amount</th>
              <th className="border p-2">Advance</th>
              <th className="border p-2">Mode of Payment</th>
              <th className="border p-2">Payment Status</th>
              <th className="border p-2">Status</th>
              <th className="border p-2">Job Completion Deadline</th>
              <th className="border p-2 sticky right-0 bg-blue-800 z-40">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={25} className="text-center py-6 text-gray-500">
                  Loading jobs…
                </td>
              </tr>
            ) : paginatedJobs.length > 0 ? (
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
                    {DateTime.fromJSDate(new Date(job.createdAt))
                      .setZone("Asia/Kolkata")
                      .toFormat("dd LLL yyyy, hh:mm a")}
                  </td>
                  <td className="border p-2">{job.client_name}</td>

                  <td className="border p-2 text-center text-xs">
                    {job.item_count || 0} items
                    {job.item_count > 0 && (
                      <button
                        onClick={() => setItemSidebarJobNo(job.job_no)}
                        className="ml-2 text-blue-600 hover:text-blue-800 underline text-xs cursor-pointer"
                      >
                        View
                      </button>
                    )}
                  </td>
                  <td className="border p-2">{job.client_type}</td>
                  <td className="border p-2 ">{job.order_type}</td>
                  <td className="border p-2 ">{job.order_source}</td>
                  <td className="border p-2 ">{job.address}</td>
                  <td className="border p-2">{job.contact_number}</td>
                  <td className="border p-2">{job.email_id}</td>
                  <td className="border p-2">{job.order_handled_by}</td>
                  <td className="border p-2">{job.execution_location}</td>
                  <td className="border p-2 font-semibold text-blue-600 hover:text-white">
                    {/* {new Date(job.delivery_date).toLocaleString()} */}
                    {DateTime.fromJSDate(new Date(job.delivery_date))
                      .setZone("Asia/Kolkata")
                      .toFormat("dd LLL yyyy, hh:mm a")}
                  </td>
                  <td className="border-r border-gray-200 px-2  max-w-[500px]">
                    {job.delivery_location?.replace(/_/g, " ")}
                    {job.delivery_address && (
                      <div className=" text-[11px] text-gray-500 italic mt-1">
                        {job.delivery_address}
                      </div>
                    )}
                  </td>
                  <td className="border p-2 ">
                    {/* {new Date(job.proof_date).toLocaleDateString()} */}
                    {DateTime.fromJSDate(new Date(job.proof_date))
                      .setZone("Asia/Kolkata")
                      .toFormat("dd LLL yyyy")}
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
                  <td className="border p-2">{job.instructions}</td>
                  <td className="border p-2">{job.no_of_files}</td>
                  <td className="border p-2 font-semibold text-blue-700 hover:text-white">
                    {job.total_amount}
                  </td>
                  <td className="border p-2">{job.advance_payment}</td>
                  <td className="border p-2">{job.mode_of_payment}</td>
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
                    {DateTime.fromJSDate(new Date(job.job_completion_deadline))
                      .setZone("Asia/Kolkata")
                      .toFormat("dd LLL yyyy, hh:mm a")}
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
                              : { job_no: job.job_no, rect },
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
                                setConfirmCancel(job);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-yellow-100 hover:text-yellow-700 transition-all flex items-center gap-2"
                            >
                              🚫 Cancel
                            </button>
                          </motion.div>
                        </AnimatePresence>,
                        document.body,
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
                        `/api/fms/jobcards/${confirmCancel.job_no}/cancel`,
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

      <JobItemsSidebar
        jobNo={itemSidebarJobNo}
        onClose={() => setItemSidebarJobNo(null)}
      />
    </div>
  );
}
