import React, { useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

// ---------- Helpers ----------
function toYMD(d) {
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function jsonToCsv(rows = [], columns = []) {
  if (!rows || rows.length === 0) return '';
  const headers = columns.length ? columns : Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
    if (s.search(/,|\n/) >= 0) return `"${s}"`;
    return s;
  };
  const lines = [headers.join(',')];
  rows.forEach((r) => {
    lines.push(headers.map((h) => esc(r[h])).join(','));
  });
  return lines.join('\n');
}

function downloadCsv(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const name = filename || `export_${toYMD(new Date())}.csv`;
  if (navigator.msSaveBlob) navigator.msSaveBlob(blob, name);
  else {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// ---------- Constants ----------
const ROLE_TABS = [
  { key: 'RESEARCHER', label: 'Researchers', metricName: 'research' },
  { key: 'TELECALLER', label: 'Telecallers', metricName: 'telecall' },
  { key: 'SALES_EXECUTIVE', label: 'Sales Execs', metricName: 'meeting' },
  { key: 'CRM', label: 'CRM', metricName: 'followup' },
];

const PERIOD_PRESETS = [
  { key: '1d', label: '1 day' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'custom', label: 'Custom' },
];

const PAGE_SIZE = 20;

// ---------- Main Component ----------
export default function CoordinatorUsers() {
  const [activeRole, setActiveRole] = useState('RESEARCHER');
  const [period, setPeriod] = useState('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]); // fetched rows for active role
  const [error, setError] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [sort, setSort] = useState({ col: 'name', dir: 'asc' });
  const [page, setPage] = useState(1);

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalData, setModalData] = useState(null); // { user, daily: [{date,count}], tasks: [...] }
  const [modalMetric, setModalMetric] = useState('research'); // metricName

  // compute range
  const range = useMemo(() => {
    const now = new Date();
    if (period === 'custom') {
      if (!customFrom || !customTo) return null;
      const from = new Date(customFrom);
      const to = new Date(customTo);
      to.setHours(23, 59, 59, 999);
      return { from, to };
    }
    const to = new Date();
    const from = new Date();
    switch (period) {
      case '1d':
        from.setDate(to.getDate() - 1);
        break;
      case '7d':
        from.setDate(to.getDate() - 7);
        break;
      case '30d':
        from.setDate(to.getDate() - 30);
        break;
      case '90d':
        from.setDate(to.getDate() - 90);
        break;
      default:
        from.setDate(to.getDate() - 7);
    }
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }, [period, customFrom, customTo]);

  // Fetch role users
  const fetchForRole = async (role) => {
    setError('');
    setRows([]);
    if (!range) {
      setError('Select a valid date range first (for custom set both From and To).');
      return;
    }
    setLoading(true);
    try {
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();

      const res = await api.get(`/api/sales/coordinator/users`, {
        params: { role, from: fromISO, to: toISO },
      });

      const data = Array.isArray(res.data) ? res.data : [];
      const normalized = data.map((u) => ({
        userId: u.userId ?? u.id ?? u.uid,
        name: u.name ?? u.fullName ?? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
        email: u.email ?? u.emailId ?? '',
        todayCount: u.todayCount ?? u.metricToday ?? 0,
        avgPerDay: u.avgPerDay ?? u.metricAvg ?? 0,
        totalCount: u.totalCount ?? u.metricTotal ?? 0,
        pendingCount: u.pendingCount ?? u.pendingTasks ?? 0,
        raw: u,
      }));

      setRows(normalized);
      setPage(1);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to fetch user stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForRole(activeRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRole, period, customFrom, customTo]);

  // filtering + sorting + pagination
  const filtered = useMemo(() => {
    let r = rows;
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      r = r.filter((x) => (x.name || '').toLowerCase().includes(q) || (x.email || '').toLowerCase().includes(q));
    }
    const dir = sort.dir === 'asc' ? 1 : -1;
    r = [...r].sort((a, b) => {
      const ca = a[sort.col];
      const cb = b[sort.col];
      if (typeof ca === 'string') return ca.localeCompare(cb || '') * dir;
      if (typeof ca === 'number') return ((ca ?? 0) - (cb ?? 0)) * dir;
      return 0;
    });
    return r;
  }, [rows, searchQ, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (col) => setSort((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' }));

  const handleExport = () => {
    const columns = ['name', 'email', 'todayCount', 'avgPerDay', 'totalCount', 'pendingCount'];
    const data = filtered.map((r) => ({
      name: r.name,
      email: r.email,
      todayCount: r.todayCount,
      avgPerDay: r.avgPerDay,
      totalCount: r.totalCount,
      pendingCount: r.pendingCount,
    }));
    const csv = jsonToCsv(data, columns);
    downloadCsv(csv, `${activeRole.toLowerCase()}_users_${toYMD(range.from)}_to_${toYMD(range.to)}.csv`);
  };

  // ---------- MODAL: fetch per-user daily + tasks ----------
  const openUserModal = async (user, metricName) => {
    setModalMetric(metricName);
    setModalError('');
    setModalData(null);
    setModalLoading(true);
    setModalOpen(true);

    try {
      if (!range) throw new Error('Select a valid date range first.');

      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();

      // backend contract:
      // GET /api/sales/coordinator/user/:userId/daily?from=&to=&metric=
      const res = await api.get(`/api/sales/coordinator/user/${encodeURIComponent(user.userId)}/daily`, {
        params: { from: fromISO, to: toISO, metric: metricName },
      });

      const data = res.data || {};
      // normalize
      const userObj = data.user ?? { userId: user.userId, name: user.name, email: user.email };
      const daily = Array.isArray(data.daily) ? data.daily.map((d) => ({
        date: d.date ?? d.day ?? toYMD(d.timestamp ?? Date.now()),
        count: Number(d.count ?? d.value ?? 0),
      })) : [];
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];

      // ensure daily has entries for every day in range (fill missing with 0)
      const filledDaily = (() => {
        if (!range) return daily;
        const arr = [];
        const cur = new Date(range.from);
        while (cur <= range.to) {
          const dstr = toYMD(cur);
          const found = daily.find((x) => (x.date ? x.date.startsWith(dstr) : false) || x.date === dstr);
          arr.push({ date: dstr, count: found ? found.count : 0 });
          cur.setDate(cur.getDate() + 1);
        }
        return arr;
      })();

      setModalData({ user: userObj, daily: filledDaily, tasks });
    } catch (err) {
      console.error(err);
      setModalError(err?.response?.data?.message ?? err.message ?? 'Failed to load user details');
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalData(null);
    setModalError('');
  };

  const exportModalDaily = () => {
    if (!modalData || !modalData.daily) return;
    const cols = ['date', 'count'];
    const csv = jsonToCsv(modalData.daily, cols);
    downloadCsv(csv, `${modalData.user?.name?.replace(/\s+/g, '_') || 'user'}_${modalMetric}_daily_${toYMD(range.from)}_to_${toYMD(range.to)}.csv`);
  };

  const exportModalTasks = () => {
    if (!modalData || !modalData.tasks) return;
    const cols = Object.keys(modalData.tasks[0] || {});
    const csv = jsonToCsv(modalData.tasks, cols);
    downloadCsv(csv, `${modalData.user?.name?.replace(/\s+/g, '_') || 'user'}_${modalMetric}_tasks.csv`);
  };

  // ---------- UI ----------
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Coordinator — Team Stats</h1>
          <p className="text-sm text-slate-500">Overview of role-wise performance and pending tasks</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <input
              type="text"
              placeholder="Search name / email"
              value={searchQ}
              onChange={(e) => { setSearchQ(e.target.value); setPage(1); }}
              className="border rounded px-3 py-2 text-sm w-64"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchForRole(activeRole)}
              className="px-3 py-2 bg-slate-50 border rounded text-sm hover:bg-slate-100"
              title="Refresh"
            >
              Refresh
            </button>

            <button
              onClick={handleExport}
              className="px-3 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700"
              title="Export current view to CSV"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Role tabs */}
      <div className="mb-4">
        <div className="flex gap-2 flex-wrap">
          {ROLE_TABS.map((r) => {
            const active = r.key === activeRole;
            return (
              <button
                key={r.key}
                onClick={() => setActiveRole(r.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${active ? 'bg-blue-600 text-white' : 'bg-white border text-slate-700'}`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Period selector */}
      <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
        <div className="flex gap-2 flex-wrap">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1 rounded text-sm ${period === p.key ? 'bg-blue-600 text-white' : 'bg-white border'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="border px-2 py-1 rounded" />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="border px-2 py-1 rounded" />
          </div>
        )}

        <div className="text-sm text-slate-500 md:text-right">
          <div>Range: {range ? `${toYMD(range.from)} — ${toYMD(range.to)}` : '—'}</div>
          <div>Rows: <strong>{rows.length}</strong></div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border rounded shadow-sm overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-right">Today</th>
              <th className="px-3 py-2 text-right">Avg / Day</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Pending</th>
              <th className="px-3 py-2 text-center">Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="p-6 text-center text-slate-500">Loading...</td></tr>
            ) : error ? (
              <tr><td colSpan={8} className="p-6 text-center text-red-600">{error}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-slate-500">No users found for this role / range.</td></tr>
            ) : (
              pageRows.map((u, idx) => (
                <tr key={u.userId ?? idx} className="odd:bg-white even:bg-slate-50">
                  <td className="px-3 py-2">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="px-3 py-2">
                    <button
                      className="text-slate-700 hover:underline text-left"
                      onClick={() => openUserModal(u, ROLE_TABS.find(r => r.key === activeRole).metricName)}
                    >
                      {u.name}
                    </button>
                  </td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2 text-right">{u.todayCount ?? 0}</td>
                  <td className="px-3 py-2 text-right">{Number(u.avgPerDay ?? 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{u.totalCount ?? 0}</td>
                  <td className="px-3 py-2 text-right">{u.pendingCount ?? 0}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => {
                          const csv = jsonToCsv([{
                            name: u.name,
                            email: u.email,
                            todayCount: u.todayCount,
                            avgPerDay: u.avgPerDay,
                            totalCount: u.totalCount,
                            pendingCount: u.pendingCount,
                          }], ['name','email','todayCount','avgPerDay','totalCount','pendingCount']);
                          downloadCsv(csv, `${u.name?.replace(/\s+/g,'_') || 'user'}_${activeRole}_${toYMD(range.from)}.csv`);
                        }}
                        className="px-2 py-1 text-xs border rounded"
                      >
                        Export
                      </button>

                      <button
                        onClick={() => openUserModal(u, ROLE_TABS.find(r => r.key === activeRole).metricName)}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
                      >
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-slate-600">
          Showing {(page - 1) * PAGE_SIZE + 1} - {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 border rounded disabled:opacity-50">Prev</button>
          <div className="text-sm">{page} / {totalPages}</div>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 border rounded disabled:opacity-50">Next</button>
        </div>
      </div>

      {/* ---------- Modal ---------- */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />

          <div className="relative w-full max-w-3xl bg-white rounded-lg shadow-lg overflow-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <div className="text-lg font-semibold">{modalData?.user?.name ?? 'User details'}</div>
                <div className="text-xs text-slate-500">{modalData?.user?.email ?? ''}</div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={exportModalDaily} className="text-sm px-3 py-1 border rounded">Export Daily</button>
                <button onClick={exportModalTasks} className="text-sm px-3 py-1 border rounded">Export Tasks</button>
                <button onClick={closeModal} className="text-sm px-3 py-1 bg-slate-100 rounded">Close</button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {modalLoading ? (
                <div className="p-6 text-center text-slate-500">Loading data...</div>
              ) : modalError ? (
                <div className="p-4 text-red-600">{modalError}</div>
              ) : !modalData ? (
                <div className="p-4 text-slate-500">No data</div>
              ) : (
                <>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={modalData.daily}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-50 p-3 rounded">
                      <div className="text-xs text-slate-500">Metric</div>
                      <div className="font-semibold mt-1">{modalMetric}</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded">
                      <div className="text-xs text-slate-500">Total (range)</div>
                      <div className="font-semibold mt-1">{modalData.daily.reduce((s, d) => s + (Number(d.count) || 0), 0)}</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded">
                      <div className="text-xs text-slate-500">Average / day</div>
                      <div className="font-semibold mt-1">
                        {(modalData.daily.reduce((s,d)=>s+(Number(d.count)||0),0) / modalData.daily.length).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2">Recent tasks</h4>
                    {modalData.tasks.length === 0 ? (
                      <div className="text-sm text-slate-500">No tasks found.</div>
                    ) : (
                      <div className="space-y-2">
                        {modalData.tasks.slice(0, 20).map((t) => (
                          <div key={t.id || t.taskId} className="p-2 border rounded flex justify-between items-start">
                            <div>
                              <div className="text-sm font-medium">{t.title ?? t.name ?? 'Untitled task'}</div>
                              <div className="text-xs text-slate-500">
                                {t.status ?? t.state ?? 'UNKNOWN'} • Assigned: {t.assignedAt ? toYMD(t.assignedAt) : '-'} • Due: {t.dueDate ? toYMD(t.dueDate) : '-'}
                              </div>
                            </div>
                            <div className="text-xs text-slate-600">{t.id ?? t.taskId}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
