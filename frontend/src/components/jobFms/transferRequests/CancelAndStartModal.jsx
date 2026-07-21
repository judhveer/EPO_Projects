export default function CancelAndStartModal({
  jobNo,
  pendingCount,
  onConfirm,
  onClose,
  loading,
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 text-center animate-fade-in">
        <div className="text-4xl mb-3">⚠️</div>
        <h3 className="text-lg font-bold text-gray-800 mb-2">
          Pending Transfer Request{pendingCount > 1 ? "s" : ""}
        </h3>
        <p className="text-sm text-gray-600 mb-2">
          You have <strong>{pendingCount}</strong> pending transfer
          request{pendingCount > 1 ? "s" : ""} for Job #{jobNo}.
        </p>
        <p className="text-sm text-gray-600 mb-6">
          Starting this job will{" "}
          <strong>cancel all pending requests</strong> and notify the
          other designer{pendingCount > 1 ? "s" : ""}.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm
                       hover:bg-gray-50 disabled:opacity-50"
          >
            Keep Requests
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm
                       font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Starting…" : "Cancel & Start"}
          </button>
        </div>
      </div>
    </div>
  );
}