import React, { useEffect, useState } from "react";
import api from "../../lib/api.js";
import Button from "../../components/salesPipeline/Button.jsx";
import JobCardForm from "../jobFms/JobCardForm.jsx"; // 👈 Import your form component
import { motion, AnimatePresence } from "framer-motion";

export default function JobWriterTable({ refresh }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null); // 👈 For modal
  const [showModal, setShowModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // store job to delete
  const [deleting, setDeleting] = useState(false);

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
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [showModal, confirmDelete]);

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

  if (loading)
    return (
      <div className="text-center py-10 text-slate-600 text-lg">
        Loading job cards...
      </div>
    );

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold text-blue-700 mb-4">
        📋 Job Writer Dashboard
      </h2>

      {/* ✅ Table */}
      <div className="relative overflow-auto border rounded-lg shadow max-h-[80vh]">
        <table className="min-w-[2000px] w-full text-sm border-collapse border border-gray-300">
          <thead className="bg-blue-600 text-white sticky top-0 z-30">
            <tr>
              <th className="border p-2 sticky left-0 bg-blue-700 z-40">
                Job No
              </th>
              <th className="border p-2">Client Name</th>
              <th className="border p-2">Client Type</th>
              <th className="border p-2">Order Type</th>
              <th className="border p-2">Order Source</th>
              <th className="border p-2">Address</th>
              <th className="border p-2">Contact</th>
              <th className="border p-2">Email</th>
              <th className="border p-2">Delivery Date</th>
              <th className="border p-2">Priority</th>
              <th className="border p-2">Total Amount</th>
              <th className="border p-2">Advance</th>
              <th className="border p-2">Payment Status</th>
              <th className="border p-2">Items</th>
              <th className="border p-2">Actions</th>
            </tr>
          </thead>

          <tbody>
            {jobs.length > 0 ? (
              jobs.map((job) => (
                <tr key={job.job_no} className="border-b hover:bg-slate-50">
                  <td className="border border-r-4 border-gray-400 p-2 sticky left-0 bg-white z-20">
                    {job.job_no}
                  </td>
                  <td className="border p-2">{job.client_name}</td>
                  <td className="border p-2">{job.client_type}</td>
                  <td className="border p-2">{job.order_type}</td>
                  <td className="border p-2">{job.order_source}</td>
                  <td className="border p-2">{job.address}</td>
                  <td className="border p-2">{job.contact_number}</td>
                  <td className="border p-2">{job.email_id}</td>
                  <td className="border p-2">
                    {new Date(job.delivery_date).toLocaleDateString()}
                  </td>
                  <td className="border p-2">{job.task_priority}</td>
                  <td className="border p-2">{job.total_amount}</td>
                  <td className="border p-2">{job.advance_payment}</td>
                  <td className="border p-2">{job.payment_status}</td>
                  <td className="border p-2 text-gray-500 text-xs italic">
                    {job.items?.length || 0} items
                  </td>
                  <td className="border p-2 text-center space-x-2">
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-sm"
                      onClick={() => handleEditClick(job)}
                    >
                      ✏️ Edit
                    </Button>
                    <Button
                      className="bg-red-600 hover:bg-red-700 text-sm"
                      onClick={() => setConfirmDelete(job)}
                    >
                      Delete
                    </Button>{" "}
                    s
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
                ⚠️ Confirm Deletion
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
                  className="bg-gray-500 hover:bg-gray-600"
                  onClick={() => setConfirmDelete(null)}
                >
                  ❌ Cancel
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700"
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
                  {deleting ? "Deleting..." : "🗑 Delete"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
