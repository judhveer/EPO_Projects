import { useState, useEffect, useRef } from "react";
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

// Out-for-delivery is the only role that offers BOTH Delivery workers and Production Workers, shown as two separate groups.
const isDeliveryRole = (role) =>
  role === "out_for_delivery" || role === "delivery";

/**
 * WorkerSelect
 * Props:
 *   role      string   — stage name (e.g. "printing", "binding", "out_for_delivery")
 *                        used internally to determine which workers to load
 *   value     string[] — selected worker IDs
 *   onChange  fn       — (ids: string[]) => void
 *   disabled  bool
 *
 * Only workers who are checked in right now are returned by the backend.
 * Any pre-selected id that is NOT in that list (e.g. a worker pre-filled on
 * revert who has since checked out) is dropped automatically once the list
 * loads, so the coordinator never submits someone they cannot see.
 */
export default function WorkerSelect({
  role,
  value = [],
  onChange,
  disabled = false,
  excludeIds = [],
}) {

  // groups: [{ key, label, workers }]  — label === null means one plain list
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [droppedCount, setDroppedCount] = useState(0);

  // Always-current value/onChange for the async load below, without making them effect dependencies (which would refetch on every selection).
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!role) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setDroppedCount(0);
      try {
        let loaded;
        if (isDeliveryRole(role)) {
          const { data } = await api.get("/api/users/workers/for-delivery");
          loaded = [
            { key: "delivery", label: "Delivery Workers", workers: data?.delivery || [] },
            { key: "production", label: "Production Workers", workers: data?.production || [] },
          ];
        } else {
          const { data } = await api.get("/api/users/workers", {
            params: { department: getDepartmentForRole(role) },
          });
          loaded = [
            { key: "all", label: null, workers: Array.isArray(data) ? data : [] },
          ];
        }
        if (cancelled) return;
        setGroups(loaded);

        // Drop pre-selected ids that are no longer eligible (not checked in).
        // Only runs after a SUCCESSFUL load — a failed fetch never prunes.
        const loadedIds = new Set(
          loaded.flatMap((g) => g.workers.map((w) => w.id))
        );
        const current = valueRef.current;
        const kept = current.filter((id) => loadedIds.has(id));
        if (kept.length !== current.length) {
          setDroppedCount(current.length - kept.length);
          onChangeRef.current(kept);
        }
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

  const isDelivery = isDeliveryRole(role);
  const allWorkers = groups.flatMap((g) => g.workers);
  const selectedWorkers = allWorkers.filter((w) => value.includes(w.id));


  // Hidden from the pick-list: workers already selected (they show as chips above) and workers the caller marked as excluded (e.g. already actively on this stage). Used at render time only — never an effect dependency, because callers pass a fresh array on every render.
  const excludedSet = new Set(excludeIds);
  const isPickable = (w) => !value.includes(w.id) && !excludedSet.has(w.id);
  const unselected = allWorkers.filter(isPickable);

  // Human-readable label for empty state message
  const displayLabel = isDelivery ? "delivery or production" : "production";

  const droppedNotice = droppedCount > 0 && (
    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2">
      {droppedCount} previously selected worker{droppedCount > 1 ? "s were" : " was"} removed — not checked in right now.
    </div>
  );

  if (loading) {
    return (
      <div className="text-xs text-gray-400 py-2">Loading workers...</div>
    );
  }

  if (error) {
    return <div className="text-xs text-red-500 py-2">{error}</div>;
  }

  if (allWorkers.length === 0) {
    return (
      <div>
        {droppedNotice}
        <div className="text-xs text-orange-600 py-2 bg-orange-50 border border-orange-200 rounded px-3">
          No checked-in {displayLabel} workers right now.
          <span className="block text-orange-500 mt-0.5">
            Only workers who have checked in today can be assigned.
          </span>
        </div>
      </div>
    );
  }

  // All available workers are either selected or excluded
  const allAccountedFor = unselected.length === 0 && allWorkers.length > 0;

  const renderList = (available) => (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {available.map((w, i) => (
        <button
          key={w.id}
          type="button"
          onClick={() => toggle(w.id)}
          className={`w-full text-left px-3 py-2 text-xs flex justify-between items-center hover:bg-blue-50 transition ${
            i !== 0 ? "border-t border-gray-100" : ""
          }`}
        >
          <span className="font-medium text-gray-800">
            {isDelivery && <span className="text-green-600 mr-1">✓</span>}
            {w.username}
          </span>
          <span className="text-green-600 font-medium text-[11px]">
            + Add
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div>
      {droppedNotice}

      {/* Selected workers — shown as chips */}
      {selectedWorkers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedWorkers.map((w) => (
            <span
              key={w.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
            >
              {w.username}
              {isDelivery && w.department === "Production Worker" && (
                <span className="text-[10px] text-blue-500 font-normal">
                  (Production)
                </span>
              )}
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

      {/* Available workers — one plain list, or two labelled groups */}
      {!disabled &&
        groups.map((g) => {
          const available = g.workers.filter(isPickable);

          // Plain single list: identical to the previous markup
          if (!g.label) {
            return available.length > 0 ? (
              <div key={g.key}>{renderList(available)}</div>
            ) : null;
          }

          // Labelled group (Out for Delivery)
          return (
            <div key={g.key} className="mb-3 last:mb-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                {g.label}
              </p>
              {available.length > 0 ? (
                renderList(available)
              ) : (
                <div className="text-xs text-gray-400 py-1.5 px-3 bg-gray-50 border border-gray-200 rounded">
                  {g.workers.length === 0
                    ? `No checked-in ${g.label.toLowerCase()} right now.`
                    : "No more checked-in workers available in this group."}
                </div>
              )}
            </div>
          );
        })}

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