import React, { useState } from "react";
import api from "../../../lib/api.js";

export default function DeleteUserModal({ user, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.delete(`/api/admin/users/${user.id}`);
      onSuccess();
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to delete user."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-red-600 mb-2">Delete User</h3>
        <p className="text-sm text-gray-600 mb-4">
          You're about to permanently delete{" "}
          <strong>{user.username}</strong>. This cannot be undone.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
            {/* Tell the admin what to do instead — without offering
                a deactivate button here. The toggle in the table
                handles that independently. */}
            {error.includes("Cannot delete") && (
              <p className="mt-2 text-xs text-gray-600">
                Use the toggle switch on the user's row to deactivate their account instead.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          {!error && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-semibold"
            >
              {loading ? "Deleting…" : "Delete Permanently"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}