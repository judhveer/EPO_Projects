import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api.js';
import Table from '../../components/salesPipeline/Table.jsx';
import Input from '../../components/salesPipeline/Input.jsx';
import Select from '../../components/salesPipeline/Select.jsx';
import Button from '../../components/salesPipeline/Button.jsx';
import Badge from '../../components/salesPipeline/Badge.jsx';

const STAGES = ['', 'RESEARCH', 'APPROVAL', 'TELECALL', 'MEETING', 'CRM', 'CLOSED'];
const CLIENTS = ['', 'OPEN', 'WON', 'LOST'];

export default function Dashboard() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [clientStatus, setClientStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // debounce timer
  const [debounceTimer, setDebounceTimer] = useState(null);

  async function fetchData() {
    setLoading(true);
    try {
      const { data } = await api.get('/api/sales/leads', { params: { q, stage, clientStatus, limit: 50, page: 1 } });
      setRows(data.rows ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, []);

  // fetch whenever filters change, with debounce for search input
  useEffect(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(fetchData, 300); // 300ms delay
    setDebounceTimer(timer);

    return () => clearTimeout(timer);
  }, [q, stage, clientStatus]);

  const columns = [
    { key: 'ticketId', title: 'Ticket', render: (r) => <Link to={`/sales/leads/${r.ticketId}`} className="text-blue-600 hover:underline">{r.ticketId}</Link> },
    { key: 'company', title: 'Company' },
    { key: 'contactName', title: 'Contact' },
    { key: 'mobile', title: 'Mobile' },
    { key: 'stage', title: 'Stage', render: (r) => <Badge>{r.stage}</Badge> },
    { key: 'clientStatus', title: 'Client', render: (r) => <span className="text-xs font-semibold">{r.clientStatus}</span> },
    { key: 'updatedAt', title: 'Updated', render: (r) => new Date(r.updatedAt).toLocaleString() },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input placeholder="Search company or region..." value={q} onChange={e => setQ(e.target.value)} />
          <Select value={stage} onChange={e => setStage(e.target.value)}>
            {STAGES.map(s => <option key={s} value={s}>{s || 'All stages'}</option>)}
          </Select>
          <Select value={clientStatus} onChange={e => setClientStatus(e.target.value)}>
            {CLIENTS.map(s => <option key={s} value={s}>{s || 'All client statuses'}</option>)}
          </Select>
          <Button onClick={() => { setQ(''); setStage(''); setClientStatus('') }}>{loading ? 'Loading...' : 'Clear Filters'}</Button>
        </div>
      </div>

      <Table columns={columns} rows={rows} loading={loading} />
    </div>
  );
}
