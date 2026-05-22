import { useState, useEffect } from "react";
import api from "../../../lib/api.js";

/**
 * WorkerSelect
 * Props:
 *   role         string   — filters master workers by role
 *   value        string[] — selected worker IDs
 *   onChange     fn       — (ids: string[]) => void
 *   disabled     bool
 */
export default function WorkerSelect({ role, value = [], onChange, disabled = false }) {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!role) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const { data } = await api.get("/api/fms/workers", { params: { role, active: "true" } });
        if (!cancelled) setWorkers(data);
      } catch {
        if (!cancelled) setError("Failed to load workers.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [role]);

  const toggle = (id) => {
    if (disabled) return;
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const selectedWorkers = workers.filter((w) => value.includes(w.id));
  const unselected = workers.filter((w) => !value.includes(w.id));

  if (loading) {
    return <div className="text-xs text-gray-400 py-2">Loading workers...</div>;
  }
  if (error) {
    return <div className="text-xs text-red-500 py-2">{error}</div>;
  }
  if (workers.length === 0) {
    return (
      <div className="text-xs text-orange-600 py-2 bg-orange-50 border border-orange-200 rounded px-3">
        No active {role?.replace("_", " ")} workers found. Add workers in the Workers Master first.
      </div>
    );
  }

  return (
    <div>
      {/* Selected chips */}
      {selectedWorkers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedWorkers.map((w) => (
            <span key={w.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
              <span className="font-bold">[{w.worker_code}]</span> {w.name}
              {!disabled && (
                <button type="button" onClick={() => toggle(w.id)}
                  className="ml-1 text-blue-400 hover:text-red-500 font-bold leading-none">×</button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Available workers to select */}
      {!disabled && unselected.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {unselected.map((w, i) => (
            <button key={w.id} type="button" onClick={() => toggle(w.id)}
              className={`w-full text-left px-3 py-2 text-xs flex justify-between items-center hover:bg-blue-50 transition ${
                i !== 0 ? "border-t border-gray-100" : ""
              }`}>
              <span>
                <span className="font-bold text-blue-700 mr-1">[{w.worker_code}]</span>
                {w.name}
              </span>
              <span className="text-green-600 font-medium text-[11px]">+ Add</span>
            </button>
          ))}
        </div>
      )}

      {value.length === 0 && (
        <p className="text-xs text-gray-400 mt-1">Click a worker above to add them.</p>
      )}
    </div>
  );
}