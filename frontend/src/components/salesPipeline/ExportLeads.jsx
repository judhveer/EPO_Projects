import React, { useMemo, useState } from 'react';
import api from '../../lib/api.js';

// Helper: format ISO date to YYYY-MM-DD (no dependency)
function toYMD(d) {
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function periodToRange(option) {
  const now = new Date();
  let from = new Date();
  switch (option) {
    case '1m':
      from.setMonth(now.getMonth() - 1);
      break;
    case '3m':
      from.setMonth(now.getMonth() - 3);
      break;
    case '6m':
      from.setMonth(now.getMonth() - 6);
      break;
    case '1y':
      from.setFullYear(now.getFullYear() - 1);
      break;
    default:
      from = null;
  }
  return { from, to: now };
}

function jsonToCsv(rows = [], columnsOrder = null) {
  if (!rows || rows.length === 0) return '';

  const headers = columnsOrder ?? Object.keys(rows[0]);
  const escapeCell = (val) => {
    if (val === null || val === undefined) return '';
    const s = String(typeof val === 'object' ? JSON.stringify(val) : val);
    if (s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
    if (s.search(/,|\n/) >= 0) return `"${s}"`;
    return s;
  };

  const lines = [];
  lines.push(headers.join(','));
  rows.forEach((r) => {
    const row = headers.map((h) => escapeCell(r[h]));
    lines.push(row.join(','));
  });

  return lines.join('\n');
}

function Spinner({ size = 18 }) {
  return (
    <svg className="animate-spin inline-block" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.15" />
      <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * ExportLeads
 *
 * - Left: period selector + actions
 * - Right: column selector (modes: common | all | custom)
 * - No preview table
 */
export default function ExportLeads() {
  const [option, setOption] = useState('1m'); // '1m'|'3m'|'6m'|'1y'|'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [leadsCount, setLeadsCount] = useState(null); // null until fetch
  const [error, setError] = useState('');

  // columns state
  const [columnMode, setColumnMode] = useState('common'); // 'common' | 'all' | 'custom'
  const [selectedColumns, setSelectedColumns] = useState([]); // for custom mode and also used for download
  const [availableColumns, setAvailableColumns] = useState([]); // detected after fetch

  const computeRange = () => {
    if (option === 'custom') {
      if (!customFrom || !customTo) return null;
      return { from: new Date(customFrom), to: new Date(customTo) };
    }
    return periodToRange(option);
  };

  const range = computeRange();
  const fromDisplay = range?.from ? toYMD(range.from) : '-';
  const toDisplay = range?.to ? toYMD(range.to) : '-';

  const buildUrl = (fromISO, toISO) =>
    `/api/sales/leads/export/excel?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`;

  // Common columns fallback (will be intersected with availableColumns)
  const COMMON_COLUMNS_FALLBACK = [
    'id',
    'name',
    'email',
    'phone',
    'company',
    'source',
    'assignedTo',
    'status',
    'createdAt',
    'updatedAt',
  ];

  // Fetch leads from API and return array.
  // If server returns CSV string, the function will trigger a download and return [].
  const fetchLeads = async () => {
    setError('');
    setLeadsCount(null);
    setAvailableColumns([]);
    setSelectedColumns([]);
    try {
      const r = computeRange();
      if (!r) {
        setError('Please select a valid range. For Custom choose both From and To.');
        return [];
      }

      const fromISO = new Date(r.from).toISOString();
      const toDate = new Date(r.to);
      toDate.setHours(23, 59, 59, 999);
      const toISO = toDate.toISOString();

      setLoading(true);
      const res = await api.get(buildUrl(fromISO, toISO));
      const data = res.data;

      // If backend returned CSV text (string), download immediately
      if (typeof data === 'string' && data.includes(',')) {
        const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
        const filename = `leads_${toYMD(new Date())}.csv`;
        if (navigator.msSaveBlob) navigator.msSaveBlob(blob, filename);
        else {
          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          link.href = url;
          link.setAttribute('download', filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
        setError('Downloaded CSV returned from server.');
        setLeadsCount(0);
        setLoading(false);
        return [];
      }

      if (!Array.isArray(data)) {
        throw new Error('Invalid data from server. Expected an array of lead objects.');
      }

      // detect columns
      const keys = data.length > 0 ? Object.keys(data[0]) : [];
      setAvailableColumns(keys);
      setLeadsCount(data.length);

      // set columns according to current columnMode
      if (columnMode === 'all') {
        setSelectedColumns(keys);
      } else if (columnMode === 'common') {
        const common = COMMON_COLUMNS_FALLBACK.filter((c) => keys.includes(c));
        // if none of the fallbacks present, fall back to the first 8 keys
        setSelectedColumns(common.length > 0 ? common : keys.slice(0, 8));
      } else if (columnMode === 'custom') {
        // keep previously selected if intersection exists, otherwise select first 6
        setSelectedColumns((prev) => {
          const validPrev = prev?.filter((p) => keys.includes(p));
          if (validPrev && validPrev.length > 0) return validPrev;
          return keys.slice(0, 6);
        });
      }

      setLoading(false);
      return data;
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        (typeof err?.response?.data === 'string' ? err.response.data : undefined) ||
        err?.message ||
        'Failed to fetch leads. Check server logs or network.';
      setError(String(msg));
      setLoading(false);
      return [];
    }
  };

  // Build CSV and trigger download for a given array and chosen columns
  const downloadCsvFromArray = (arr, columns) => {
    if (!arr || arr.length === 0) {
      setError('No leads to export for the selected range.');
      return;
    }
    const cols = columns && columns.length > 0 ? columns : Object.keys(arr[0]);
    const csv = jsonToCsv(arr, cols);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const filename = `leads_${toYMD(new Date())}.csv`;
    if (navigator.msSaveBlob) {
      navigator.msSaveBlob(blob, filename);
    } else {
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  // determine columns to use for download based on mode & selectedColumns
  const resolveColumnsForDownload = (availCols) => {
    if (columnMode === 'all') return availCols;
    if (columnMode === 'common') {
      const common = COMMON_COLUMNS_FALLBACK.filter((c) => availCols.includes(c));
      return common.length > 0 ? common : availCols.slice(0, 8);
    }
    // custom
    return selectedColumns.length > 0 ? selectedColumns.filter((c) => availCols.includes(c)) : availCols.slice(0, 8);
  };

  // Fetch leads only (updates detected columns & counts) - handy if boss wants to inspect counts first
  const handleFetch = async () => {
    setError('');
    await fetchLeads();
  };

  // Fetch & Download — uses the returned array to avoid state race
  const handleFetchAndDownload = async () => {
    setError('');
    setLoading(true);
    try {
      const arr = await fetchLeads();
      if (!arr || arr.length === 0) {
        // fetchLeads may have downloaded server CSV already or no rows found
        if (!error) setError('No leads found for the selected range.');
        return;
      }
      const cols = resolveColumnsForDownload(availableColumns.length ? availableColumns : Object.keys(arr[0]));
      downloadCsvFromArray(arr, cols);
    } finally {
      setLoading(false);
    }
  };

  // Toggle checkbox in custom mode
  const toggleColumn = (col) => {
    if (selectedColumns.includes(col)) {
      setSelectedColumns(selectedColumns.filter((c) => c !== col));
    } else {
      setSelectedColumns([...selectedColumns, col]);
    }
  };

  // If user switches column mode, update selectedColumns immediately based on availableColumns
  const onChangeColumnMode = (mode) => {
    setColumnMode(mode);
    if (mode === 'all') {
      setSelectedColumns(availableColumns);
    } else if (mode === 'common') {
      const common = COMMON_COLUMNS_FALLBACK.filter((c) => availableColumns.includes(c));
      setSelectedColumns(common.length > 0 ? common : availableColumns.slice(0, 8));
    } else if (mode === 'custom') {
      // keep previous selection if present; else pick first few
      setSelectedColumns((prev) => (prev && prev.length > 0 ? prev.filter((p) => availableColumns.includes(p)) : availableColumns.slice(0, 6)));
    }
  };

  // responsive layout: two columns on md+, stacked on small screens
  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-md shadow-sm">
      <h2 className="text-2xl font-semibold mb-4">Export Leads</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: period selector + actions */}
        <div className="space-y-4">
          <label className="block text-sm font-medium">Select period</label>

          <div className="inline-flex rounded-md shadow-sm" role="tablist" aria-label="Period presets">
            {[
              { key: '1m', label: '1 month' },
              { key: '3m', label: '3 months' },
              { key: '6m', label: '6 months' },
              { key: '1y', label: '1 year' },
              { key: 'custom', label: 'Custom' },
            ].map((p) => {
              const active = option === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => setOption(p.key)}
                  className={`px-3 py-1.5 text-sm font-medium border-r last:border-r-0 ${
                    active ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {option === 'custom' && (
            <div className="flex gap-3 items-end mt-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-600">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full border px-3 py-2 rounded"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-600">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full border px-3 py-2 rounded"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 items-center mt-2">
            <button
              onClick={handleFetch}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? <><Spinner /> Fetching...</> : 'Fetch Leads'}
            </button>

            <button
              onClick={handleFetchAndDownload}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? <Spinner /> : 'Fetch & Download CSV'}
            </button>

            <div className="ml-auto text-sm text-slate-500 text-right">
              <div><strong>Range:</strong></div>
              <div className="text-xs">{fromDisplay} — {toDisplay}</div>
              <div className="text-xs mt-1">Leads: <strong>{leadsCount === null ? '-' : leadsCount}</strong></div>
            </div>
          </div>

          {error && <div className="text-sm text-red-600 mt-1">{error}</div>}

          <div className="text-xs text-slate-500 mt-2">
            Tip: use <strong>Common</strong> for standard exports, <strong>All</strong> to include every field, or <strong>Custom</strong> to choose specific columns.
          </div>
        </div>

        {/* Right: columns selector */}
        <div className="space-y-4">
          <label className="block text-sm font-medium">Columns (choose export columns)</label>

          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => onChangeColumnMode('common')}
              className={`px-3 py-1 rounded text-sm ${columnMode === 'common' ? 'bg-blue-600 text-white' : 'border bg-white text-slate-700'}`}
            >
              Common
            </button>
            <button
              onClick={() => onChangeColumnMode('all')}
              className={`px-3 py-1 rounded text-sm ${columnMode === 'all' ? 'bg-blue-600 text-white' : 'border bg-white text-slate-700'}`}
            >
              All
            </button>
            <button
              onClick={() => onChangeColumnMode('custom')}
              className={`px-3 py-1 rounded text-sm ${columnMode === 'custom' ? 'bg-blue-600 text-white' : 'border bg-white text-slate-700'}`}
            >
              Custom
            </button>
          </div>

          <div className="mt-3 border rounded p-3 bg-slate-50 min-h-[120px]">
            <div className="text-xs text-slate-600 mb-2">Selected columns will be used for the CSV export.</div>

            {/* show available columns after fetch */}
            {availableColumns.length === 0 ? (
              <div className="text-sm text-slate-500">No columns detected yet. Click <strong>Fetch Leads</strong> to detect available fields from the server.</div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-xs text-slate-700">Available: <strong>{availableColumns.length}</strong></div>
                  <button
                    onClick={() => {
                      // quick-select first 8 as "common preview"
                      setSelectedColumns(availableColumns.slice(0, 8));
                      setColumnMode('custom');
                    }}
                    className="text-xs px-2 py-1 border rounded ml-auto"
                  >
                    Quick select first 8
                  </button>
                </div>

                {columnMode === 'all' && (
                  <div className="text-sm text-slate-700">All columns will be included in the export.</div>
                )}

                {columnMode === 'common' && (
                  <div className="text-sm text-slate-700">Common columns selected (you can switch to Custom to change them).</div>
                )}

                {columnMode === 'custom' && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-auto">
                    {availableColumns.map((c) => (
                      <label key={c} className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedColumns.includes(c)}
                          onChange={() => toggleColumn(c)}
                        />
                        <span className="truncate">{c}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* small summary */}
                <div className="mt-3 text-xs text-slate-600">
                  Columns chosen:&nbsp;
                  <strong>
                    {columnMode === 'all' ? 'All' : (selectedColumns.length > 0 ? selectedColumns.length : '0')}
                  </strong>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
