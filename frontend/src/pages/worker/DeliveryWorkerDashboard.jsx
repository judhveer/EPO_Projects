import { useEffect, useState, useCallback } from "react";
import api from "../../lib/api.js";
import WorkerSwitcherHeader from "../../components/worker/WorkerSwitcherHeader.jsx";
import DeliveryCard from "../../components/worker/DeliveryCard.jsx";

// Silent background poll — new assignments from coordinator appear automatically
const POLL_INTERVAL_MS = 30_000;

export default function DeliveryWorkerDashboard() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAssignments = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const { data } = await api.get("/api/fms/delivery-worker/assignments");
      setAssignments(data);
    } catch {
      if (!silent)
        setError("Could not load your deliveries. Check your connection.");
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

  // Called by a card after it successfully confirms — removes it from list
  const handleConfirmed = (assignmentId) => {
    setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
  };

  // ── Full-screen loading ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center gap-4">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
        <p className="text-gray-500 text-sm">Loading your deliveries...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ── Sticky header ── */}
      <WorkerSwitcherHeader title="My Deliveries" />

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
            <div className="text-6xl mb-4">🚚</div>
            <p className="text-gray-700 font-bold text-xl">
              No pending deliveries
            </p>
            <p className="text-gray-400 text-sm mt-2">
              You have no deliveries to confirm right now.
            </p>
            <button
              onClick={() => fetchAssignments()}
              className="mt-6 text-blue-600 text-sm underline"
            >
              Refresh
            </button>
          </div>
        )}

        {/* Delivery cards */}
        {assignments.map((assignment) => (
          <DeliveryCard
            key={assignment.id}
            assignment={assignment}
            onConfirmed={handleConfirmed}
          />
        ))}
      </main>
    </div>
  );
}