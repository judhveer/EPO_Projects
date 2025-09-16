const color = (v='') => {
  const s = v.toUpperCase();
  if (['APPROVAL','TELECALL','MEETING','CRM'].includes(s)) return 'bg-amber-100 text-amber-800';
  if (s === 'CLOSED') return 'bg-slate-200 text-slate-800';
  if (s === 'RESEARCH') return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-800';
};

export default function Badge({ children }){
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color(children)}`}>{children}</span>;
}
