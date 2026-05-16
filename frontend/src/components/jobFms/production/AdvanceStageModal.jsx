import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../../lib/api.js";
import StageChip from "./StageChip.jsx";

export default function AdvanceStageModal({ job, onClose, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [opts, setOpts] = useState(null);
  const [error, setError] = useState(null);
  const [action, setAction] = useState(null); // { type, stage? }
  const [deliveryPersonsName, setDeliveryPersonsName] = useState("");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const { data } = await api.get(`/api/fms/production/${job.job_no}/valid-stages`);
        if (!cancelled) setOpts(data);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || "Failed to load options.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [job?.job_no]);

  const requiresDeliveryNames = action?.type === "forward" && action.stage === "out_for_delivery";
  const requiresRemarks = action?.type === "reverse";

  const resetSelection = () => {
    setAction(null); setError(null); setRemarks(""); setDeliveryPersonsName("");
  };

  const handleSubmit = async () => {
    if (!action) return;
    setError(null);
    setSubmitting(true);
    try {
      let url, body;
      if (action.type === "forward") {
        url = `/api/fms/production/${job.job_no}/advance-stage`;
        body = { to_stage: action.stage };
        if (remarks.trim()) body.remarks = remarks.trim();
        if (action.stage === "out_for_delivery") {
          if (!deliveryPersonsName.trim()) throw new Error("Delivery person name(s) is required.");
          body.delivery_persons_name = deliveryPersonsName.trim();
        }
      } else if (action.type === "reverse") {
        if (!remarks.trim()) throw new Error("Remarks are required for revert.");
        url = `/api/fms/production/${job.job_no}/revert-stage`;
        body = { to_stage: action.stage, remarks: remarks.trim() };
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

  return (
    <AnimatePresence>
      {job && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 22 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold text-blue-700">Update Stage</h3>
                <p className="text-sm text-gray-500">
                  Job <span className="font-semibold">#{job.job_no}</span> — {job.client_name}
                </p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
              <div className="text-xs text-gray-500 mb-1">Current Stage</div>
              <StageChip value={opts?.current_production_stage || opts?.status} fallback="Not Started" />
              {opts?.delivery_mode && (
                <div className="text-xs text-gray-500 mt-2">
                  Delivery: <span className="font-semibold uppercase">{opts.delivery_mode}</span>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-8 w-8 border-b-2 border-blue-700 rounded-full"></div>
              </div>
            ) : error && !action ? (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded">{error}</div>
            ) : (
              <>
                {opts?.forward_stages?.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-600 uppercase mb-2">Move Forward To</div>
                    <div className="grid grid-cols-2 gap-2">
                      {opts.forward_stages.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => { setAction({ type: "forward", stage: s.value }); setError(null); }}
                          className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                            action?.type === "forward" && action.stage === s.value
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50"
                          }`}
                        >
                          → {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {opts?.can_mark_delivered && (
                  <div className="mb-4">
                    <button
                      onClick={() => { setAction({ type: "deliver" }); setError(null); }}
                      className={`w-full px-3 py-2 rounded-lg border text-sm font-semibold transition ${
                        action?.type === "deliver"
                          ? "bg-green-600 text-white border-green-600"
                          : "bg-white text-green-700 border-green-400 hover:bg-green-50"
                      }`}
                    >
                      ✅ Mark as Delivered ({opts.delivery_mode === "pickup" ? "Customer Collected" : "Driver Confirmed"})
                    </button>
                  </div>
                )}

                {opts?.reverse_stages?.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-600 uppercase mb-2">Revert To (remarks required)</div>
                    <div className="grid grid-cols-2 gap-2">
                      {opts.reverse_stages.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => { setAction({ type: "reverse", stage: s.value }); setError(null); }}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                            action?.type === "reverse" && action.stage === s.value
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

                {action && (
                  <div className="border-t pt-4 mt-2 space-y-3">
                    {requiresDeliveryNames && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Delivery Person Name(s) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={deliveryPersonsName}
                          onChange={(e) => setDeliveryPersonsName(e.target.value)}
                          placeholder="e.g. Ramesh, Suresh"
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-400 mt-1">Comma-separated if multiple.</p>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Remarks {requiresRemarks && <span className="text-red-500">*</span>}
                      </label>
                      <textarea
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        rows={2}
                        placeholder={requiresRemarks ? "Reason for revert (required)" : "Optional note"}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-2 rounded">{error}</div>}

                    <div className="flex justify-end gap-2 pt-2">
                      <button onClick={resetSelection} disabled={submitting}
                        className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium">
                        Change Action
                      </button>
                      <button onClick={handleSubmit} disabled={submitting}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
                        {submitting ? "Processing..." : "Confirm"}
                      </button>
                    </div>
                  </div>
                )}

                {!action && !opts?.forward_stages?.length && !opts?.can_mark_delivered && !opts?.reverse_stages?.length && (
                  <div className="text-center text-gray-500 py-4 text-sm">No actions available for this job.</div>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}