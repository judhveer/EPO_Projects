import React, { useState } from "react";
import api from "../../../lib/api.js";

export default function EditPaperModal({ paper, onClose, onSuccess }) {
  const [paperName,    setPaperName]    = useState(paper.paper_name);
  const [sizeCategory, setSizeCategory] = useState(paper.size_category || "");
  const [rate,         setRate]         = useState(String(paper.rate_per_sheet));
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.patch(`/api/admin/papers/${paper.id}`, {
        paper_name:     paperName,
        size_category:  sizeCategory || null,
        rate_per_sheet: rate,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update paper.");
    } finally {
      setLoading(false);
    }
  };

  const isValid = paperName.trim() !== "" && rate !== "";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-blue-700 mb-1">Edit Paper</h3>
        <p className="text-xs text-gray-500 mb-4">ID: {paper.id}</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* Editable */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Paper Name <span className="text-red-500">*</span>
            </label>
            <input
              value={paperName}
              onChange={(e) => setPaperName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Size Category <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              value={sizeCategory}
              onChange={(e) => setSizeCategory(e.target.value)}
              placeholder="e.g. Double Demy"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Rate per Sheet (₹) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Locked — shown for context, not editable */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2 font-semibold">
              Locked fields (cannot be changed after creation)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["GSM",    paper.gsm],
                ["Size",   paper.size_name],
                ["Width",  `${paper.width}"`],
                ["Height", `${paper.height}"`],
                ["Unit",   paper.unit],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-100 rounded-lg px-3 py-1.5">
                  <div className="text-[10px] text-gray-400">{label}</div>
                  <div className="text-xs text-gray-600 font-medium">{val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} disabled={loading}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading || !isValid}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold">
            {loading ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}