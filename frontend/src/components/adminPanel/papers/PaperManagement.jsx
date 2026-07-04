import React, { useEffect, useState, useCallback } from "react";
import api from "../../../lib/api.js";
import AddPaperModal  from "./AddPaperModal.jsx";
import EditPaperModal from "./EditPaperModal.jsx";
import DeletePaperModal from "./DeletePaperModal.jsx";
import Toast from "../common/Toast.jsx";

export default function PaperManagement() {
  const [papers, setPapers]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [limit]                   = useState(50);
  const [paperNames, setPaperNames] = useState([]);

  const [searchInput, setSearchInput]   = useState("");
  const [search, setSearch]             = useState("");
  const [paperNameFilter, setPaperNameFilter] = useState("");

  const [showAddModal, setShowAddModal]     = useState(false);
  const [editTarget, setEditTarget]         = useState(null);
  const [deleteTarget, setDeleteTarget]     = useState(null);

  // ── Toast state ──────────────────────────────────────────────────────
  // { message, icon, variant } — null when hidden.
  // Parent owns the timer so Toast itself stays a pure display component.
  const [toast, setToast] = useState(null);

  const showToast = (message, icon = "✓", variant = "success") => {
    // Clear any existing timer before starting a new one — prevents a
    // fast add → edit sequence from leaving a ghost toast on screen.
    setToast({ message, icon, variant });
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);
  // ────────

  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

  const hasActiveFilters = searchInput !== "" || paperNameFilter !== "";

  // ── Fetch ─────────────────────────────────────────────────────────
  const fetchPapers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (search)         params.search      = search;
      if (paperNameFilter) params.paper_name = paperNameFilter;

      const { data } = await api.get("/api/admin/papers", { params });
      setPapers(data.data || []);
      setTotal(data.total || 0);
      if (data.paperNames) setPaperNames(data.paperNames);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load papers.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, paperNameFilter]);

  useEffect(() => { fetchPapers(); }, [fetchPapers]);

  // Debounce search
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
    setPaperNameFilter("");
    setPage(1);
  };

  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        {error}
        <button onClick={fetchPapers} className="ml-2 text-blue-600 underline">Retry</button>
      </div>
    );
  }

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="🔍 Search name, size, category..."
          className="border border-gray-300 rounded-full px-4 py-1.5 text-sm w-[260px] focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        <select
          value={paperNameFilter}
          onChange={(e) => { setPaperNameFilter(e.target.value); setPage(1); }}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">All Paper Types</option>
          {paperNames.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="bg-gray-300 hover:bg-gray-500 hover:text-white rounded px-3 py-2 text-xs col-span-1 cursor-pointer"
          >
            ✕ Clear Filters
          </button>
        )}

        <button
          onClick={() => setShowAddModal(true)}
          className="ml-auto px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
        >
          + Add Paper
        </button>

        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
          <span className="text-xs text-blue-700 font-medium">Total</span>
          <span className="text-sm font-bold text-blue-800">{total}</span>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="overflow-auto border rounded-lg shadow">
        <table className={`${loading ? "opacity-50 pointer-events-none" : ""} min-w-[860px] w-full text-xs border-collapse`}>
          <thead className="bg-gradient-to-r from-blue-700 to-blue-600 text-white sticky top-0 z-10">
            <tr>
              <th className="border p-2 text-left w-[50px]">ID</th>
              <th className="border p-2 text-left w-[180px]">Paper Name</th>
              <th className="border p-2 text-center w-[70px]">GSM</th>
              <th className="border p-2 text-left w-[120px]">Size Name</th>
              <th className="border p-2 text-center w-[80px]">Width</th>
              <th className="border p-2 text-center w-[80px]">Height</th>
              <th className="border p-2 text-left w-[140px]">Size Category</th>
              <th className="border p-2 text-right w-[110px]">Rate / Sheet (₹)</th>
              <th className="border p-2 text-center w-[130px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-6">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700" />
                  </div>
                </td>
              </tr>
            ) : papers.length > 0 ? (
              papers.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b ${i % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-blue-50`}
                >
                  <td className="border p-2 text-gray-400">{p.id}</td>
                  <td className="border p-2 font-medium">{p.paper_name}</td>
                  <td className="border p-2 text-center">{p.gsm}</td>
                  <td className="border p-2">{p.size_name}</td>
                  <td className="border p-2 text-center">{p.width}"</td>
                  <td className="border p-2 text-center">{p.height}"</td>
                  <td className="border p-2 text-gray-600">
                    {p.size_category || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="border p-2 text-right font-semibold text-blue-700">
                    ₹{Number(p.rate_per_sheet).toFixed(2)}
                  </td>
                  <td className="border p-2 text-center">
                    <div className="flex justify-center gap-1.5">
                      <button
                        onClick={() => setEditTarget(p)}
                        className="px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="px-2 py-1 rounded-md text-[11px] font-semibold bg-red-600 text-white hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="text-center py-6 text-gray-500">No papers found</td>
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
      {/* ── Modals ─────────────────────────────────────────────────── */}
      {showAddModal && (
        <AddPaperModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(paper) => {
            setShowAddModal(false);
            fetchPapers();
            showToast(
              `"${paper?.paper_name || "Paper"}" added successfully.`,
              "✅"
            );
          }}
        />
      )}

      {editTarget && (
        <EditPaperModal
          paper={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={(paper) => {
            setEditTarget(null);
            fetchPapers();
            showToast(
              `"${paper?.paper_name || "Paper"}" updated successfully.`,
              "✏️"
            );
          }}
        />
      )}

      {deleteTarget && (
        <DeletePaperModal
          paper={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            const name = deleteTarget.paper_name;
            setDeleteTarget(null);
            fetchPapers();
            showToast(`"${name}" deleted.`, "🗑️");
          }}
        />
      )}

       {/* ── Toast ──────────────────────────────────────────────────── */}
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