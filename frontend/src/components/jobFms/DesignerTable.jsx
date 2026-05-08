import React, { 
  useEffect, useState, useMemo, useRef, useCallback, memo 
} from "react";
import api from "../../lib/api.js";
import { DateTime } from "luxon";
import JobItemsSidebar from "./commonDashboard/JobItemsSidebar.jsx";
import Input from "../salesPipeline/Input.jsx";



// PURE HELPER — mirrors server logic exactly (no API call needed)
// Returns a JS Date representing the latest allowed estimated completion time.
function calcMaxDesignDeadline(deliveryDateISO, createdAtISO, priority, instance = 1, assignedAtISO = null) {
  const deliveryDate = new Date(deliveryDateISO);
  const jobCreatedAt = new Date(createdAtISO);
  const now          = new Date();
  const totalMs      = deliveryDate.getTime() - jobCreatedAt.getTime();
  const totalDays    = totalMs / (1000 * 60 * 60 * 24);

  let deadline;

  // ── Rule 1: Urgent or same-day ─
  if (priority === "Urgent" || totalDays < 1) {
    // 4 hours from now
    deadline = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  }
  // ── Rule 2: Next-day ─────
  else if (totalDays <= 2) {
    // Day before delivery at 19:30 IST (= 14:00 UTC)
    deadline = new Date(deliveryDate);
    deadline.setDate(deadline.getDate() - 1);
    deadline.setUTCHours(14, 0, 0, 0); // 19:30 IST
  }
  else{
    // ── Rule 3: 50% of window ───
    deadline = new Date(jobCreatedAt.getTime() + totalMs * 0.50);
  }

  // Redesign override: grant 4h from assignment only when original window
  // has ≤ 4 hours left (or is already expired)
  if (instance > 1) {
    const remainingMs = deadline.getTime() - now.getTime();
    const fourHoursMs = 4 * 60 * 60 * 1000;
    if(remainingMs < fourHoursMs){
      const base = assignedAtISO ? new Date(assignedAtISO) : now;
      deadline   = new Date(base.getTime() + fourHoursMs);
    }
  }
  // ── HARD CAP: estimated completion can never exceed delivery date ──
  return deadline > deliveryDate ? deliveryDate : deadline;
}

