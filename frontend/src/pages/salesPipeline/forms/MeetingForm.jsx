import { useState, useEffect } from 'react';
import api, { toNumberOrNull } from '../../../lib/api.js';
import FormCard from '../../../components/salesPipeline/FormCard.jsx';
import Field from '../../../components/salesPipeline/Field.jsx';
import Input from '../../../components/salesPipeline/Input.jsx';
import TextArea from '../../../components/salesPipeline/TextArea.jsx';
import Select from '../../../components/salesPipeline/Select.jsx';
import Button from '../../../components/salesPipeline/Button.jsx';
import StageGuardNote from '../../../components/salesPipeline/StageGuardNote.jsx';
import StageEligibleTable from '../../../components/salesPipeline/StageEligibleTable.jsx';

const STATUS_OPTIONS = [
  { value: 'APPROVE', label: 'Approve' },
  { value: 'REJECT', label: 'Reject' },
  { value: 'CRM_FOLLOW_UP', label: 'CRM follow-up' },
  { value: 'RESCHEDULE_MEETING', label: 'Reschedule meeting' },
];


export default function MeetingForm() {
  const [form, setForm] = useState({
    ticketId: '',
    outcomeNotes: '',
    status: 'CRM_FOLLOW_UP',    // default to CRM follow-up
    newActualBudget: '',
    meetingType: 'phone call',
    meetingDateTime: '',
    meetingAssignee: '',
    nextFollowUpOn: '',
  });
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  const [guard, setGuard] = useState(null);

  // assignees state
  const [assignees, setAssignees] = useState([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [assigneesError, setAssigneesError] = useState('');

  const onChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const isReschedule = form.status === 'RESCHEDULE_MEETING';
  const isCrmFollowUp = form.status === 'CRM_FOLLOW_UP';

  // fetch assignees when reschedule is selected
  useEffect(() => {
    let mounted = true;

    async function fetchAssignees() {
      setAssigneesLoading(true);
      setAssigneesError('');
      try {
        const res = await api.get('/api/auth/users/executives');
        if (!mounted) return;
        setAssignees(res.data || []);
      } catch (e) {
        if (!mounted) return;
        console.error('Failed to fetch assignees', e);
        setAssigneesError(e.response?.data?.error || e.message || 'Failed to load assignees');
        setAssignees([]);
      } finally {
        if (mounted) setAssigneesLoading(false);
      }
    }

    if (isReschedule) fetchAssignees();

    return () => { mounted = false; };
  }, [isReschedule]);

  async function onSubmit(e) {
    e.preventDefault();
    setOk(false); setErr(''); setGuard(null);
    try {
      await api.post('/api/sales/meeting', {
        ticketId: form.ticketId,
        outcomeNotes: form.outcomeNotes || '',
        status: form.status,
        newActualBudget: toNumberOrNull(form.newActualBudget),
        nextFollowUpOn: isCrmFollowUp ? (form.nextFollowUpOn || null) : null,
        meetingType: isReschedule ? form.meetingType : null,
        meetingDateTime: isReschedule ? (form.meetingDateTime ? new Date(form.meetingDateTime).toISOString() : null) : null,
        meetingAssignee: isReschedule ? (form.meetingAssignee || null) : null
      });
      setOk(true);
    } catch (e) {
      const d = e.response?.data;
      if (d?.code === 'STAGE_MISMATCH') {
        const det = d.details || {};
        setGuard({
          title: 'Not available yet for Meeting',
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
    <FormCard title="Meeting Outcome">
      {ok && <Msg ok text="Saved." />}
      {err && <Msg text={err} />}
      {guard && <StageGuardNote {...guard} />}

      <form className="grid md:grid-cols-2 gap-4" onSubmit={onSubmit}>
        <Field label="Ticket ID" required>
          <Input name="ticketId" value={form.ticketId} onChange={onChange} required readOnly />
        </Field>

        <Field label="Status" required>
          <Select name="status" value={form.status} onChange={onChange}>
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </Field>

        <div className="md:col-span-2">
          <Field label="Outcome Notes">
            <TextArea rows="4" name="outcomeNotes" value={form.outcomeNotes} onChange={onChange} />
          </Field>
        </div>

        <Field label="New Actual Budget">
          <Input name="newActualBudget" value={form.newActualBudget} onChange={onChange} placeholder="e.g. 520000" />
        </Field>

        {/* Only when sending to CRM follow-up */}
        {isCrmFollowUp && (
          <Field label="Next Follow-up On" required>
            <Input type="date" name="nextFollowUpOn" value={form.nextFollowUpOn} onChange={onChange} required />
          </Field>
        )}

        {/* Only when rescheduling a meeting */}
        {isReschedule && (
          <>
            <Field label="Meeting Type" required>
              <Select name="meetingType" value={form.meetingType} onChange={onChange}>
                <option>VISIT</option>
                <option>PHONE CALL</option>
                <option>ZOOM MEET</option>
              </Select>
            </Field>

            <Field label="Meeting Date & Time" required>
              <Input type="datetime-local" name="meetingDateTime" value={form.meetingDateTime} onChange={onChange} required />
            </Field>

            <Field label="Meeting Assignee" required>
              {assigneesLoading ? (
                <div className="p-2 text-sm text-gray-500">Loading assignees…</div>
              ) : assigneesError ? (
                <div className="p-2 text-sm text-red-600">Failed to load assignees</div>
              ) : (
                <Select name="meetingAssignee" value={form.meetingAssignee} onChange={onChange} required>
                  <option value="">Select Assignee</option>
                  {assignees.map(user => (
                    // keep value compatible with other forms (username) — change to user.id if you prefer numeric id
                    <option key={user.id} value={user.username || user.id}>
                      {user.name || user.username || user.email}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        )}

        <div className="md:col-span-2">
          <Button type="submit">Submit</Button>
        </div>
      </form>

      <div className="mt-6">
        <StageEligibleTable
          stage="MEETING"
          preset="meeting"
          onPick={(id) => setForm(f => ({ ...f, ticketId: id }))}
          title="Tickets with Meeting details"
        />
      </div>
    </FormCard>
  );
}
function Msg({ ok = false, text }) { return <div className={`rounded-md px-3 py-2 text-sm border ${ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{text}</div>; }

