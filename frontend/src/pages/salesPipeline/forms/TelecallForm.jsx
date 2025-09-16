import { useState } from 'react';
import api from '../../../lib/api.js';
import FormCard from '../../../components/salesPipeline/FormCard.jsx';
import Field from '../../../components/salesPipeline/Field.jsx';
import Input from '../../../components/salesPipeline/Input.jsx';
import Select from '../../../components/salesPipeline/Select.jsx';
import Button from '../../../components/salesPipeline/Button.jsx';
import StageGuardNote from '../../../components/salesPipeline/StageGuardNote.jsx';
import StageEligibleTable from '../../../components/salesPipeline/StageEligibleTable.jsx';

export default function TelecallForm() {
  const [form, setForm] = useState({
    ticketId: '',
    meetingType: 'phone call',
    meetingDateTime: '',
    meetingAssignee: ''
  });
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  const [guard, setGuard] = useState(null);

  const onChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setOk(false); setErr(''); setGuard(null);
    try {
      await api.post('/api/sales/telecall', {
        ...form,
        meetingDateTime: form.meetingDateTime ? new Date(form.meetingDateTime).toISOString() : null
      });
      setOk(true);
    } catch (e) {
      const d = e.response?.data;
      if (d?.code === 'STAGE_MISMATCH') {
        const det = d.details || {};
        setGuard({
          title: 'Not available yet for Tele-call',
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
    <FormCard title="Tele-call Form">
      {ok && <Msg ok text="Saved." />}
      {err && <Msg text={err} />}
      {guard && <StageGuardNote {...guard} />}

      <form className="grid md:grid-cols-2 gap-4" onSubmit={onSubmit}>
        <Field label="Ticket ID" required>
          <Input name="ticketId" value={form.ticketId} onChange={onChange} required readOnly />
        </Field>
        <Field label="Meeting Type" required>
          <Select name="meetingType" value={form.meetingType} onChange={onChange}>
            <option>visit</option>
            <option>phone call</option>
            <option>video call</option>
          </Select>
        </Field>
        <Field label="Meeting Date & Time" required><Input type="datetime-local" name="meetingDateTime" value={form.meetingDateTime} onChange={onChange} required /></Field>
        <Field label="Meeting Assignee" required><Input name="meetingAssignee" value={form.meetingAssignee} onChange={onChange} required/></Field>

        <div className="md:col-span-2">
          <Button type="submit">Submit</Button>
        </div>
      </form>

      <div className="mt-6">
        <StageEligibleTable
          stage="TELECALL"
          preset="telecall"
          onPick={(id) => setForm(f => ({ ...f, ticketId: id }))}
          title="Tickets ready for Tele-call (with contact details)"
        />
      </div>
    </FormCard>
  );
}

function Msg({ ok = false, text }) {
  return <div className={`rounded-md px-3 py-2 text-sm border ${ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{text}</div>;
}
