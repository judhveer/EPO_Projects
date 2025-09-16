export default function Field({ label, children, hint, required=false }){
  return (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-slate-700">
        {label} {required ? <span className="text-red-600">*</span> : null}
      </label>}
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
