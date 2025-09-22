import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../lib/api.js';

export default function LeadDetail(){
  const { ticketId } = useParams();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      try{
        const { data } = await api.get(`/api/sales/leads/${ticketId}`);
        setLead(data);
      } finally { setLoading(false); }
    })();
  }, [ticketId]);

  if (loading) return <div>Loading…</div>;
  if (!lead) return <div className="text-sm text-slate-600">Not found.</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Lead {lead.ticketId}</h2>
          <div className="text-xs text-slate-500">Updated {new Date(lead.updatedAt).toLocaleString()}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-sm">
          <div><span className="font-medium">Company:</span> {lead.company || '-'}</div>
          <div><span className="font-medium">Contact:</span> {lead.contactName || '-'}</div>
          <div><span className="font-medium">Mobile:</span> {lead.mobile || '-'}</div>
          <div><span className="font-medium">Email:</span> {lead.email || '-'}</div>
          <div><span className="font-medium">Region:</span> {lead.region || '-'}</div>
          <div><span className="font-medium">Stage:</span> {lead.stage || '-'}</div>
          <div><span className="font-medium">Client Status:</span> {lead.clientStatus || '-'}</div>
          <div><span className="font-medium">Meeting:</span> {lead.meetingType || '-'} {lead.meetingDateTime ? ` @ ${new Date(lead.meetingDateTime).toLocaleString()}` : ''}</div>
          <div><span className="font-medium">Budget (Est):</span> {lead.estimatedBudget ?? '-'}</div>
          <div><span className="font-medium">Budget (Actual):</span> {lead.newActualBudget ?? '-'}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Section title="History">
          {lead.history?.length ? lead.history.map(h=>(
            <div key={h.id} className="border rounded-md p-2 text-sm">
              <div><b>{h.fromStage} → {h.toStage}</b></div>
              <div className="text-slate-600">{h.notes}</div>
              <div className="text-xs text-slate-500">{h.by} • {new Date(h.createdAt).toLocaleString()}</div>
            </div>
          )) : <Empty />}
        </Section>

        <Section title="Research entries">
          {lead.researchEntries?.length ? lead.researchEntries.map(r=>(
            <KV key={r.id} items={{
              'Date': r.researchDate ? new Date(r.researchDate).toLocaleDateString() : '-',
              'Company': r.company,
              'Contact': r.contactName,
              'Mobile': r.mobile,
              'Email': r.email,
              'Region': r.region,
              'Est. Budget': r.estimatedBudget
            }} />
          )) : <Empty />}
        </Section>

        <Section title="Research Approval entries">
          {lead.approvalEntries?.length ? lead.approvalEntries.map(a=>(
            <KV key={a.id} items={{
              'Status': a.approveStatus,
              'Remark': a.approverRemark,
              'Telecaller': a.telecallerAssignedTo,
              'By': a.approvedBy
            }} />
          )) : <Empty />}
        </Section>

        <Section title="Telecall entries">
          {lead.telecallEntries?.length ? lead.telecallEntries.map(t=>(
            <KV key={t.id} items={{
              'Type': t.meetingType,
              'DateTime': t.meetingDateTime ? new Date(t.meetingDateTime).toLocaleString() : '-',
              'Assignee': t.meetingAssignee,
              'By': t.createdBy
            }} />
          )) : <Empty />}
        </Section>

        <Section title="Meeting entries">
          {lead.meetingEntries?.length ? lead.meetingEntries.map(m=>(
            <KV key={m.id} items={{
              'Status': m.status,
              'Notes': m.outcomeNotes,
              'New Budget': m.newActualBudget,
              'By': m.createdBy
            }} />
          )) : <Empty />}
        </Section>

        <Section title="CRM entries">
          {lead.crmEntries?.length ? lead.crmEntries.map(c=>(
            <KV key={c.id} items={{
              'Status': c.status,
              'Notes': c.followupNotes,
              'Next Follow-up': c.nextFollowUpOn ? new Date(c.nextFollowUpOn).toLocaleDateString() : '-',
              'By': c.createdBy
            }} />
          )) : <Empty />}
        </Section>
      </div>

      <div>
        <Link className="text-blue-600 hover:underline" to="/sales/dashboard">← Back to dashboard</Link>
      </div>
    </div>
  );
}

function Section({ title, children }){
  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-semibold mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function KV({ items }){
  return (
    <div className="border rounded-md p-2 text-sm grid grid-cols-1 sm:grid-cols-2 gap-1">
      {Object.entries(items).map(([k,v])=>(
        <div key={k}><span className="font-medium">{k}:</span> {String(v ?? '-')}</div>
      ))}
    </div>
  );
}
function Empty(){ return <div className="text-sm text-slate-500">No entries yet.</div>; }
