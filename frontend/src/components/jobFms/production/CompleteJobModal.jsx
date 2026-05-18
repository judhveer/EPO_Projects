import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../../lib/api.js";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
const MAX_SIZE_MB = 10;

export default function CompleteJobModal({ job, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [challanNo, setChallanNo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [file, setFile] = useState(null);

  if (!job) return null;
  const isShipment = job.delivery_location?.endsWith("_SHIPMENT");
  const isPickup = job.delivery_location?.endsWith("_PICKUP");

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) { setFile(null); return; }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Max ${MAX_SIZE_MB} MB.`);
      e.target.value = "";
      return;
    }
    setError(null);
    setFile(f);
  };

  const handleSubmit = async () => {
    setError(null);
    if (isShipment) {
      if (!challanNo.trim()) { setError("Challan number is required."); return; }
      if (!file) { setError("Challan file is required."); return; }
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (isShipment) {
        fd.append("challan_no", challanNo.trim());
        fd.append("challan_file", file);
      }
      if (remarks.trim()) fd.append("remarks", remarks.trim());

      await api.post(`/api/fms/production/${job.job_no}/complete`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to complete the job.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
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
              <h3 className="text-xl font-bold text-emerald-700">Complete Job</h3>
              <p className="text-sm text-gray-500">
                Job <span className="font-semibold">#{job.job_no}</span> — {job.client_name}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 text-sm">
            <div className="text-xs text-gray-500 mb-1">Delivery Type</div>
            <div className="font-semibold">
              {isPickup ? "🚶 Pickup (Customer Collected)" : "🚚 Shipment"}
            </div>
            <div className="text-xs text-gray-500 mt-1">{job.delivery_location?.replace(/_/g, " ")}</div>
            {job.delivery_persons_name && (
              <div className="text-xs text-gray-600 mt-1">Delivered by: <span className="font-medium">{job.delivery_persons_name}</span></div>
            )}
          </div>

          {isShipment && (
            <>
              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Challan Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text" value={challanNo} onChange={(e) => setChallanNo(e.target.value)}
                  placeholder="e.g. CH-2026-00451" disabled={submitting}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Challan Document <span className="text-red-500">*</span>
                </label>
                <input
                  type="file" accept={ACCEPT} onChange={handleFileChange} disabled={submitting}
                  className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200"
                />
                <p className="text-xs text-gray-400 mt-1">PDF, JPG, or PNG. Max {MAX_SIZE_MB} MB. Uploads to Google Drive.</p>
                {file && <p className="text-xs text-green-700 mt-1">✓ {file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
              </div>
            </>
          )}

          {isPickup && (
            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              No challan required for pickup. Click Confirm to mark as completed.
            </div>
          )}

          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Remarks</label>
            <textarea
              value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2}
              placeholder="Optional" disabled={submitting}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-2 rounded mb-3">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} disabled={submitting}
              className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">
              {submitting ? (isShipment ? "Uploading..." : "Completing...") : "Confirm & Complete"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}