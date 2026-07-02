import React, { useEffect, useState, useCallback } from "react";
import api from "../../../lib/api.js";
import { DateTime } from "luxon";
import { useAuth } from "../../../context/AuthContext.jsx";
import EditUserModal from "./EditUserModal.jsx";
import DeleteUserModal from "./DeleteUserModal.jsx";

const fmt = (d) =>
  d ? DateTime.fromJSDate(new Date(d)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a") : "Never";


// ── Inline toggle switch component ───────────────────────────────────
// Kept here since it's only used in this table. Extract to a shared
// component later if it gets reused elsewhere.
function ToggleSwitch({ checked, onChange, disabled, loading }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled || loading}
      title={disabled ? "Cannot change this account's status" : checked ? "Deactivate user" : "Activate user"}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
        ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
        ${checked ? "bg-green-500" : "bg-gray-300"}
      `}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
          ${loading ? "opacity-60" : ""}
          ${checked ? "translate-x-4" : "translate-x-0.5"}
        `}
      />
    </button>
  );
}


export default function UserManagement() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Which user row's toggle is currently mid-request (prevents double-click)
  const [togglingId, setTogglingId] = useState(null);
  const [toggleError, setToggleError] = useState(null); // inline error near the row

  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [total, setTotal] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [assignableDepartments, setAssignableDepartments] = useState([]);
  const [assignableRoles, setAssignableRoles] = useState([]);

  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

  const hasActiveFilters = searchInput !== "" || departmentFilter !== "" || roleFilter !== "" || statusFilter !== "";

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (departmentFilter) params.department = departmentFilter;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.isActive = statusFilter;

      const { data } = await api.get("/api/admin/users", { params });
      setUsers(data.data || []);
      setTotal(data.total || 0);
      setAssignableDepartments(data.assignableDepartments || []);
      setAssignableRoles(data.assignableRoles || []);
    } catch (err) {
      console.error("Failed to load users:", err);
      setError(err.response?.data?.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, departmentFilter, roleFilter, statusFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Toggle active / inactive ────────────────────────────────────────
  const handleToggleStatus = async (targetUser) => {
    setToggleError(null);
    setTogglingId(targetUser.id);
    try {
      await api.patch(`/api/admin/users/${targetUser.id}/status`, {
        isActive: !targetUser.isActive,
      });
      // Optimistic update: flip in-place without a full refetch so the
      // toggle feels instant. If the request failed, the catch below
      // restores the error and the next fetchUsers will correct the state.
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id ? { ...u, isActive: !u.isActive } : u
        )
      );
    } catch (err) {
      setToggleError({
        id: targetUser.id,
        message: err.response?.data?.message || "Failed to update status.",
      });
    } finally {
      setTogglingId(null);
    }
  };

  // ── Clear all filters ───────────────────────────────────────────────
  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setDepartmentFilter("");
    setRoleFilter("");
    setStatusFilter("");
    setPage(1);
  };

  // ── Error state ─────
  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        {error}
        <button onClick={fetchUsers} className="ml-2 text-blue-600 underline">Retry</button>
      </div>
    );
  }

  return (
    <div>
      {/* ── Filter bar ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="🔍 Search username or email..."
          className="border border-gray-300 rounded-full px-4 py-1.5 text-sm w-[260px] focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <select
          value={departmentFilter}
          onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">All Departments</option>
          {assignableDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">All Roles</option>
          {assignableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>

        {/* Clear filters — only visible when at least one filter is set */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="bg-gray-300 hover:bg-gray-500 hover:text-white rounded px-3 py-2 text-xs col-span-1 cursor-pointer"
          >
            ✕ Clear Filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
          <span className="text-xs text-blue-700 font-medium">Total</span>
          <span className="text-sm font-bold text-blue-800">{total}</span>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="overflow-auto border rounded-lg shadow">
        <table className={`${loading ? "opacity-50 pointer-events-none" : ""} min-w-[900px] w-full text-xs border-collapse`}>
          <thead className="bg-gradient-to-r from-blue-700 to-blue-600 text-white">
            <tr>
              <th className="border p-2 text-left">Username</th>
              <th className="border p-2 text-left">Email</th>
              <th className="border p-2 text-left">Role</th>
              <th className="border p-2 text-left">Department</th>
              <th className="border p-2 text-center">Status</th>
              <th className="border p-2 text-left">Last Login</th>
              <th className="border p-2 text-center w-[220px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-6">
                <div className="flex justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700" />
                </div>
              </td></tr>
            ) : users.length > 0 ? (
              users.map((u, i) => {
                const isSelf = u.id === currentUser?.id;
                // ADMIN-role requester cannot touch a BOSS account
                const isProtectedBoss = u.role === "BOSS" && currentUser?.role !== "BOSS";
                // Toggle is disabled for self and for protected boss
                const toggleDisabled = isSelf || isProtectedBoss;
                // Delete button is hidden for self and protected boss
                const canDelete = !isSelf && !isProtectedBoss;
                const rowToggleError =
                  toggleError?.id === u.id ? toggleError.message : null;
                  
                return (
                  <tr
                    key={u.id}
                    className={`border-b ${
                      i % 2 === 0 ? "bg-white" : "bg-slate-50"
                    } hover:bg-blue-50`}
                  >
                    {/* Username */}
                    <td className="border p-2 font-medium">
                      {u.username}
                      {isSelf && (
                        <span className="ml-1 text-[10px] text-blue-500">(you)</span>
                      )}
                    </td>

                    {/* Email */}
                    <td className="border p-2">
                      {u.email || <span className="text-gray-400">—</span>}
                    </td>

                    {/* Role */}
                    <td className="border p-2">{u.role}</td>

                    {/* Department */}
                    <td className="border p-2">{u.department}</td>

                    {/* Status — badge + toggle */}
                    <td className="border p-2 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-200 text-gray-500"
                          }`}
                        >
                          {u.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>

                        <ToggleSwitch
                          checked={u.isActive}
                          onChange={() => handleToggleStatus(u)}
                          disabled={toggleDisabled}
                          loading={togglingId === u.id}
                        />

                        {/* Inline error for this specific row's toggle */}
                        {rowToggleError && (
                          <span className="text-[10px] text-red-500 leading-tight max-w-[100px] text-center">
                            {rowToggleError}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Last Login */}
                    <td className="border p-2 text-gray-600">{fmt(u.lastLoginAt)}</td>

                    {/* Actions */}
                    <td className="border p-2 text-center">
                      <div className="flex justify-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => setEditTarget(u)}
                          className="px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Edit
                        </button>

                        {/* Delete only shown for accounts that can potentially
                            be deleted (not self, not a protected boss).
                            The backend is the real enforcement — this is
                            just UI polish. */}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-red-600 text-white hover:bg-red-700"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="text-center py-6 text-gray-500">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* ── Pagination ─────────────────────────────────────────────── */}
        <div className="bg-gray-50 border-t border-gray-300 p-3 flex justify-between items-center">
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="px-2 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
            >
              ⬅ Prev
            </button>
            <button
              disabled={page === totalPages || total === 0}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="px-2 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
            >
              Next ➡
            </button>
          </div>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────── */}
      {editTarget && (
        <EditUserModal
          user={editTarget}
          assignableDepartments={assignableDepartments}
          assignableRoles={assignableRoles}
          isSelf={editTarget.id === currentUser?.id}
          isProtectedBoss={
            editTarget.role === "BOSS" && currentUser?.role !== "BOSS"
          }
          onClose={() => setEditTarget(null)}
          onSuccess={() => { setEditTarget(null); fetchUsers(); }}
        />
      )}

      {deleteTarget && (
        <DeleteUserModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => { setDeleteTarget(null); fetchUsers(); }}
        />
      )}
    </div>
  );
}