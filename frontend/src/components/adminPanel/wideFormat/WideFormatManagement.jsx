import React, { useEffect, useState, useCallback } from "react";
import api from "../../../lib/api.js";
import AddWideFormatModal    from "./AddWideFormatModal.jsx";
import EditWideFormatModal   from "./EditWideFormatModal.jsx";
import DeleteWideFormatModal from "./DeleteWideFormatModal.jsx";
import Toast                 from "../common/Toast.jsx";

// ── Type badge config ─────────────────────────────────────────────────
const TYPE_BADGE = {
  roll:    { label: "Roll",    cls: "bg-blue-100 text-blue-700"   },
  board:   { label: "Board",   cls: "bg-amber-100 text-amber-700" },
  standee: { label: "Standee", cls: "bg-purple-100 text-purple-700" },
  unknown: { label: "Unknown", cls: "bg-gray-100 text-gray-500"   },
};

const TYPE_FILTER_OPTIONS = [
  { value: "",        label: "All Types" },
  { value: "roll",    label: "Roll (Flex / Vinyl)" },
  { value: "board",   label: "Board (Sun Board / ACP / Acrylic)" },
  { value: "standee", label: "Standee" },
];

/** Renders the key specs for a material row in a compact format. */
function SpecsCell({ mat }) {
  if (mat.material_type === "roll") {
    return (
      <span className="text-gray-600">
        {mat.roll_width_ft} ft wide
        {mat.gsm ? ` · ${mat.gsm} GSM` : ""}
      </span>
    );
  }
  if (mat.material_type === "board") {
    return (
      <span className="text-gray-600">
        {mat.board_width_ft} × {mat.board_height_ft} ft
        {mat.thickness_mm ? ` · ${mat.thickness_mm} mm` : ""}
      </span>
    );
  }
  if (mat.material_type === "standee") {
    return (
      <span className="text-gray-600">
        {mat.board_width_ft} × {mat.board_height_ft} ft
      </span>
    );
  }
  return <span className="text-gray-400">—</span>;
}

/** Renders the applicable rate with its label. */
function RateCell({ mat }) {
  if (mat.material_type === "standee") {
    return (
      <span className="font-semibold text-blue-700">
        ₹{Number(mat.rate_per_pc).toFixed(2)}{" "}
        <span className="text-gray-400 font-normal text-[10px]">/pc</span>
      </span>
    );
  }
  return (
    <span className="font-semibold text-blue-700">
      ₹{Number(mat.rate_per_sqft).toFixed(2)}{" "}
      <span className="text-gray-400 font-normal text-[10px]">/sqft</span>
    </span>
  );
}

