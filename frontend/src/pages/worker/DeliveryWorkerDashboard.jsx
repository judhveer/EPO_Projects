import { useEffect, useState, useCallback } from "react";
import api from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext.jsx";

const MAX_MB = 10;
const ACCEPT_ALL = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
const ACCEPT_IMAGE = ".jpg,.jpeg,.png,image/jpeg,image/png";

// Silent background poll — new assignments from coordinator appear automatically
const POLL_INTERVAL_MS = 30_000;

export default function DeliveryWorkerDashboard() {
  const { user, logout } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAssignments = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const { data } = await api.get("/api/fms/delivery-worker/assignments");
      setAssignments(data);
    } catch {
      if (!silent)
        setError("Could not load your deliveries. Check your connection.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // Background poll
  useEffect(() => {
    const interval = setInterval(
      () => fetchAssignments(true),
      POLL_INTERVAL_MS
    );
    return () => clearInterval(interval);
  }, [fetchAssignments]);

  // Called by a card after it successfully confirms — removes it from list
  const handleConfirmed = (assignmentId) => {
    setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
  };

  // ── Full-screen loading ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center gap-4">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
        <p className="text-gray-500 text-sm">Loading your deliveries...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ── Sticky header ── */}
      <header className="bg-blue-700 text-white px-4 py-4 flex justify-between items-center shadow-md sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black tracking-tight">My Deliveries</h1>
          <p className="text-xs text-blue-200 mt-0.5">
            Hello, <span className="font-semibold">{user?.username}</span>
          </p>
        </div>
        <button
          onClick={logout}
          className="text-xs bg-blue-600 hover:bg-blue-500 active:bg-blue-400 border border-blue-400 px-4 py-2 rounded-lg font-semibold transition"
        >
          Logout
        </button>
      </header>

      {/* ── Content ── */}
      <main className="p-4 max-w-lg mx-auto space-y-4 pb-10">
        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex justify-between items-center">
            <span>{error}</span>
            <button
              onClick={() => fetchAssignments()}
              className="underline font-semibold ml-3 shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {assignments.length === 0 && !error && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🚚</div>
            <p className="text-gray-700 font-bold text-xl">
              No pending deliveries
            </p>
            <p className="text-gray-400 text-sm mt-2">
              You have no deliveries to confirm right now.
            </p>
            <button
              onClick={() => fetchAssignments()}
              className="mt-6 text-blue-600 text-sm underline"
            >
              Refresh
            </button>
          </div>
        )}

        {/* Delivery cards */}
        {assignments.map((assignment) => (
          <DeliveryCard
            key={assignment.id}
            assignment={assignment}
            onConfirmed={handleConfirmed}
          />
        ))}
      </main>
    </div>
  );
}

// ── Individual delivery card with upload form ─────────────────────────────────
function DeliveryCard({ assignment, onConfirmed }) {
  const [challanNo, setChallanNo] = useState("");
  const [challanFile, setChallanFile] = useState(null);
  const [materialFile, setMaterialFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleFileChange = (e, setter) => {
    const f = e.target.files?.[0];
    if (!f) {
      setter(null);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      alert(`File too large. Maximum allowed size is ${MAX_MB} MB.`);
      e.target.value = "";
      return;
    }
    setter(f);
  };

  const handleSubmit = async () => {
    setFormError(null);

    if (!challanNo.trim()) {
      setFormError("Challan number is required.");
      return;
    }
    if (!challanFile) {
      setFormError("Please upload the challan document.");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("challan_no", challanNo.trim());
      fd.append("challan_file", challanFile);
      if (materialFile) fd.append("material_photo", materialFile);

      // Reuse the existing public confirm endpoint.
      // The upload_token is the credential — same as when using the email link.
      // All Drive upload, confirmation, and job status logic runs on the backend.
      await api.post(
        `/api/public/delivery/${assignment.upload_token}/confirm`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      // Card vanishes immediately after confirmation
      onConfirmed(assignment.id);
    } catch (err) {
      setFormError(
        err?.response?.data?.message ||
          "Submission failed. Please check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const job = assignment.jobCard;

  const expiryDate = assignment.token_expires_at
    ? new Date(assignment.token_expires_at).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border-2 border-gray-100 overflow-hidden">
      {/* Job header */}
      <div className="bg-blue-700 text-white px-4 py-3">
        <p className="text-3xl font-black leading-none">#{job?.job_no}</p>
        <p className="text-sm text-blue-100 mt-1 font-medium">
          {job?.client_name}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Delivery location */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm space-y-1">
          <div>
            <span className="font-semibold text-gray-500 text-xs uppercase tracking-wide">
              Deliver to:{" "}
            </span>
            <span className="text-gray-800 font-bold">
              {job?.delivery_location?.replace(/_/g, " ")}
            </span>
          </div>
          {job?.delivery_address && (
            <div className="text-gray-600 text-xs mt-0.5">
              {job.delivery_address}
            </div>
          )}
        </div>

        {/* Challan number */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1.5">
            Challan Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={challanNo}
            onChange={(e) => setChallanNo(e.target.value)}
            placeholder="e.g. CH-2026-00451"
            disabled={submitting}
            className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
          />
        </div>

        {/* Challan document upload */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1.5">
            Challan Document <span className="text-red-500">*</span>
          </label>
          <input
            type="file"
            accept={ACCEPT_ALL}
            disabled={submitting}
            onChange={(e) => handleFileChange(e, setChallanFile)}
            className="w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 disabled:opacity-50"
          />
          <p className="text-xs text-gray-400 mt-1">
            PDF, JPG or PNG. Max {MAX_MB} MB.
          </p>
          {challanFile && (
            <p className="text-xs text-green-700 mt-1 font-medium">
              ✓ {challanFile.name} (
              {(challanFile.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        {/* Material photo upload — optional */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1.5">
            Material Photo{" "}
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="file"
            accept={ACCEPT_IMAGE}
            disabled={submitting}
            onChange={(e) => handleFileChange(e, setMaterialFile)}
            className="w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-50"
          />
          <p className="text-xs text-gray-400 mt-1">
            Photo of delivered materials. JPG or PNG only. Max {MAX_MB} MB.
          </p>
          {materialFile && (
            <p className="text-xs text-green-700 mt-1 font-medium">
              ✓ {materialFile.name} (
              {(materialFile.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        {/* Form error */}
        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">
            {formError}
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-black text-lg disabled:opacity-50 transition shadow-md"
        >
          {submitting ? "Uploading & Confirming..." : "✅  Confirm Delivery"}
        </button>

        {/* Token expiry warning */}
        {expiryDate && (
          <p className="text-center text-xs text-red-500">
            ⚠️ This assignment expires on <strong>{expiryDate}</strong>
          </p>
        )}
      </div>
    </div>
  );
}