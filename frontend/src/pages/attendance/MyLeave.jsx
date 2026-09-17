import React, { useState, useEffect, useCallback } from 'react';
import { DateTime } from 'luxon';
import api from '../../lib/api';

const ZONE = 'Asia/Kolkata';
const fmtDate = (d) => DateTime.fromISO(d, { zone: ZONE }).toFormat('dd LLL yyyy');

const STATUS_STYLES = {
  PENDING:   'bg-yellow-100 text-yellow-800',
  APPROVED:  'bg-green-100 text-green-800',
  REJECTED:  'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
};

export default function MyLeave() {
  const [balances, setBalances] = useState([]);
  const [types, setTypes] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ leave_type_id: '', date_from: '', date_to: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [balanceRes, typesRes, requestsRes] = await Promise.all([
        api.get('/api/leave/me/balance'),
        api.get('/api/leave/types'),
        api.get('/api/leave/requests/me'),
      ]);
      setBalances(balanceRes.data);
      setTypes(typesRes.data);
      setRequests(requestsRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load leave data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/api/leave/requests', form);
      setMessage(`Request submitted (~${data.estimatedWorkingDays} working day(s), excluding Sundays).`);
      setForm({ leave_type_id: '', date_from: '', date_to: '', reason: '' });
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (requestId) => {
    if (!window.confirm('Cancel this leave request?')) return;
    setError('');
    setMessage('');
    try {
      await api.patch(`/api/leave/requests/${requestId}/cancel`);
      setMessage('Request cancelled.');
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel request.');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto mt-6 px-4 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">My Leave</h1>

      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{message}</div>}
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {/* ── Balance cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {balances.map((b) => (
          <div key={b.leave_type_id} className="bg-white rounded-xl shadow p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{b.balance}</p>
            <p className="text-xs text-gray-500 mt-1">{b.name}</p>
          </div>
        ))}
        {balances.length === 0 && (
          <p className="col-span-full text-sm text-gray-400 italic">
            No leave allocated yet — this appears automatically once you cross 6 months from your join date.
          </p>
        )}
      </div>

      {/* ── Request form ── */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-5 space-y-3">
        <h2 className="font-semibold text-gray-700">Request Leave</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Leave Type</label>
            <select value={form.leave_type_id} onChange={(e) => setForm((f) => ({ ...f, leave_type_id: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" required>
              <option value="">Select…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
              <input type="date" value={form.date_from} onChange={(e) => setForm((f) => ({ ...f, date_from: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
              <input type="date" value={form.date_to} onChange={(e) => setForm((f) => ({ ...f, date_to: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
          <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={submitting}
          className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </form>

      {/* ── History ── */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <h2 className="font-semibold text-gray-700 px-5 py-3 border-b">My Requests</h2>
        <div className="divide-y">
          {requests.length === 0 && <p className="px-5 py-4 text-sm text-gray-400">No leave requests yet.</p>}
          {requests.map((r) => (
            <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {r.leaveType?.name} — {fmtDate(r.date_from)} to {fmtDate(r.date_to)}
                </p>
                {r.reason && <p className="text-xs text-gray-400 mt-0.5">{r.reason}</p>}
                {r.decision_reason && r.status !== 'PENDING' && (
                  <p className="text-xs text-gray-500 mt-0.5">Note: {r.decision_reason}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                {['PENDING', 'APPROVED'].includes(r.status) && (
                  <button onClick={() => handleCancel(r.id)} className="text-xs text-red-600 hover:underline">Cancel</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}