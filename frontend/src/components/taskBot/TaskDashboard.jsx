import React, { useEffect, useMemo, useState } from 'react'
import api from '../../lib/api.js';
import axios from 'axios';

const STATUS = ['pending', 'revised', 'completed', 'canceled']
const STATUS_LABEL = { pending: 'Pending', revised: 'Revised', completed: 'Completed', canceled: 'Cancelled' }


function Pill({ children, className = '' }) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>{children}</span>
}

function StatusBadge({ status }) {
  const map = {
    pending: 'bg-amber-100 text-amber-700',
    revised: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    canceled: 'bg-rose-100 text-rose-700',
  }
  return <Pill className={map[status] || 'bg-gray-100 text-gray-700'}>{STATUS_LABEL[status] || status}</Pill>
}


function UrgencyBadge({ urgency }) {
  const u = String(urgency || '').toLowerCase()
  const cls = u.includes('high') || u.includes('urgent') || u.includes('critical')
    ? 'bg-rose-100 text-rose-700'
    : u.includes('med')
      ? 'bg-amber-100 text-amber-700'
      : u
        ? 'bg-sky-100 text-sky-700'
        : 'bg-gray-100 text-gray-600'
  return <Pill className={cls}>{urgency || '—'}</Pill>
}

function formatDate(s) {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

function isOverdue(task) {
  if (!task?.dueDate) return false
  const due = new Date(task.dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today && !['completed', 'canceled'].includes(task.status)
}


export default function TaskDashboard() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [totalCount, setTotalCount] = useState(0)     // NEW
  const [serverPaging, setServerPaging] = useState(false) // NEW

  // filters
  const [q, setQ] = useState('')
  const [status, setStatus] = useState(new Set()) // multi
  const [urgency, setUrgency] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')


  // table/ui
  const [sortKey, setSortKey] = useState('dueDate')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [view, setView] = useState('table') // table | cards
  // fetch tasks whenever filters/paging change
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true); setError('')
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (status.size) params.set('status', [...status].join(','))
      if (urgency) params.set('urgency', urgency)
      if (dueFrom) params.set('dueFrom', dueFrom)
      if (dueTo) params.set('dueTo', dueTo)
      if (limit) params.set('limit', String(limit))
      if (page) params.set('page', String(page))
      if (sortKey) params.set('sort', sortKey)
      if (sortDir) params.set('dir', sortDir)
      try {
        // NOTE: keep the leading /api if your server routes are under /api
        const res = await api.get('/api/tasks', {
          params,
          signal: controller.signal,               // axios v1 supports AbortController
          validateStatus: () => true,             // we'll handle non-2xx ourselves
        });

        console.log(res);

        const ct = (res.headers?.['content-type'] || '').toLowerCase();
        const data = res.data;

        // If server sent HTML (e.g., SPA index.html or login page), bail out
        if (!ct.includes('application/json') && typeof data === 'string') {
          // optional peek for debugging:
          console.debug('Non-JSON payload snippet:', data.slice(0, 200));
          throw new Error('Expected JSON but received HTML. Check API route/proxy/auth redirect.');
        }

        if (res.status < 200 || res.status >= 300) {
          const snippet = typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data);
          throw new Error(`HTTP ${res.status}: ${snippet}`);
        }
        // setTasks(Array.isArray(data) ? data : data.rows || [])
        // detect shape and set totals
        const totalHeader = Number(res.headers?.['x-total-count'])
        if (Array.isArray(data)) {
          // server returned ALL items (no paging)
          setServerPaging(false)
          setTasks(data)
          setTotalCount(data.length)
        } else if (data && Array.isArray(data.rows)) {
          // server returned paged list
          setServerPaging(true)
          setTasks(data.rows)
          setTotalCount(
            Number(
              data.count ??
              data.total ??
              data.totalCount ??
              totalHeader ??
              data.rows.length
            )
          )
        } else {
          setServerPaging(false)
          setTasks([])
          setTotalCount(0)
        }
      } catch (err) {
        // ignore cancellations from unmount/dep change
        if (controller.signal.aborted ||
          axios.isCancel?.(err) ||
          err?.name === 'CanceledError' ||
          err?.code === 'ERR_CANCELED') return;

        // surface useful message
        const msg =
          (err?.response
            ? `HTTP ${err.response.status}: ${typeof err.response.data === 'string'
              ? err.response.data.slice(0, 200)
              : JSON.stringify(err.response.data)
            }`
            : err?.message) || 'Failed to load tasks';
        console.error('tasks load error:', err);
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load()
    return () => controller.abort()
  }, [q, status, urgency, dueFrom, dueTo, limit, page, sortKey, sortDir])


  // New: only three options — All / Urgency / Scheduled
  const urgencyOptions = ['', 'urgent', 'scheduled'];

  // client-side sort (in case backend ignores sort)
  const sorted = useMemo(() => {
    const arr = tasks.slice()
    arr.sort((a, b) => {
      let av = a[sortKey]; let bv = b[sortKey]
      if (sortKey === 'dueDate' || sortKey === 'createdAt') {
        av = av ? new Date(av).getTime() : 0
        bv = bv ? new Date(bv).getTime() : 0
      }
      if (sortKey === 'status') {
        const order = { pending: 1, revised: 2, completed: 3, canceled: 4 }
        av = order[a.status] || 99; bv = order[b.status] || 99
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [tasks, sortKey, sortDir])

  // client-side filter (if backend ignores some params)
  const filtered = useMemo(() => {
    return sorted.filter(t => {
      if (q) {
        const needle = q.toLowerCase()
        const hay = `${t.task || ''} ${t.doer || ''} ${t.department || ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      // if (status.size && !status.has(t.status)) return false
      // if (urgency && String(t.urgency || '') !== urgency) return false
      if (status.size && !status.has(t.status)) return false
      // New: interpret the dropdown choices
      if (urgency === 'urgent' && !t.urgency) return false
      if (urgency === 'scheduled' && !t.dueDate) return false
      if (dueFrom && t.dueDate && new Date(t.dueDate) < new Date(`${dueFrom}T00:00:00`)) return false
      if (dueTo && t.dueDate && new Date(t.dueDate) > new Date(`${dueTo}T23:59:59`)) return false
      return true
    })
  }, [sorted, q, status, urgency, dueFrom, dueTo])

  // const total = filtered.length
  // const startIdx = (page - 1) * limit
  // const pageItems = filtered.slice(startIdx, startIdx + limit)
  // const totalPages = Math.max(1, Math.ceil(total / limit))

  const total = serverPaging ? totalCount : filtered.length;
  const startIdx = (page - 1) * limit;
  const pageItems = serverPaging ? filtered : filtered.slice(startIdx, startIdx + limit)
  const totalPages = Math.max(1, Math.ceil(total / limit))

  useEffect(() => { if (page > totalPages) setPage(1) }, [totalPages])


  function toggleStatus(s) {
    setPage(1)
    setStatus(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  function resetFilters() {
    setQ(''); setStatus(new Set()); setUrgency(''); setDueFrom(''); setDueTo(''); setPage(1)
  }

  function exportCSV() {
    const cols = ['ID', 'Task', 'Doer', 'Department', 'Urgency', 'Due Date', 'Status', 'Cancellation Requested', 'Extension Requested Date']
    const lines = [cols.join(',')]
    filtered.forEach(t => {
      const row = [
        t.id,
        JSON.stringify(t.task || ''),
        JSON.stringify(t.doer || ''),
        JSON.stringify(t.department || ''),
        JSON.stringify(t.urgency || ''),
        JSON.stringify(t.dueDate || ''),
        JSON.stringify(t.status),
        t.cancellationRequested ? 'Yes' : 'No',
        JSON.stringify(t.extensionRequestedDate || '')
      ]
      lines.push(row.join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tasks.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function HeaderButton({ active, children, onClick }) {
    return (
      <button onClick={onClick} className={
        `px-3 py-2 rounded-lg text-sm font-medium border ${active ? 'bg-blue-700 text-white border-white' : 'bg-white hover:bg-gray-50 border-gray-200'} `
      }>{children}</button>
    )
  }


  return (
    <div className='min-h-screen p-4 sm:p-6 lg:p-8'>
      <div className="max-w-7xl mx-auto">
        {/* Top bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Task Dashboard</h1>
            <p className="text-sm text-gray-500">Filter by status, urgency, and due date. Export to CSV.</p>
          </div>
          <div className="flex gap-2">
            <HeaderButton active={view === 'table'} onClick={() => setView('table')}>Table</HeaderButton>
            <HeaderButton active={view === 'cards'} onClick={() => setView('cards')}>Cards</HeaderButton>
            <button onClick={exportCSV} className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white hover:text-blue-700">Export CSV</button>
          </div>
        </div>

        {/* Filter panel */}
        <div className="mt-5 bg-white border border-gray-200 shadow-soft rounded-2xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Search</label>
              <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }}
                placeholder="Search task, doer, department..."
                className="w-full rounded-xl px-3 py-[3px] border border-gray-300 focus:ring-gray-700 focus:border-gray-700" />
            </div>
            <div>
              {/* <label className="block text-xs font-semibold text-gray-500 mb-1">Urgency</label>
              <select value={urgency} onChange={e => { setUrgency(e.target.value); setPage(1) }}
                className="w-full rounded-xl border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-gray-900">
                {urgencies.map(u => <option key={u} value={u}>{u || 'All'}</option>)}
              </select> */}
              <label className="block text-xs px-3 font-semibold text-gray-500 mb-1">Type</label>
              <select
                value={urgency}
                onChange={e => { setUrgency(e.target.value); setPage(1) }}
                className="w-full lg:w-max px-3 py-[3px]  rounded-xl border border-gray-300  focus:ring-gray-700 focus:border-gray-700"
              >
                {urgencyOptions.map(u => (
                  <option key={u} value={u}>
                    {u === '' ? 'All' : u === 'urgent' ? 'Urgent' : 'Scheduled'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs px-3 font-semibold text-gray-500 mb-1">Due From</label>
              <input type="date" value={dueFrom} onChange={e => { setDueFrom(e.target.value); setPage(1) }}
                className="w-full lg:w-max px-3 py-[3px] rounded-xl border border-gray-300  focus:ring-gray-700 focus:border-gray-700" />
            </div>
            <div>
              <label className="block text-xs px-3 font-semibold text-gray-500 mb-1">Due To</label>
              <input type="date" value={dueTo} onChange={e => { setDueTo(e.target.value); setPage(1) }}
                className="w-full lg:w-max px-3 py-[3px] rounded-xl border border-gray-300  focus:ring-gray-700 focus:border-gray-700" />
            </div>
          </div>

          {/* Status chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            {STATUS.map(s => (
              <button key={s} onClick={() => toggleStatus(s)}
                className={`px-3 py-1.5 rounded-full text-sm border ${status.has(s) ? 'bg-blue-700 text-white border-white' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                {STATUS_LABEL[s]}
              </button>
            ))}
            <button onClick={resetFilters} className="ml-auto text-lg px-3 rounded-xl border border-gray-300 text-gray-600 hover:text-gray-900 cursor-pointer">Reset</button>
          </div>
        </div>

        {/* Results header */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">{loading ? 'Loading…' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}</div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Rows:</label>
            <select value={limit} onChange={e => setLimit(parseInt(e.target.value) || 20)} className="rounded-lg px-3 py-[3px] border border-gray-300">
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="ml-4 text-sm text-gray-600">Sort:</label>
            <select value={sortKey} onChange={e => setSortKey(e.target.value)} className="rounded-lg px-3 py-[3px] border border-gray-300">
              <option value="dueDate">Due date</option>
              <option value="createdAt">Created</option>
              <option value="urgency">Urgency</option>
              <option value="status">Status</option>
            </select>
            <select value={sortDir} onChange={e => setSortDir(e.target.value)} className="rounded-lg px-3 py-[3px] border border-gray-300">
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
          </div>
        </div>


        {/* Error */}

        {error && <div className="mt-3 p-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">{error}</div>}


        {/* Table / Cards */}
        <div className="mt-3">
          {view === 'table' ? (
            <div className="overflow-x-auto bg-white border border-gray-200 rounded-2xl shadow-soft">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3">Created On</th>
                    <th className="text-left px-4 py-3">Task</th>
                    <th className="text-left px-4 py-3">Doer</th>
                    <th className="text-left px-4 py-3">Department</th>
                    <th className="text-left px-4 py-3">Urgency</th>
                    <th className="text-left px-4 py-3">Due</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(t => (
                    <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">{t.createdAt ? new Date(t.createdAt).toISOString().split('T')[0].split('-').reverse().join('-'): '—'}</td>
                      <td className="px-4 py-3 max-w-[420px]"><div className="font-medium text-gray-900 truncate" title={t.task}>{t.task}</div></td>
                      <td className="px-4 py-3">{t.doer || '—'}</td>
                      <td className="px-4 py-3">{t.department || '—'}</td>
                      <td className="px-4 py-3"><UrgencyBadge urgency={t.urgency} /></td>
                      <td className={"px-4 py-3 " + (isOverdue(t) ? 'text-rose-600 font-semibold' : '')}>{formatDate(t.dueDate)}</td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        <div className="flex flex-wrap gap-2">
                          {t.cancellationRequested && <Pill className="bg-rose-100 text-rose-700">Cancel req</Pill>}
                          {t.extensionRequestedDate && <Pill className="bg-indigo-100 text-indigo-700">Ext: {formatDate(t.extensionRequestedDate)}</Pill>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!pageItems.length && !loading && (
                    <tr>
                      <td colSpan="7" className="px-4 py-8 text-center text-gray-500">No results</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pageItems.map(t => (
                <div key={t.id} className="bg-white border border-gray-200 rounded-2xl shadow-soft p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold text-gray-900 leading-snug line-clamp-2" title={t.task}>{t.task}</div>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="mt-2 text-sm text-gray-600">{t.doer || '—'} • {t.department || '—'}</div>
                  <div className="mt-3 flex items-center justify-between">
                    <UrgencyBadge urgency={t.urgency} />
                    <div className={"text-sm " + (isOverdue(t) ? 'text-rose-600 font-semibold' : 'text-gray-600')}>{formatDate(t.dueDate)}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {t.cancellationRequested && <Pill className="bg-rose-100 text-rose-700">Cancel req</Pill>}
                    {t.extensionRequestedDate && <Pill className="bg-indigo-100 text-indigo-700">Ext: {formatDate(t.extensionRequestedDate)}</Pill>}
                  </div>
                </div>
              ))}
              {!pageItems.length && !loading && (
                <div className="col-span-full text-center text-gray-500 py-12">No results</div>
              )}
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-600">Page {page} of {totalPages}</div>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
              className={"px-3 py-2 rounded-lg text-sm border " + (page <= 1 ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white hover:bg-gray-50 border-gray-200')}>
              Prev
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className={"px-3 py-2 rounded-lg text-sm border " + (page >= totalPages ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white hover:bg-gray-50 border-gray-200')}>
              Next
            </button>
          </div>
        </div>

      </div>

    </div >

  );
}


