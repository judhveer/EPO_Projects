import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';

export default function AttendanceLeaveConfig() {
  const [settings, setSettings] = useState(null);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  const [typeForm, setTypeForm] = useState({ name: '', is_paid: true, requires_approval: true, auto_deductible: false, auto_deduct_priority: '' });
  const [policyDrafts, setPolicyDrafts] = useState({}); // { [leaveTypeId]: entitlementString }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, typesRes] = await Promise.all([
        api.get('/api/attendance/settings'),
        api.get('/api/leave-config/types'),
      ]);
      setSettings(settingsRes.data);
      setTypes(typesRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async () => {
    setError(''); setMessage('');
    try {
      await api.patch('/api/attendance/settings', settings);
      setMessage('Attendance settings saved.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings.');
    }
  };

  const createType = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      await api.post('/api/leave-config/types', {
        ...typeForm,
        auto_deduct_priority: typeForm.auto_deductible ? Number(typeForm.auto_deduct_priority) : null,
      });
      setMessage('Leave type created.');
      setTypeForm({ name: '', is_paid: true, requires_approval: true, auto_deductible: false, auto_deduct_priority: '' });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create leave type.');
    }
  };

  const savePolicy = async (leaveTypeId) => {
    const amount = policyDrafts[leaveTypeId];
    if (!amount) return;
    setError(''); setMessage('');
    try {
      await api.post('/api/leave-config/policies', { leave_type_id: leaveTypeId, annual_entitlement: Number(amount) });
      setMessage('Policy saved.');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save policy.');
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditDraft({ 
      is_paid: t.is_paid, 
      requires_approval: t.requires_approval, 
      auto_deductible: t.auto_deductible, 
      auto_deduct_priority: t.auto_deduct_priority || '' 
    });
  };

  const saveEdit = async (id) => {
    setError(''); setMessage('');
    try {
      await api.patch(`/api/leave-config/types/${id}`, {
        ...editDraft,
        auto_deduct_priority: editDraft.auto_deductible ? Number(editDraft.auto_deduct_priority) : null,
      });
      setMessage('Leave type updated.');
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update leave type.');
    }
  };

  const toggleActive = async (t) => {
    setError(''); 
    setMessage('');
    try {
      await api.patch(`/api/leave-config/types/${t.id}`, { active: !t.active });
      setMessage(t.active ? 'Leave type deactivated.' : 'Leave type reactivated.');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update leave type.');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto mt-6 px-4 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Attendance & Leave Configuration</h1>

      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{message}</div>}
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {/* ── Attendance Settings ── */}
      <div className="bg-white rounded-xl shadow p-5 space-y-3">
        <h2 className="font-semibold text-gray-700">Attendance Settings</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Shift Start Hour (0–23)</label>
            <input type="number" min="0" max="23" value={settings.shift_start_hour}
              onChange={(e) => setSettings((s) => ({ ...s, shift_start_hour: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Shift Start Minute</label>
            <input type="number" min="0" max="59" value={settings.shift_start_minute}
              onChange={(e) => setSettings((s) => ({ ...s, shift_start_minute: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Grace Period (minutes)</label>
            <input type="number" min="0" value={settings.grace_minutes}
              onChange={(e) => setSettings((s) => ({ ...s, grace_minutes: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Overtime Threshold (minutes)</label>
            <input type="number" min="1" value={settings.overtime_threshold_minutes}
              onChange={(e) => setSettings((s) => ({ ...s, overtime_threshold_minutes: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Reminder Delay (minutes after shift start)</label>
            <input type="number" min="0" value={settings.reminder_delay_minutes}
              onChange={(e) => setSettings((s) => ({ ...s, reminder_delay_minutes: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <button onClick={saveSettings} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
          Save Settings
        </button>
      </div>

       {/* ── System Jobs (BOSS/ADMIN only — hidden for HR via a quick client check, backend enforces regardless) ── */}
      <SystemJobsSection />

      {/* ── Leave Types + Policies ── */}
      <div className="bg-white rounded-xl shadow p-5 space-y-4">
        <h2 className="font-semibold text-gray-700">Leave Types</h2>

        <div className="space-y-2">
          {types.map((t) => (
            <div key={t.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {t.name}
                    {!t.active && <span className="ml-2 text-xs text-red-500">(inactive)</span>}
                  </p>
                  <p className="text-xs text-gray-400">
                    {t.is_paid ? 'Paid' : 'Unpaid'} · {t.auto_deductible ? `Auto-deduct (priority ${t.auto_deduct_priority})` : 'Not auto-deducted'}
                    {t.policies?.[0] && ` · Annual: ${t.policies[0].annual_entitlement} days`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!t.policies?.[0] && (
                    <>
                      <input type="number" placeholder="Annual days" value={policyDrafts[t.id] || ''}
                        onChange={(e) => setPolicyDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                        className="w-24 border rounded-lg px-2 py-1 text-sm" />
                      <button onClick={() => savePolicy(t.id)} className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">
                        Set Policy
                      </button>
                    </>
                  )}
                  <button onClick={() => startEdit(t)} className="px-3 py-1 text-xs bg-slate-600 text-white rounded-lg hover:bg-slate-700">
                    Edit
                  </button>
                  <button onClick={() => toggleActive(t)} className={`px-3 py-1 text-xs rounded-lg ${t.active ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                    {t.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </div>

              {editingId === t.id && (
                <div className="border-t pt-2 flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={editDraft.is_paid} onChange={(e) => setEditDraft((d) => ({ ...d, is_paid: e.target.checked }))} />
                    Paid
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={editDraft.requires_approval} onChange={(e) => setEditDraft((d) => ({ ...d, requires_approval: e.target.checked }))} />
                    Requires Approval
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={editDraft.auto_deductible} onChange={(e) => setEditDraft((d) => ({ ...d, auto_deductible: e.target.checked }))} />
                    Auto-deductible
                  </label>
                  {editDraft.auto_deductible && (
                    <input type="number" placeholder="Priority" value={editDraft.auto_deduct_priority}
                      onChange={(e) => setEditDraft((d) => ({ ...d, auto_deduct_priority: e.target.value }))}
                      className="w-20 border rounded-lg px-2 py-1 text-sm" />
                  )}
                  <button onClick={() => saveEdit(t.id)} className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs border rounded-lg hover:bg-gray-50">Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={createType} className="border-t pt-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Leave Type</p>
          <input value={typeForm.name} onChange={(e) => setTypeForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Casual Leave" className="w-full border rounded-lg px-3 py-2 text-sm" required />
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={typeForm.is_paid} onChange={(e) => setTypeForm((f) => ({ ...f, is_paid: e.target.checked }))} />
              Paid
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={typeForm.requires_approval} onChange={(e) => setTypeForm((f) => ({ ...f, requires_approval: e.target.checked }))} />
              Requires Approval
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={typeForm.auto_deductible} onChange={(e) => setTypeForm((f) => ({ ...f, auto_deductible: e.target.checked }))} />
              Auto-deductible on no-show
            </label>
          </div>
          {typeForm.auto_deductible && (
            <input type="number" placeholder="Priority (lower = tried first)" value={typeForm.auto_deduct_priority}
              onChange={(e) => setTypeForm((f) => ({ ...f, auto_deduct_priority: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" required />
          )}
          <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
            Add Leave Type
          </button>
        </form>
      </div>
    </div>
  );
}


function SystemJobsSection() {
  const [running, setRunning] = useState(null); // 'allocation' | 'resolution' | null
  const [result, setResult] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [error, setError] = useState('');
  


  const run = async (key, endpoint) => {
    setRunning(key);
    setResult(null);
    setError('');
    setShowRaw(false);
    try {
      const { data } = await api.post(endpoint);
      setResult(data);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Job failed. Please check the server logs."
      );
    } finally {
      setRunning(null);
    }
  };

  const isAllocationResult = result?.allocated !== undefined;
  const isResolutionResult = result?.resolved !== undefined;

 return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                <span className="text-lg">⚙️</span>
              </div>

              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  System Jobs
                </h2>

                <p className="text-xs text-gray-500 mt-0.5">
                  Run attendance and leave background processes manually.
                </p>
              </div>
            </div>
          </div>

          {running && (
            <div className="flex items-center gap-2 text-xs text-indigo-600">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              Running
            </div>
          )}
        </div>

        <div className="mt-4 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100">
          <p className="text-xs text-gray-500 leading-relaxed">
            These jobs normally run automatically overnight at
            <span className="font-medium text-gray-700"> 00:30 / 00:45 IST</span>.
            Use the buttons below for testing or manual catch-up.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Leave Allocation */}
          <button
            onClick={() =>
              run(
                'allocation',
                '/api/attendance/jobs/run-leave-allocation'
              )
            }
            disabled={running !== null}
            className="
              group flex items-center justify-between
              rounded-xl border border-gray-200
              bg-white px-4 py-3.5
              text-left transition-all
              hover:border-indigo-300 hover:bg-indigo-50/40
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <span className="text-lg">📅</span>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Leave Allocation
                </p>

                <p className="text-xs text-gray-500 mt-0.5">
                  Allocate yearly leave balances
                </p>
              </div>
            </div>

            <span className="text-gray-400 group-hover:text-indigo-600">
              →
            </span>
          </button>


          {/* Attendance Resolution */}
          <button
            onClick={() =>
              run(
                'resolution',
                '/api/attendance/jobs/run-attendance-resolution'
              )
            }
            disabled={running !== null}
            className="
              group flex items-center justify-between
              rounded-xl border border-gray-200
              bg-white px-4 py-3.5
              text-left transition-all
              hover:border-indigo-300 hover:bg-indigo-50/40
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <span className="text-lg">🕒</span>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Attendance Resolution
                </p>

                <p className="text-xs text-gray-500 mt-0.5">
                  Resolve pending attendance records
                </p>
              </div>
            </div>

            <span className="text-gray-400 group-hover:text-indigo-600">
              →
            </span>
          </button>

        </div>
      </div>


      {/* Error */}
      {error && (
        <div className="mx-6 mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex gap-3">
            <span className="text-red-600">⚠️</span>

            <div>
              <p className="text-sm font-semibold text-red-800">
                Job failed
              </p>

              <p className="text-xs text-red-700 mt-1">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}


      {/* Result */}
      {result && (
        <div className="border-t border-gray-100 bg-gray-50/70">


          {/* Allocation Summary */}
          {isAllocationResult && (
            <div className="px-6 pb-5">

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">

                <StatCard
                  label="Allocated"
                  value={result.allocated?.length || 0}
                  icon="✓"
                  type="success"
                />

                <StatCard
                  label="Not Eligible"
                  value={result.skippedIneligible || 0}
                  icon="⏳"
                  type="neutral"
                />

                <StatCard
                  label="Errors"
                  value={result.errors?.length || 0}
                  icon="!"
                  type={
                    result.errors?.length > 0
                      ? 'danger'
                      : 'neutral'
                  }
                />

                <StatCard
                  label="Total"
                  value={
                    (result.allocated?.length || 0) +
                    (result.skippedIneligible || 0) +
                    (result.errors?.length || 0)
                  }
                  icon="#"
                  type="neutral"
                />

              </div>


              {/* Allocation Table */}
              {result.allocated?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-800">
                      Allocations Created
                    </h3>

                    <p className="text-xs text-gray-500 mt-0.5">
                      Leave allocation records processed during this run
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">

                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">
                            Employee
                          </th>

                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">
                            Leave Type
                          </th>

                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">
                            Allocated
                          </th>

                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">
                            Type
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-gray-100">

                        {result.allocated.map((allocation, index) => (

                          <tr
                            key={allocation.allocationId || index}
                            className="hover:bg-gray-50"
                          >

                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-bold">
                                  {allocation.employeeName
                                    ?.trim()
                                    ?.slice(0, 2)
                                    ?.toUpperCase() || "??"}
                                </div>

                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-800 truncate">
                                    {allocation.employeeName || "Unknown employee"}
                                  </p>

                                  <p className="text-[10px] text-gray-400 font-mono truncate">
                                    {allocation.employeeId?.slice(0, 8)}…
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-gray-700">
                                {allocation.leaveTypeName || "Unknown leave type"}
                              </span>
                            </td>


                            <td className="px-4 py-3 text-right">
                              <div>
                                <span className="text-sm font-bold text-gray-900">
                                  {Number(allocation.amount).toFixed(2)}
                                </span>

                                <span className="text-xs text-gray-400 ml-1">
                                  days
                                </span>
                              </div>
                            </td>


                            <td className="px-4 py-3 text-center">
                              {allocation.isProRated ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-semibold">
                                  <span>◔</span>
                                  Pro-rated
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-[11px] font-semibold">
                                  <span>✓</span>
                                  Full
                                </span>
                              )}
                            </td>

                          </tr>

                        ))}

                      </tbody>

                    </table>
                  </div>

                </div>
              )}


              {/* Errors */}
              {result.errors?.length > 0 && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">

                  <p className="text-sm font-semibold text-red-800">
                    Allocation Errors
                  </p>

                  <div className="mt-2 space-y-2">
                    {result.errors.map((e, i) => (
                      <div
                        key={`${e.employeeId}-${e.leaveTypeId}-${i}`}
                        className="rounded-lg border border-red-100 bg-white/60 px-3 py-2"
                      >
                        <p className="text-xs font-semibold text-red-800">
                          {e.employeeName || "Unknown employee"}
                          {" · "}
                          {e.leaveTypeName || "Unknown leave type"}
                        </p>

                        <p className="text-[11px] text-red-700 mt-1">
                          {e.error}
                        </p>
                      </div>
                    ))}
                  </div>

                </div>
              )}

            </div>
          )}


          {/* Attendance Resolution */}
          {isResolutionResult && (
            <div className="px-6 pb-5">

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                <StatCard
                  label="Resolved"
                  value={result.resolved || 0}
                  icon="✓"
                  type="success"
                />

                <StatCard
                  label="Already Resolved"
                  value={result.skippedExisting || 0}
                  icon="↻"
                  type="neutral"
                />

                <StatCard
                  label="Errors"
                  value={result.errors?.length || 0}
                  icon="!"
                  type={
                    result.errors?.length > 0
                      ? 'danger'
                      : 'neutral'
                  }
                />

              </div>

            </div>
          )}


          {/* Raw JSON */}
          {/* technical response */}
          <div className="px-6 pb-5">
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="text-xs font-medium text-gray-500 hover:text-indigo-600 transition"
            >
              {showRaw ? "Hide" : "Show"} technical response
              <span className="ml-1">
                {showRaw ? "↑" : "↓"}
              </span>
            </button>

            {showRaw && (
              <pre className="mt-3 text-[11px] leading-relaxed bg-gray-900 text-gray-100 rounded-xl p-4 overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>

        </div>
      )}

    </div>
  );
}


function StatCard({ label, value, icon, type = 'neutral' }) {
  const styles = {
    success: {
      box: 'bg-green-50 border-green-100',
      icon: 'bg-green-100 text-green-700',
      value: 'text-green-700',
    },

    danger: {
      box: 'bg-red-50 border-red-100',
      icon: 'bg-red-100 text-red-700',
      value: 'text-red-700',
    },

    neutral: {
      box: 'bg-white border-gray-200',
      icon: 'bg-gray-100 text-gray-600',
      value: 'text-gray-800',
    },
  };

  const s = styles[type];

  return (
    <div className={`rounded-xl border p-4 ${s.box}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">
          {label}
        </span>

        <span
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${s.icon}`}
        >
          {icon}
        </span>
      </div>

      <p className={`mt-2 text-2xl font-bold ${s.value}`}>
        {value}
      </p>
    </div>
  );
}