import { useState, useEffect, useCallback } from "react";
import api from "../../../lib/api.js";

const ROLES = [
  { value: "", label: "All" },
  { value: "printing", label: "Printing" },
  { value: "binding", label: "Binding" },
  { value: "quality_check", label: "QC" },
  { value: "packaging", label: "Packaging" },
  { value: "delivery", label: "Delivery" },
];

const ROLE_LABELS = {
  printing: "Printing",
  binding: "Binding",
  quality_check: "Quality Check",
  packaging: "Packaging",
  delivery: "Delivery",
};

const ROLE_COLORS = {
  printing: "bg-blue-100 text-blue-700",
  binding: "bg-purple-100 text-purple-700",
  quality_check: "bg-orange-100 text-orange-700",
  packaging: "bg-amber-100 text-amber-700",
  delivery: "bg-cyan-100 text-cyan-700",
};

const EMPTY_FORM = { worker_code: "", name: "", role: "printing", email: "", phone: "" };

export default function WorkerManagement() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Modal
  const [modal, setModal] = useState(null); // null | 'add' | 'edit'
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toggling, setToggling] = useState(null); // worker id being toggled

  const fetchWorkers = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = { active: showInactive ? "all" : "true" };
      if (roleFilter) params.role = roleFilter;
      const { data } = await api.get("/api/fms/workers", { params });
      setWorkers(data);
    } catch {
      setError("Failed to load workers.");
    } finally {
      setLoading(false);
    }
  }, [roleFilter, showInactive]);

  useEffect(() => { fetchWorkers(); }, [fetchWorkers]);

  const openAdd = () => {
    setForm(EMPTY_FORM); setFormError(null);
    setModal("add"); setEditTarget(null);
  };

  const openEdit = (w) => {
    setForm({
      worker_code: w.worker_code,
      name: w.name,
      role: w.role,
      email: w.email || "",
      phone: w.phone || "",
    });
    setFormError(null); setModal("edit"); setEditTarget(w);
  };

  const closeModal = () => {
    setModal(null); setEditTarget(null); setFormError(null);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!form.worker_code.trim()) { setFormError("Worker code is required."); return; }
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    if (!form.role) { setFormError("Role is required."); return; }
    if (form.role === "delivery" && !form.email.trim()) {
      setFormError("Email is required for delivery workers."); return;
    }

    setSubmitting(true);
    try {
      if (modal === "add") {
        await api.post("/api/fms/workers", {
          worker_code: form.worker_code.trim().toUpperCase(),
          name: form.name.trim(),
          role: form.role,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
        });
      } else {
        await api.patch(`/api/fms/workers/${editTarget.id}`, {
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
        });
      }
      closeModal();
      fetchWorkers();
    } catch (err) {
      setFormError(err?.response?.data?.message || "Failed to save.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (w) => {
    setToggling(w.id);
    try {
      await api.patch(`/api/fms/workers/${w.id}`, { is_active: !w.is_active });
      fetchWorkers();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to update status.");
    } finally {
      setToggling(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-blue-700">👷 Workers Master</h2>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
        >
          + Add Worker
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRoleFilter(r.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                roleFilter === r.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-blue-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowInactive((v) => !v)}
          className={`ml-auto px-3 py-1 rounded-full text-xs font-medium border transition ${
            showInactive
              ? "bg-gray-700 text-white border-gray-700"
              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          }`}
        >
          {showInactive ? "Showing All" : "Active Only"}
        </button>
      </div>

      {/* Table */}
      {error ? (
        <div className="text-center text-red-600 py-4">
          {error}{" "}
          <button onClick={fetchWorkers} className="ml-2 text-blue-600 underline">Retry</button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-auto shadow">
          <table className={`w-full text-xs border-collapse ${loading ? "opacity-50" : ""}`}>
            <thead className="bg-gradient-to-r from-blue-700 to-blue-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Code</th>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Phone</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <div className="flex justify-center">
                      <div className="animate-spin h-6 w-6 border-b-2 border-blue-700 rounded-full"></div>
                    </div>
                  </td>
                </tr>
              ) : workers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    No workers found. Click "Add Worker" to get started.
                  </td>
                </tr>
              ) : (
                workers.map((w, index) => (
                  <tr
                    key={w.id}
                    className={`border-t transition ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50"
                    } ${!w.is_active ? "opacity-50" : ""}`}
                  >
                    <td className="px-4 py-2.5 font-bold text-blue-700">{w.worker_code}</td>
                    <td className="px-4 py-2.5 font-medium">{w.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_COLORS[w.role] || "bg-gray-100 text-gray-700"}`}>
                        {ROLE_LABELS[w.role] || w.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {w.email || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {w.phone || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        w.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                      }`}>
                        {w.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => openEdit(w)}
                          className="px-2.5 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(w)}
                          disabled={toggling === w.id}
                          className={`px-2.5 py-1 rounded text-xs font-medium disabled:opacity-50 transition ${
                            w.is_active
                              ? "bg-red-100 text-red-600 hover:bg-red-200"
                              : "bg-green-100 text-green-700 hover:bg-green-200"
                          }`}
                        >
                          {toggling === w.id ? "..." : w.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-blue-700">
                {modal === "add" ? "Add New Worker" : `Edit — ${editTarget?.worker_code}`}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="space-y-3">
              {/* Worker Code — add only */}
              {modal === "add" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Worker Code <span className="text-red-500">*</span>
                    <span className="text-gray-400 font-normal ml-1">(unique — e.g. W001, D001)</span>
                  </label>
                  <input
                    type="text"
                    value={form.worker_code}
                    onChange={(e) => setForm((f) => ({ ...f, worker_code: e.target.value.toUpperCase() }))}
                    placeholder="W001"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Worker's full name"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Role — add only, cannot change after creation */}
              {modal === "add" ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value, email: "" }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="printing">Printing</option>
                    <option value="binding">Binding</option>
                    <option value="quality_check">Quality Check</option>
                    <option value="packaging">Packaging</option>
                    <option value="delivery">Delivery</option>
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-600">
                  Role:
                  <span className={`font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[editTarget?.role]}`}>
                    {ROLE_LABELS[editTarget?.role]}
                  </span>
                  <span className="text-gray-400">(cannot be changed)</span>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Email{" "}
                  {form.role === "delivery"
                    ? <span className="text-red-500">*</span>
                    : <span className="text-gray-400 font-normal">(optional)</span>}
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder={form.role === "delivery" ? "Required — receives delivery link" : "Optional"}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                {form.role === "delivery" && (
                  <p className="text-xs text-blue-600 mt-1">
                    📧 This email receives the challan upload link.
                  </p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Phone <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Optional"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-2 rounded">
                  {formError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={closeModal} disabled={submitting}
                className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
                {submitting ? "Saving..." : modal === "add" ? "Add Worker" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}