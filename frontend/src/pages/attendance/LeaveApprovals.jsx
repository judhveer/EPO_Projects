import React, { useState, useEffect, useCallback } from 'react';
import { DateTime } from 'luxon';
import api from '../../lib/api';

const ZONE = 'Asia/Kolkata';
const fmtDate = (d) => DateTime.fromISO(d, { zone: ZONE }).toFormat('dd LLL yyyy');

export default function LeaveApprovals() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/leave/requests/pending');
      setRequests(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load pending requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id) => {
    setActingOn(id);
    setError(''); setMessage('');
    try {
      const { data } = await api.patch(`/api/leave/requests/${id}/approve`);
      const skippedNote = data.skippedDays?.length ? ` (${data.skippedDays.length} day(s) skipped — see details)` : '';
      setMessage(`Approved — ${data.consumedDays.length} day(s) consumed${skippedNote}.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve.');
    } finally {
      setActingOn(null);
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt('Reason for rejection (required):');
    if (!reason || !reason.trim()) return;
    setActingOn(id);
    setError(''); setMessage('');
    try {
      await api.patch(`/api/leave/requests/${id}/reject`, { reason });
      setMessage('Request rejected.');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject.');
    } finally {
      setActingOn(null);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto mt-6 px-4 space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Pending Leave Approvals</h1>

      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{message}</div>}
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {requests.length === 0 && (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">No pending requests.</div>
      )}

      <div className="space-y-3">
        {requests.map((r) => (
          <div key={r.id} className="bg-white rounded-xl shadow p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-semibold text-gray-800">
                {r.employee?.username}
                <span className="ml-2 text-xs font-normal text-gray-400">({r.employee?.office} · {r.employee?.department})</span>
              </p>
              <p className="text-sm text-gray-600 mt-0.5">
                {r.leaveType?.name} — {fmtDate(r.date_from)} to {fmtDate(r.date_to)}
              </p>
              {r.reason && <p className="text-xs text-gray-400 mt-1">"{r.reason}"</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleApprove(r.id)} disabled={actingOn === r.id}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">
                {actingOn === r.id ? '…' : 'Approve'}
              </button>
              <button onClick={() => handleReject(r.id)} disabled={actingOn === r.id}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50">
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}