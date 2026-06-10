import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../../lib/api.js";
import StageChip from "./StageChip.jsx";
import WorkerSelect from "./WorkerSelect.jsx";

const STAGES_REQUIRING_WORKERS = [
  "printing",
  "binding",
  "quality_check",
  "packaging",
];

const STAGE_WORKER_LABEL = {
  printing: "Printing Workers",
  binding: "Binding Workers",
  quality_check: "QC Workers",
  packaging: "Packaging Workers",
  out_for_delivery: "Delivery Workers",
};

// Delivery assignment status badges (existing)
const STATUS_BADGE = {
  pending: "bg-orange-100 text-orange-700",
  confirmed: "bg-green-100 text-green-700",
  overridden: "bg-gray-100 text-gray-600",
};

// NEW: Worker assignment status badges
const WORKER_STATUS_BADGE = {
  assigned: "bg-gray-100 text-gray-600",
  in_progress: "bg-green-100 text-green-700",
  paused: "bg-orange-100 text-orange-700",
  completed: "bg-blue-100 text-blue-700",
  force_completed: "bg-purple-100 text-purple-700",
  cancelled: "bg-gray-100 text-gray-400",
};

// NEW: Human-readable labels for worker status
const WORKER_STATUS_LABEL = {
  assigned: "Not Started",
  in_progress: "Working",
  paused: "Paused",
  completed: "Done ✓",
  force_completed: "Force Done",
  cancelled: "Cancelled",
};

/**
 * NEW: Calculates net productive work time for display.
 * Net = (end_time - started_at) - total_pause_duration_seconds
 * end_time = completed_at if done, paused_at if paused, NOW if in_progress.
 * Returns human-readable string or null if worker never started.
 */
