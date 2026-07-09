import React, { useState } from "react";
import api from "../../../lib/api.js";

const TYPE_OPTIONS = [
  { value: "roll",    label: "Roll",    desc: "Flex, Vinyl, Cloth Banner — priced per sq ft" },
  { value: "board",   label: "Board",   desc: "Sun Board, ACP, Acrylic — priced per sq ft"   },
  { value: "standee", label: "Standee", desc: "Fixed size standee — priced per piece"         },
];

export default function AddWideFormatModal({ onClose, onSuccess }) {
  const [materialType, setMaterialType] = useState("roll");
  const [form, setForm] = useState({
    material_name:   "",
    roll_width_ft:   "",
    gsm:             "",
    board_width_ft:  "",
    board_height_ft: "",
    thickness_mm:    "",
    rate_per_sqft:   "",
    rate_per_pc:     "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  // When type changes, reset all dimension + rate fields to avoid sending
  // fields from a previous type that would confuse the backend type detection.
  const handleTypeChange = (newType) => {
    setMaterialType(newType);
    setForm({
      material_name:   form.material_name, // preserve name
      roll_width_ft:   "",
      gsm:             "",
      board_width_ft:  "",
      board_height_ft: "",
      thickness_mm:    "",
      rate_per_sqft:   "",
      rate_per_pc:     "",
    });
    setError(null);
  };

  const isValid = (() => {
    if (!form.material_name.trim()) return false;
    if (materialType === "roll")    return form.roll_width_ft !== "" && form.rate_per_sqft !== "";
    if (materialType === "board")   return form.board_width_ft !== "" && form.board_height_ft !== "" && form.rate_per_sqft !== "";
    if (materialType === "standee") return form.board_width_ft !== "" && form.board_height_ft !== "" && form.rate_per_pc !== "";
    return false;
  })();

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/api/admin/wide-format", {
        material_type: materialType,
        ...form,
      });
      onSuccess(data.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add material.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-blue-700 mb-4">Add Wide Format Material</h3>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Material Type selector */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-700 mb-2">
            Material Type <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleTypeChange(opt.value)}
                className={`p-2.5 rounded-lg border text-left transition ${
                  materialType === opt.value
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className={`text-xs font-bold ${materialType === opt.value ? "text-blue-700" : "text-gray-700"}`}>
                  {opt.label}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Material Name — always full width */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Material Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.material_name}
              onChange={(e) => set("material_name", e.target.value)}
              placeholder="e.g. Star Flex"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* ── Roll fields ───────────────────────────────────────── */}
          {materialType === "roll" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Roll Width (ft) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={form.roll_width_ft}
                  onChange={(e) => set("roll_width_ft", e.target.value)}
                  placeholder="e.g. 5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  GSM <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number" min="1"
                  value={form.gsm}
                  onChange={(e) => set("gsm", e.target.value)}
                  placeholder="e.g. 240"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Rate per Sq Ft (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" step="0.01" min="0"
                  value={form.rate_per_sqft}
                  onChange={(e) => set("rate_per_sqft", e.target.value)}
                  placeholder="e.g. 15"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </>
          )}

          {/* ── Board fields ──────────────────────────────────────── */}
          {materialType === "board" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Board Width (ft) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={form.board_width_ft}
                  onChange={(e) => set("board_width_ft", e.target.value)}
                  placeholder="e.g. 8"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Board Height (ft) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={form.board_height_ft}
                  onChange={(e) => set("board_height_ft", e.target.value)}
                  placeholder="e.g. 4"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Thickness (mm) <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number" step="0.1" min="0.1"
                  value={form.thickness_mm}
                  onChange={(e) => set("thickness_mm", e.target.value)}
                  placeholder="e.g. 5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Rate per Sq Ft (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" step="0.01" min="0"
                  value={form.rate_per_sqft}
                  onChange={(e) => set("rate_per_sqft", e.target.value)}
                  placeholder="e.g. 40"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </>
          )}

          {/* ── Standee fields ────────────────────────────────────── */}
          {materialType === "standee" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Width (ft) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={form.board_width_ft}
                  onChange={(e) => set("board_width_ft", e.target.value)}
                  placeholder="e.g. 5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Height (ft) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={form.board_height_ft}
                  onChange={(e) => set("board_height_ft", e.target.value)}
                  placeholder="e.g. 2"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Rate per Piece (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" step="0.01" min="0"
                  value={form.rate_per_pc}
                  onChange={(e) => set("rate_per_pc", e.target.value)}
                  placeholder="e.g. 1200"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} disabled={loading}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading || !isValid}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold">
            {loading ? "Adding…" : "Add Material"}
          </button>
        </div>
      </div>
    </div>
  );
}