import React, { useState } from "react";
import api from "../../../lib/api.js";

const BILL_TYPES = ["GST Bill", "PI Bill"];

export default function CreateBillModal({ job, onClose, onSuccess }) {
  const [billCreated, setBillCreated] = useState("yes");
  const [billType, setBillType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isValid =
    billCreated === "complimentary" ||
    (billCreated === "yes" && billType !== "");

  const handleSubmit = async () => {
    if (!isValid) return;
    setError(null);
    setLoading(true);
    try {
      await api.patch(`/api/fms/accounts/${job.job_no}/bill`, {
        bill_created: billCreated,
        ...(billCreated === "yes" ? { bill_type: billType } : {}),
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create bill.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">

        {/* Header */}
        <h3 className="text-lg font-bold text-blue-700 mb-0.5">Create Bill</h3>
        <p className="text-xs text-gray-500 mb-4">
          Job #{job.job_no} — {job.client_name}
        </p>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Bill Status Selection */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Bill Type <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="billCreated"
                value="yes"
                checked={billCreated === "yes"}
                onChange={() => setBillCreated("yes")}
                className="accent-blue-600 w-4 h-4"
              />
              <span className="text-sm text-gray-700">Generate Bill</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="billCreated"
                value="complimentary"
                checked={billCreated === "complimentary"}
                onChange={() => { setBillCreated("complimentary"); setBillType(""); }}
                className="accent-purple-600 w-4 h-4"
              />
              <span className="text-sm text-gray-700">Complimentary</span>
            </label>
          </div>
        </div>

        {/* Bill Type Dropdown (only when "yes") */}
        {billCreated === "yes" && (
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Select Bill Type <span className="text-red-500">*</span>
            </label>
            <select
              value={billType}
              onChange={(e) => setBillType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">— Select bill type —</option>
              {BILL_TYPES.map((bt) => (
                <option key={bt} value={bt}>{bt}</option>
              ))}
            </select>
          </div>
        )}

        {/* Complimentary Info */}
        {billCreated === "complimentary" && (
          <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-700">
            ℹ️ Marking as <strong>Complimentary</strong> will automatically set
            payment status to "Complimentary". No bill type is needed.
          </div>
        )}

        {/* Lock Warning */}
        <div className="mb-5 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
          ⚠️ Once submitted, bill information <strong>cannot be changed</strong>.
        </div>

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
            {loading ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}