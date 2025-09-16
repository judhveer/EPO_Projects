import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api.js';
import Input from './Input.jsx';
import Button from './Button.jsx';
import { labelForStatus } from '../../lib/labels.js';

function fmtDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d) ? '-' : d.toLocaleString();
}

export default function StageEligibleTable({ stage, preset, onPick, title, detailsPathBase = '/sales/leads' }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/api/sales/leads', { params: { stage, q, limit: 50, page: 1 } });
      setRows(data.rows ?? []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [stage]);

  const columns = columnsForPreset(preset, detailsPathBase);

  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">
          {title || 'Eligible Tickets'} — Stage: <span className="text-blue-700">{stage}</span>
        </h3>
        <div className="flex gap-2">
          <Input placeholder="Search company..." value={q} onChange={e => setQ(e.target.value)} />
          <Button onClick={load}>{loading ? 'Loading...' : 'Apply'}</Button>
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
      className='font-mono text-blue-700 hover:underline'
      title='Open lead details'
    >
      {r.ticketId}
    </Link>
  );

  switch ((preset || '').toLowerCase()) {
    case 'approval': // show research data so coordinator can review and decide
      return [
        { key: 'ticketId', title: 'Ticket', render: TicketCell},
        { key: 'company', title: 'Company' },
        { key: 'contactName', title: 'Contact' },
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
