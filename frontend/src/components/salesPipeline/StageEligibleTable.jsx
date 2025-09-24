import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api.js';
import Input from './Input.jsx';
import Button from './Button.jsx';
import { labelForStatus } from '../../lib/labels.js';

function fmtDate(v, opts = {}) {
  // opts:
  //   showTime: true|false|'auto' (default 'auto')
  //   hour12: true|false (default true)
  if (!v) return '-';
  const { showTime = 'auto', hour12 = true } = opts;

  // Keep original raw string for pattern checks
  const raw = (typeof v === 'string') ? v.trim() : null;

  // If string is a pure date-only like "2025-09-28" or "28/09/2025", treat as date-only
  const isoDateOnly = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const slashDateOnly = raw && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw);

  // Construct Date object (if already Date, keep it)
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d)) return '-';

  // If caller explicitly asked to always hide/show time
  if (showTime === false) {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  if (showTime === true) {
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12
    });
  }

  // showTime === 'auto' (default): decide based on input or the Date object's UTC time
  if (isoDateOnly || slashDateOnly) {
    // backend sent a date-only string -> show only date
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // If input wasn't a string (or not date-only), detect if Date has zero UTC time
  // When new Date('YYYY-MM-DD') -> time components in UTC are 00:00:00.000
  const isMidnightUTC =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;

  if (isMidnightUTC) {
    // Likely created from a date-only string -> show only date
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // Otherwise input had time -> show date + time
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12
  });
}




export default function StageEligibleTable({ stage, preset, onPick, title, detailsPathBase = '/sales/leads' }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/sales/leads', { params: { stage, q, limit: 50, page: 1 } });
      setRows(data.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, [stage, q]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e) => {
      // optionally check e.detail.ticketId or e.detail.stage
      load();
    };
    window.addEventListener('sales:lead:created', handler);
    window.addEventListener('sales:approval:completed', handler);

    return () => {
      window.removeEventListener('sales:lead:created', handler);
      window.removeEventListener('sales:approval:completed', handler);
    };
  }, [load]);


  const columns = columnsForPreset(preset, detailsPathBase);

  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">
          {title || 'Eligible Tickets'} — Stage: <span className="text-blue-700">{stage}</span>
        </h3>
        <div className="flex gap-2">
          <Input placeholder="Search company or region..." value={q} onChange={e => setQ(e.target.value)} />
          <Button onClick={() => setQ('') }>{loading ? 'Loading...' : 'Clear'}</Button>
        </div>
      </div>

      <div className="overflow-auto border border-slate-200 rounded-lg">
        <table className="min-w-full bg-white">
          <thead className="bg-slate-100">
            <tr>
              {columns.map(c => (
                <th key={c.key} className="text-left text-xs font-semibold text-slate-700 px-3 py-2">
                  {c.title}
                </th>
              ))}
              <th className="text-left text-xs font-semibold text-slate-700 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td className="px-3 py-3 text-sm text-slate-600" colSpan={columns.length + 1}>No tickets in this stage.</td></tr>
            ) : rows.map(r => (
              <tr key={r.ticketId} className="border-t border-slate-100">
                {columns.map(c => (
                  <td key={c.key} className="px-3 py-2 text-sm">
                    {c.render ? c.render(r) : (r[c.key] ?? '-')}
                  </td>
                ))}
                <td className="px-3 py-2 text-sm">
                  <Button onClick={() => onPick && onPick(r.ticketId)}>Use</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function columnsForPreset(preset, detailsPathBase) {
  // All presets can assume we have these snapshot fields from /api/leads
  // ticketId, company, contactName, mobile, email, region, estimatedBudget,
  // researchDate, meetingType, meetingDateTime, meetingAssignee, outcomeStatus, updatedAt

  const TicketCell = (r) => (
    <Link
      to={`${detailsPathBase}/${encodeURIComponent(r.ticketId)}`}
      onClick={(e) => {
        e.preventDefault();
        window.open(`${detailsPathBase}/${encodeURIComponent(r.ticketId)}`, '_blank');
      }}
      className='font-mono text-blue-700 hover:underline'
      title='Open lead details'
    >
      {r.ticketId}
    </Link>
  );

  switch ((preset || '').toLowerCase()) {
    case 'approval': // show research data so coordinator can review and decide
      return [
        { key: 'ticketId', title: 'Ticket', render: TicketCell },
        { key: 'company', title: 'Company' },
        { key: 'contactName', title: 'Contact Name' },
        { key: 'mobile', title: 'Mobile' },
        { key: 'email', title: 'Email' },
        { key: 'region', title: 'Region' },
        { key: 'estimatedBudget', title: 'Est. Budget' },
        { key: 'researchDate', title: 'Research Date', render: r => fmtDate(r.researchDate) },
        // { key:'updatedAt', title:'Updated', render:r => fmtDate(r.updatedAt) },
      ];

    case 'telecall': // include contact details prominently
      return [
        { key: 'ticketId', title: 'Ticket', render: TicketCell },
        { key: 'company', title: 'Company' },
        { key: 'contactName', title: 'Contact' },
        { key: 'mobile', title: 'Mobile' },
        { key: 'email', title: 'Email' },
        { key: 'region', title: 'Region' },
        { key: 'updatedAt', title: 'Updated', render: r => fmtDate(r.updatedAt) },
      ];

    case 'meeting': // show meeting details scheduled by telecaller
      return [
        { key: 'ticketId', title: 'Ticket', render: TicketCell },
        { key: 'company', title: 'Company' },
        { key: 'meetingType', title: 'Meeting Type' },
        { key: 'meetingDateTime', title: 'Meeting DateTime', render: r => fmtDate(r.meetingDateTime) },
        { key: 'meetingAssignee', title: 'Assignee' },
        { key: 'contactName', title: 'Contact' },
        { key: 'mobile', title: 'Mobile' },
        { key: 'email', title: 'Email' },
        { key: 'updatedAt', title: 'Updated', render: r => fmtDate(r.updatedAt) },
      ];

    case 'crm': // show contact details for follow-ups
      return [
        { key: 'ticketId', title: 'Ticket', render: TicketCell },
        { key: 'company', title: 'Company' },
        { key: 'contactName', title: 'Contact' },
        { key: 'mobile', title: 'Mobile' },
        { key: 'email', title: 'Email' },
        { key: 'outcomeStatus', title: 'Last Status', render: r => labelForStatus(r.outcomeStatus) },
        { key: 'nextFollowUpOn', title: 'Next Follow-up', render: r => fmtDate(r.nextFollowUpOn) },
        // { key: 'updatedAt', title: 'Updated', render: r => fmtDate(r.updatedAt) },
      ];

    default: // fallback similar to the simple table
      return [
        { key: 'ticketId', title: 'Ticket', render: TicketCell },
        { key: 'company', title: 'Company' },
        { key: 'contactName', title: 'Contact' },
        { key: 'mobile', title: 'Mobile' },
        { key: 'updatedAt', title: 'Updated', render: r => fmtDate(r.updatedAt) },
      ];
  }
}
