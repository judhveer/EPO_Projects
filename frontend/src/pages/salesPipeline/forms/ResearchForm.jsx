import { useState, useEffect } from 'react';
import api, { toNumberOrNull } from '../../../lib/api.js';
import FormCard from '../../../components/salesPipeline/FormCard.jsx';
import Field from '../../../components/salesPipeline/Field.jsx';
import Input from '../../../components/salesPipeline/Input.jsx';
import Button from '../../../components/salesPipeline/Button.jsx';

const emptyForm = {
  ticketId: '',
  researchDate: '',
  company: '',
  contactName: '',
  mobile: '',
  email: '',
  region: '',
  estimatedBudget: ''
};

export default function ResearchForm() {
  const [form, setForm] = useState(emptyForm);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  const [loadingId, setLoadingId] = useState(false);
  const [lastSavedId, setLastSavedId] = useState(null);

  const onChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  async function fetchNextId() {
    setLoadingId(true);
    try {
      const { data } = await api.get('/api/sales/leads/next-id');
      const next = data?.ticketId || '';
      setForm(f => ({ ...f, ticketId: next }));
      return next;
    } catch (e) {
      console.error(e);
      setErr(e.response?.data?.error || 'Failed to get next Ticket ID');
      return '';
    } finally {
      setLoadingId(false);
    }
  }

  useEffect(() => { fetchNextId(); }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setOk(false);
    setErr('');
    setLastSavedId(null);

    try {
      const payload = {
        ticketId: form.ticketId || 'AUTO',
        researchDate: form.researchDate || null,
        company: form.company,
        contactName: form.contactName,
        mobile: form.mobile,
        email: form.email || null,
        region: form.region || null,
        estimatedBudget: toNumberOrNull(form.estimatedBudget)
      };
      const { data } = await api.post('/api/sales/research', payload);

      // Show saved ticket id (prefer backend returned id if available)
      const savedId = data?.ticketId || form.ticketId || 'UNKNOWN';
      setLastSavedId(savedId);
      setOk(true);

      // Clear the form (but keep ticketId blank while we fetch the next)
      setForm(emptyForm);

      // Get a fresh ticket id and put it into the form
      const newId = await fetchNextId();
      // If fetchNextId failed, form.ticketId will remain '', which is okay

    } catch (e) {
      if (e.response?.status === 409) {
        // collision; auto-refresh ID
        await fetchNextId();
        setErr('Ticket was taken. Generated a new ID — please submit again.');
      } else {
        setErr(e.response?.data?.error || e.message);
      }
    }
  }

  return (
    <FormCard title="Research Form">
      {ok && (
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          Saved. Ticket: <b>{lastSavedId || '-'}</b>
        </div>
      )}
      {err && (
        <div className="rounded-md bg-red-50 border-red-200 text-red-700 px-3 py-2 text-sm">
          {err}
        </div>
      )}

      <form className="grid md:grid-cols-2 gap-4" onSubmit={onSubmit}>
        <Field label="Ticket ID" required>
          <div className="flex gap-2">
            <Input name="ticketId" value={form.ticketId} readOnly />
            <Button type="button" onClick={fetchNextId} disabled={loadingId}>
              {loadingId ? '...' : 'Refresh ID'}
            </Button>
          </div>
        </Field>

        <Field label="Research Date" required>
          <Input type="date" name="researchDate" value={form.researchDate} onChange={onChange} required />
        </Field>

        <Field label="Company" required>
          <Input name="company" value={form.company} onChange={onChange} required />
        </Field>

        <Field label="Contact Name" required>
          <Input name="contactName" value={form.contactName} onChange={onChange} required />
        </Field>

        <Field label="Mobile" required>
          <Input name="mobile" type="number" value={form.mobile} onChange={onChange} required />
        </Field>

        <Field label="Email">
          <Input name="email" type="email" value={form.email} onChange={onChange} />
        </Field>

        <Field label="Region">
          <Input name="region" value={form.region} onChange={onChange} />
        </Field>

        <Field label="Estimated Budget" >
          <Input name="estimatedBudget" type="number" value={form.estimatedBudget} onChange={onChange} placeholder="e.g. 500000" />
        </Field>

        <div className="md:col-span-2">
          <Button type="submit">Submit</Button>
        </div>
      </form>
    </FormCard>
  );
}