// Converts a JS Date → "YYYY-MM-DDTHH:mm" for datetime-local input max/min
function toDateTimeLocalStr(date) {
  if (!date || isNaN(date.getTime())) return "";
  // Use local time (matches what the browser datetime-local input uses)
  const pad   = (n) => String(n).padStart(2, "0");
  const year  = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day   = pad(date.getDate());
  const hour  = pad(date.getHours());
  const min   = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hour}:${min}`;
}

function isoToDateTimeLocal(isoString) {
  if (!isoString) return "";
  return toDateTimeLocalStr(new Date(isoString));
}


// Human-readable deadline label shown under the input
function deadlineLabel(deliveryDateISO, createdAtISO, priority, instance = 1, assignedAtISO = null) {
  const deliveryDate = new Date(deliveryDateISO);
  const jobCreatedAt = new Date(createdAtISO);
  const now          = new Date();
  const totalMs      = deliveryDate.getTime() - jobCreatedAt.getTime();
  const totalDays    = totalMs / (1000 * 60 * 60 * 24);

  // Compute what the base (non-redesign) deadline would be
  let baseDeadline;
  if (priority === "Urgent" || totalDays < 1) {
    baseDeadline = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  } else if (totalDays <= 2) {
    baseDeadline = new Date(deliveryDate);
    baseDeadline.setDate(baseDeadline.getDate() - 1);
    baseDeadline.setUTCHours(14, 0, 0, 0);
  } else {
    baseDeadline = new Date(jobCreatedAt.getTime() + totalMs * 0.50);
  }

  const fmtRemaining = (ms) => {
    if (ms <= 0) return "expired";
    const days  = Math.floor(ms / 86400000);
    const hours = Math.round(ms / 3600000);
    return days >= 1 ? `${days} day${days !== 1 ? "s" : ""} remaining` : `${hours} hr${hours !== 1 ? "s" : ""} remaining`;
  };

  if (instance > 1) {
    const remainingMs = baseDeadline.getTime() - now.getTime();
    const fourHoursMs = 4 * 60 * 60 * 1000;

    if (remainingMs < fourHoursMs) {
      return { rule: "Redesign — 4 hrs from assignment (window expired)", color: "text-purple-600" };
    } 
    return {
      rule:  `Redesign — original 50% window (${fmtRemaining(remainingMs)})`,
      color: "text-purple-600",
    }
  }

  if (priority === "Urgent" || totalDays < 1) {
    return { rule: "Urgent — 4 hrs from now", color: "text-red-600" };
  }
  if (totalDays <= 2) {
    return { rule: "Next day — by 7:30 PM today", color: "text-orange-600" };
  }
  return {
    rule:  `50% window — ${fmtRemaining(baseDeadline.getTime() - now.getTime())}`,
    color: "text-blue-600",
  };
}

function formatTimer(totalSec) {
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// LOCALSTORAGE HELPERS — module-level, no component coupling
const getTimerKey = (jobNo) => `designer_timer_${jobNo}`;

const saveTimerToLS = (jobNo, data) => {
  localStorage.setItem(getTimerKey(jobNo), JSON.stringify(data));
};

const getTimerFromLS   = (jobNo) => {
  try {
    const raw = localStorage.getItem(getTimerKey(jobNo));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const clearTimerFromLS = (jobNo) => {
  localStorage.removeItem(getTimerKey(jobNo));
};


// JobTimer — self-contained, ONLY this component re-renders every second.
// The parent table never ticks.
const JobTimer = memo(function JobTimer({ jobNo, backendSeconds, isInProgress, isPaused }) {
  // Initialise from localStorage so elapsed time survives a re-mount
  const [seconds, setSeconds] = useState(() => {
    const stored = getTimerFromLS(jobNo);
    if (stored && stored.isRunning && isInProgress && !isPaused) {
      return stored.baseSeconds + Math.floor((Date.now() - stored.lastTick) / 1000);
    }
    return stored?.baseSeconds ?? backendSeconds;
  });

  // Re-sync whenever backend data refreshes (after start / pause / resume)
  useEffect(() => {
    const stored = getTimerFromLS(jobNo);
    if (stored) {
      const computed =
        stored.isRunning && isInProgress && !isPaused
          ? stored.baseSeconds + Math.floor((Date.now() - stored.lastTick) / 1000)
          : stored.baseSeconds;
      setSeconds(computed);
    } else {
      setSeconds(backendSeconds);
    }
  }, [jobNo, backendSeconds, isInProgress, isPaused]);

  // Tick — only when actually running
  useEffect(() => {
    if (!isInProgress || isPaused) return;
    console.log("running");
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isInProgress, isPaused]);

  if (!isInProgress) {
    return <span className="text-gray-500 text-sm">Not Started</span>;
  }
  return (
    <span>
      {formatTimer(seconds)}
      {isPaused && <span className="text-red-500 text-xs ml-1">(Paused)</span>}
    </span>
  );
});



// JobRow — memoised table row.
// Re-renders only when its own job object, error, or index changes —
// NOT when the timer ticks.
const JobRow = memo(function JobRow({
  job, index, errMsg,
  onStart, onPause, onResume, onEnd,
  onTempTimeChange, onTimeBlur, onTimeFocus,
  onViewItems,
}) {
  // Per-row blur debounce ref — no shared state contention between rows
  const blurTimeoutRef = useRef(null);

  // Expensive deadline calculations — only recompute when relevant job fields change
  const { maxStr, isLocked, label } = useMemo(() => {
    const instance   = job.assignment.instance ?? 1;
    const assignedAt = job.assignment.assigned_at ?? job.assignment.assignedAt ?? null;
    const maxDate    = calcMaxDesignDeadline(
      job.delivery_date, job.createdAt, job.task_priority, instance, assignedAt,
    );
    return {
      maxStr:   toDateTimeLocalStr(maxDate),
      isLocked: !!job.assignment.estimated_completion_time,
      label:    deadlineLabel(
        job.delivery_date, job.createdAt, job.task_priority, instance, assignedAt,
      ),
    };
  }, [
    job.delivery_date,
    job.createdAt,
    job.task_priority,
    job.assignment.instance,
    job.assignment.assigned_at,
    job.assignment.assignedAt,
    job.assignment.estimated_completion_time,
  ]);

  // minStr: "now" — intentionally NOT memoised; stale by a render cycle is fine
  const minStr       = toDateTimeLocalStr(new Date());
  const isInProgress = job.status === "design_in_progress";

  const validate = (val) => {
    if (!val) return null;
    if (val < minStr) return "Cannot be in the past.";
    if (val > maxStr) return `Must be on or before ${maxStr.replace("T", " ")}`;
    return null;
  };

  return (
    <tr
      className={`group border-b transition-all duration-200 ${
        index % 2 === 0 ? "bg-white" : "bg-slate-300"
      } hover:bg-blue-500 hover:text-white`}
    >
      {/* Job No */}
      <td className="border p-1 sm:p-2 sticky left-0 bg-white z-20 text-center font-bold text-blue-700 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
        {job.job_no}
        {job.isRework && <div className="text-[11px] text-red-800 italic mt-1">Redesign</div>}
      </td>

      {/* Job Created On */}
      <td className="border p-1 sm:p-2">
        {DateTime.fromJSDate(new Date(job.createdAt)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a")}
      </td>

      <td className="border p-1 sm:p-2">{job.client_name}</td>

      {/* Items */}
      <td className="border p-1 sm:p-2 text-center text-gray-500 text-xs italic hover:text-white cursor-default">
        {job.item_count || 0} items{" "}
        {job.item_count > 0 && (
          <button
            onClick={() => onViewItems(job.job_no)}
            className="ml-2 text-blue-600 hover:text-blue-800 underline text-xs cursor-pointer"
          >
            View
          </button>
        )}
      </td>

      <td className="border p-1 sm:p-2">{job.order_type}</td>
      <td className="border p-1 sm:p-2">{job.order_handled_by}</td>
      <td className="border p-1 sm:p-2">{job.execution_location}</td>

      {/* Delivery Date */}
      <td className="border p-1 sm:p-2 font-semibold text-blue-600 hover:text-white">
        <span className="bg-yellow-300 text-blue-900 rounded-md font-bold p-1">
          {DateTime.fromJSDate(new Date(job.delivery_date)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a")}
        </span>
      </td>

      {/* Delivery Location */}
      <td className="border-r border-gray-200 px-2 max-w-[500px]">
        {job.delivery_location?.replace(/_/g, " ")}
        {job.delivery_address && (
          <div className="text-[11px] text-gray-500 italic mt-1">{job.delivery_address}</div>
        )}
      </td>

      {/* Proof Date */}
      <td className="border p-1 sm:p-2">
        {job.proof_date
          ? DateTime.fromJSDate(new Date(job.proof_date)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy")
          : "Not Set"}
      </td>

      {/* Priority */}
      <td className="border p-1 sm:p-2 min-w-[150px] text-center">
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
          job.task_priority === "Urgent" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
        }`}>
          {job.task_priority}
        </span>
      </td>

      <td className="border p-1 sm:p-2">{job.instructions}</td>
      <td className="border p-1 sm:p-2">{job.no_of_files}</td>

      {/* Job Completion Deadline */}
      <td className="border p-1 sm:p-2">
        {job.job_completion_deadline
          ? DateTime.fromJSDate(new Date(job.job_completion_deadline)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a")
          : "Not Set"}
      </td>

      {/* ── Estimated Completion Time ─────────────────────────────────────── */}
      <td className="border p-1 sm:p-2 text-center sticky right-[260px] bg-white z-40 min-w-[250px] group-hover:bg-blue-500 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
        <Input
          type="datetime-local"
          min={isLocked ? undefined : minStr}
          max={isLocked ? undefined : maxStr}
          value={isoToDateTimeLocal(
            job.assignment.estimated_completion_time ?? job.tempEstimatedCompletionTime,
          )}
          onChange={(e) => {
            if (isLocked) return;
            onTempTimeChange(job.job_no, e.target.value);
          }}
          onBlur={(e) => {
            if (isLocked) return;
            const val = e.target.value;
            if (!val || val.length !== 16) return;
            const error = validate(val);
            if (error) {
              onTimeBlur(job.job_no, null, error);
              return;
            }
            clearTimeout(blurTimeoutRef.current);
            blurTimeoutRef.current = setTimeout(() => onTimeBlur(job.job_no, val, null), 300);
          }}
          onFocus={() => {
            clearTimeout(blurTimeoutRef.current);
            onTimeFocus(job.job_no);
          }}
          readOnly={isLocked}
          className={`border rounded-md p-2 text-xs w-full text-black ${
            isLocked ? "cursor-not-allowed bg-slate-100" : errMsg ? "border-red-400 bg-red-50" : ""
          }`}
        />

        {errMsg && !isLocked && (
          <div className="text-[10px] mt-1 text-red-600 font-medium group-hover:text-red-300 leading-tight">
            ⚠ {errMsg}
          </div>
        )}
        {!isLocked && !errMsg && (
          <div className={`text-[10px] mt-1 font-medium ${label.color} group-hover:text-white`}>
            Max: {label.rule}
          </div>
        )}
        {isLocked && (
          <div className="text-[10px] mt-1 text-slate-400 group-hover:text-white">
            Deadline: {maxStr.replace("T", " ")}
          </div>
        )}
      </td>

      {/* ── Timer — ONLY JobTimer re-renders every second ─────────────────── */}
      <td className="border p-1 sm:p-2 text-center font-mono text-blue-600 text-lg sticky right-[100px] bg-white z-40 min-w-[160px] group-hover:bg-blue-500 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
        <JobTimer
          jobNo={job.job_no}
          backendSeconds={job.assignment.designer_duration_seconds || 0}
          isInProgress={isInProgress}
          isPaused={job.assignment.is_paused}
        />
      </td>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <td className="border p-1 sm:p-2 text-center space-y-2 sticky right-0 bg-white z-40 min-w-[100px] group-hover:bg-blue-500 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)]">
        {(job.status === "assigned_to_designer" || job.status === "client_changes") && (
          <button
            disabled={!job.assignment.estimated_completion_time}
            onClick={() => onStart(job.job_no)}
            className={`px-4 py-1 rounded text-white text-xs font-semibold shadow ${
              job.assignment.estimated_completion_time
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-400 cursor-not-allowed"
            }`}
          >
            Start
          </button>
        )}
        {isInProgress && !job.assignment.is_paused && (
          <button
            onClick={() => onPause(job.job_no)}
            className="px-4 py-1 bg-yellow-500 text-white rounded text-xs font-semibold shadow hover:bg-yellow-600"
          >
            Pause
          </button>
        )}
        {isInProgress && job.assignment.is_paused && (
          <button
            onClick={() => onResume(job.job_no)}
            className="px-4 py-1 bg-green-600 text-white rounded text-xs font-semibold shadow hover:bg-green-700"
          >
            Resume
          </button>
        )}
        {isInProgress && (
          <button
            onClick={() => onEnd(job.job_no)}
            className="px-4 py-1 bg-red-600 text-white rounded text-xs font-semibold shadow hover:bg-red-700"
          >
            End Task
          </button>
        )}
      </td>
    </tr>
  );
});


