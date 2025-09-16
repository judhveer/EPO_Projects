import { useState } from 'react';
import api from '../../../lib/api.js';
import FormCard from '../../../components/salesPipeline/FormCard.jsx';
import Field from '../../../components/salesPipeline/Field.jsx';
import Input from '../../../components/salesPipeline/Input.jsx';
import Select from '../../../components/salesPipeline/Select.jsx';
import Button from '../../../components/salesPipeline/Button.jsx';
import StageGuardNote from '../../../components/salesPipeline/StageGuardNote.jsx';
import StageEligibleTable from '../../../components/salesPipeline/StageEligibleTable.jsx';

export default function ApprovalForm() {
  const [form, setForm] = useState({
    ticketId: '',
    approveStatus: 'PENDING',
    approverRemark: '',
    telecallerAssignedTo: ''
  });
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  const [guard, setGuard] = useState(null);

  const onChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const needTelecaller = form.approveStatus === 'ACCEPTED';

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
            <Input name="telecallerAssignedTo" value={form.telecallerAssignedTo} onChange={onChange} required placeholder="Name" />
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
      className={`rounded-md px-3 py-2 text-sm border ${ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}
    >
      {text}
    </div>
  );
}
