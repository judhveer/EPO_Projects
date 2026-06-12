import { useState, useEffect } from "react";
import api from "../../../lib/api.js";

/**
 * Maps the stage name / role prop to the correct User department.
 *   "out_for_delivery" or "delivery" → "Delivery" department
 *   All other production stages      → "Production Worker" department
 *
 * Workers are role-independent — any Production Worker can do any stage.
 * The department is the only filter now.
 */
function getDepartmentForRole(role) {
  if (role === "out_for_delivery" || role === "delivery") return "Delivery";
  return "Production Worker";
}

/**
 * WorkerSelect
 * Props:
 *   role      string   — stage name (e.g. "printing", "binding", "out_for_delivery")
 *                        used internally to determine which department to load
 *   value     string[] — selected worker IDs
 *   onChange  fn       — (ids: string[]) => void
 *   disabled  bool
 */
export default function WorkerSelect({
  role,
  value = [],
  onChange,
  disabled = false,
  exludeIds = [],
}) {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!role) return;
    let cancelled = false;
    const department = getDepartmentForRole(role);

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // CHANGED: was /api/fms/workers?role=X&active=true
        // Now:     /api/users/workers?department=X
        const { data } = await api.get("/api/users/workers", {
          params: { department },
        });
        if (!cancelled) setWorkers(data);
      } catch {
        if (!cancelled) setError("Failed to load workers.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
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

  // Hide workers who are excluded (already active on the stage)
  // AND hide workers already selected (they show as chips above)
  const unselected = workers.filter((w) => !value.includes(w.id));

  // Human-readable label for empty state message
  const displayLabel =
    getDepartmentForRole(role) === "Delivery" ? "delivery" : "production";

  if (loading) {
    return (
      <div className="text-xs text-gray-400 py-2">Loading workers...</div>
    );
  }

  if (error) {
    return <div className="text-xs text-red-500 py-2">{error}</div>;
  }

  if (workers.length === 0) {
    return (
      <div className="text-xs text-orange-600 py-2 bg-orange-50 border border-orange-200 rounded px-3">
        No active {displayLabel} workers found. Create worker accounts via
        the Create User page first.
      </div>
    );
  }

  // All available workers are either selected or excluded
  const allAccountedFor =
    unselected.length === 0 && workers.length > 0;

  return (
    <div>
      {/* Selected workers — shown as chips */}
      {selectedWorkers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedWorkers.map((w) => (
            <span
              key={w.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
            >
              {/* CHANGED: was [{w.worker_code}] {w.name} — now just username */}
              {w.username}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(w.id)}
                  className="ml-1 text-blue-400 hover:text-red-500 font-bold leading-none"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Available workers list */}
      {!disabled && unselected.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {unselected.map((w, i) => (
            <button
              key={w.id}
              type="button"
              onClick={() => toggle(w.id)}
              className={`w-full text-left px-3 py-2 text-xs flex justify-between items-center hover:bg-blue-50 transition ${
                i !== 0 ? "border-t border-gray-100" : ""
              }`}
            >
              {/* CHANGED: was [worker_code] name — now just username */}
              <span className="font-medium text-gray-800">{w.username}</span>
              <span className="text-green-600 font-medium text-[11px]">
                + Add
              </span>
            </button>
          ))}
        </div>
      )}

      {/* All workers are already on this stage */}
      {!disabled && allAccountedFor && selectedWorkers.length === 0 && (
        <div className="text-xs text-gray-400 py-2 bg-gray-50 border border-gray-200 rounded px-3">
          All available workers are already assigned to this stage.
        </div>
      )}

      {value.length === 0 && !allAccountedFor && (
        <p className="text-xs text-gray-400 mt-1">
          Click a worker above to add them.
        </p>
      )}
    </div>
  );
}