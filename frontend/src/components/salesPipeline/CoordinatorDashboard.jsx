import React, { useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';

// ---------- Helpers ----------
function toYMD(d) {
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------- Constants ----------
const ROLE_TABS = [
  { key: 'RESEARCHER', label: 'Researchers', metricName: 'research' },
  { key: 'TELECALLER', label: 'Telecallers', metricName: 'telecall' },
  { key: 'SALES_EXECUTIVE', label: 'Sales Execs', metricName: 'meeting' },
  { key: 'CRM', label: 'CRM', metricName: 'followup' },
];

const PAGE_SIZE = 20;
const RESEARCH_TARGET_PER_DAY = 5; // 5 research per day (Mon-Sat) as requested

// ---------- Main Component ----------
export default function CoordinatorUsersSimple() {
  const [activeRole, setActiveRole] = useState('RESEARCHER');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]); // fetched rows for active role
  const [error, setError] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [sort, setSort] = useState({ col: 'name', dir: 'asc' });
  const [page, setPage] = useState(1);

  // modal state for pending details
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalTitle, setModalTitle] = useState('');
  const [modalItems, setModalItems] = useState([]); // list of pending items (meetings/followups/etc)

  // Fetch users for the selected role
  const fetchForRole = async (role) => {
    setError('');
    setRows([]);
    setLoading(true);
    try {
      // NOTE: backend contract expected:
      // GET /api/sales/coordinator/users?role=<ROLE>
      // Each user object should include: id/userId, name, email, todayCount, totalCount, pendingCount
      const res = await api.get('/api/sales/coordinator/users', { params: { role } });
      const data = Array.isArray(res.data) ? res.data : [];

      const normalized = data.map((u) => ({
        userId: u.userId ?? u.id ?? u.uid,
        name: u.name ?? u.fullName ?? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
        email: u.email ?? u.emailId ?? '',
        todayCount: Number(u.todayCount ?? u.metricToday ?? 0),
        totalCount: Number(u.totalCount ?? u.metricTotal ?? 0),
        pendingCount: Number(u.pendingCount ?? u.pendingTasks ?? 0),
        raw: u,
      }));

      // Special handling for CRM: pending should be same for all CRMs (aggregate)
      if (role === 'CRM') {
        const totalPending = normalized.reduce((s, r) => s + (r.pendingCount || 0), 0);
        const unified = normalized.map((r) => ({ ...r, pendingCount: totalPending }));
        setRows(unified);
      } else {
        setRows(normalized);
      }
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
  }, [activeRole]);

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
      if (typeof ca === 'string') return (ca || '').localeCompare(cb || '') * dir;
      if (typeof ca === 'number') return ((ca ?? 0) - (cb ?? 0)) * dir;
      return 0;
    });
    return r;
  }, [rows, searchQ, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (col) => setSort((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' }));

  // Open modal to fetch pending details for a particular user (or CRM combined)
  const openPendingModal = async (user, metricName) => {
    setModalItems([]);
    setModalError('');
    setModalTitle('');
    setModalLoading(true);
    setModalOpen(true);

    try {
      let res;
      // For CRM we fetch combined pending list
      if (activeRole === 'CRM') {
        setModalTitle('Pending followups (All CRM)');
        // NOTE: expected endpoint for combined CRM pending items:
        // GET /api/sales/coordinator/pending/crm
        res = await api.get('/api/sales/coordinator/pending/crm');
      } else {
        // per-user pending details
        setModalTitle(`${user.name} — Pending ${metricName}`);
        // NOTE: expected endpoint:
        // GET /api/sales/coordinator/user/:userId/pending?metric=<metricName>
        res = await api.get(`/api/sales/coordinator/user/${encodeURIComponent(user.userId)}/pending`, {
          params: { metric: metricName },
        });
      }

      const items = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
      // normalize a bit
      const normalized = items.map((t) => ({
        id: t.id ?? t.taskId ?? t.meetingId ?? Math.random().toString(36).slice(2, 9),
        title: t.title ?? t.name ?? t.subject ?? 'Untitled',
        status: t.status ?? t.state ?? 'PENDING',
        assignedAt: t.assignedAt ?? t.createdAt ?? t.timestamp,
        dueDate: t.dueDate ?? t.due_at ?? null,
        raw: t,
      }));
      setModalItems(normalized);
    } catch (err) {
      console.error(err);
      setModalError(err?.response?.data?.message ?? err.message ?? 'Failed to load pending items');
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalItems([]);
    setModalError('');
  };

  // UI
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Coordinator — Team Summary</h1>
          <p className="text-sm text-slate-500">Simple role-wise stats (name, total, today, pending)</p>
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

      {/* short info */}
      <div className="mb-4 text-sm text-slate-600">
        {activeRole === 'RESEARCHER' && (
          <div>Target for researchers: <strong>{RESEARCH_TARGET_PER_DAY} per day</strong> (Mon–Sat)</div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border rounded shadow-sm overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('name')}>Name</th>
              <th className="px-3 py-2 text-right cursor-pointer" onClick={() => toggleSort('totalCount')}>Total</th>
              <th className="px-3 py-2 text-right cursor-pointer" onClick={() => toggleSort('todayCount')}>Today</th>
              <th className="px-3 py-2 text-right">Pending</th>
              <th className="px-3 py-2 text-left">Notes</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-500">Loading...</td></tr>
            ) : error ? (
              <tr><td colSpan={6} className="p-6 text-center text-red-600">{error}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-500">No users found for this role.</td></tr>
            ) : (
              pageRows.map((u, idx) => (
                <tr key={u.userId ?? idx} className="odd:bg-white even:bg-slate-50">
                  <td className="px-3 py-2">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-3 py-2 text-right">{u.totalCount ?? 0}</td>
                  <td className="px-3 py-2 text-right">{u.todayCount ?? 0}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => openPendingModal(u, ROLE_TABS.find(r => r.key === activeRole).metricName)}
                      className="text-sm px-2 py-1 border rounded disabled:opacity-50"
                    >
                      {u.pendingCount ?? 0}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {activeRole === 'RESEARCHER' ? (
                      <div className="text-xs text-slate-600">Target: {RESEARCH_TARGET_PER_DAY}/day (Mon–Sat)</div>
                    ) : activeRole === 'CRM' ? (
                      <div className="text-xs text-slate-600">Common pending followups shown to all CRMs</div>
                    ) : null}
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

      {/* ---------- Modal: pending details ---------- */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />

          <div className="relative w-full max-w-3xl bg-white rounded-lg shadow-lg overflow-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <div className="text-lg font-semibold">{modalTitle}</div>
                <div className="text-xs text-slate-500">{modalItems.length} items</div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={closeModal} className="text-sm px-3 py-1 bg-slate-100 rounded">Close</button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {modalLoading ? (
                <div className="p-6 text-center text-slate-500">Loading pending items...</div>
              ) : modalError ? (
                <div className="p-4 text-red-600">{modalError}</div>
              ) : modalItems.length === 0 ? (
                <div className="p-4 text-slate-500">No pending items.</div>
              ) : (
                <div className="space-y-2">
                  {modalItems.map((t) => (
                    <div key={t.id} className="p-3 border rounded flex justify-between items-start">
                      <div>
                        <div className="text-sm font-medium">{t.title}</div>
                        <div className="text-xs text-slate-500">
                          {t.status} • Assigned: {t.assignedAt ? toYMD(t.assignedAt) : '-'} • Due: {t.dueDate ? toYMD(t.dueDate) : '-'}
                        </div>
                      </div>
                      <div className="text-xs text-slate-600">{t.id}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
