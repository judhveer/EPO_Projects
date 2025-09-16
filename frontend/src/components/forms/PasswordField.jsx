// components/forms/PasswordField.jsx
import { useMemo, useState } from 'react';

export const rules = {
  minLength: 8,
  minUpper: 1,
  minLower: 1,
  minNumber: 1,
  minSymbols: 1, // backend allows zero symbols
};

export function checkPassword(pwd = '') {
  const lengthOK = pwd.length >= rules.minLength;
  const upperOK  = (pwd.match(/[A-Z]/g) || []).length >= rules.minUpper;
  const lowerOK  = (pwd.match(/[a-z]/g) || []).length >= rules.minLower;
  const numberOK = (pwd.match(/[0-9]/g) || []).length >= rules.minNumber;
  const symbolOK = (pwd.match(/[^A-Za-z0-9]/g) || []).length >= rules.minSymbols; // true when 0
  const valid = lengthOK && upperOK && lowerOK && numberOK && symbolOK;
  return { lengthOK, upperOK, lowerOK, numberOK, symbolOK, valid };
}

export default function PasswordField({
  value,
  onChange,
  name = 'password',
  label = 'Password',
}) {
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const res = useMemo(() => checkPassword(value), [value]);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          className={`w-full rounded-lg border px-3 py-2 outline-none ${
            touched && !res.valid ? 'border-rose-400' : 'border-slate-300'
          }`}
          autoComplete="new-password"
          aria-describedby={`${name}-help`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-800"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>

      <ul id={`${name}-help`} className="text-xs space-y-1 ">
        <Req ok={res.lengthOK}>At least 8 characters</Req>
        <Req ok={res.upperOK}>At least 1 uppercase letter</Req>
        <Req ok={res.lowerOK}>At least 1 lowercase letter</Req>
        <Req ok={res.numberOK}>At least 1 number</Req>
        <Req ok={res.symbolOK}>At least 1 Symbol</Req>
      </ul>

      {touched && !res.valid && (
        <p className="text-xs text-rose-600">Password doesn’t meet the requirements.</p>
      )}
    </div>
  );
}

function Req({ ok, children }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? 'text-emerald-600' : 'text-red-700'}`}>
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      {children}
    </li>
  );
}
