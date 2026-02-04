import React, { useEffect, useState, useRef } from "react";
import api from "../../lib/api.js";
import { motion, AnimatePresence } from "framer-motion";
import { DateTime } from "luxon";

export default function CRMTable({ refresh }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const [showItemsPanel, setShowItemsPanel] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedJobNo, setSelectedJobNo] = useState(null);

  const [actionState, setActionState] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [popup, setPopup] = useState({
    open: false,
    message: "",
    type: "success", // success | info | error
  });

  const [err, setErr] = useState("");


  const startIdx = (page - 1) * limit;
  const endIdx = startIdx + limit;
  const paginatedJobs = jobs.slice(startIdx, endIdx);
  const totalPages = Math.ceil(jobs.length / limit);

  const showPopup = (message, type = "success") => {
    setPopup({
      open: true,
      message,
      type,
    });

    setTimeout(() => {
      setPopup((p) => ({ ...p, open: false }));
    }, 2000);
  };


  // 🔄 Fetch CRM jobs
  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/fms/crm/jobs");

      const jobCards = res.data.data || [];
      // FLATTEN job + active assignment
      const normalized = jobCards
        .map((job) => {
          const latestApproval = job.clientApprovals?.[0];
          console.log("jobcards: ", jobCards);
          const isRework = job.clientApprovals?.[0]?.status === "changes_requested" || job.clientApprovals?.[0]?.instance > 1;

          return {
            ...job,
            // 👇 THIS IS THE KEY LINE
            instructions: latestApproval?.client_feedback ? latestApproval.client_feedback : job.instructions,
            isRework,
          };
        })
        .filter(Boolean);

      setJobs(normalized);
    } catch (err) {
      console.error("Failed to fetch CRM jobs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [refresh]);

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

  // 🟦 Actions
  const markSentToClient = async (job_no) => {
    try {
      await api.patch(`/api/fms/crm/${job_no}/sent-to-client`);
      showPopup("📤 Job successfully sent to client, wait for the client response.", "success");
      fetchJobs();
    } catch (err) {
      console.error(err);
      setErr("Failed to send job to client");
    }
  };

  const submitDecision = async (job) => {
    const state = actionState[job.job_no];
    if (!state?.decision) return;

    setSubmitting(true);
    try {
      if (state.decision === "approved") {
        await api.patch(`/api/fms/crm/${job.job_no}/approved`);
        showPopup("✅ Job approved successfully! Ready for Production.", "success");
      }

      if (state.decision === "client_changes") {
        if (!state.feedback?.trim()) {
          alert("Please enter client instructions");
          return;
        }

        await api.patch(`/api/fms/crm/${job.job_no}/client-changes`, {
          client_feedback: state.feedback,
        });
        showPopup("Client changes recorded. Job reassigned to the same designer for redesign.", "info");
      }

      fetchJobs();
    } catch (err) {
      console.error(err);
      setErr("Action failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-10 text-slate-600 text-lg">
        Loading CRM jobs...
      </div>
    );
  }

  return (
    <div>
      {popup.open && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30 backdrop-blur-sm">
          <div
            className={`bg-white shadow-2xl rounded-xl px-8 py-6 border text-center animate-fade-in
              ${
                popup.type === "success"
                  ? "border-green-200"
                  : popup.type === "info"
                  ? "border-yellow-300"
                  : "border-red-300"
              }`}
          >
            <h3
              className={`text-2xl font-semibold mb-2
                ${
                  popup.type === "success"
                    ? "text-green-700"
                    : popup.type === "info"
                    ? "text-yellow-700"
                    : "text-red-700"
                }`}
            >
              {popup.type === "success" && "🎉 Success"}
              {popup.type === "info" && "🔁 Redesign Required"}
              {popup.type === "error" && "❌ Error"}
            </h3>

            <p className="text-slate-600 text-sm">{popup.message}</p>
          </div>
        </div>
      )}

      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">
          {err}
        </div>
      )}

    

      <h2 className="text-2xl font-bold text-blue-700 mb-4">
        📋 CRM Approval Dashboard
      </h2>

      {/* TABLE */}
      <div className="relative overflow-auto border rounded-lg shadow max-h-[80vh]">
        <table className="min-w-[1800px] lg:min-w-[4000px] text-[11px] sm:text-xs border-collapse border border-gray-300 table-fixed">
          <thead className="sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow-sm">
            <tr>
              <th className="border p-2 sticky left-0 bg-blue-800 z-40 text-center font-semibold">
                Job No
              </th>
              <th className="border p-1 sm:p-2"> Job Created On</th>
              <th className="border p-2">Client Name</th>
              <th className="border p-2">Client Type</th>
              <th className="border p-2">Order Type</th>
              <th className="border p-2">Order Source</th>
              <th className="border p-2">Address</th>
              <th className="border p-2">Contact</th>
              <th className="border p-2">Email</th>
              <th className="border p-1 sm:p-2">Execution Location</th>
              <th className="border p-2">Delivery Date</th>
              <th className="border p-1 sm:p-2 max-w-[500px] ">
                Delivery Location
              </th>
              <th className="border p-1 sm:p-2">Proof Date</th>
              <th className="border p-1 sm:p-2 min-w-[150px text-center">
                Priority
              </th>
              <th className="border p-1 sm:p-2">Instructions</th>
              <th className="border p-1 sm:p-2">No of Files</th>
              <th className="border p-2">Total Amount</th>
              <th className="border p-2">Advance</th>
              <th className="border p-2">Mode of Payment</th>
              <th className="border p-2">Payment Status</th>
              <th className="border p-1 sm:p-2">Job Completion Deadline</th>
              <th className="border p-2">Items</th>
              <th className="border p-2">Current Stage</th>
              <th className="border p-2 sticky right-0 bg-blue-800 z-40">
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {paginatedJobs.length > 0 ? (
              paginatedJobs.map((job, idx) => (
                <tr
                  key={job.job_no}
                  className={`border-b ${
                    idx % 2 === 0 ? "bg-white" : "bg-slate-100"
                  } hover:bg-blue-500 hover:text-white`}
                >
                  <td className="border p-2 sticky left-0 bg-white font-bold text-blue-700 text-center ">
                    {job.job_no}
                    {job.isRework && (
                      <div className="text-[11px] text-red-800 italic mt-1">
                        {"Redesign"}
                      </div>
                    )}
                  </td>
                  <td className="border p-1 sm:p-2">
                    {DateTime.fromJSDate(new Date(job.createdAt)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a")}
                  </td>
                  <td className="border p-2">{job.client_name}</td>
                  <td className="border p-2">{job.client_type}</td>
                  <td className="border p-2">{job.order_type}</td>
                  <td className="border p-2 ">{job.order_source}</td>
                  <td className="border p-2 ">{job.address}</td>
                  <td className="border p-2">{job.contact_number}</td>
                  <td className="border p-2">{job.email_id}</td>
                  <td className="border p-1 sm:p-2">
                    {job.execution_location}
                  </td>
                  <td className="border p-1 sm:p-2 font-semibold text-blue-600 hover:text-white">
                     {DateTime.fromJSDate(new Date(job.delivery_date)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a")}
                  </td>
                  <td className="border-r border-gray-200 px-2  max-w-[500px]">
                    {job.delivery_location}
                    {job.delivery_location === "Delivery Address" && (
                      <div className=" text-[11px] text-gray-500 italic mt-1">
                        {job.delivery_address}
                      </div>
                    )}
                  </td>
                  <td className="border p-1 sm:p-2 ">
                    {job.proof_date && ( DateTime.fromJSDate(new Date(job.proof_date)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy") )}
                  </td>

                  <td className="border p-1 sm:p-2 min-w-[150px] text-center">
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
                  <td className="border p-1 sm:p-2">{job.instructions}</td>
                  <td className="border p-1 sm:p-2">{job.no_of_files}</td>
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
                  <td className="border p-1 sm:p-2">
                    {job.job_completion_deadline ? ( DateTime.fromJSDate(new Date(job.job_completion_deadline)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a") ) : "Not Set"}
                  </td>

                  <td className="border p-1 sm:p-2 text-center text-gray-500 text-xs italic hover:text-white cursor-default">
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

                  <td className="border p-2 font-semibold">{job.status}</td>

                  {/* ACTION COLUMN */}
                  <td className="border p-2 sticky right-0 bg-white">
                    {job.status === "sent_for_approval" && (
                      <button
                        onClick={() => markSentToClient(job.job_no)}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
                      >
                        Sent to Client
                      </button>
                    )}

                    {job.status === "awaiting_client_response" && (
                      <div className="space-y-2">
                        <select
                          className="border rounded p-1 text-xs w-full text-black"
                          value={actionState[job.job_no]?.decision || ""}
                          onChange={(e) =>
                            setActionState((prev) => ({
                              ...prev,
                              [job.job_no]: {
                                decision: e.target.value,
                                feedback: "",
                              },
                            }))
                          }
                        >
                          <option value="">Select</option>
                          <option value="approved">Approved</option>
                          <option value="client_changes">Client Changes</option>
                        </select>

                        {actionState[job.job_no]?.decision ===
                          "client_changes" && (
                          <textarea
                            className="border rounded p-1 text-xs w-full text-black"
                            rows={3}
                            placeholder="Enter client instructions"
                            onChange={(e) =>
                              setActionState((prev) => ({
                                ...prev,
                                [job.job_no]: {
                                  ...prev[job.job_no],
                                  feedback: e.target.value,
                                },
                              }))
                            }
                          />
                        )}

                        <button
                          disabled={submitting}
                          onClick={() => submitDecision(job)}
                          className="px-3 py-1 bg-green-600 text-white rounded text-xs"
                        >
                          Submit
                        </button>
                      </div>
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

        {/* PAGINATION */}
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

      {/* ITEMS DRAWER (same as designer) */}
      <AnimatePresence>
        {showItemsPanel && (
          <>
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
              className="fixed top-0 right-0 h-full w-full sm:w-[35%] bg-white shadow-2xl z-50 overflow-y-auto"
            >
              {/* Header */}
              <div className="sticky top-0 bg-blue-600 text-white flex justify-between items-center p-4 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
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
                      className="border rounded-xl p-4 shadow-sm bg-slate-50 space-y-4"
                    >
                      {/* HEADER */}
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                        <h4 className="font-semibold text-blue-700">
                          Item {index + 1}: {item.category}
                        </h4>

                        <span
                          className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded max-w-full sm:max-w-[220px] truncate"
                          title={item.enquiry_for}
                        >
                          {item.enquiry_for || "—"}
                        </span>
                      </div>

                      {/* BASIC DETAILS */}
                      <div className="space-y-2 text-gray-700 text-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                          <span className="font-medium shrink-0">
                            Client Size (Finished):
                          </span>
                          <span
                            className="break-words sm:truncate"
                            title={item.size}
                          >
                            {item.size || "—"}
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                          <span className="font-medium shrink-0">
                            Quantity:
                          </span>
                          <span>
                            {item.quantity || 0} {item.uom || ""}
                          </span>
                        </div>

                        {item.color_scheme && (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <span className="font-medium shrink-0">
                              Color Scheme:
                            </span>
                            <span>{item.color_scheme}</span>
                          </div>
                        )}

                        {item.sides && (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <span className="font-medium shrink-0">Sides:</span>
                            <span>{item.sides}</span>
                          </div>
                        )}

                        {/* COMMON BINDING */}
                        {item.binding_types && (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <span className="font-medium shrink-0">
                              Binding:
                            </span>
                            <span
                              className="break-words sm:truncate"
                              title={
                                Array.isArray(item.binding_types)
                                  ? item.binding_types.join(", ")
                                  : item.binding_types
                              }
                            >
                              {Array.isArray(item.binding_types)
                                ? item.binding_types.join(", ")
                                : item.binding_types}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* PAPER DETAILS */}
                      {item.selectedPaper && (
                        <div className="border rounded-lg p-3 bg-white space-y-2">
                          <h6 className="font-semibold text-gray-700">
                            🧻 Paper Details
                          </h6>

                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                            <span className="font-medium shrink-0">
                              Paper Type:
                            </span>
                            <span
                              className="break-words sm:truncate"
                              title={item.selectedPaper.paper_name}
                            >
                              {item.selectedPaper.paper_name}
                            </span>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                            <span className="font-medium shrink-0">GSM:</span>
                            <span>{item.selectedPaper.gsm}</span>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                            <span className="font-medium shrink-0">
                              Paper Size (Press):
                            </span>
                            <span
                              className="break-words sm:truncate"
                              title={item.selectedPaper.size_name}
                            >
                              {item.selectedPaper.size_name}
                            </span>
                          </div>

                          {item.inside_pages && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                              <span className="font-medium shrink-0">
                                Inside Pages:
                              </span>
                              <span>{item.inside_pages || "—"}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* MULTIPLE SHEET ONLY */}
                      {item.category === "Multiple Sheet" && (
                        <>
                          {item.selectedCoverPaper && (
                            <div className="border rounded-lg p-3 bg-slate-100 space-y-2">
                              <h6 className="font-semibold text-gray-700">
                                📘 Cover Paper Details
                              </h6>

                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                                <span className="font-medium shrink-0">
                                  Cover Type:
                                </span>
                                <span
                                  className="break-words sm:truncate"
                                  title={item.selectedCoverPaper.paper_name}
                                >
                                  {item.selectedCoverPaper.paper_name}
                                </span>
                              </div>

                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                                <span className="font-medium shrink-0">
                                  Cover GSM:
                                </span>
                                <span>{item.selectedCoverPaper.gsm}</span>
                              </div>

                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                                <span className="font-medium shrink-0">
                                  Cover Pages:
                                </span>
                                <span>{item.cover_pages || "—"}</span>
                              </div>

                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                                <span className="font-medium shrink-0">
                                  Cover Color:
                                </span>
                                <span>{item.cover_color_scheme || "—"}</span>
                              </div>
                            </div>
                          )}
                        </>
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
