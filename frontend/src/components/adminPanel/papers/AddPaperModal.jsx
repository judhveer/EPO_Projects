import React, { useState } from "react";
import api from "../../../lib/api.js";

export default function AddPaperModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    paper_name:    "",
    gsm:           "",
    width:         "",
    height:        "",
    size_category: "",
    rate_per_sheet:"",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // Live preview of the auto-generated size_name.
  // Mirrors exactly what the backend will produce:
  //   parseFloat(width) + "x" + parseFloat(height)
  // Shows "—" until both values are valid positive numbers.
  const sizePreview = (() => {
    const w = parseFloat(form.width);
    const h = parseFloat(form.height);
    if (!isNaN(w) && w > 0 && !isNaN(h) && h > 0) {
      return `${parseFloat(w)}x${parseFloat(h)}`;
    }
    return null;
  })();

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      // size_name is intentionally not sent — backend auto-generates it.
      const { data } = await api.post("/api/admin/papers", form);
      onSuccess(data.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add paper.");
    } finally {
      setLoading(false);
    }
  };

  const isValid =
    form.paper_name.trim() &&
    form.gsm !== "" &&
    form.width !== "" &&
    form.height !== "" &&
    form.rate_per_sheet !== "";

return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-blue-700 mb-4">Add New Paper</h3>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">

          {/* Paper Name — full width */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Paper Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.paper_name}
              onChange={(e) => set("paper_name", e.target.value)}
              placeholder="e.g. Art Paper Gloss"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* GSM */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              GSM <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.gsm}
              onChange={(e) => set("gsm", e.target.value)}
              placeholder="e.g. 130"
              min="1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Size Category */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Size Category{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              value={form.size_category}
              onChange={(e) => set("size_category", e.target.value)}
              placeholder="e.g. Double Demy"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Width */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Width (inches) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.width}
              onChange={(e) => set("width", e.target.value)}
              placeholder="e.g. 23"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Height */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Height (inches) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.height}
              onChange={(e) => set("height", e.target.value)}
              placeholder="e.g. 36"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Auto-generated size_name preview — full width */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Size Name{" "}
              <span className="text-gray-400 font-normal">(auto-generated)</span>
            </label>
            <div
              className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${
                sizePreview
                  ? "bg-green-50 border-green-300 text-green-800"
                  : "bg-gray-100 border-gray-200 text-gray-400"
              }`}
            >
              {sizePreview ?? "Enter width and height to preview"}
            </div>
          </div>

          {/* Rate per Sheet — full width */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Rate per Sheet (₹) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.rate_per_sheet}
              onChange={(e) => set("rate_per_sheet", e.target.value)}
              placeholder="e.g. 10.50"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Unit — always inches, locked display */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Unit</label>
            <div className="w-full border border-gray-200 bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500">
              inches (fixed)
            </div>
          </div>

        </div>

        <div className="flex justify-end gap-3 mt-6">
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
            {loading ? "Adding…" : "Add Paper"}
          </button>
        </div>
      </div>
    </div>
  );
}