// DesignerTable — parent component.
// Holds NO timer state. Re-renders only on data changes (user actions).
export default function DesignerTable({ refresh }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [err, setErr] = useState("");
  const [estimationErrors, setEstimationErrors] = useState({}); // { [job_no]: errorString }
  const [selectedJobNo, setSelectedJobNo] = useState(null);
  // Pagination & Sorting
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalJobs, setTotalJobs] = useState(0);
  // Separate from showSuccessPopup — toast is non-blocking (bottom banner),
  // popup is modal (center screen). Toast auto-dismisses in 4s.
  const [autoPauseToast, setAutoPauseToast] = useState(null); // { jobNo, action }

  // Stable ref so callbacks always see current jobs without being in deps
  const jobsRef              = useRef([]);
  const autoPauseTimerRef    = useRef(null);

  // Memoised slice — recomputes only when jobs/page/limit change
  const paginatedJobs = useMemo(
    () => jobs.slice((page - 1) * limit, page * limit),
    [jobs, page, limit],
  );
  const totalPages = Math.ceil(jobs.length / limit);

  // Cleanup on unmount
  useEffect(() => () => clearTimeout(autoPauseTimerRef.current), []);
  
  const showAutoPauseToast = useCallback((pausedJobNo, action) => {
    // Clear any existing toast timer before setting a new one
    clearTimeout(autoPauseTimerRef.current);
    setAutoPauseToast({ jobNo: pausedJobNo, action });
    autoPauseTimerRef.current = setTimeout(
      () => setAutoPauseToast(null),
      4000,
    );
  }, []);

  // ── fetchJobs: stable reference, empty deps ---
  const fetchJobs = useCallback(async () => {
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
          return {
            ...job,
            assignment,
            instructions: latestApproval?.client_feedback || "",
            isRework: latestApproval?.status === "changes_requested",
          };
        })
        .filter(Boolean);
      jobsRef.current = normalized;
      setJobs(normalized);
      setTotalJobs(res.data.total || normalized.length);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    fetchJobs();
  }, [refresh, fetchJobs]);
  
  // ── Action handlers — stable, read job via ref (no stale closures) ──

  const handleStart = useCallback(async (jobNo) => {
    const job = jobsRef.current.find((j) => j.job_no === jobNo);
    if (!job?.assignment?.estimated_completion_time) {
      alert("Please enter estimated completion time first.");
      return;
    }

    try {
      const res = await api.patch(`/api/fms/designers/${jobNo}/start`);
      const { auto_paused_job_no } = res.data;
      saveTimerToLS(jobNo, {
        baseSeconds: job.assignment.designer_duration_seconds || 0,
        lastTick: Date.now(),
        isRunning: true,
      });
      // Stop localStorage timer for the auto-paused job
      if(auto_paused_job_no){
        const stored = getTimerFromLS(auto_paused_job_no);
        if(stored?.isRunning){
          saveTimerToLS(auto_paused_job_no, {
            baseSeconds: stored.baseSeconds + Math.floor((Date.now() - stored.lastTick) / 1000),
            lastTick: null,
            isRunning: false,
          });
        }
        showAutoPauseToast(auto_paused_job_no, "started");
      }
      fetchJobs();
    } catch (err) {
      console.error(err);
    }
  }, [fetchJobs, showAutoPauseToast]);

  const handlePause = useCallback(async (jobNo) => {
    try {
      await api.patch(`/api/fms/designers/${jobNo}/pause`);

      const stored = getTimerFromLS(jobNo);

      if (stored?.isRunning) {
        const elapsed = Math.floor((Date.now() - stored.lastTick) / 1000);
        saveTimerToLS(jobNo, {
          baseSeconds: stored.baseSeconds + elapsed,
          lastTick: null,
          isRunning: false,
        });
      }
      fetchJobs(); // refresh duration from backend
    } catch (err) {
      console.error("Pause failed", err);
    }
  }, [fetchJobs]);

  const handleResume = useCallback(async (jobNo) => {
    const job = jobsRef.current.find((j) => j.job_no === jobNo);
    try {
      const res = await api.patch(`/api/fms/designers/${jobNo}/resume`);
      const { auto_paused_job_no } = res.data;
      const stored = getTimerFromLS(jobNo);
      const baseSeconds =
        stored?.baseSeconds ?? job.assignment.designer_duration_seconds ?? 0;

      saveTimerToLS(jobNo, {
        baseSeconds,
        lastTick: Date.now(),
        isRunning: true,
      });

      // Stop localStorage timer for the auto-paused job
      if (auto_paused_job_no) {
        const stored2 = getTimerFromLS(auto_paused_job_no);
        if (stored2?.isRunning) {
          const elapsed = Math.floor((Date.now() - stored2.lastTick) / 1000);
          saveTimerToLS(auto_paused_job_no, {
            baseSeconds: stored2.baseSeconds + elapsed,
            lastTick: null,
            isRunning: false,
          });
        }
        showAutoPauseToast(auto_paused_job_no, "resumed");
      }

      fetchJobs(); // ensure sync
    } catch (err) {
      console.error("Resume failed", err);
    }
  }, [fetchJobs, showAutoPauseToast]);

  const handleEnd = useCallback(async (jobNo) => {
    if (!jobNo) return;
    try {
      clearTimerFromLS(jobNo);
      await api.patch(`/api/fms/designers/${jobNo}/end`);
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
  }, [fetchJobs]);

  // ── Estimated-time handlers ---

  const handleTempTimeChange = useCallback((jobNo, val) => {
    setEstimationErrors((prev) => ({ ...prev, [jobNo]: null }));
    setJobs((prev) =>
      prev.map((j) => j.job_no === jobNo ? { ...j, tempEstimatedCompletionTime: val } : j),
    );
  }, []);

  const handleTimeBlur = useCallback(async (jobNo, val, validationError) => {
    if (validationError) {
      setEstimationErrors((prev) => ({ ...prev, [jobNo]: validationError }));
      return;
    }
    if (!val) return;
    setEstimationErrors((prev) => ({ ...prev, [jobNo]: null }));
    try {
      await api.patch("/api/fms/designers/set-estimated-time", {
        job_no:                   jobNo,
        estimated_completion_time: val,
      });
      setJobs((prev) =>
        prev.map((j) =>
          j.job_no === jobNo
            ? {
                ...j,
                assignment:               { ...j.assignment, estimated_completion_time: val },
                tempEstimatedCompletionTime: undefined,
              }
            : j,
        ),
      );
    } catch (e) {
      console.error("Failed to save estimated completion time", e);
      setEstimationErrors((prev) => ({
        ...prev,
        [jobNo]: e?.response?.data?.error || "Failed to save estimated completion time.",
      }));
    }
  }, []);

  const handleTimeFocus  = useCallback((jobNo) => {
    setEstimationErrors((prev) => ({ ...prev, [jobNo]: null }));
  }, []);

  const handleViewItems  = useCallback((jobNo) => setSelectedJobNo(jobNo), []);


  if (loading){
    return (
      <div className="text-center py-10 text-slate-600 text-lg">
        Loading job cards...
      </div>
    );
  }

  return (
    <div className="">
      {/* Success popup */}
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
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>
      )}

      {/* ── Auto-pause toast notification ─────────────────────────────────────
    Non-blocking — appears at bottom of screen, auto-dismisses after 4s.
    Shows which job was automatically paused when designer started/resumed
      a different job. ───────────────────────────────────────── */}
      {autoPauseToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-800 text-white text-sm px-5 py-3 rounded-xl shadow-xl animate-fade-in">
          <span className="text-yellow-400 text-base">⏸</span>
          <span>
            Job{" "}
            <span className="font-bold text-yellow-300">
              #{autoPauseToast.jobNo}
            </span>{" "}
            was automatically paused because you{" "}
            {autoPauseToast.action === "started" ? "started" : "resumed"} another job.
          </span>
          <button
            onClick={() => setAutoPauseToast(null)}
            className="ml-2 text-slate-400 hover:text-white text-xs"
          >✕</button>
        </div>
      )}

      {/* Header */}
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
              <th className="border p-1 sm:p-2">Items</th>
              <th className="border p-1 sm:p-2">Order Type</th>
              <th className="border p-1 sm:p-2">Order Handled By</th>
              <th className="border p-1 sm:p-2">Execution Location</th>
              <th className="border p-1 sm:p-2 min-w-[170px]">Delivery Date</th>
              <th className="border p-1 sm:p-2 max-w-[500px] ">
                Delivery Location
              </th>
              <th className="border p-1 sm:p-2">Proof Date</th>
              <th className="border p-1 sm:p-2 min-w-[150px text-center">
                Priority
              </th>
              <th className="border p-1 sm:p-2">Client Instructions</th>
              <th className="border p-1 sm:p-2">No of Files</th>
              <th className="border p-1 sm:p-2">Job Completion Deadline</th>
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
                <JobRow
                  key={job.job_no}
                  job={job}
                  index={index}
                  errMsg={estimationErrors[job.job_no]}
                  onStart={handleStart}
                  onPause={handlePause}
                  onResume={handleResume}
                  onEnd={handleEnd}
                  onTempTimeChange={handleTempTimeChange}
                  onTimeBlur={handleTimeBlur}
                  onTimeFocus={handleTimeFocus}
                  onViewItems={handleViewItems}
                />
              ))
            ) : (
              <tr>
                <td colSpan="17" className="text-center py-4 text-gray-500">
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
            <div className="flex justify-between items-center font-mono text-blue-600">
              <JobTimer
                jobNo={job.job_no}
                backendSeconds={job.assignment?.designer_duration_seconds || 0}
                isInProgress={job.status === "design_in_progress"}
                isPaused={job.assignment?.is_paused}
              />
            </div>

            {/* ACTIONS */}
            <div className="flex gap-2 flex-wrap">
              {job.status === "assigned_to_designer" && (
                <button
                  onClick={() => handleStart(job.job_no)}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
                >
                  Start
                </button>
              )}

              {job.status === "design_in_progress" && (
                <>
                  {!job.assignment.is_paused ? (
                    <button
                      onClick={() => handlePause(job.job_no)}
                      className="px-3 py-1 bg-yellow-500 text-white rounded text-xs"
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      onClick={() => handleResume(job.job_no)}
                      className="px-3 py-1 bg-green-600 text-white rounded text-xs"
                    >
                      Resume
                    </button>
                  )}

                  <button
                    onClick={() => handleEnd(job.job_no)}
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
