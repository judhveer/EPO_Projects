import React, { useState } from "react";
import api from "../../../lib/api.js";

export default function DeletePaperModal({ paper, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleDelete = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.delete(`/api/admin/papers/${paper.id}`);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete paper.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-red-600 mb-2">Delete Paper</h3>
        <p className="text-sm text-gray-600 mb-1">
          You're about to permanently delete:
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 mb-4 text-sm">
          <span className="font-semibold">{paper.paper_name}</span>{" "}
          <span className="text-gray-500">
            {paper.gsm} GSM · {paper.size_name}
            {paper.size_category ? ` (${paper.size_category})` : ""}
          </span>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={loading}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          {/* Hide the Delete button after a 409 — if it's linked, there's
              nothing else to try. The error message explains why. */}
          {!error && (
            <button onClick={handleDelete} disabled={loading}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-semibold">
              {loading ? "Deleting…" : "Delete Permanently"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}