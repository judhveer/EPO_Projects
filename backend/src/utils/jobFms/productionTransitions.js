/**
 * Production stage state machine.
 *
 * Forward transitions: linear with two skip options
 *   - Entering production (from null): can start at "printing" (normal) or "binding" (rare,
 *     for direct cutting / paper pasting jobs that skip printing).
 *   - From "printing": can go to "binding" (normal) or skip directly to "quality_check"
 *     (when no binding is required for any item in the job).
 *   - "quality_check" is NEVER skipped.
 *
 * Reverse transitions: only within in_production. Restricted to logical "back one step"
 *   plus printing-from-quality_check (in case QC catches a print defect after binding skip).
 *   No reverse out of in_production (e.g., back to ready_for_production) — once production
 *   starts, it's forward-only at the status level.
 *
 * Branching at end of production:
 *   - PICKUP delivery: "ready_to_dispatch" -> status='delivered' (handled by markJobDelivered)
 *   - SHIPMENT delivery: "ready_to_dispatch" -> "out_for_delivery" -> status='delivered'
 */

export const PRODUCTION_STAGES = Object.freeze({
  PRINTING: 'printing',
  BINDING: 'binding',
  QUALITY_CHECK: 'quality_check',
  PACKAGING: 'packaging',
  READY_TO_DISPATCH: 'ready_to_dispatch',
  OUT_FOR_DELIVERY: 'out_for_delivery',
});

export const ALL_PRODUCTION_STAGES = Object.freeze(Object.values(PRODUCTION_STAGES));

export const STAGE_LABELS = Object.freeze({
  printing: 'Printing',
  binding: 'Binding',
  quality_check: 'Quality Check',
  packaging: 'Packaging',
  ready_to_dispatch: 'Ready to Dispatch',
  out_for_delivery: 'Out for Delivery',
});

// Use a Map so we can key by `null` (entering production from ready_for_production).
const FORWARD_TRANSITIONS = new Map([
  [null,                ['printing', 'binding']],          // entry — printing skip is rare but allowed
  ['printing',          ['binding', 'quality_check']],     // binding skip allowed
  ['binding',           ['quality_check']],                // QC never skipped
  ['quality_check',     ['packaging']],
  ['packaging',         ['ready_to_dispatch']],
  ['ready_to_dispatch', ['out_for_delivery']],             // shipment path; pickup uses markDelivered
  ['out_for_delivery',  []],                               // terminal sub-stage -> markDelivered
]);

const REVERSE_TRANSITIONS = new Map([
  ['binding',           ['printing']],
  ['quality_check',     ['binding', 'printing']],
  ['packaging',         ['quality_check']],
  ['ready_to_dispatch', ['packaging']],
  ['out_for_delivery',  []],
]);

export function getValidForwardStages(currentStage) {
  return FORWARD_TRANSITIONS.get(currentStage ?? null) ?? [];
}

export function getValidReverseStages(currentStage) {
  return REVERSE_TRANSITIONS.get(currentStage) ?? [];
}

export function isValidForwardTransition(from, to) {
  return getValidForwardStages(from).includes(to);
}

export function isValidReverseTransition(from, to) {
  return getValidReverseStages(from).includes(to);
}

export class StageTransitionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StageTransitionError';
    this.statusCode = 422;
  }
}

export function assertForwardTransition(from, to) {
  if (!isValidForwardTransition(from, to)) {
    const allowed = getValidForwardStages(from);
    throw new StageTransitionError(
      `Cannot move from "${from || 'start'}" to "${to}". ` +
      `Allowed next: ${allowed.length ? allowed.map((s) => STAGE_LABELS[s]).join(', ') : 'none'}.`
    );
  }
}

export function assertReverseTransition(from, to) {
  if (!isValidReverseTransition(from, to)) {
    const allowed = getValidReverseStages(from);
    throw new StageTransitionError(
      `Cannot revert from "${from}" to "${to}". ` +
      `Allowed previous: ${allowed.length ? allowed.map((s) => STAGE_LABELS[s]).join(', ') : 'none'}.`
    );
  }
}

export function isPickupDelivery(deliveryLocation) {
  return typeof deliveryLocation === 'string' && deliveryLocation.endsWith('_PICKUP');
}

export function isShipmentDelivery(deliveryLocation) {
  return typeof deliveryLocation === 'string' && deliveryLocation.endsWith('_SHIPMENT');
}

/**
 * Stages where at least one worker name must be recorded before transitioning.
 * ready_to_dispatch and out_for_delivery are excluded — dispatch/delivery
 * uses delivery_persons_name separately.
 */
export const STAGES_REQUIRING_WORKERS = Object.freeze([
  "printing",
  "binding",
  "quality_check",
  "packaging",
  "out_for_delivery",
]);