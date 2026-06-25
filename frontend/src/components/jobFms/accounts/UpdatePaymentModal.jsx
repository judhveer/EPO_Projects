import React, { useState } from "react";
import api from "../../../lib/api.js";

const PAYMENT_STATUSES = ["Un-paid", "Half Paid", "Paid"];
const MODES_OF_PAYMENT = ["cash", "upi", "neft", "rtgs", "pfms", "cheque"];

export default function UpdatePaymentModal({ job, onClose, onSuccess }) {
  const [paymentStatus, setPaymentStatus] = useState(job.payment_status || "Un-paid");
  const [modeOfPayment, setModeOfPayment] = useState(job.mode_of_payment || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Mode of payment is required only when marking Paid
  const isValid = paymentStatus !== "Paid" || modeOfPayment !== "";

  const handleSubmit = async () => {
    if (!isValid) {
      setError("Mode of payment is required when marking as Paid.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.patch(`/api/fms/accounts/${job.job_no}/payment`, {
        payment_status: paymentStatus,
        ...(modeOfPayment ? { mode_of_payment: modeOfPayment } : {}),
      });
      onSuccess(data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update payment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">

        {/* Header */}
        <h3 className="text-lg font-bold text-blue-700 mb-0.5">Update Payment</h3>
        <div className="text-xs text-gray-500 mb-1">
          Job #{job.job_no} — {job.client_name}
        </div>
        <div className="text-xs text-gray-500 mb-4">
          Bill Type:{" "}
          <span className="font-semibold text-blue-700">{job.bill_type}</span>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Payment Status */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Payment Status <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-3 flex-wrap">
            {PAYMENT_STATUSES.map((ps) => (
              <label key={ps} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="paymentStatus"
                  value={ps}
                  checked={paymentStatus === ps}
                  onChange={() => setPaymentStatus(ps)}
                  className="accent-blue-600 w-4 h-4"
                />
                <span className="text-sm text-gray-700">{ps}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Mode of Payment */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Mode of Payment{" "}
            {paymentStatus === "Paid" && <span className="text-red-500">*</span>}
          </label>
          <select
            value={modeOfPayment}
            onChange={(e) => setModeOfPayment(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">— Select mode —</option>
            {MODES_OF_PAYMENT.map((m) => (
              <option key={m} value={m}>{m.toUpperCase()}</option>
            ))}
          </select>
        </div>

        {/* Auto-complete info banner */}
        {paymentStatus === "Paid" && job.status === "delivered" && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            ✅ This job has already been <strong>delivered</strong>. Marking as Paid
            will <strong>auto-complete</strong> it and remove it from this dashboard.
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !isValid}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            {loading ? "Updating…" : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}