function calcWorkTime(w) {
  if (!w.started_at) return null;

  const startMs = new Date(w.started_at).getTime();
  const endMs = w.completed_at
    ? new Date(w.completed_at).getTime()
    : w.paused_at
      ? new Date(w.paused_at).getTime()
      : Date.now();

  const netSecs = Math.max(
    0,
    Math.floor((endMs - startMs) / 1000) -
      (w.total_pause_duration_seconds || 0),
  );

  if (netSecs < 60) return `${netSecs}s`;
  if (netSecs < 3600) return `${Math.floor(netSecs / 60)}m`;
  const h = Math.floor(netSecs / 3600);
  const m = Math.floor((netSecs % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function AdvanceStageModal({ job, onClose, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [opts, setOpts] = useState(null);
  const [error, setError] = useState(null);
  const [action, setAction] = useState(null);
  const [workerIds, setWorkerIds] = useState([]);
  const [remarks, setRemarks] = useState("");
  const [existingWorkers, setExistingWorkers] = useState({});
  const [acknowledgedIncomplete, setAcknowledgedIncomplete] = useState(false);

  // Delivery override state (existing)
  const [overriding, setOverriding] = useState(null);
  const [overrideForm, setOverrideForm] = useState({
    reason: "",
    challanNo: "",
    challanFile: null,
    materialFile: null,
  });

  // NEW: Worker force-complete state
  const [forcingComplete, setForcingComplete] = useState(null); // assignment id
  const [forceReason, setForceReason] = useState("");

  // Load valid stages + delivery assignments + worker summary
  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get(
          `/api/fms/production/${job.job_no}/valid-stages`,
        );
        if (!cancelled) setOpts(data);
      } catch (err) {
        if (!cancelled)
          setError(err?.response?.data?.message || "Failed to load options.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job?.job_no]);

  // Load existing stage workers for revert pre-population
  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    api
      .get(`/api/fms/production/${job.job_no}/stage-workers`)
      .then(({ data }) => {
        if (!cancelled) setExistingWorkers(data || {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [job?.job_no]);

  const handleActionSelect = useCallback(
    (newAction) => {
      setAction(newAction);
      setError(null);
      setRemarks("");
      setAcknowledgedIncomplete(false);
      if (newAction.type === "reverse" && newAction.stage) {
        const existing = existingWorkers[newAction.stage] || [];
        setWorkerIds(existing.map((w) => w.worker_id).filter(Boolean));
      } else {
        setWorkerIds([]);
      }
    },
    [existingWorkers],
  );

  // NEW: Force-complete a stuck worker assignment
  const handleForceComplete = async (assignmentId) => {
    if (!forceReason.trim()) {
      setError("Reason is required for force completion.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(
        `/api/fms/production/${job.job_no}/worker-assignments/${assignmentId}/force-complete`,
        { reason: forceReason.trim() },
      );
      // Refresh opts to get updated worker summary
      const { data: fresh } = await api.get(
        `/api/fms/production/${job.job_no}/valid-stages`,
      );
      setOpts(fresh);
      setForcingComplete(null);
      setForceReason("");
    } catch (err) {
      setError(err?.response?.data?.message || "Force completion failed.");
    } finally {
      setSubmitting(false);
    }
  };

  // Delivery override handler (existing — unchanged)
  const handleOverride = async (assignmentId) => {
    const { reason, challanNo, challanFile } = overrideForm;
    if (!reason.trim()) {
      setError("Override reason is required.");
      return;
    }
    if (!challanNo.trim()) {
      setError("Challan number is required.");
      return;
    }
    if (!challanFile) {
      setError("Challan file is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("override_reason", reason.trim());
      fd.append("challan_no", challanNo.trim());
      fd.append("challan_file", challanFile);
      if (overrideForm.materialFile)
        fd.append("material_photo", overrideForm.materialFile);

      const { data } = await api.post(
        `/api/fms/production/${job.job_no}/delivery-assignments/${assignmentId}/override`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );

      if (data.all_confirmed) {
        onSuccess?.();
        onClose();
      } else {
        const { data: fresh } = await api.get(
          `/api/fms/production/${job.job_no}/valid-stages`,
        );
        setOpts(fresh);
        setOverriding(null);
        setOverrideForm({
          reason: "",
          challanNo: "",
          challanFile: null,
          materialFile: null,
        });
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Override failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!action) return;
    setError(null);
    const requiresWorkers =
      STAGES_REQUIRING_WORKERS.includes(action.stage) ||
      action.stage === "out_for_delivery";
    if (requiresWorkers && workerIds.length === 0) {
      setError(
        `At least one worker is required for ${action.stage?.replace(/_/g, " ")}.`,
      );
      return;
    }
    if (action.type === "reverse" && !remarks.trim()) {
      setError("Remarks are required for revert.");
      return;
    }
    setSubmitting(true);
    try {
      let url, body;
      if (action.type === "forward") {
        url = `/api/fms/production/${job.job_no}/advance-stage`;
        body = {
          to_stage: action.stage,
          worker_ids: requiresWorkers ? workerIds : [],
          remarks: remarks.trim() || undefined,
        };
      } else if (action.type === "reverse") {
        url = `/api/fms/production/${job.job_no}/revert-stage`;
        body = {
          to_stage: action.stage,
          worker_ids: requiresWorkers ? workerIds : [],
          remarks: remarks.trim(),
        };
      } else {
        url = `/api/fms/production/${job.job_no}/mark-delivered`;
        body = remarks.trim() ? { remarks: remarks.trim() } : {};
      }
      await api.post(url, body);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Action failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const requiresWorkers =
    action?.stage &&
    (STAGES_REQUIRING_WORKERS.includes(action.stage) ||
      action.stage === "out_for_delivery");

  const showDeliveryPanel =
    opts?.delivery_mode === "shipment" &&
    opts?.current_production_stage === "out_for_delivery" &&
    opts?.delivery_assignments?.length > 0;

  // NEW: Show worker summary when the current stage has assigned workers
  // out_for_delivery uses DeliveryAssignment + Override — never JobProductionStageWorker
  // Force Done buttons must not appear for delivery stage
  const showWorkerSummary =
    opts?.stage_worker_summary != null &&
    opts.stage_worker_summary.total > 0 &&
    opts?.current_production_stage !== "out_for_delivery";

  return (
    <AnimatePresence>
      {job && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 22 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold text-blue-700">
                  Update Stage
                </h3>
                <p className="text-sm text-gray-500">
                  Job <span className="font-semibold">#{job.job_no}</span> —{" "}
                  {job.client_name}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* ── Current stage info ── */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
              <div className="text-xs text-gray-500 mb-1">Current Stage</div>
              <StageChip
                value={opts?.current_production_stage || opts?.status}
                fallback="Not Started"
              />
              {opts?.delivery_mode && (
                <div className="text-xs text-gray-500 mt-2">
                  Delivery:{" "}
                  <span className="font-semibold uppercase">
                    {opts.delivery_mode}
                  </span>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-8 w-8 border-b-2 border-blue-700 rounded-full" />
              </div>
            ) : (
              <>
                {/* ════════════════════════════════════════════════════════
                    NEW: Stage worker status panel
                    Shows per-worker status + time + force-complete button.
                    Coordinator sees this before deciding to advance/revert.
                ════════════════════════════════════════════════════════ */}
                {showWorkerSummary && (
                  <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
                    {/* Panel header with completion count */}
                    <div
                      className={`px-3 py-2 text-xs font-semibold uppercase flex justify-between items-center ${
                        opts.stage_worker_summary.all_done
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-50 text-gray-600"
                      }`}
                    >
                      <span>Stage Workers</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          opts.stage_worker_summary.all_done
                            ? "bg-green-100 text-green-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {opts.stage_worker_summary.done}/
                        {opts.stage_worker_summary.total} done
                      </span>
                    </div>

                    {/* Warning banner if not all done */}
                    {opts.stage_worker_summary.has_incomplete && (
                      <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
                        ⚠️ Some workers have not finished. Force-complete them
                        below, or advance anyway — remaining workers will be
                        auto force-completed.
                      </div>
                    )}

                    {/* Per-worker rows */}
                    {opts.stage_worker_summary.workers.map((w) => {
                      const isPending = [
                        "assigned",
                        "in_progress",
                        "paused",
                      ].includes(w.status);
                      const workTime = calcWorkTime(w);

                      return (
                        <div
                          key={w.id}
                          className="px-3 py-2.5 border-t border-gray-100"
                        >
                          {/* Worker info row */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-gray-800 truncate block">
                                {w.worker_name}
                              </span>
                              {workTime && (
                                <span className="text-[11px] text-gray-400">
                                  ⏱ {workTime} worked
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  WORKER_STATUS_BADGE[w.status] ||
                                  "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {WORKER_STATUS_LABEL[w.status] || w.status}
                              </span>
                              {isPending && forcingComplete !== w.id && (
                                <button
                                  onClick={() => {
                                    setForcingComplete(w.id);
                                    setForceReason("");
                                    setError(null);
                                  }}
                                  className="text-xs px-2 py-0.5 bg-red-100 text-red-700 border border-red-300 rounded hover:bg-red-200 whitespace-nowrap"
                                >
                                  Force Done
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Force-complete inline form */}
                          {forcingComplete === w.id && (
                            <div className="mt-2.5 pt-2.5 border-t border-red-100 space-y-2">
                              <p className="text-xs text-red-700 font-semibold">
                                Force-complete {w.worker_name}
                              </p>
                              <input
                                type="text"
                                value={forceReason}
                                onChange={(e) => setForceReason(e.target.value)}
                                placeholder="Reason — e.g. worker left early (required)"
                                disabled={submitting}
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:border-red-400 focus:ring-1 focus:ring-red-400"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    setForcingComplete(null);
                                    setForceReason("");
                                    setError(null);
                                  }}
                                  disabled={submitting}
                                  className="flex-1 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleForceComplete(w.id)}
                                  disabled={submitting}
                                  className="flex-1 py-1.5 rounded bg-red-500 hover:bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
                                >
                                  {submitting ? "..." : "Confirm Force Done"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* ════════════════ END worker summary panel ════════════════ */}

                {/* Delivery assignments panel (existing — unchanged) */}
                {showDeliveryPanel && (
                  <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 uppercase">
                      Delivery Assignment Status
                    </div>

                    {opts.delivery_assignments.map((da) => (
                      <div
                        key={da.id}
                        className="px-3 py-2.5 border-t border-gray-100"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-sm font-medium">
                              {da.worker_name}
                            </span>
                            {da.challan_no && (
                              <span className="text-xs text-gray-500 ml-2">
                                Challan: {da.challan_no}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[da.status]}`}
                            >
                              {da.status}
                            </span>
                            {da.status === "pending" &&
                              overriding !== da.id && (
                                <button
                                  onClick={() => {
                                    setOverriding(da.id);
                                    setOverrideForm({
                                      reason: "",
                                      challanNo: "",
                                      challanFile: null,
                                      materialFile: null,
                                    });
                                    setError(null);
                                  }}
                                  className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 border border-orange-300 rounded hover:bg-orange-200"
                                >
                                  Override
                                </button>
                              )}
                          </div>
                        </div>

                        {overriding === da.id && (
                          <div className="mt-3 pt-3 border-t border-orange-100 space-y-2.5">
                            <p className="text-xs font-semibold text-orange-700">
                              Override: upload documents on behalf of{" "}
                              {da.worker_name}
                            </p>

                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Override Reason{" "}
                                <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={overrideForm.reason}
                                onChange={(e) =>
                                  setOverrideForm((f) => ({
                                    ...f,
                                    reason: e.target.value,
                                  }))
                                }
                                placeholder="Why are you overriding?"
                                disabled={submitting}
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Challan Number{" "}
                                <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={overrideForm.challanNo}
                                onChange={(e) =>
                                  setOverrideForm((f) => ({
                                    ...f,
                                    challanNo: e.target.value,
                                  }))
                                }
                                placeholder="e.g. CH-2026-00451"
                                disabled={submitting}
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Challan Document{" "}
                                <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                disabled={submitting}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f && f.size > 10 * 1024 * 1024) {
                                    alert("File too large. Max 10 MB.");
                                    e.target.value = "";
                                    return;
                                  }
                                  setOverrideForm((prev) => ({
                                    ...prev,
                                    challanFile: f || null,
                                  }));
                                }}
                                className="w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200"
                              />
                              {overrideForm.challanFile && (
                                <p className="text-[11px] text-green-700 mt-0.5">
                                  ✓ {overrideForm.challanFile.name}
                                </p>
                              )}
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Material Photo{" "}
                                <span className="text-gray-400 font-normal">
                                  (optional)
                                </span>
                              </label>
                              <input
                                type="file"
                                accept=".jpg,.jpeg,.png"
                                disabled={submitting}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f && f.size > 10 * 1024 * 1024) {
                                    alert("File too large. Max 10 MB.");
                                    e.target.value = "";
                                    return;
                                  }
                                  setOverrideForm((prev) => ({
                                    ...prev,
                                    materialFile: f || null,
                                  }));
                                }}
                                className="w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                              />
                              {overrideForm.materialFile && (
                                <p className="text-[11px] text-green-700 mt-0.5">
                                  ✓ {overrideForm.materialFile.name}
                                </p>
                              )}
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => {
                                  setOverriding(null);
                                  setOverrideForm({
                                    reason: "",
                                    challanNo: "",
                                    challanFile: null,
                                    materialFile: null,
                                  });
                                  setError(null);
                                }}
                                disabled={submitting}
                                className="flex-1 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleOverride(da.id)}
                                disabled={submitting}
                                className="flex-1 py-1.5 rounded bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold disabled:opacity-50"
                              >
                                {submitting
                                  ? "Uploading..."
                                  : "Confirm Override"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    <div className="bg-blue-50 px-3 py-2 text-xs text-blue-700">
                      Job will move to Delivered automatically when all
                      assignments are confirmed or overridden.
                    </div>
                  </div>
                )}

                {/* Forward actions (existing — unchanged) */}
                {opts?.forward_stages?.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-600 uppercase mb-2">
                      Move Forward To
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {opts.forward_stages.map((s) => (
                        <button
                          key={s.value}
                          onClick={() =>
                            handleActionSelect({
                              type: "forward",
                              stage: s.value,
                            })
                          }
                          className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                            action?.type === "forward" &&
                            action.stage === s.value
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50"
                          }`}
                        >
                          → {s.label}
                          {(STAGES_REQUIRING_WORKERS.includes(s.value) ||
                            s.value === "out_for_delivery") && (
                            <span className="block text-[10px] opacity-60 mt-0.5">
                              select workers
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mark Delivered — pickup only (existing — unchanged) */}
                {opts?.can_mark_delivered && (
                  <div className="mb-4">
                    <button
                      onClick={() => handleActionSelect({ type: "deliver" })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm font-semibold transition ${
                        action?.type === "deliver"
                          ? "bg-green-600 text-white border-green-600"
                          : "bg-white text-green-700 border-green-400 hover:bg-green-50"
                      }`}
                    >
                      ✅ Mark as Delivered (Customer Collected)
                    </button>
                  </div>
                )}

                {/* Reverse actions (existing — unchanged) */}
                {opts?.reverse_stages?.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-600 uppercase mb-2">
                      Revert To{" "}
                      <span className="text-orange-500">
                        (remarks required)
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {opts.reverse_stages.map((s) => (
                        <button
                          key={s.value}
                          onClick={() =>
                            handleActionSelect({
                              type: "reverse",
                              stage: s.value,
                            })
                          }
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                            action?.type === "reverse" &&
                            action.stage === s.value
                              ? "bg-orange-500 text-white border-orange-500"
                              : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50"
                          }`}
                        >
                          ↶ {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Context inputs after action selected (existing — unchanged) */}
                {action && (
                  <div className="border-t pt-4 mt-2 space-y-4">
                    {requiresWorkers && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          {STAGE_WORKER_LABEL[action.stage] || "Workers"}{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <WorkerSelect
                          role={
                            action.stage === "out_for_delivery"
                              ? "delivery"
                              : action.stage
                          }
                          value={workerIds}
                          onChange={setWorkerIds}
                          disabled={submitting}
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Remarks{" "}
                        {action.type === "reverse" && (
                          <span className="text-red-500">*</span>
                        )}
                      </label>
                      <textarea
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        rows={2}
                        placeholder={
                          action.type === "reverse"
                            ? "Reason for revert (required)"
                            : "Optional note"
                        }
                        disabled={submitting}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {/* ── Acknowledgment checkbox when advancing with incomplete workers ── */}
                    {action.type === "forward" &&
                      opts?.stage_worker_summary?.has_incomplete && (
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={acknowledgedIncomplete}
                            onChange={(e) =>
                              setAcknowledgedIncomplete(e.target.checked)
                            }
                            disabled={submitting}
                            className="mt-0.5 accent-orange-500"
                          />
                          <span className="text-xs text-orange-700 font-medium">
                            I understand{" "}
                            {opts.stage_worker_summary.total -
                              opts.stage_worker_summary.done}{" "}
                            worker(s) have not completed. Advancing will auto
                            force-complete them.
                          </span>
                        </label>
                      )}

                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-2 rounded">
                        {error}
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => {
                          setAction(null);
                          setError(null);
                          setRemarks("");
                          setWorkerIds([]);
                          setAcknowledgedIncomplete(false);
                        }}
                        disabled={submitting}
                        className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium"
                      >
                        Change Action
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={
                          submitting ||
                          // Block Confirm if incomplete workers exist and coordinator hasn't acknowledged
                          (action.type === "forward" &&
                            opts?.stage_worker_summary?.has_incomplete &&
                            !acknowledgedIncomplete)
                        }
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
                      >
                        {submitting ? "Processing..." : "Confirm"}
                      </button>
                    </div>
                  </div>
                )}

                {error && !action && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-2 rounded mt-2">
                    {error}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
