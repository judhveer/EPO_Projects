import React, { useState, useEffect, useCallback } from "react";
import { DateTime } from "luxon";
import api from "../../../lib/api.js";

// ── Constants ──────────────────────────────────────────────────────────
const PRIORITY_STYLE = {
  Urgent: "bg-red-100 text-red-700",
  High:   "bg-orange-100 text-orange-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low:    "bg-blue-100 text-blue-700",
};

const STATUS_BADGE = {
  pending:  { label: "⏳ Pending",  cls: "bg-orange-100 text-orange-700" },
  accepted: { label: "✅ Accepted", cls: "bg-green-100 text-green-700"   },
  rejected: { label: "❌ Rejected", cls: "bg-red-100 text-red-700"       },
};

const fmtDate = (d) =>
  d
    ? DateTime.fromJSDate(new Date(d))
        .setZone("Asia/Kolkata")
        .toFormat("dd LLL yyyy")
    : "—";

// ── Inline reject form — shown in-place on the incoming card ─────────
function RejectForm({ requestId, loading, onReject, onCancel }) {
  const [reason, setReason] = useState("");
  return (
    <div className="mt-2 border border-red-200 bg-red-50 rounded-lg p-3 space-y-2">
      <label className="block text-xs font-semibold text-red-700">
        Rejection reason <span className="text-red-500">*</span>
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Why are you declining?"
        className="w-full border border-red-300 rounded px-2 py-1 text-xs
                   focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
      />
      <div className="flex gap-2">
        <button
          onClick={() => onReject(requestId, reason)}
          disabled={!reason.trim() || loading}
          className="flex-1 py-1 bg-red-600 text-white rounded text-xs
                     font-semibold hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "Rejecting…" : "Confirm Reject"}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-1 border border-gray-300 rounded text-xs
                     hover:bg-gray-50"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// ── Incoming request card ───────────────────────────────────────────────
function IncomingCard({ req, rejectingId, actionLoading, onAccept, onReject, onStartReject, onCancelReject }) {
  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-white shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-bold text-blue-700 text-sm">
          Job #{req.jobCard?.job_no}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
            PRIORITY_STYLE[req.jobCard?.task_priority] || "bg-gray-100 text-gray-500"
          }`}
        >
          {req.jobCard?.task_priority}
        </span>
      </div>

      <p className="text-xs font-medium text-gray-700">
        {req.jobCard?.client_name}
      </p>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
        <span>📅 {fmtDate(req.jobCard?.delivery_date)}</span>
        <span>📌 {req.jobCard?.order_type}</span>
        <span>📍 {req.jobCard?.execution_location}</span>
      </div>

      <div className="text-[11px] text-gray-600 border-l-2 border-orange-300 pl-2 italic">
        <span className="font-semibold not-italic text-gray-800">
          {req.fromDesigner?.username}
        </span>{" "}
        says: "{req.request_reason}"
      </div>

      {rejectingId !== req.id ? (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onAccept(req.id)}
            disabled={actionLoading === req.id}
            className="flex-1 py-1.5 bg-green-600 text-white rounded-lg
                       text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            {actionLoading === req.id ? "…" : "✓ Accept"}
          </button>
          <button
            onClick={() => onStartReject(req.id)}
            disabled={actionLoading === req.id}
            className="flex-1 py-1.5 bg-red-600 text-white rounded-lg
                       text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            ✕ Reject
          </button>
        </div>
      ) : (
        <RejectForm
          requestId={req.id}
          loading={actionLoading === req.id}
          onReject={onReject}
          onCancel={onCancelReject}
        />
      )}
    </div>
  );
}

// ── Outgoing request card ───────────────────────────────────────────────
function OutgoingCard({ req, actionLoading, onCancel, onDismiss }) {
  const badge     = STATUS_BADGE[req.status];
  const isPending = req.status === "pending";
  const isResolved = ["accepted", "rejected"].includes(req.status);

  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-white shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-bold text-blue-700 text-sm">
          Job #{req.jobCard?.job_no}
        </span>
        {badge && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-700">{req.jobCard?.client_name}</p>

      <p className="text-[11px] text-gray-600">
        To:{" "}
        <span className="font-semibold">{req.toDesigner?.username}</span>
      </p>

      <div className="text-[11px] text-gray-500 italic border-l-2 border-blue-200 pl-2">
        "{req.request_reason}"
      </div>

      {req.status === "rejected" && req.rejection_reason && (
        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          ❌ Reason: "{req.rejection_reason}"
        </div>
      )}

      {req.status === "accepted" && (
        <div className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5">
          ✅ {req.toDesigner?.username} accepted. Job has been transferred.
        </div>
      )}

      <div className="flex justify-end pt-1">
        {isPending && (
          <button
            onClick={() => onCancel(req.id)}
            disabled={actionLoading === req.id}
            className="px-3 py-1 bg-gray-100 text-gray-600 border border-gray-200
                       rounded-lg text-xs font-semibold hover:bg-gray-200 disabled:opacity-50"
          >
            {actionLoading === req.id ? "…" : "Cancel Request"}
          </button>
        )}
        {isResolved && (
          <button
            onClick={() => onDismiss(req.id)}
            disabled={actionLoading === req.id}
            className="px-3 py-1 bg-gray-100 text-gray-500 border border-gray-200
                       rounded-lg text-xs hover:bg-gray-200 disabled:opacity-50"
          >
            {actionLoading === req.id ? "…" : "✕ Dismiss"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── TransferPanel (main export) ─────────────────────────────────────────
export default function TransferPanel({ isOpen, onClose, onActionComplete }) {
  const [activeTab,     setActiveTab]     = useState("incoming");
  const [outgoing,      setOutgoing]      = useState([]);
  const [incoming,      setIncoming]      = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectingId,   setRejectingId]   = useState(null);

  const fetchBoth = useCallback(async () => {
    setLoading(true);
    try {
      const [outRes, inRes] = await Promise.all([
        api.get("/api/fms/designers/transfer-requests/outgoing"),
        api.get("/api/fms/designers/transfer-requests/incoming"),
      ]);
      setOutgoing(outRes.data.data || []);
      setIncoming(inRes.data.data || []);
    } catch (err) {
      console.error("Failed to load transfer requests:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch whenever the panel opens
  useEffect(() => {
    if (!isOpen) return;
    fetchBoth();
    setActiveTab("incoming");
    setRejectingId(null);
  }, [isOpen, fetchBoth]);

  // ── Action handlers ──────────────────────────────────────────────────
  const handleAccept = async (requestId) => {
    setActionLoading(requestId);
    try {
      await api.patch(`/api/fms/designers/transfer-requests/${requestId}/accept`);
      await fetchBoth();
      onActionComplete(); // tell parent to refresh jobs + badge
    } catch (err) {
      alert(err.response?.data?.message || "Failed to accept transfer.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId, reason) => {
    setActionLoading(requestId);
    try {
      await api.patch(
        `/api/fms/designers/transfer-requests/${requestId}/reject`,
        { rejection_reason: reason }
      );
      setRejectingId(null);
      await fetchBoth();
      onActionComplete();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to reject transfer.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (requestId) => {
    setActionLoading(requestId);
    try {
      await api.delete(`/api/fms/designers/transfer-requests/${requestId}`);
      await fetchBoth();
      onActionComplete();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to cancel request.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDismiss = async (requestId) => {
    setActionLoading(requestId);
    try {
      await api.patch(
        `/api/fms/designers/transfer-requests/${requestId}/dismiss`
      );
      await fetchBoth();
      onActionComplete();
    } catch (err) {
      console.error("Dismiss failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { key: "incoming", label: "Incoming", count: incoming.length },
    { key: "outgoing", label: "Outgoing", count: outgoing.length },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div className="fixed right-0 top-0 h-full w-[400px] max-w-[95vw] bg-gray-50
                      shadow-2xl z-50 flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-blue-700 text-white flex-shrink-0">
          <h2 className="text-sm font-bold">🔄 Transfer Requests</h2>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    activeTab === tab.key
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : activeTab === "incoming" ? (
            incoming.length === 0 ? (
              <div className="text-center text-gray-400 py-10 text-sm">
                No incoming transfer requests.
              </div>
            ) : (
              incoming.map((req) => (
                <IncomingCard
                  key={req.id}
                  req={req}
                  rejectingId={rejectingId}
                  actionLoading={actionLoading}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  onStartReject={(id) => setRejectingId(id)}
                  onCancelReject={() => setRejectingId(null)}
                />
              ))
            )
          ) : outgoing.length === 0 ? (
            <div className="text-center text-gray-400 py-10 text-sm">
              No active outgoing requests.
            </div>
          ) : (
            outgoing.map((req) => (
              <OutgoingCard
                key={req.id}
                req={req}
                actionLoading={actionLoading}
                onCancel={handleCancel}
                onDismiss={handleDismiss}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}