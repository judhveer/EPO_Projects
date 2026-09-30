import React, { useState } from 'react';
import { DateTime } from 'luxon';
import api from '../../lib/api';

const ZONE = 'Asia/Kolkata';
const OVERRIDABLE_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'HOLIDAY', 'WEEK_OFF'];
const TIME_BASED_STATUSES = ['PRESENT', 'LATE'];

// Converts a stored ISO datetime (or null) into the "YYYY-MM-DDTHH:mm"
// shape a datetime-local input expects, for pre-filling.
function toDateTimeLocal(isoString) {
  if (!isoString) return '';
  return DateTime.fromJSDate(new Date(isoString)).setZone(ZONE).toFormat("yyyy-LL-dd'T'HH:mm");
}

export default function OverrideAttendanceModal({ record, onClose, onSuccess }) {
  
  const DEFAULT_STATUS = OVERRIDABLE_STATUSES.includes(record.status) ? record.status : OVERRIDABLE_STATUSES[0];
  const [newStatus, setNewStatus] = useState(DEFAULT_STATUS);
  // Pre-filled from whatever the record already has — an admin only
  // touching one field leaves the other exactly as it was, with no
  // special handling needed for "unchanged" vs "explicitly entered."
  const [checkInTime, setCheckInTime] = useState(toDateTimeLocal(record.check_in_time));
  const [checkOutTime, setCheckOutTime] = useState(toDateTimeLocal(record.check_out_time));
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const needsCheckIn = TIME_BASED_STATUSES.includes(newStatus);

  // Fixed windows, matching the backend exactly — check-in locked to shift_date only, checkout allowed to spill one day over for legitimate overnight shifts.
  const checkInMin = `${record.shift_date}T00:00`;
  const checkInMax = `${record.shift_date}T23:59`;
  const nextDay = DateTime.fromISO(record.shift_date, { zone: ZONE }).plus({ days: 1 }).toISODate();
  const checkOutMin = `${record.shift_date}T00:00`;
  const checkOutMax = `${nextDay}T23:59`;

  const handleSubmit = async () => {
    if (!reason.trim()) { 
      setError('A reason is required.'); 
      return; 
    }
    if (needsCheckIn && !checkInTime) { 
      setError('A check-in time is required for this status.'); 
      return; 
    }
    setLoading(true); setError('');
    try {
      await api.patch('/api/attendance/override', {
        employee_id: record.employee_id, 
        shift_date: record.shift_date, 
        new_status: newStatus, 
        reason,
        ...(needsCheckIn && { check_in_time: checkInTime, check_out_time: checkOutTime || null }),
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
          {record.status && <span className="ml-1 text-gray-400">(currently {record.status})</span>}
        </p>

        {error && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

        <label className="block text-xs font-semibold text-gray-700 mb-1">New Status</label>
        <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3">
          {OVERRIDABLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        {needsCheckIn && (
          <div className="mb-3 space-y-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Check-in Time (required)</label>
              <input
                type="datetime-local"
                value={checkInTime}
                min={checkInMin} 
                max={checkInMax}
                onChange={(e) => setCheckInTime(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" 
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Check-out Time {record.shift_date !== DateTime.now().setZone(ZONE).toISODate() ? '(required — this day has ended)' : '(optional — day still in progress)'}
              </label>
              <input type="datetime-local" value={checkOutTime} min={checkOutMin} max={checkOutMax}
                onChange={(e) => setCheckOutTime(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <p className="text-[11px] text-gray-400">
              The PRESENT/LATE status and late-minutes are computed automatically from the check-in time — if it doesn't match your selection above, you'll be asked to correct one or the other.
            </p>
          </div>
        )}

        <p className="text-xs text-gray-400 mb-3">
          To grant LEAVE for a specific day, use the leave request flow instead — it keeps the balance ledger consistent.
        </p>

        <label className="block text-xs font-semibold text-gray-700 mb-1">Reason (required)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-4" />

        <div className="flex justify-end gap-3">
           <button onClick={onClose} disabled={loading} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold">
            {loading ? 'Saving…' : 'Apply Override'}
          </button>
        </div>
      </div>
    </div>
  );
}