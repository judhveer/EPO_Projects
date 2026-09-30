import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import PasswordField, { checkPassword } from '../components/forms/PasswordField'

const DEPARTMENTS = [
  'Accounts', 'Admin', 'CRM', 'Designer', 'EA', 'Foundation', 'HR', 'Job Writer', 'MIS',
  'Office Assistant', 'Process Coordinator', 'Production Coordinator', 'Receptionist', 'Sales dept', 'Tender Executive', "Production Worker", "Delivery"];


// Full catalog (frontend); we'll filter based on department.
const ROLES_CATALOG = [
 'STAFF', 'RESEARCHER', 'COORDINATOR', 'TELECALLER', 'EXECUTIVE', 'CRM', 'EA'
];

const SALES_ROLES = ['RESEARCHER', 'COORDINATOR', 'TELECALLER', 'EXECUTIVE', 'CRM'];
const EA_ROLES = ['EA'];
const BASE_ROLES = ['STAFF'];             // for non-sales, non-EA
const OFFICES = ['EPO', 'MM']; // ← mirrors backend User.model.js OFFICES


export default function CreateUser() {
  const { user } = useAuth();
  const isBossAdmin = user?.role === 'BOSS' || user?.role === 'ADMIN';

  const [form, setForm] = useState({
    email: null, username: '', password: '',
    role: 'STAFF', department: 'Admin',
    office: 'EPO', join_date: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgStatus, setMsgStatus] = useState(true);

  if (!isBossAdmin) return <div className="p-6">Not authorized</div>;

  const onChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const pwd = checkPassword(form.password);

  // ── NEW: is office/join_date needed for the currently selected role? ──
  // Note: today, this form can never actually produce role="BOSS" (the allowedRoles logic below never includes it — a pre-existing gap unrelated to this change), so this branch is effectively always true right now. Written correctly anyway so it's already right if that's ever fixed.
  const needsAttendanceFields = form.role !== 'BOSS';

  // Compute allowed roles based on department selection
  const allowedRoles = useMemo(() => {
    if (form.department === 'Sales dept') return SALES_ROLES;
    if (form.department === 'EA') return EA_ROLES;
    let roles = [...BASE_ROLES];
    if (isBossAdmin && (form.department === 'Admin')) {
      roles = [...roles,];
    }
    return roles;
  }, [form.department, isBossAdmin]);

  // If current role becomes invalid after dept change, reset it
  useEffect(() => {
    if (!allowedRoles.includes(form.role)) {
      setForm(f => ({ ...f, role: allowedRoles[0] }));
    }
  }, [allowedRoles]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(e) {
    e.preventDefault();
    if (!pwd.valid) return;
    if(needsAttendanceFields && (!form.office || !form.join_date )){
      setMsg('Office and Join Date are required.');
      setMsgStatus(false);
      return;
    }
    setSaving(true); setMsg('');
    try {
      await api.post('/api/auth/users', form);
      setMsg('User created successfully.');
      setMsgStatus(true);
      setForm({ email: null, username: '', password: '', role: 'STAFF', department: 'Admin', office: 'EPO', join_date: '' });
    } catch (err) {
      const data = err?.response?.data;
      const fromArray = Array.isArray(data?.errors)
        ? data.errors.map(e => `${e.path}: ${e.msg}`).join(', ')
        : null;
      setMsg(data?.message || data?.error || fromArray || 'Create failed');
      setMsgStatus(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Create Employee</h1>
        <p className="text-sm text-gray-600">Boss/Admin can add new users with department & role.</p>
      </div>

      {msgStatus && msg && (
        <div className="mb-4 text-lg text-green-700 font-medium px-3 py-2 rounded bg-gray-100">{msg}</div>
      )}
      {msgStatus === false && msg && (
        <div className="mb-4 text-lg text-red-700 font-medium px-3 py-2 rounded bg-gray-100">{msg}</div>
      )}

      <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow p-6 grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Email</label>
            <input name="email" value={form.email} onChange={onChange}
              type="email" className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Username</label>
            <input name="username" value={form.username} onChange={onChange}
              className="w-full border rounded-lg px-3 py-2" minLength={3} required />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <PasswordField
              value={form.password}
              onChange={(val) => setForm(f => ({ ...f, password: val }))}
              label="Password"
              name="password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Department</label>
            <select
              name="department"
              value={form.department}
              onChange={onChange}
              className="w-full border rounded-lg px-3 py-2"
            >
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Selecting <strong>Sales dept</strong> or <strong>EA</strong> restricts roles automatically.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select
              name="role"
              value={form.role}
              onChange={onChange}
              className="w-full border rounded-lg px-3 py-2"
            >
              {allowedRoles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {form.department === 'Sales dept' && 'Only Sales roles are available.'}
              {form.department === 'EA' && 'Only EA role is available.'}
              {form.department !== 'Sales dept' && form.department !== 'EA' && !(isBossAdmin && (form.department === 'Admin')) && 'Non-sales departments default to STAFF.'}
              {isBossAdmin && (form.department === 'Admin') && 'Admin/Boss roles are available for Admin department.'}
            </p>
          </div>
        </div>

        {/* ── NEW: Attendance section — Office + Join Date ────────────── */}
        {needsAttendanceFields && (
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Attendance Settings</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700">Office</label>
                <select name="office" value={form.office} onChange={onChange} className="w-full border rounded-lg px-3 py-2" required>
                  {OFFICES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700">Join Date</label>
                <input type="date" name="join_date" value={form.join_date} onChange={onChange}
                  className="w-full border rounded-lg px-3 py-2" required />
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Determines attendance tracking and leave eligibility (leave becomes usable 6 months after this date).
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <button
            disabled={saving}
            className={`px-4 py-2 rounded-lg text-white ${saving ? 'bg-gray-400' : 'bg-blue-700 hover:opacity-90'}`}
          >
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          • Sales roles must use department "Sales dept". • EA role must use department "EA".
        </p>
      </form>
    </div>
  );
}
