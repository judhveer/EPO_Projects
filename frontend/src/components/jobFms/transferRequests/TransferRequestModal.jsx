import React, { useState } from "react";
import api from "../../../lib/api.js";

export default function TransferRequestModal({
  job,
  availableDesigners,
  onClose,
  onSuccess,
}) {
  const [toDesignerId, setToDesignerId] = useState("");
  const [reason, setReason]             = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);

  // Designers who already have a pending request for this job.
  // Used to surface a warning label in the dropdown — not to disable
  // the option (backend enforces the 2-request cap).
  const pendingToIds = new Set(
    (job.transferRequests || [])
      .filter((r) => r.status === "pending")
      .map((r) => r.to_designer_id)
  );

  const isValid = toDesignerId !== "" && reason.trim() !== "";

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/fms/designers/transfer-requests", {
        job_no:         job.job_no,
        to_designer_id: toDesignerId,
        request_reason: reason.trim(),
      });
      onSuccess();
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to send transfer request."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
        <h3 className="text-lg font-bold text-blue-700 mb-1">
          Request Job Transfer
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Job #{job.job_no} — {job.client_name}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Transfer to <span className="text-red-500">*</span>
            </label>
            <select
              value={toDesignerId}
              onChange={(e) => setToDesignerId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">— Select a designer —</option>
              {availableDesigners.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.username}
                  {pendingToIds.has(d.id) ? " ⏳ (request pending)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Reason for transfer <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why are you requesting a transfer? (e.g. occupied with an urgent job)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>

          <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            ℹ️ Maximum <strong>2 requests per designer per job</strong>. The job
            stays with you unless accepted.
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg
                       hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !isValid}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg
                       hover:bg-blue-700 disabled:opacity-50
                       disabled:cursor-not-allowed font-semibold"
          >
            {loading ? "Sending…" : "Send Request"}
          </button>
        </div>
      </div>
    </div>
  );
}