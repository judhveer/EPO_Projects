import React, { useState } from "react";
import api from "../../../lib/api.js";

const TYPE_LABEL = { roll: "Roll", board: "Board", standee: "Standee" };

export default function EditWideFormatModal({ material, onClose, onSuccess }) {
  const [materialName, setMaterialName] = useState(material.material_name);
  const [rate, setRate] = useState(
    material.material_type === "standee"
      ? String(material.rate_per_pc)
      : String(material.rate_per_sqft)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const isStandee = material.material_type === "standee";
  const rateLabel = isStandee ? "Rate per Piece (₹)" : "Rate per Sq Ft (₹)";

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const payload = { material_name: materialName };
      if (isStandee) {
        payload.rate_per_pc = rate;
      } else {
        payload.rate_per_sqft = rate;
      }

      const { data } = await api.patch(`/api/admin/wide-format/${material.id}`, payload);
      onSuccess(data.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update material.");
    } finally {
      setLoading(false);
    }
  };

  const isValid = materialName.trim() !== "" && rate !== "";

  // Locked fields to display based on material type
  const lockedFields = (() => {
    if (material.material_type === "roll") {
      return [
        ["Roll Width", `${material.roll_width_ft} ft`],
        ...(material.gsm ? [["GSM", material.gsm]] : []),
      ];
    }
    if (material.material_type === "board") {
      return [
        ["Board Size", `${material.board_width_ft} × ${material.board_height_ft} ft`],
        ...(material.thickness_mm ? [["Thickness", `${material.thickness_mm} mm`]] : []),
      ];
    }
    if (material.material_type === "standee") {
      return [
        ["Size", `${material.board_width_ft} × ${material.board_height_ft} ft`],
      ];
    }
    return [];
  })();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-bold text-blue-700">Edit Material</h3>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
            {TYPE_LABEL[material.material_type] || material.material_type}
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-4">ID: {material.id}</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* Editable: name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Material Name <span className="text-red-500">*</span>
            </label>
            <input
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Editable: rate */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {rateLabel} <span className="text-red-500">*</span>
            </label>
            <input
              type="number" step="0.01" min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Locked fields */}
          {lockedFields.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2 font-semibold">
                Locked fields (cannot be changed after creation)
              </p>
              <div className="grid grid-cols-2 gap-2">
                {lockedFields.map(([label, val]) => (
                  <div key={label} className="bg-gray-100 rounded-lg px-3 py-1.5">
                    <div className="text-[10px] text-gray-400">{label}</div>
                    <div className="text-xs text-gray-600 font-medium">{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
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