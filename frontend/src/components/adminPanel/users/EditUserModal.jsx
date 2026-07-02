import React, { useState } from "react";
import api from "../../../lib/api.js";

export default function EditUserModal({
  user,
  assignableDepartments,
  assignableRoles,
  isSelf,
  isProtectedBoss,
  onClose,
  onSuccess,
}) {
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email || "");
  const [department, setDepartment] = useState(user.department);
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (isProtectedBoss) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
          <h3 className="text-lg font-bold text-red-600 mb-2">Access Restricted</h3>
          <p className="text-sm text-gray-600 mb-5">
            Only a BOSS-role account can edit another BOSS account.
          </p>
          <div className="flex justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const payload = { username, email: email || null, department, role };
      if (password) payload.password = password;

      await api.patch(`/api/admin/users/${user.id}`, payload);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update user.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-blue-700 mb-4">Edit User</h3>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={department === "Production Worker" ? "Optional for Production Worker" : "Required"}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Department {isSelf && <span className="text-gray-400 font-normal">(locked — can't change your own)</span>}
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              disabled={isSelf}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {assignableDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
              {!assignableDepartments.includes(department) && (
                <option value={department}>{department} (current)</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Role {isSelf && <span className="text-gray-400 font-normal">(locked — can't change your own)</span>}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={isSelf}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {assignableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
              {!assignableRoles.includes(role) && (
                <option value={role}>{role} (current)</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              New Password <span className="text-gray-400 font-normal">(leave blank to keep current)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 chars, 1 uppercase, 1 lowercase, 1 number"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold">
            {loading ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}