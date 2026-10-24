import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DateTime } from 'luxon';
import api from '../../lib/api';

const ZONE = 'Asia/Kolkata';
const fmtDate = (d) => DateTime.fromISO(d, { zone: ZONE }).toFormat('dd LLL yyyy');

const OFFICES = ['EPO', 'MM'];
const DEPARTMENTS = ['Accounts', 'Admin', 'CRM', 'Designer', 'EA', 'Foundation', 'HR', 'Job Writer', 'MIS',
  'Office Assistant', 'Process Coordinator', 'Production Coordinator', 'Receptionist', 'Sales dept', 'Tender Executive', 'Production Worker', 'Delivery'];

// "username · department · office" — username is unique in this system, so
// it is the primary identifier; department and office disambiguate at a glance.
const formatUserLabel = (u) => [u.username, u.department, u.office].filter(Boolean).join(' · ');

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

  // ── User picker state (INDIVIDUAL scope) ──
  const [employees, setEmployees] = useState([]);
  const [employeesError, setEmployeesError] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [pickedIds, setPickedIds] = useState([]);

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

  // Same list Team Attendance uses: active, non-BOSS users with an office.
  useEffect(() => {
    let cancelled = false;
    api.get('/api/attendance/employees')
      .then(({ data }) => { if (!cancelled) setEmployees(Array.isArray(data) ? data : []); })
      .catch((err) => {
        if (!cancelled) setEmployeesError(err.response?.data?.error || 'Could not load the user list.');
      });
    return () => { cancelled = true; };
  }, []);

  const userLabelById = useMemo(() => {
    const map = new Map();
    employees.forEach((u) => map.set(u.id, formatUserLabel(u)));
    return map;
  }, [employees]);

  const describeScope = useCallback((row) => {
    switch (row.scope_type) {
      case 'ALL': return 'Everyone';
      case 'OFFICE': return `Office: ${row.scope_ref_id}`;
      case 'DEPARTMENT': return `Department: ${row.scope_ref_id}`;
      case 'INDIVIDUAL': return userLabelById.get(row.scope_ref_id) || 'Unknown / inactive user';
      default: return row.scope_type;
    }
  }, [userLabelById]);

  const addedUserIds = useMemo(
    () => new Set(scopeRows.filter((r) => r.scope_type === 'INDIVIDUAL').map((r) => r.scope_ref_id)),
    [scopeRows],
  );

  const filteredEmployees = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((u) => formatUserLabel(u).toLowerCase().includes(q));
  }, [employees, userQuery]);

  const togglePicked = (id) =>
    setPickedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const pickAllShown = () =>
    setPickedIds((ids) => {
      const next = new Set(ids);
      filteredEmployees.forEach((u) => { if (!addedUserIds.has(u.id)) next.add(u.id); });
      return [...next];
    });

  const addScopeRow = () => {
    if (scopeType === 'INDIVIDUAL') {
      const toAdd = pickedIds.filter((id) => !addedUserIds.has(id));
      if (toAdd.length === 0) return;
      setScopeRows((rows) => [...rows, ...toAdd.map((id) => ({ scope_type: 'INDIVIDUAL', scope_ref_id: id }))]);
      setPickedIds([]);
      setUserQuery('');
      return;
    }

    if (scopeType !== 'ALL' && !scopeValue) return;
    const ref = scopeType === 'ALL' ? null : scopeValue;
    setScopeRows((rows) =>
      rows.some((r) => r.scope_type === scopeType && r.scope_ref_id === ref)
        ? rows
        : [...rows, { scope_type: scopeType, scope_ref_id: ref }],
    );
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
      const absentNote = data.absentConvertedFor?.length
        ? ` ${data.absentConvertedFor.length} employee(s) marked Absent on that date were changed to Holiday.`
        : '';
      const skippedNote = data.skippedManualOverride?.length
        ? ` ${data.skippedManualOverride.length} manually-corrected Absent record(s) were left unchanged.`
        : '';
      setMessage(`Holiday created.${reversalNote}${absentNote}${skippedNote}`);
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

  const addDisabled = scopeType === 'INDIVIDUAL' && pickedIds.length === 0;

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
            <select aria-label="Scope type" value={scopeType}
              onChange={(e) => { setScopeType(e.target.value); setScopeValue(''); setPickedIds([]); setUserQuery(''); }}
              className="border rounded-lg px-3 py-2 text-sm">
              <option value="ALL">Everyone</option>
              <option value="OFFICE">Office</option>
              <option value="DEPARTMENT">Department</option>
              <option value="INDIVIDUAL">Specific Users</option>
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
            <button type="button" onClick={addScopeRow} disabled={addDisabled}
              className="px-3 py-2 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50">
              {scopeType === 'INDIVIDUAL' && pickedIds.length > 0 ? `+ Add ${pickedIds.length} user${pickedIds.length > 1 ? 's' : ''}` : '+ Add'}
            </button>
          </div>

          {scopeType === 'INDIVIDUAL' && (
            <div className="border rounded-lg mb-2">
              {employeesError ? (
                <p className="px-3 py-3 text-sm text-red-600">{employeesError}</p>
              ) : (
                <>
                  <div className="flex items-center gap-2 p-2 border-b bg-slate-50">
                    <input
                      type="text"
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      // Enter inside this box must filter, never submit the whole holiday form.
                      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                      placeholder="Search by name, department or office…"
                      aria-label="Search users"
                      className="flex-1 border rounded-lg px-3 py-1.5 text-sm bg-white"
                    />
                    <button type="button" onClick={pickAllShown} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                      Select all shown
                    </button>
                    <button type="button" onClick={() => setPickedIds([])} className="text-xs text-gray-500 hover:underline">
                      Clear
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y">
                    {employees.length === 0 && (
                      <p className="px-3 py-3 text-sm text-gray-400">Loading users…</p>
                    )}
                    {employees.length > 0 && filteredEmployees.length === 0 && (
                      <p className="px-3 py-3 text-sm text-gray-400">No user matches “{userQuery}”.</p>
                    )}
                    {filteredEmployees.map((u) => {
                      const alreadyAdded = addedUserIds.has(u.id);
                      return (
                        <label key={u.id}
                          className={`flex items-center gap-2 px-3 py-2 text-sm ${alreadyAdded ? 'text-gray-400 bg-gray-50' : 'cursor-pointer hover:bg-blue-50'}`}>
                          <input
                            type="checkbox"
                            checked={alreadyAdded || pickedIds.includes(u.id)}
                            disabled={alreadyAdded}
                            onChange={() => togglePicked(u.id)}
                          />
                          <span>{formatUserLabel(u)}</span>
                          {alreadyAdded && <span className="ml-auto text-xs">added</span>}
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {scopeRows.map((r, i) => (
              <span key={`${r.scope_type}:${r.scope_ref_id ?? ''}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                {describeScope(r)}
                <button type="button" aria-label={`Remove ${describeScope(r)}`} onClick={() => removeScopeRow(i)} className="text-blue-500 hover:text-blue-700">✕</button>
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
                  {h.holiday_type} · {h.applicability?.map(describeScope).join(', ')}
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

