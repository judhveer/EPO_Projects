import React, { useState, useEffect, useCallback } from 'react';
import { DateTime } from 'luxon';
import api from '../../lib/api';

const ZONE = 'Asia/Kolkata';
const fmtDate = (d) => DateTime.fromISO(d, { zone: ZONE }).toFormat('dd LLL yyyy');

const OFFICES = ['EPO', 'MM'];
const DEPARTMENTS = ['Accounts', 'Admin', 'CRM', 'Designer', 'EA', 'Foundation', 'HR', 'Job Writer', 'MIS',
  'Office Assistant', 'Process Coordinator', 'Production Coordinator', 'Receptionist', 'Sales dept', 'Tender Executive', 'Production Worker', 'Delivery'];

export default function HolidayManagement() {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({ name: '', date: '', holiday_type: 'MANDATORY', notes: '' });
  const [scopeType, setScopeType] = useState('ALL');
  const [scopeValue, setScopeValue] = useState('');
  const [scopeRows, setScopeRows] = useState([]); // built list of applicability rows before submit
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/holidays');
      setHolidays(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load holidays.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addScopeRow = () => {
    if (scopeType !== 'ALL' && !scopeValue) return;
    setScopeRows((rows) => [...rows, { scope_type: scopeType, scope_ref_id: scopeType === 'ALL' ? null : scopeValue }]);
    setScopeValue('');
  };
  const removeScopeRow = (idx) => setScopeRows((rows) => rows.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (scopeRows.length === 0) {
      setError('Add at least one applicability scope before saving.');
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/api/holidays', { ...form, applicability: scopeRows });
      const reversalNote = data.reversedFor?.length
        ? ` ${data.reversedFor.length} employee(s) had colliding approved leave auto-reversed.`
        : '';
      setMessage(`Holiday created.${reversalNote}`);
      setForm({ name: '', date: '', holiday_type: 'MANDATORY', notes: '' });
      setScopeRows([]);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create holiday.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this holiday? Past attendance already marked because of it will not change.')) return;
    try {
      await api.patch(`/api/holidays/${id}/deactivate`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to deactivate.');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto mt-6 px-4 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Holiday Master</h1>

      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{message}</div>}
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-5 space-y-3">
        <h2 className="font-semibold text-gray-700">Add Holiday</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select value={form.holiday_type} onChange={(e) => setForm((f) => ({ ...f, holiday_type: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="MANDATORY">Mandatory</option>
              <option value="OPTIONAL">Optional</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        {/* ── Applicability builder ── */}
        <div className="border-t pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Applies To</p>
          <div className="flex flex-wrap gap-2 items-end mb-2">
            <select value={scopeType} onChange={(e) => { setScopeType(e.target.value); setScopeValue(''); }}
              className="border rounded-lg px-3 py-2 text-sm">
              <option value="ALL">Everyone</option>
              <option value="OFFICE">Office</option>
              <option value="DEPARTMENT">Department</option>
              <option value="INDIVIDUAL">Specific User ID</option>
            </select>
            {scopeType === 'OFFICE' && (
              <select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
                <option value="">Select office…</option>
                {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {scopeType === 'DEPARTMENT' && (
              <select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
                <option value="">Select department…</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            {scopeType === 'INDIVIDUAL' && (
              <input value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} placeholder="Paste user ID"
                className="border rounded-lg px-3 py-2 text-sm w-56" />
            )}
            <button type="button" onClick={addScopeRow} className="px-3 py-2 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700">
              + Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {scopeRows.map((r, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                {r.scope_type}{r.scope_ref_id ? `: ${r.scope_ref_id}` : ''}
                <button type="button" onClick={() => removeScopeRow(i)} className="text-blue-500 hover:text-blue-700">✕</button>
              </span>
            ))}
          </div>
        </div>

        <button type="submit" disabled={submitting}
          className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
          {submitting ? 'Saving…' : 'Create Holiday'}
        </button>
      </form>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <h2 className="font-semibold text-gray-700 px-5 py-3 border-b">Upcoming & Recent Holidays</h2>
        <div className="divide-y">
          {holidays.length === 0 && <p className="px-5 py-4 text-sm text-gray-400">No holidays configured.</p>}
          {holidays.map((h) => (
            <div key={h.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium text-gray-700">{h.name} — {fmtDate(h.date)}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {h.holiday_type} · {h.applicability?.map((a) => a.scope_ref_id ? `${a.scope_type}:${a.scope_ref_id}` : a.scope_type).join(', ')}
                </p>
              </div>
              <button onClick={() => handleDeactivate(h.id)} className="text-xs text-red-600 hover:underline">Deactivate</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}