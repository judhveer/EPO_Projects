const STYLE = {
  printing: "bg-blue-100 text-blue-700",
  binding: "bg-purple-100 text-purple-700",
  quality_check: "bg-orange-100 text-orange-700",
  packaging: "bg-amber-100 text-amber-700",
  ready_to_dispatch: "bg-yellow-100 text-yellow-800",
  out_for_delivery: "bg-cyan-100 text-cyan-700",
  ready_for_production: "bg-slate-100 text-slate-700",
  in_production: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
  completed: "bg-emerald-200 text-emerald-800",
};

const LABEL = {
  printing: "Printing",
  binding: "Binding",
  quality_check: "Quality Check",
  packaging: "Packaging",
  ready_to_dispatch: "Ready to Dispatch",
  out_for_delivery: "Out for Delivery",
  ready_for_production: "Ready for Production",
  in_production: "In Production",
  delivered: "Delivered",
  completed: "Completed",
};

export default function StageChip({ value, fallback = "—" }) {
  if (!value) {
    return <span className="text-gray-400 text-xs italic">{fallback}</span>;
  }
  return (
    <span className={`inline-block px-2 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${STYLE[value] || "bg-gray-100 text-gray-700"}`}>
      {LABEL[value] || value}
    </span>
  );
}