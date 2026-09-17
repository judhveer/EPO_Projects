import React, { useState, useEffect, useCallback } from 'react';
import { DateTime } from 'luxon';
import api from '../../lib/api';

const ZONE = 'Asia/Kolkata';
const fmtDateTime = (d) => DateTime.fromISO(d, { zone: ZONE }).toFormat('dd LLL yyyy, hh:mm a');

const ENTITY_TYPES = ['ATTENDANCE', 'LEAVE_REQUEST', 'LEAVE_LEDGER', 'LEAVE_ALLOCATION', 'HOLIDAY', 'USER'];

export default function AuditLogViewer() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: 30 };
      if (filterType) params.entity_type = filterType;
      const { data } = await api.get('/api/audit-log', { params });
      setEntries(data.data);
      setPagination((p) => ({ ...p, totalPages: data.totalPages }));
    } catch (err) {
      console.error('Failed to load audit log', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, pagination.page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-4xl mx-auto mt-4 px-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-800">Audit Log</h2>
        <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All entity types</option>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden divide-y">
          {entries.length === 0 && <p className="px-5 py-6 text-sm text-gray-400 text-center">No audit entries found.</p>}
          {entries.map((e) => (
            <div key={e.id} className="px-5 py-3">
              <button onClick={() => setExpandedId(expandedId === e.id ? null : e.id)} className="w-full text-left flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">{e.entity_type}</span>
                  <span className="ml-2 text-sm font-medium text-gray-700">{e.action}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    by {e.performedByUser?.username || 'System'} · {fmtDateTime(e.createdAt)}
                  </span>
                </div>
                <span className="text-gray-400 text-xs">{expandedId === e.id ? '▲' : '▼'}</span>
              </button>
              {expandedId === e.id && (
                <div className="mt-2 text-xs bg-gray-50 rounded-lg p-3 space-y-1">
                  {e.reason && <p><span className="font-semibold text-gray-600">Reason:</span> {e.reason}</p>}
                  <p><span className="font-semibold text-gray-600">Entity ID:</span> {e.entity_id}</p>
                  {e.old_value && <pre className="whitespace-pre-wrap text-gray-500">Old: {JSON.stringify(e.old_value, null, 2)}</pre>}
                  {e.new_value && <pre className="whitespace-pre-wrap text-gray-500">New: {JSON.stringify(e.new_value, null, 2)}</pre>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center text-sm">
        <button disabled={pagination.page === 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
          className="px-3 py-1.5 border rounded-lg disabled:opacity-50">⬅ Prev</button>
        <span className="text-gray-500">Page {pagination.page} of {pagination.totalPages}</span>
        <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
          className="px-3 py-1.5 border rounded-lg disabled:opacity-50">Next ➡</button>
      </div>
    </div>
  );
}