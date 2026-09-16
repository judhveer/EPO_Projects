import React, { useState } from 'react';
import api from '../../lib/api';

const OVERRIDABLE_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'HOLIDAY', 'WEEK_OFF'];

export default function OverrideAttendanceModal({ record, onClose, onSuccess }) {
  const [newStatus, setNewStatus] = useState(record.status || 'ABSENT');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('A reason is required.'); return; }
    setLoading(true); setError('');
    try {
      await api.patch('/api/attendance/override', {
        employee_id: record.employee_id, shift_date: record.shift_date, new_status: newStatus, reason,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to override attendance.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-blue-700 mb-1">Override Attendance</h3>
        <p className="text-sm text-gray-500 mb-4">
          {record.employee?.username || record.employee_id} — {record.shift_date}
        </p>

        {error && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

        <label className="block text-xs font-semibold text-gray-700 mb-1">New Status</label>
        <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3">
          {OVERRIDABLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <p className="text-xs text-gray-400 mb-3">
          To grant LEAVE for a specific day, use the leave request flow instead — it keeps the balance ledger consistent.
        </p>

        <label className="block text-xs font-semibold text-gray-700 mb-1">Reason (required)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-4" />

        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold">
            {loading ? 'Saving…' : 'Apply Override'}
          </button>
        </div>
      </div>
    </div>
  );
}