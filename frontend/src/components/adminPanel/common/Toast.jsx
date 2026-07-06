/**
 * Shared toast notification for Admin Panel actions.
 * Parent controls visibility via `show` prop and owns the auto-dismiss
 * timer — keeping this component pure and reusable with no internal side
 * effects.
 *
 * Usage:
 *   <Toast show={!!toast} message={toast?.message} icon={toast?.icon} onClose={() => setToast(null)} />
 */

const VARIANT = {
  success: {
    bar:  "bg-slate-900",
    icon: "bg-emerald-500",
    text: "text-white",
  },
  error: {
    bar:  "bg-slate-900",
    icon: "bg-red-500",
    text: "text-white",
  },
};

export default function Toast({
  show,
  message = "",
  icon    = "✓",
  variant = "success",
  onClose,
}) {
  if (!show) return null;

  const v = VARIANT[variant] || VARIANT.success;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999]
        flex items-center gap-3
        ${v.bar} ${v.text}
        pl-2 pr-5 py-2
        rounded-2xl shadow-2xl
        animate-fade-in
        min-w-[260px] max-w-[420px]
      `}
    >
      {/* Icon bubble */}
      <span
        className={`
          flex-shrink-0 flex items-center justify-center
          w-9 h-9 rounded-xl ${v.icon} text-white text-lg font-bold
        `}
      >
        {icon}
      </span>

      {/* Message */}
      <span className="flex-1 text-sm font-medium leading-snug">
        {message}
      </span>

      {/* Dismiss button */}
      <button
        onClick={onClose}
        aria-label="Dismiss"
        className="flex-shrink-0 opacity-70 hover:opacity-100 text-white text-base leading-none ml-1"
      >
        ✕
      </button>
    </div>
  );
}