export default function WideFormatManagement() {
  const [materials, setMaterials]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [limit]                         = useState(50);
  const [materialNames, setMaterialNames] = useState([]);

  const [searchInput, setSearchInput]         = useState("");
  const [search, setSearch]                   = useState("");
  const [materialNameFilter, setMaterialNameFilter] = useState("");
  const [typeFilter, setTypeFilter]           = useState("");

  const [showAddModal, setShowAddModal]   = useState(false);
  const [editTarget, setEditTarget]       = useState(null);
  const [deleteTarget, setDeleteTarget]   = useState(null);

  const [toast, setToast] = useState(null);

  const showToast = (message, icon = "✓", variant = "success") => {
    setToast({ message, icon, variant });
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const totalPages      = total > 0 ? Math.ceil(total / limit) : 1;
  const hasActiveFilters = searchInput !== "" || materialNameFilter !== "" || typeFilter !== "";

  // ── Fetch ─────────────────────────────────────────────────────────
  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (search)             params.search        = search;
      if (materialNameFilter) params.material_name = materialNameFilter;
      if (typeFilter)         params.type          = typeFilter;

      const { data } = await api.get("/api/admin/wide-format", { params });
      setMaterials(data.data || []);
      setTotal(data.total || 0);
      if (data.materialNames) setMaterialNames(data.materialNames);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load materials.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, materialNameFilter, typeFilter]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setMaterialNameFilter("");
    setTypeFilter("");
    setPage(1);
  };

  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        {error}
        <button onClick={fetchMaterials} className="ml-2 text-blue-600 underline">Retry</button>
      </div>
    );
  }

  return (
    <div>
      {/* ── Toolbar ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="🔍 Search material name..."
          className="border border-gray-300 rounded-full px-4 py-1.5 text-sm w-[240px] focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        <select
          value={materialNameFilter}
          onChange={(e) => { setMaterialNameFilter(e.target.value); setPage(1); }}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">All Materials</option>
          {materialNames.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          {TYPE_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-blue-600 hover:underline px-2 py-1.5"
          >
            ✕ Clear Filters
          </button>
        )}

        <button
          onClick={() => setShowAddModal(true)}
          className="ml-auto px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
        >
          + Add Material
        </button>

        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
          <span className="text-xs text-blue-700 font-medium">Total</span>
          <span className="text-sm font-bold text-blue-800">{total}</span>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      <div className="overflow-auto border rounded-lg shadow">
        <table className={`${loading ? "opacity-50 pointer-events-none" : ""} min-w-[780px] w-full text-xs border-collapse`}>
          <thead className="bg-gradient-to-r from-blue-700 to-blue-600 text-white sticky top-0 z-10">
            <tr>
              <th className="border p-2 text-left w-[50px]">ID</th>
              <th className="border p-2 text-left w-[180px]">Material Name</th>
              <th className="border p-2 text-center w-[90px]">Type</th>
              <th className="border p-2 text-left w-[200px]">Specs</th>
              <th className="border p-2 text-right w-[140px]">Rate</th>
              <th className="border p-2 text-center w-[130px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-6">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700" />
                  </div>
                </td>
              </tr>
            ) : materials.length > 0 ? (
              materials.map((m, i) => {
                const badge = TYPE_BADGE[m.material_type] || TYPE_BADGE.unknown;
                return (
                  <tr
                    key={m.id}
                    className={`border-b ${i % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-blue-50`}
                  >
                    <td className="border p-2 text-gray-400">{m.id}</td>
                    <td className="border p-2 font-medium">{m.material_name}</td>
                    <td className="border p-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="border p-2">
                      <SpecsCell mat={m} />
                    </td>
                    <td className="border p-2 text-right">
                      <RateCell mat={m} />
                    </td>
                    <td className="border p-2 text-center">
                      <div className="flex justify-center gap-1.5">
                        <button
                          onClick={() => setEditTarget(m)}
                          className="px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(m)}
                          className="px-2 py-1 rounded-md text-[11px] font-semibold bg-red-600 text-white hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="text-center py-6 text-gray-500">No materials found</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="bg-gray-50 border-t border-gray-300 p-3 flex justify-between items-center">
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="px-2 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100">⬅ Prev</button>
            <button disabled={page === totalPages || total === 0} onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="px-2 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100">Next ➡</button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddWideFormatModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(mat) => {
            setShowAddModal(false);
            fetchMaterials();
            showToast(`"${mat?.material_name || "Material"}" added successfully.`, "✅");
          }}
        />
      )}
      {editTarget && (
        <EditWideFormatModal
          material={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={(mat) => {
            setEditTarget(null);
            fetchMaterials();
            showToast(`"${mat?.material_name || "Material"}" updated successfully.`, "✏️");
          }}
        />
      )}
      {deleteTarget && (
        <DeleteWideFormatModal
          material={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            const name = deleteTarget.material_name;
            setDeleteTarget(null);
            fetchMaterials();
            showToast(`"${name}" deleted.`, "🗑️");
          }}
        />
      )}

      <Toast
        show={!!toast}
        message={toast?.message}
        icon={toast?.icon}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />
    </div>
  );
}