export default function FormCard({ title, children, footer }){
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="p-4 space-y-4">{children}</div>
      {footer && <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">{footer}</div>}
    </div>
  );
}
