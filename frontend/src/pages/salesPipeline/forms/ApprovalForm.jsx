import { useState, useEffect } from 'react';
import api from '../../../lib/api.js';
import FormCard from '../../../components/salesPipeline/FormCard.jsx';
import Field from '../../../components/salesPipeline/Field.jsx';
import Input from '../../../components/salesPipeline/Input.jsx';
import Select from '../../../components/salesPipeline/Select.jsx';
import Button from '../../../components/salesPipeline/Button.jsx';
import StageGuardNote from '../../../components/salesPipeline/StageGuardNote.jsx';
import StageEligibleTable from '../../../components/salesPipeline/StageEligibleTable.jsx';

const emptyForm = {
  ticketId: '',
  approveStatus: 'PENDING',
  approverRemark: '',
  telecallerAssignedTo: ''
};

export default function ApprovalForm() {
  const [form, setForm] = useState(emptyForm);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  const [guard, setGuard] = useState(null);
  

  // new states for telecallers
  const [telecallers, setTelecallers] = useState([]);
  const [telecallersLoading, setTelecallersLoading] = useState(false);
  const [telecallersError, setTelecallersError] = useState('');

  const onChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const needTelecaller = form.approveStatus === 'ACCEPTED';

  // fetch telecallers when component mounts or when approveStatus becomes ACCEPTED
  useEffect(() => {
    let mounted = true;
    async function fetchTelecallers() {
      setTelecallersLoading(true);
      setTelecallersError('');
      try {
        // Adjust endpoint if you prefer /api/users?department=Sales&role=Telecaller
        const res = await api.get('/api/auth/users/telecallers');
        console.log("res: ", res);
        if (!mounted) return;
        // assume res.data is an array of { id, name, email? }
        setTelecallers(res.data || []);
      } catch (e) {
        console.log("res: ");
        if (!mounted) return;
        setTelecallersError(e.response?.data?.error || e.message || 'Failed to load telecallers');
        setTelecallers([]);
      } finally {
        if (mounted) setTelecallersLoading(false);
      }
    }

    if (needTelecaller) {
      fetchTelecallers();
    }

    return () => { mounted = false; };
  }, [needTelecaller]);



  async function onSubmit(e) {
    e.preventDefault();
    setOk(false); setErr(''); setGuard(null);
    try {
      const payload = {
        ...form,
        telecallerAssignedTo: needTelecaller ? form.telecallerAssignedTo : ''
      };
      await api.post('/api/sales/approval', payload);
      setOk(true);

      // clear form to defaults
      setForm({ ...emptyForm });

      // dispatch a DOM event so any table/dashboard can listen and refresh
      try {
        window.dispatchEvent(new CustomEvent('sales:approval:completed', { detail: { ticketId: savedTicketId } }));
      } catch (evErr) {
        // non-fatal
        console.warn('Could not dispatch sales:approval:completed event', evErr);
      }

      // auto-hide success after 4s
      setTimeout(() => setOk(false), 4000);

    } catch (e) {
      const d = e.response?.data;
      if (d?.code === 'STAGE_MISMATCH') {
        const det = d.details || {};
        setGuard({
          title: 'Not available yet for Approval',
          text: `${det.message} ${det.guidance || ''}`,
          sub: det.note,
          foot: det.ticketId ? `Ticket: ${det.ticketId} • Current: ${det.currentStageLabel} • Required here: ${det.expectedStageLabel}` : ''
        });
      } else {
        setErr(d?.error || e.message);
      }
    }
  }


  return (
    <FormCard title="Sales Coordinator Approval">
      {ok && <Msg ok text="Saved." />}
      {err && <Msg text={err} />}
      {guard && <StageGuardNote {...guard} />}

      <form className="grid md:grid-cols-2 gap-4" onSubmit={onSubmit}>
        <Field label="Ticket ID" required>
          <Input name="ticketId" value={form.ticketId} onChange={onChange} required readOnly />
        </Field>

        <Field label="Approve Status" required>
          <Select name="approveStatus" value={form.approveStatus} onChange={onChange}>
            <option value="PENDING">PENDING</option>
            <option value="ACCEPTED">ACCEPTED</option>
            <option value="REJECTED">REJECTED</option>
          </Select>
        </Field>

        {needTelecaller && (
          <Field label="Telecaller Assigned To" required>
            {telecallersLoading ? (
              <div className="p-2 text-sm text-gray-500">Loading telecallers…</div>
            ) : telecallersError ? (
              <div className="p-2 text-sm text-red-600">Failed to load telecallers</div>
            ) : (
              <Select
                name="telecallerAssignedTo"
                value={form.telecallerAssignedTo}
                onChange={onChange}
                required
              >
                <option value="">Select telecaller</option>
                {telecallers.map(tc => (
                  <option key={tc.id} value={tc.username || tc.id}>
                    {tc.username}{tc.email ? ` — ${tc.email}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field label="Approver Remark" required>
          <Input name="approverRemark" value={form.approverRemark} onChange={onChange} required />
        </Field>

        <div className="md:col-span-2">
          <Button type="submit">Submit</Button>
        </div>
      </form>

      <div className="mt-6">
        <StageEligibleTable
          stage="APPROVAL"
          preset="approval"
          onPick={(id) => setForm(f => ({ ...f, ticketId: id }))}
          title="Research data awaiting Approval"
        />
      </div>
    </FormCard>
  );
}

function Msg({ ok = false, text }) {
  return (
    <div
      className={`rounded-md px-3 py-2 text-sm border ${ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}
    >
      {text}
    </div>
  );
}
