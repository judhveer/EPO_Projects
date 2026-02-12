import React, { useEffect, useState, useMemo, useRef } from "react";
import api from "../../lib/api.js";
import { DateTime } from "luxon";
import JobItemsSidebar from "./commonDashboard/JobItemsSidebar.jsx";

export default function DesignerTable({ refresh }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timers, setTimers] = useState({});

  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [err, setErr] = useState("");

  const [openActionDropdown, setOpenActionDropdown] = useState(null);
  const [selectedJobNo, setSelectedJobNo] = useState(null);
  const blurTimeoutRef = useRef(null);

  // 📄 Pagination & Sorting
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const startIdx = (page - 1) * limit;
  const endIdx = startIdx + limit;
  const paginatedJobs = jobs.slice(startIdx, endIdx);
  const totalPages = Math.ceil(jobs.length / limit);
  const [totalJobs, setTotalJobs] = useState(0);

  const getTimerKey = (jobNo) => `designer_timer_${jobNo}`;

  const saveTimerToLS = (jobNo, data) => {
    localStorage.setItem(getTimerKey(jobNo), JSON.stringify(data));
  };

  const getTimerFromLS = (jobNo) => {
    const raw = localStorage.getItem(getTimerKey(jobNo));
    return raw ? JSON.parse(raw) : null;
  };

  const clearTimerFromLS = (jobNo) => {
    localStorage.removeItem(getTimerKey(jobNo));
  };

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
    const interval = setInterval(() => {
      setTimers((prev) => {
        const updated = { ...prev };

        jobs.forEach((job) => {
          const jobNo = job.job_no;

          if (
            job.assignment?.status === "in_progress" &&
            !job.assignment?.is_paused
          ) {
            updated[jobNo] = (updated[jobNo] || 0) + 1;
          }
        });

        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [jobs]);

  const handleStart = async (job) => {
    if (!job.assignment.estimated_completion_time) {
      alert("Please enter estimated completion time first.");
      return;
    }

    try {
      await api.patch(`/api/fms/designers/${job.job_no}/start`);

      const baseSeconds = job.assignment.designer_duration_seconds || 0;

      saveTimerToLS(job.job_no, {
        baseSeconds,
        lastTick: Date.now(),
        isRunning: true,
      });

      setTimers((prev) => ({
        ...prev,
        [job.job_no]: baseSeconds,
      }));

      fetchJobs();
    } catch (err) {
      console.error(err);
    }
  };

  const handlePause = async (job) => {
    try {
      await api.patch(`/api/fms/designers/${job.job_no}/pause`);

      const stored = getTimerFromLS(job.job_no);

      if (stored?.isRunning) {
        const elapsed = Math.floor((Date.now() - stored.lastTick) / 1000);

        saveTimerToLS(job.job_no, {
          baseSeconds: stored.baseSeconds + elapsed,
          lastTick: null,
          isRunning: false,
        });
      }

      fetchJobs(); // refresh duration from backend
    } catch (err) {
      console.error("Pause failed", err);
    }
  };

  const handleResume = async (job) => {
    try {
      await api.patch(`/api/fms/designers/${job.job_no}/resume`);

      const stored = getTimerFromLS(job.job_no);
      const baseSeconds =
        stored?.baseSeconds ?? job.assignment.designer_duration_seconds ?? 0;

      saveTimerToLS(job.job_no, {
        baseSeconds,
        lastTick: Date.now(),
        isRunning: true,
      });

      fetchJobs(); // ensure sync
    } catch (err) {
      console.error("Resume failed", err);
    }
  };

  const handleEnd = async (job) => {
    if (!job) return;
    try {
      clearTimerFromLS(job.job_no);
      await api.patch(`/api/fms/designers/${job.job_no}/end`);

      setErr("");
      setSuccessMsg("✅ Design Completed Successfully!");
      setShowSuccessPopup(true);

      // ⏳ Wait 2 seconds before closing modal (after popup)
      setTimeout(() => {
        setShowSuccessPopup(false);
      }, 2000);

      fetchJobs();
    } catch (error) {
      console.error(error);
      setErr(error.response?.data?.message || "Failed to End Task");
    }
  };

  const formatTimer = (totalSec) => {
    const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const estimatedCompletionTimes = async (job_no, time) => {
    if (!time) return;

    const payload = {
      job_no: job_no,
      estimated_completion_time: time,
    };

    try {
      await api.patch(`/api/fms/designers/set-estimated-time`, payload);

      // update local state immutably
      setJobs((prev) =>
        prev.map((j) =>
          j.job_no === job_no
            ? {
                ...j,
                assignment: {
                  ...j.assignment,
                  estimated_completion_time: time, // FINAL
                },
                tempEstimatedCompletionTime: undefined, // cleanup
              }
            : j,
        ),
      );
    } catch (err) {
      console.error("Failed to save estimated completion time", err);
      alert("Failed to save estimated completion time");
    }
  };

  // ✅ Fetch jobs
  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/fms/designers/jobs");

      const jobCards = res.data.data || [];

      // FLATTEN job + active assignment
      const normalized = jobCards
        .map((job) => {
          const assignment = job.assignments?.[0];
          if (!assignment) return null;

          const latestApproval = job.clientApprovals?.[0];
          console.log("clientApprovals: ", job.clientApprovals?.[0]);
          const isRework =
            job.clientApprovals?.[0]?.status === "changes_requested";

          return {
            ...job,
            assignment,
            // 👇 THIS IS THE KEY LINE
            instructions: latestApproval?.client_feedback
              ? latestApproval.client_feedback
              : job.instructions,
            isRework,
          };
        })
        .filter(Boolean);

      console.log("Fetched jobs for designer:", normalized);

      setJobs(normalized);
      setTotalJobs(res.data.total || normalized.length);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialTimers = {};

    jobs.forEach((job) => {
      const jobNo = job.job_no;
      const backendSeconds = job.assignment?.designer_duration_seconds || 0;
      const isPaused = job.assignment?.is_paused;

      const stored = getTimerFromLS(jobNo);

      if (stored && stored.isRunning && !isPaused) {
        const elapsed = Math.floor((Date.now() - stored.lastTick) / 1000);

        initialTimers[jobNo] = stored.baseSeconds + elapsed;
      } else {
        initialTimers[jobNo] = backendSeconds;
      }
    });

    setTimers(initialTimers);
  }, [jobs]);

  useEffect(() => {
    fetchJobs();
  }, [refresh]);


  const toDateTimeLocal = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);

    const pad = (n) => String(n).padStart(2, "0");

    return (
      date.getFullYear() +
      "-" +
      pad(date.getMonth() + 1) +
      "-" +
      pad(date.getDate()) +
      "T" +
      pad(date.getHours()) +
      ":" +
      pad(date.getMinutes())
    );
  };

  if (loading)
    return (
      <div className="text-center py-10 text-slate-600 text-lg">
        Loading job cards...
      </div>
    );

  return (
    <div className="">
      {showSuccessPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30 backdrop-blur-sm">
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

      {/* 🎛️ Filter Toggle Button */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-blue-700">
          🎨 Designer Dashboard
        </h2>
        {/* TOTAL JOBS TAG */}
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
          <span className="text-xs text-blue-700 font-medium">
            Total Pending Jobs:
          </span>
          <span className="text-sm font-bold text-blue-800">{totalJobs}</span>
        </div>
      </div>

      {/* ✅ Table */}
      <div className="hidden md:block relative overflow-auto border rounded-lg shadow max-h-[80vh]">
        <table className="min-w-[1800px] lg:min-w-[2100px] text-[11px] sm:text-xs border-collapse border border-gray-300 table-fixed">
          <thead className="sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow-sm">
            <tr>
              <th className="border p-1 sm:p-2 sticky left-0 bg-blue-800 z-40  text-center font-semibold shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                Job No
              </th>
              <th className="border p-1 sm:p-2"> Job Created On</th>
              <th className="border p-1 sm:p-2">Client Name</th>
              <th className="border p-1 sm:p-2">Order Type</th>
              <th className="border p-1 sm:p-2">Order Handled By</th>
              <th className="border p-1 sm:p-2">Execution Location</th>
              <th className="border p-1 sm:p-2">Delivery Date</th>
              <th className="border p-1 sm:p-2 max-w-[500px] ">
                Delivery Location
              </th>
              <th className="border p-1 sm:p-2">Proof Date</th>
              <th className="border p-1 sm:p-2 min-w-[150px text-center">
                Priority
              </th>
              <th className="border p-1 sm:p-2">Instructions</th>
              <th className="border p-1 sm:p-2">No of Files</th>
              <th className="border p-1 sm:p-2">Job Completion Deadline</th>
              <th className="border p-1 sm:p-2">Items</th>
              <th className="border p-1 sm:p-2 bg-blue-800 sticky right-[220px] sm:right-[260px] min-w-[200px] sm:min-w-[250px] z-50 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                {" "}
                Estimated Completion Time
              </th>
              <th className="border p-1 sm:p-2 bg-blue-800 sticky right-[100px] min-w-[160px] z-50 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                Start Time
              </th>
              <th className="border p-1 sm:p-2 bg-blue-800 sticky right-0 min-w-[100px] z-50 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                End Task
              </th>
            </tr>
          </thead>

          <tbody>
            {paginatedJobs.length > 0 ? (
              paginatedJobs.map((job, index) => (
                <tr
                  key={job.job_no}
                  className={`group border-b transition-all duration-200 ${
                    index % 2 === 0 ? "bg-white" : "bg-slate-300"
                  } hover:bg-blue-500 hover:text-white`}
                >
                  <td className="border p-1 sm:p-2 sticky left-0 bg-white z-20 text-center font-bold text-blue-700 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                    {job.job_no}
                    {job.isRework && (
                      <div className="text-[11px] text-red-800 italic mt-1">
                        {"Redesign"}
                      </div>
                    )}
                  </td>
                  <td className="border p-1 sm:p-2">
                    {DateTime.fromJSDate(new Date(job.createdAt))
                      .setZone("Asia/Kolkata")
                      .toFormat("dd LLL yyyy, hh:mm a")}
                  </td>
                  <td className="border p-1 sm:p-2">{job.client_name}</td>
                  <td className="border p-1 sm:p-2 ">{job.order_type}</td>
                  <td className="border p-1 sm:p-2">{job.order_handled_by}</td>
                  <td className="border p-1 sm:p-2">
                    {job.execution_location}
                  </td>
                  <td className="border p-1 sm:p-2 font-semibold text-blue-600 hover:text-white">
                    {DateTime.fromJSDate(new Date(job.delivery_date))
                      .setZone("Asia/Kolkata")
                      .toFormat("dd LLL yyyy, hh:mm a")}
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
                    {job.proof_date
                      ? DateTime.fromJSDate(new Date(job.proof_date))
                          .setZone("Asia/Kolkata")
                          .toFormat("dd LLL yyyy")
                      : "Not Set"}
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
                  <td className="border p-1 sm:p-2">
                    {job.job_completion_deadline
                      ? DateTime.fromJSDate(
                          new Date(job.job_completion_deadline),
                        )
                          .setZone("Asia/Kolkata")
                          .toFormat("dd LLL yyyy, hh:mm a")
                      : "Not Set"}
                  </td>

                  <td className="border p-1 sm:p-2 text-center text-gray-500 text-xs italic hover:text-white cursor-default">
                    {job.item_count || 0} items{" "}
                    {job.item_count > 0 && (
                      <button
                        onClick={() => { 
                          setOpenActionDropdown(null);
                          setSelectedJobNo(job.job_no);
                        }}
                        className="ml-2 text-blue-600 hover:text-blue-800 underline text-xs cursor-pointer"
                      >
                        View
                      </button>
                    )}
                  </td>

                  {/* action-dropdown */}

                  {/* Estimated Time Input */}
                  <td className="border p-1 sm:p-2 text-center sticky right-[260px] bg-white z-40 min-w-[250px] group-hover:bg-blue-500 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                    <input
                      type="datetime-local"
                      value={toDateTimeLocal(
                        job.assignment.estimated_completion_time ??
                          job.tempEstimatedCompletionTime,
                      )}
                      onChange={(e) => {
                        if (job.assignment.estimated_completion_time) return;

                        const val = e.target.value;

                        setJobs((prev) =>
                          prev.map((j) =>
                            j.job_no === job.job_no
                              ? {
                                  ...j,
                                  tempEstimatedCompletionTime: val, // 👈 TEMP ONLY
                                }
                              : j,
                          ),
                        );
                      }}
                      onBlur={(e) => {
                        if (job.assignment.estimated_completion_time) return;

                        const val = e.target.value;

                        // must be full datetime: YYYY-MM-DDTHH:mm
                        if (!val || val.length !== 16) return;

                        clearTimeout(blurTimeoutRef.current);

                        blurTimeoutRef.current = setTimeout(() => {
                          console.log(
                            "backend api called for blue even estimatedCompletionTimes",
                          );
                          estimatedCompletionTimes(job.job_no, val);
                        }, 500);
                      }}
                      onFocus={() => {
                        clearTimeout(blurTimeoutRef.current);
                      }}
                      readOnly={!!job.assignment.estimated_completion_time}
                      className={`border rounded-md p-2 text-xs w-full ${
                        job.assignment.estimated_completion_time
                          ? "cursor-not-allowed"
                          : ""
                      }`}
                    />

                    {/* {job.assignment.estimated_completion_time && (
                      <div className="text-[10px] text-gray-500 mt-1">
                        Estimation locked
                      </div>
                    )} */}
                  </td>

                  {/* Timer Column */}
                  <td className="border p-1 sm:p-2 text-center font-mono text-blue-600 text-lg sticky right-[100px] bg-white z-40 min-w-[160px] group-hover:bg-blue-500 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                    {(job.status === "assigned_to_designer" ||
                      job.status === "client_changes") && (
                      <span className="text-gray-500 text-sm">Not Started</span>
                    )}

                    {job.status === "design_in_progress" && (
                      <span>
                        {formatTimer(timers[job.job_no] || 0)}
                        {job.assignment.is_paused && (
                          <span className="text-red-500 text-xs ml-1">
                            (Paused)
                          </span>
                        )}
                      </span>
                    )}
                  </td>

                  {/* Action Column */}
                  <td className="border p-1 sm:p-2 text-center space-y-2 sticky right-0 bg-white z-40 min-w-[100px] group-hover:bg-blue-500 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                    {/* Start Button */}
                    {(job.status === "assigned_to_designer" ||
                      job.status === "client_changes") && (
                      <button
                        disabled={!job.assignment.estimated_completion_time}
                        onClick={() => handleStart(job)}
                        className={`px-4 py-1 rounded text-white text-xs font-semibold shadow ${
                          job.assignment.estimated_completion_time
                            ? "bg-blue-600 hover:bg-blue-700"
                            : "bg-gray-400 cursor-not-allowed"
                        }`}
                      >
                        Start
                      </button>
                    )}

                    {/* Pause Button */}
                    {job.status === "design_in_progress" &&
                      !job.assignment.is_paused && (
                        <button
                          onClick={() => handlePause(job)}
                          className="px-4 py-1 bg-yellow-500 text-white rounded text-xs font-semibold shadow hover:bg-yellow-600"
                        >
                          Pause
                        </button>
                      )}

                    {/* Resume Button */}
                    {job.status === "design_in_progress" &&
                      job.assignment.is_paused && (
                        <button
                          onClick={() => handleResume(job)}
                          className="px-4 py-1 bg-green-600 text-white rounded text-xs font-semibold shadow hover:bg-green-700"
                        >
                          Resume
                        </button>
                      )}

                    {/* End Task Button */}
                    {job.status === "design_in_progress" && (
                      <button
                        onClick={() => handleEnd(job)}
                        className="px-4 py-1 bg-red-600 text-white rounded text-xs font-semibold shadow hover:bg-red-700"
                      >
                        End Task
                      </button>
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

      {/* MOBILE VIEW */}
      <div className="md:hidden space-y-4">
        {paginatedJobs.map((job) => (
          <div
            key={job.job_no}
            className="border rounded-xl p-4 shadow bg-white space-y-3"
          >
            <div className="flex justify-between items-center">
              <span className="font-bold text-blue-700">Job #{job.job_no}</span>
              <span className="text-xs text-gray-500">
                {new Date(job.createdAt).toLocaleDateString()}
              </span>
            </div>

            <div className="text-sm">
              <b>Client:</b> {job.client_name}
            </div>

            <div className="text-sm">
              <b>Order Type:</b> {job.order_type}
            </div>

            <div className="text-sm">
              <b>Delivery:</b>{" "}
              {new Date(job.delivery_date).toLocaleDateString()}
            </div>

            <div className="text-sm">
              <b>Items:</b> {job.item_count|| 0}
            </div>

            {/* TIMER */}
            <div className="flex justify-between items-center">
              <span className="font-mono text-blue-600">
                {formatTimer(timers[job.job_no] || 0)}
              </span>

              {job.assignment?.is_paused && (
                <span className="text-xs text-red-500">(Paused)</span>
              )}
            </div>

            {/* ACTIONS */}
            <div className="flex gap-2 flex-wrap">
              {job.status === "assigned_to_designer" && (
                <button
                  onClick={() => handleStart(job)}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
                >
                  Start
                </button>
              )}

              {job.status === "design_in_progress" && (
                <>
                  {!job.assignment.is_paused ? (
                    <button
                      onClick={() => handlePause(job)}
                      className="px-3 py-1 bg-yellow-500 text-white rounded text-xs"
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      onClick={() => handleResume(job)}
                      className="px-3 py-1 bg-green-600 text-white rounded text-xs"
                    >
                      Resume
                    </button>
                  )}

                  <button
                    onClick={() => handleEnd(job)}
                    className="px-3 py-1 bg-red-600 text-white rounded text-xs"
                  >
                    End
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>


      <JobItemsSidebar
        jobNo={selectedJobNo}
        onClose={() => setSelectedJobNo(null)}
      />

    </div>
  );
}
