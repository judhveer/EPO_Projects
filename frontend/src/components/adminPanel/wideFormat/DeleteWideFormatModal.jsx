import React, { useState } from "react";
import api from "../../../lib/api.js";

const TYPE_LABEL = { roll: "Roll", board: "Board", standee: "Standee" };

export default function DeleteWideFormatModal({ material, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleDelete = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.delete(`/api/admin/wide-format/${material.id}`);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete material.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-red-600 mb-2">Delete Material</h3>
        <p className="text-sm text-gray-600 mb-2">You're about to permanently delete:</p>

        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 mb-4 text-sm">
          <span className="font-semibold">{material.material_name}</span>{" "}
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
            {TYPE_LABEL[material.material_type] || material.material_type}
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