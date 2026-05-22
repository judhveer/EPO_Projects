import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api.js";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
const MAX_MB = 10;

export default function DeliveryChallanPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [challanNo, setChallanNo] = useState("");
  const [file, setFile] = useState(null);
  const [materialFile, setMaterialFile] = useState(null); 
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/public/delivery/${token}`);
        setInfo(data);
      } catch (err) {
        setError(err?.response?.data?.message || "Invalid or expired link.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) { setFile(null); return; }
    if (f.size > MAX_MB * 1024 * 1024) {
      alert(`File too large. Max ${MAX_MB} MB.`);
      e.target.value = "";
      return;
    }
    setFile(f);
  };

  const handleMaterialFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) { setMaterialFile(null); return; }
    if (f.size > MAX_MB * 1024 * 1024) {
      alert(`File too large. Max ${MAX_MB} MB.`);
      e.target.value = "";
      return;
    }
    setMaterialFile(f);
  };

  const handleSubmit = async () => {
    if (!challanNo.trim()) { alert("Challan number is required."); return; }
    if (!file) { alert("Please upload the challan document."); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("challan_no", challanNo.trim());
      fd.append("challan_file", file);
      if (materialFile) {
        fd.append("material_photo", materialFile);  // ← ADD (optional, only if selected)
      }
      const { data } = await api.post(`/api/public/delivery/${token}/confirm`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDone(true);
      setInfo((prev) => ({ ...prev, all_confirmed: data.all_confirmed }));
    } catch (err) {
      alert(err?.response?.data?.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-10 w-10 border-b-2 border-blue-700 rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">❌</div>
          <h2 className="text-xl font-bold text-red-600 mb-2">Link Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (info?.already_confirmed || done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-xl font-bold text-green-700 mb-2">Delivery Confirmed!</h2>
          <p className="text-gray-600 mb-4">Thank you, <strong>{info.worker_name}</strong>.</p>
          {info.challan_no && <p className="text-sm text-gray-500">Challan: {info.challan_no}</p>}
          {info.all_confirmed && (
            <p className="mt-3 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              All deliveries confirmed. Job has been marked as Delivered.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (info?.overridden) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">ℹ️</div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">Assignment Completed</h2>
          <p className="text-gray-600">{info.message}</p>
        </div>
      </div>
    );
  }

  const expiryDate = info?.token_expires_at
    ? new Date(info.token_expires_at).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
      })
    : "";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">📦</div>
          <h1 className="text-2xl font-bold text-blue-700">Delivery Confirmation</h1>
          <p className="text-sm text-gray-500 mt-1">Hello, <strong>{info?.worker_name}</strong></p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-5 text-sm space-y-1">
          <div><span className="font-semibold text-gray-600">Job No:</span> <span className="font-bold">#{info?.job_no}</span></div>
          <div><span className="font-semibold text-gray-600">Client:</span> {info?.client_name}</div>
          <div><span className="font-semibold text-gray-600">Delivery:</span> {info?.delivery_location}</div>
          {info?.delivery_address && (
            <div><span className="font-semibold text-gray-600">Address:</span> {info.delivery_address}</div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Challan Number <span className="text-red-500">*</span>
            </label>
            <input type="text" value={challanNo} onChange={(e) => setChallanNo(e.target.value)}
              placeholder="e.g. CH-2026-00451" disabled={submitting}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Upload Challan Document <span className="text-red-500">*</span>
            </label>
            <input type="file" accept={ACCEPT} onChange={handleFile} disabled={submitting}
              className="w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200" />
            <p className="text-xs text-gray-400 mt-1">PDF, JPG, or PNG. Max {MAX_MB} MB.</p>
            {file && <p className="text-xs text-green-700 mt-1">✓ {file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Material Photo{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              onChange={handleMaterialFile}
              disabled={submitting}
              className="w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
            />
            <p className="text-xs text-gray-400 mt-1">
              Photo of delivered materials. JPG or PNG only. Max {MAX_MB} MB.
            </p>
            {materialFile && (
              <p className="text-xs text-green-700 mt-1">
                ✓ {materialFile.name} ({(materialFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <button onClick={handleSubmit} disabled={submitting}
            className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm disabled:opacity-50 transition">
            {submitting ? "Uploading & Confirming..." : "✅ Confirm Delivery"}
          </button>
        </div>

        {expiryDate && (
          <p className="text-center text-xs text-red-500 mt-4">
            ⚠️ This link expires on <strong>{expiryDate}</strong>
          </p>
        )}
      </div>
    </div>
  );
}