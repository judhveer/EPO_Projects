import { useEffect, useState, useCallback } from "react";
import api from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext.jsx";

const STAGE_LABELS = {
  printing: "Printing",
  binding: "Binding",
  quality_check: "Quality Check",
  packaging: "Packaging",
  ready_to_dispatch: "Ready to Dispatch",
  out_for_delivery: "Out for Delivery",
};


/**
 * Live timer component for a worker assignment.
 *
 * in_progress → green running timer (ticks every second)
 * paused      → static orange display showing time worked before pause
 *
 * On page refresh the timer initialises from server timestamps so it
 * is never reset to zero.
 *
 * Net work time = (elapsed since start) − total accumulated pause seconds
 * For paused state we use paused_at as the end point so the current
 * pause duration is not counted (it has not been committed yet).
 */
function WorkTimer({ started_at, paused_at, total_pause_duration_seconds, status }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!started_at) return;

    const calculate = () => {
      const startMs = new Date(started_at).getTime();
      const pauseSecs = total_pause_duration_seconds || 0;

      if (status === "in_progress") {
        return Math.max(
          0,
          Math.floor((Date.now() - startMs) / 1000) - pauseSecs
        );
      }
      if (status === "paused" && paused_at) {
        return Math.max(
          0,
          Math.floor((new Date(paused_at).getTime() - startMs) / 1000) -
            pauseSecs
        );
      }
      return 0;
    };

    setElapsed(calculate());
    if (status !== "in_progress") return;

    const interval = setInterval(() => setElapsed(calculate()), 1000);
    return () => clearInterval(interval);
  }, [status, started_at, paused_at, total_pause_duration_seconds]);

  const format = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n) => String(n).padStart(2, "0");
    if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  };

  if (!started_at) return null;

  const isRunning = status === "in_progress";

  return (
    <div className="text-right shrink-0">
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${
        isRunning ? "text-green-500" : "text-orange-400"
      }`}>
        {isRunning ? "⏱ Working" : "⏸ Paused"}
      </p>
      <p className={`text-xl font-black font-mono tabular-nums leading-none ${
        isRunning ? "text-green-700" : "text-gray-500"
      }`}>
        {format(elapsed)}
      </p>
    </div>
  );
}


// Silent background poll every 30 seconds so newly assigned jobs appear
// without the worker having to manually refresh.
const POLL_INTERVAL_MS = 30_000;

export default function WorkerDashboard() {
  const { user, logout } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Per-assignment submitting flag — prevents double-tap on slow networks
  const [submitting, setSubmitting] = useState({});

  const fetchAssignments = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const { data } = await api.get("/api/fms/worker/assignments");
      setAssignments(data);
    } catch {
      if (!silent) setError("Could not load your jobs. Check your connection.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // Background poll
  useEffect(() => {
    const interval = setInterval(
      () => fetchAssignments(true),
      POLL_INTERVAL_MS
    );
    return () => clearInterval(interval);
  }, [fetchAssignments]);

  const handleAction = async (assignmentId, action) => {
    setSubmitting((prev) => ({ ...prev, [assignmentId]: true }));
    try {
      await api.post(`/api/fms/worker/assignments/${assignmentId}/${action}`);

      if (action === "done") {
        // Optimistic removal — card vanishes immediately after DONE
        setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
      } else {
        // For start / pause / resume — re-fetch to get updated status
        await fetchAssignments(true);
      }
    } catch (err) {
      alert(
        err?.response?.data?.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting((prev) => ({ ...prev, [assignmentId]: false }));
    }
  };

  const handleLogout = () => {
    const hasActiveWork = assignments.some((a) => a.status === "in_progress");
    if (hasActiveWork) {
      const confirmed = window.confirm(
        "You have a job in progress. Please PAUSE it before logging out.\n\nLog out anyway?"
      );
      if (!confirmed) return;
    }
    logout();
  };

  // ── Full-screen loading ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center gap-4">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
        <p className="text-gray-500 text-sm">Loading your jobs...</p>
      </div>
    );
  }

  // ── Main dashboard ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100">
      {/* ── Sticky header ── */}
      <header className="bg-blue-700 text-white px-4 py-4 flex justify-between items-center shadow-md sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black tracking-tight">My Jobs</h1>
          <p className="text-xs text-blue-200 mt-0.5">
            Hello, <span className="font-semibold">{user?.username}</span>
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs bg-blue-600 hover:bg-blue-500 active:bg-blue-400 border border-blue-400 px-4 py-2 rounded-lg font-semibold transition"
        >
          Logout
        </button>
      </header>

      {/* ── Content ── */}
      <main className="p-4 max-w-lg mx-auto space-y-4 pb-10">
        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex justify-between items-center">
            <span>{error}</span>
            <button
              onClick={() => fetchAssignments()}
              className="underline font-semibold ml-3 shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {assignments.length === 0 && !error && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">✅</div>
            <p className="text-gray-700 font-bold text-xl">All done!</p>
            <p className="text-gray-400 text-sm mt-2">
              No jobs assigned to you right now.
            </p>
            <button
              onClick={() => fetchAssignments()}
              className="mt-6 text-blue-600 text-sm underline"
            >
              Refresh
            </button>
          </div>
        )}

        {/* Assignment cards */}
        {assignments.map((assignment) => (
          <AssignmentCard
            key={assignment.id}
            assignment={assignment}
            isSubmitting={submitting[assignment.id] || false}
            onAction={handleAction}
          />
        ))}
      </main>
    </div>
  );
}

// ── Assignment card ───────────────────────────────────────────────────────────
function AssignmentCard({ assignment, isSubmitting, onAction }) {
  const {
    id,
    status,
    stage_name,
    jobCard,
    started_at,
    paused_at,
    total_pause_duration_seconds,
  } = assignment;

  const stageLabel =
    STAGE_LABELS[stage_name] || stage_name?.replace(/_/g, " ");
  const isUrgent = jobCard?.task_priority === "Urgent";

  const statusConfig = {
    assigned: {
      label: "Not Started",
      style: "bg-gray-100 text-gray-600",
    },
    in_progress: {
      label: "Working",
      style: "bg-green-100 text-green-700",
    },
    paused: {
      label: "Paused",
      style: "bg-orange-100 text-orange-700",
    },
  }[status] || { label: status, style: "bg-gray-100 text-gray-500" };

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden ${
        isUrgent ? "border-red-400" : "border-gray-100"
      }`}
    >
      {/* Urgent banner */}
      {isUrgent && (
        <div className="bg-red-500 text-white text-xs font-black text-center py-1.5 tracking-widest uppercase">
          ⚡ Urgent Job
        </div>
      )}

      <div className="p-4">
        {/* Job info row */}
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-3xl font-black text-blue-700 leading-none">
              #{jobCard?.job_no}
            </p>
            <p className="text-sm font-semibold text-gray-700 mt-1">
              {jobCard?.client_name}
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ml-2 ${statusConfig.style}`}
          >
            {statusConfig.label}
          </span>
        </div>

        {/* Stage pill */}
        {/* Stage pill with inline timer on the right */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 mb-5">
          <div className="flex justify-between items-start gap-2">
            <div>
              <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-widest mb-0.5">
                Your Stage
              </p>
              <p className="text-lg font-black text-blue-800">{stageLabel}</p>
            </div>

            {started_at && (
              <WorkTimer
                started_at={started_at}
                paused_at={paused_at}
                total_pause_duration_seconds={total_pause_duration_seconds}
                status={status}
              />
            )}
          </div>
        </div>

        {/* ── Action buttons ── */}

        {/* NOT STARTED — single large START button */}
        {status === "assigned" && (
          <button
            onClick={() => onAction(id, "start")}
            disabled={isSubmitting}
            className="w-full py-5 rounded-2xl bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-black text-2xl disabled:opacity-50 transition shadow-md"
          >
            {isSubmitting ? "Starting..." : "▶  START"}
          </button>
        )}

        {/* IN PROGRESS — PAUSE + DONE */}
        {status === "in_progress" && (
          <div className="flex gap-3">
            <button
              onClick={() => onAction(id, "pause")}
              disabled={isSubmitting}
              className="flex-1 py-5 rounded-2xl bg-orange-400 hover:bg-orange-500 active:bg-orange-600 text-white font-black text-lg disabled:opacity-50 transition shadow-md"
            >
              {isSubmitting ? "..." : "⏸  PAUSE"}
            </button>
            <button
              onClick={() => onAction(id, "done")}
              disabled={isSubmitting}
              className="flex-1 py-5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-lg disabled:opacity-50 transition shadow-md"
            >
              {isSubmitting ? "..." : "✓  DONE"}
            </button>
          </div>
        )}

        {/* PAUSED — RESUME + DONE */}
        {status === "paused" && (
          <div className="flex gap-3">
            <button
              onClick={() => onAction(id, "resume")}
              disabled={isSubmitting}
              className="flex-1 py-5 rounded-2xl bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-black text-lg disabled:opacity-50 transition shadow-md"
            >
              {isSubmitting ? "..." : "▶  RESUME"}
            </button>
            <button
              onClick={() => onAction(id, "done")}
              disabled={isSubmitting}
              className="flex-1 py-5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-lg disabled:opacity-50 transition shadow-md"
            >
              {isSubmitting ? "..." : "✓  DONE"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}