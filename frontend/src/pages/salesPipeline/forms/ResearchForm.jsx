import { useState, useEffect } from 'react';
import api, { toNumberOrNull } from '../../../lib/api.js';
import FormCard from '../../../components/salesPipeline/FormCard.jsx';
import Field from '../../../components/salesPipeline/Field.jsx';
import Input from '../../../components/salesPipeline/Input.jsx';
import Button from '../../../components/salesPipeline/Button.jsx';
import Select from '../../../components/salesPipeline/Select.jsx';

const emptyForm = {
  ticketId: '',
  researchType: 'GENERAL', // 'GENERAL' | 'TENDER'
  researchDate: '',
  company: '',
  contactName: '',
  mobile: '',
  email: '',
  region: '',
  estimatedBudget: '',
  requirements: '',
  remarks: '',
  // tender-specific
  tenderOpeningDate: '',
  tenderClosingDate: '',
  // month picker value is 'YYYY-MM' (we will send this to backend as-is)
  financialPeriod: '',
};

export default function ResearchForm() {
  const [form, setForm] = useState(emptyForm);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  const [loadingId, setLoadingId] = useState(false);
  const [lastSavedId, setLastSavedId] = useState(null);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

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

  useEffect(() => {
    fetchNextId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setOk(false);
    setErr('');
    setLastSavedId(null);

    // basic client-side checks
    if (!form.ticketId) {
      setErr('Ticket ID is required');
      return;
    }
    if (!form.company) {
      setErr('Company is required');
      return;
    }
    if (form.researchType === 'TENDER') {
      if (!form.tenderOpeningDate || !form.tenderClosingDate) {
        setErr('Tender opening and closing dates are required for TENDER research type.');
        return;
      }
      if (!form.financialPeriod) {
        setErr('Provide financial period (month) for TENDER type.');
        return;
      }
    }

    try {
      // prepare payload
      const payload = {
        ticketId: form.ticketId || 'AUTO',
        researchType: form.researchType,
        researchDate: form.researchDate || null,
        company: form.company,
        contactName: form.contactName || null,
        mobile: form.mobile || null,
        email: form.email || null,
        region: form.region || null,
        estimatedBudget: toNumberOrNull(form.estimatedBudget),
        requirements: form.requirements || null,
        remarks: form.remarks || null,
        // createdBy: /* set on server if needed; keep blank or filled by server */ null,
      };

      // tender-specific fields
      if (form.researchType === 'TENDER') {
        payload.tenderOpeningDate = form.tenderOpeningDate || null; // DATEONLY 'YYYY-MM-DD'
        payload.tenderClosingDate = form.tenderClosingDate || null; // DATEONLY
        // send financialPeriod as 'YYYY-MM' — controller will extract month/year
        payload.financialPeriod = form.financialPeriod || null;
      }

      const { data } = await api.post('/api/sales/research', payload);

      // Show saved ticket id (prefer backend returned id if available)
      const savedId = data?.ticketId || form.ticketId || 'UNKNOWN';
      setLastSavedId(savedId);
      setOk(true);

      // Clear the form (but keep ticketId blank while we fetch the next)
      setForm(emptyForm);

      // Get a fresh ticket id and put it into the form
      await fetchNextId();
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

  const isTender = form.researchType === 'TENDER';

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
        {/* Ticket ID */}
        <Field label="Ticket ID" required>
          <div className="flex gap-2">
            <Input name="ticketId" value={form.ticketId} readOnly />
            <Button type="button" onClick={fetchNextId} disabled={loadingId}>
              {loadingId ? '...' : 'Refresh ID'}
            </Button>
          </div>
        </Field>

        {/* Research Type */}
        <Field label="Research Type" required>
          <Select name="researchType" value={form.researchType} onChange={onChange}>
            <option value="GENERAL">GENERAL</option>
            <option value="TENDER">TENDER</option>
          </Select>
        </Field>

        {/* Research Date */}
        <Field label="Research Date" required>
          <Input type="date" name="researchDate" value={form.researchDate} onChange={onChange} required />
        </Field>

        {/* Company */}
        <Field label="Company" required>
          <Input name="company" value={form.company} onChange={onChange} required />
        </Field>

        {/* Contact Name */}
        <Field label="Contact Name" required>
          <Input name="contactName" value={form.contactName} onChange={onChange} required />
        </Field>

        {/* Mobile */}
        <Field label="Mobile" required>
          <Input name="mobile" type="tel" value={form.mobile} onChange={onChange} required />
        </Field>

        {/* Email */}
        <Field label="Email">
          <Input name="email" type="email" value={form.email} onChange={onChange} />
        </Field>

        {/* Region */}
        <Field label="Region">
          <Input name="region" value={form.region} onChange={onChange} />
        </Field>

        {/* Estimated Budget */}
        <Field label="Estimated Budget">
          <Input name="estimatedBudget" type="number" value={form.estimatedBudget} onChange={onChange} placeholder="e.g. 500000" />
        </Field>

        {/* Requirements (textarea) */}
        <Field label="Requirements">
          <textarea
            name="requirements"
            value={form.requirements}
            onChange={onChange}
            className="border border-slate-300 rounded px-3 py-2 w-full text-sm min-h-[50px]"
            placeholder="Enter requirements..."
          />
        </Field>

        {/* Remarks (textarea) */}
        <Field label="Remarks">
          <textarea
            name="remarks"
            value={form.remarks}
            onChange={onChange}
            className="border border-slate-300 rounded px-3 py-2 w-full text-sm min-h-[50px]"
            placeholder="Enter remarks..."
          />
        </Field>

        {/* TENDER-only fields (styled same as others) */}
        {isTender && (
          <>
            <Field label="Tender Opening Date" required>
              <Input type="date" name="tenderOpeningDate" value={form.tenderOpeningDate} onChange={onChange} required />
            </Field>

            <Field label="Tender Closing Date" required>
              <Input type="date" name="tenderClosingDate" value={form.tenderClosingDate} onChange={onChange} required />
            </Field>

            <Field label="Financial Period (Month)" required>
              <Input
                type="month"
                name="financialPeriod"
                value={form.financialPeriod}
                onChange={onChange}
                className="w-full"
                required
              />
            </Field>
          </>
        )}

        <div className="md:col-span-2">
          <Button type="submit">Submit</Button>
        </div>
      </form>
    </FormCard>
  );
}
