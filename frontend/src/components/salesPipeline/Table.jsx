export default function Table({ columns=[], rows=[] }){
  return (
    <div className="overflow-auto border border-slate-200 rounded-lg">
      <table className="min-w-full bg-white">
        <thead className="bg-slate-100">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="text-left text-xs font-semibold text-slate-700 px-3 py-2">{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="px-3 py-4 text-sm text-slate-600" colSpan={columns.length}>No data</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-sm">{c.render ? c.render(r) : r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
