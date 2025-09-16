export default function StageGuardNote({ title, text, sub, foot }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
      <div className="font-semibold">{title}</div>
      <div>{text}</div>
      {sub && <div className="text-xs text-amber-800">{sub}</div>}
      {foot && <div className="text-xs text-amber-700">{foot}</div>}
    </div>
  );
}
