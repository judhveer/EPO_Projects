import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import api from "../../lib/api.js";
import debounce from "lodash.debounce";
import FormCard from "../../components/salesPipeline/FormCard.jsx";
import Field from "../../components/salesPipeline/Field.jsx";
import Input from "../../components/salesPipeline/Input.jsx";
import Select from "../../components/salesPipeline/Select.jsx";
import Button from "../../components/salesPipeline/Button.jsx";
import JobItem from "./JobItem.jsx";

// At module level, outside the component empty the form
const EMPTY_FORM = {
  client_type: "",
  order_source: "",
  client_name: "",
  department: "",
  reference: "",
  order_type: "",
  address: "",
  contact_number: "",
  email_id: "",
  order_handled_by: "",
  execution_location: "",
  delivery_location: "",
  delivery_address: "",
  delivery_date: "",
  proof_date: "",
  task_priority: "",
  instructions: "",
  total_amount: "",
  advance_payment: "",
  mode_of_payment: "",
  payment_status: "",
  no_of_files: "",
  order_received_by: "",
  is_direct_to_production: false,
  outbound_sent_to: "",
  paper_ordered_from: "",
  receiving_date_for_mm: "",
  discount: "",
  gst_percentage: "",
  job_items: [],
};

const sanitize = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v ?? ""]));

// Creates one empty inside-paper row for Multiple Sheet category.
// Each inside paper tracks its own paper type, GSM, whether to print,
// and if printing — its color scheme and press machine.
export const createEmptyInsidePaper = () => ({
  _id:
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString() + Math.random(),
  paper_type: "",
  paper_gsm: "",
  to_print: false, // checkbox: does this paper get sent to press?
  color_scheme: "", // only matters when to_print = true
  press_type: "", // only matters when to_print = true
  available_gsm: [], // UI-only: GSM options for this paper's paper_type
});

// Fields that, when changed via handleItemChange, trigger a backend calculation.
// NOTE: paper_type / paper_gsm / inside_press_type for Multiple Sheet are now inside inside_papers[] and handled by handleInsidePaperChange, so they no longer appear here for that category. paper_type stays because Single Sheet still uses it at item level.

// module level — pure function, zero cost, never recreated
// O(1) lookup instead of array.includes() on every keystroke
const CALC_TRIGGER_FIELDS = new Set([
  // Common across all categories
  "quantity",
  "size",
  "uom",
  "enquiry_for",
  "sides",
  // Single Sheet + Multiple Sheet
  "paper_type",
  "paper_gsm",
  "press_type",
  // Multiple Sheet specific
  "inside_pages",
  "cover_paper_type",
  "cover_paper_gsm",
  "cover_pages",
  "cover_press_type",
  "inside_press_type",
  "cover_to_print", // toggling print/no-print changes total cost
  // Wide Format
  "wide_material_name",
  "wide_material_gsm",
  "wide_material_thickness",
  // Binding specific
  "binding_types",
  "creases_per_sheet",
  "folds_per_sheet",
  "binding_targets",
]);

// [FIX 1B] Fields inside an inside_paper that should trigger recalculation.
const INSIDE_PAPER_CALC_TRIGGER_FIELDS = new Set([
  "paper_type",
  "paper_gsm",
  "to_print",
  "color_scheme",
  "press_type",
]);

// Returns true only when all fields needed for a backend calculation are present
const isItemReady = (item) => {
  // "Other" is calculated inline — never hits backend
  if (item.category === "Other") return false;
  // These are required for every non-Other category
  if (!item.quantity || !item.size || !item.enquiry_for) return false;

  switch (item.category) {
    case "Single Sheet":
      return !!(item.paper_type && item.paper_gsm);

    case "Multiple Sheet": {
      // Use the first inside paper for backward-compat backend calculation.
      // Backend will be updated later to handle all inside_papers.
      const firstPaper = item.inside_papers?.[0];
      return !!(
        firstPaper?.paper_type &&
        firstPaper?.paper_gsm &&
        item.inside_pages &&
        item.cover_paper_type &&
        item.cover_paper_gsm &&
        item.cover_pages
      );
    }
    case "Wide Format":
      // wide_material_gsm/thickness are optional for some materials (e.g. Standee)
      // so only hard-require material name
      return !!item.wide_material_name;

    default:
      return false;
  }
};

// Highlight the part of text that matches the query
const highlightMatch = (text, query) => {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, "i"); // Case-insensitive match
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <span key={i} className="font-semibold text-blue-600">
        {part}
      </span>
    ) : (
      part
    ),
  );
};

const emptyToNull = (obj) =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === "" ? null : v]),
  );

const normalizePayload = (payload) => {
  const normalizedPayload = {
    ...payload,
    advance_payment: payload.advance_payment
      ? Number(payload.advance_payment)
      : 0,
    total_amount: payload.total_amount ? Number(payload.total_amount) : 0,
    discount: payload.discount ? Number(payload.discount) : 0,
    gst_percentage: payload.gst_percentage
      ? Number(payload.gst_percentage)
      : null,
    no_of_files: payload.no_of_files ? Number(payload.no_of_files) : 0,

    job_items: payload.job_items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      paper_gsm: item.paper_gsm ? Number(item.paper_gsm) : null,
      cover_paper_gsm: item.cover_paper_gsm
        ? Number(item.cover_paper_gsm)
        : null,
      unit_rate: Number(item.unit_rate),
      item_total: Number(item.item_total),
      inside_pages: item.inside_pages ? Number(item.inside_pages) : null,
      cover_pages: item.cover_pages ? Number(item.cover_pages) : null,
      // for Wide Format category, send either GSM or Thickness based on material
      wide_material_gsm: item.wide_material_gsm
        ? Number(item.wide_material_gsm)
        : null,
      wide_material_thickness: item.wide_material_thickness
        ? Number(item.wide_material_thickness)
        : null,
    })),
  };
  return emptyToNull(normalizedPayload);
};

// Strips all UI-only dropdown data before sending to backend. Backend only needs the selected value for each field, it doesn't need the full list of options used to populate dropdowns. This keeps the payload clean and small.
const cleanJobItems = (items) => {
  return items.map((item) => {
    const {
      // ── UI-only dropdown caches ────
      available_items,
      available_papers,
      available_gsm,
      available_gsm_cover,
      available_bindings,
      available_sizes,
      available_wide_materials,
      available_wide_gsm,
      // ── Calc display fields (stored in JobItemCosting, not JobItem) ──
      best_inside_sheet,
      best_inside_sheet_name,
      best_inside_dimensions,
      best_inside_ups,
      best_cover_sheet,
      best_cover_dimensions,
      best_cover_ups,
      selected_material,
      calculation_type,
      rolls_or_boards_used,
      wastage_sqft,
      wide_ups,
      material_info,
      // ── DB-generated identity / timestamp fields ──────────────────────
      // These must NEVER be sent when creating a new item — Sequelize
      // would try to INSERT the old values → duplicate key or timestamp errors.
      job_no: _jobNo,
      created_at: _ca,
      updated_at: _ua,
      createdAt: _Cat,
      updatedAt: _Uat,
      item_master_id: _imi,

      // ── DB association objects (not columns) ─────────────────────────
      // Sequelize eagerly loads these as nested objects. Sending them back
      // would be ignored at best, or cause "unknown column" errors.
      costing: _costing,
      selectedPaper: _sp,
      selectedCoverPaper: _scp,
      selectedWideMaterial: _swm,
      itemMaster: _im,
      jobCard: _jc,
      ...cleaned
    } = item;

    // Strip available_gsm from each inside_paper before sending to backend
    if (Array.isArray(cleaned.inside_papers)) {
      cleaned.inside_papers = cleaned.inside_papers.map(
        ({
          available_gsm: _ag,
          // Strip calc output — goes to JobItemCosting, not stored in JobItem.inside_papers
          ups: _ups,
          effective_ups: _eups,
          sheets: _sh,
          sheets_with_wastage: _shw,
          sheet_rate: _shr,
          sheet_cost: _shc,
          printing_cost: _pc,
          // Strip display-only text (derivable from selected_paper_id JOIN)
          best_sheet_size_name: _bssn,
          best_sheet_name: _bsn,
          best_sheet_dims: _bsd,
          // Keep: _id, selected_paper_id, paper_type, paper_gsm,
          //        to_print, color_scheme, press_type
          ...rest
        }) => rest,
      );
    }
    return cleaned;
  });
};

// ── rebuildCostingSnapshotFromDB ──────────────────────────────────────────────
// Reconstructs a costing_snapshot from the saved JobItemCosting DB row.
// This is used in edit mode so the user can re-save without recalculating.
// resolvePaperIds in the backend reads ONLY these fields from costing_snapshot:
//   Single Sheet  → ss_paper_id
//   Multiple Sheet → ms_cover_paper_id
//   Wide Format   → wf_material_id
// All other fields are bonus — they populate JobItemCosting on save.
const rebuildCostingSnapshotFromDB = (category, costing) => {
  if (!costing) return null;

  if (category === "Single Sheet") {
    return {
      ss_paper_id: costing.ss_paper_id,
      ss_ups: costing.ss_ups,
      ss_sheets: costing.ss_sheets,
      ss_sheets_with_wastage: costing.ss_sheets_with_wastage,
      ss_sheet_rate: costing.ss_sheet_rate,
      ss_sheet_cost: costing.ss_sheet_cost,
      ss_printing_cost: costing.ss_printing_cost,
      binding_cost: costing.binding_cost || 0,
      binding_cost_per_copy: costing.binding_cost_per_copy || 0,
      total_sheet_cost: costing.total_sheet_cost || 0,
      total_printing_cost: costing.total_printing_cost || 0,
      sheet_cost_per_copy: costing.sheet_cost_per_copy || 0,
      printing_cost_per_copy: costing.printing_cost_per_copy || 0,
      unit_rate: costing.unit_rate || 0,
      item_total: costing.item_total || 0,
    };
  }

  if (category === "Multiple Sheet") {
    return {
      ms_inside_costing: costing.ms_inside_costing || [],
      ms_total_inside_sheet_cost: costing.ms_total_inside_sheet_cost || 0,
      ms_total_inside_printing_cost: costing.ms_total_inside_printing_cost || 0,
      ms_cover_paper_id: costing.ms_cover_paper_id, // ← critical
      ms_cover_ups: costing.ms_cover_ups,
      ms_cover_sheets: costing.ms_cover_sheets,
      ms_cover_sheets_with_wastage: costing.ms_cover_sheets_with_wastage,
      ms_cover_sheet_rate: costing.ms_cover_sheet_rate,
      ms_cover_sheet_cost: costing.ms_cover_sheet_cost,
      ms_cover_printing_cost: costing.ms_cover_printing_cost,
      binding_cost: costing.binding_cost || 0,
      binding_cost_per_copy: costing.binding_cost_per_copy || 0,
      total_sheet_cost: costing.total_sheet_cost || 0,
      total_printing_cost: costing.total_printing_cost || 0,
      sheet_cost_per_copy: costing.sheet_cost_per_copy || 0,
      printing_cost_per_copy: costing.printing_cost_per_copy || 0,
      unit_rate: costing.unit_rate || 0,
      item_total: costing.item_total || 0,
    };
  }

  if (category === "Wide Format") {
    return {
      wf_material_id: costing.wf_material_id, // ← critical
      wf_calculation_type: costing.wf_calculation_type,
      wf_rolls_or_boards_used: costing.wf_rolls_or_boards_used,
      wf_wastage_sqft: costing.wf_wastage_sqft,
      wf_ups: costing.wf_ups,
      wf_material_cost: costing.wf_material_cost || 0,
      wf_printing_cost: costing.wf_printing_cost || 0,
      binding_cost: costing.binding_cost || 0,
      binding_cost_per_copy: costing.binding_cost_per_copy || 0,
      total_sheet_cost: 0,
      total_printing_cost: costing.total_printing_cost || 0,
      sheet_cost_per_copy: 0,
      printing_cost_per_copy: costing.printing_cost_per_copy || 0,
      unit_rate: costing.unit_rate || 0,
      item_total: costing.item_total || 0,
    };
  }

  // "Other" never has costing
  return null;
};

// ── buildCostingSnapshot ──────────────────────────────────────────────────────
// Maps the calculation API response into the costing_snapshot object that
// createJobCard/updateJobCard uses to create/upsert JobItemCosting.
const buildCostingSnapshot = (category, data, qty) => {
  if (category === "Single Sheet") {
    return {
      ss_paper_id: data.inside.selected_paper_id,
      ss_ups: data.inside.ups,
      ss_sheets: data.inside.sheets,
      ss_sheets_with_wastage: data.inside.sheets_with_wastage,
      ss_sheet_rate: data.inside.sheet_rate,
      ss_sheet_cost: data.inside.total_sheet_cost,
      ss_printing_cost: data.inside.printing_cost_total,
      binding_cost: data.totals.total_binding_cost || 0,
      binding_cost_per_copy: data.totals.binding_cost_per_copy || 0,
      total_sheet_cost: data.totals.total_sheet_cost,
      total_printing_cost: data.totals.total_printing_cost,
      sheet_cost_per_copy: data.totals.sheet_cost_per_copy,
      printing_cost_per_copy: data.totals.printing_cost_per_copy,
      unit_rate: data.totals.unit_rate,
      item_total: data.totals.item_total,
    };
  }
  if (category === "Multiple Sheet") {
    return {
      ms_inside_costing: (data.inside_papers_results || []).map((p) => ({
        paper_id: p.selected_paper_id,
        paper_name: p.paper_type || null,
        gsm: p.paper_gsm || null,
        size_name: p.best_sheet_size_name || null,
        sheet_dimensions: p.best_sheet_dims || null,
        ups: p.ups,
        effective_ups: p.effective_ups,
        sheets: p.sheets,
        sheets_with_wastage: p.sheets_with_wastage,
        sheet_rate: p.sheet_rate,
        sheet_cost: p.sheet_cost,
        printing_cost: p.printing_cost,
        to_print: p.to_print,
        color_scheme: p.color_scheme,
        press_type: p.press_type,
      })),
      ms_total_inside_sheet_cost: data.totals.total_inside_sheet_cost || 0,
      ms_total_inside_printing_cost:
        data.totals.total_inside_printing_cost || 0,
      ms_cover_paper_id: data.cover?.selected_paper_id,
      ms_cover_ups: data.cover?.ups,
      ms_cover_sheets: data.cover?.sheets,
      ms_cover_sheets_with_wastage: data.cover?.sheets_with_wastage,
      ms_cover_sheet_rate: data.cover?.sheet_rate,
      ms_cover_sheet_cost: data.cover?.total_sheet_cost,
      ms_cover_printing_cost: data.cover?.printing_cost_total,
      ms_cover_to_print: data.cover?.to_print ?? true, // default to true since cover is printed by default
      binding_cost: data.totals.total_binding_cost || 0,
      binding_cost_per_copy: data.totals.binding_cost_per_copy || 0,
      total_sheet_cost: data.totals.total_sheet_cost,
      total_printing_cost: data.totals.total_printing_cost,
      sheet_cost_per_copy: data.totals.sheet_cost_per_copy,
      printing_cost_per_copy: data.totals.printing_cost_per_copy,
      unit_rate: data.totals.unit_rate,
      item_total: data.totals.item_total,
    };
  }
  if (category === "Wide Format") {
    return {
      // wf_material_id is set server-side (from selected_wide_material_id)
      wf_material_id: data.wide?.selected_wide_material_id, // ← CRITICAL FIX
      wf_calculation_type: data.wide?.calculation_type,
      wf_rolls_or_boards_used: data.wide?.details?.rolls_or_boards_used,
      wf_wastage_sqft: data.wide?.details?.wastage_sqft,
      wf_ups: data.wide?.details?.ups,
      wf_material_cost: data.totals.material_cost || 0,
      wf_printing_cost: data.totals.printing_cost || 0,
      binding_cost: data.totals.total_binding_cost || 0,
      binding_cost_per_copy:
        qty > 0 ? (data.totals.total_binding_cost || 0) / qty : 0,
      unit_rate: data.totals.unit_rate,
      item_total: data.totals.item_total,
      // WF has no sheets, so sheet totals are 0
      total_sheet_cost: 0,
      total_printing_cost: data.totals.printing_cost || 0,
      sheet_cost_per_copy: 0,
      printing_cost_per_copy:
        qty > 0 ? (data.totals.printing_cost || 0) / qty : 0,
    };
  }
  return null;
};

/**
 * Pure billing breakdown — called on every render, zero side effects.
 * discount is clamped so it can never exceed subtotal.
 */
const computeBilling = (totalAmount, discount, gstPct) => {
  const subtotal = parseFloat(Number(totalAmount || 0).toFixed(2));
  const disc = parseFloat(Math.min(Number(discount || 0), subtotal).toFixed(2));
  const afterDisc = parseFloat((subtotal - disc).toFixed(2));
  const rate = gstPct ? Number(gstPct) : 0;
  const gstAmount = parseFloat(((afterDisc * rate) / 100).toFixed(2));
  const finalAmount = parseFloat((afterDisc + gstAmount).toFixed(2));
  return { subtotal, disc, afterDisc, gstAmount, finalAmount };
};


// ── NEW ──────────────────────────────────────────────────────────────────────
// Pure module-level function. Takes a raw DB job object (same shape returned
// by GET /api/fms/jobcards/:jobNo) and returns:
//   { formState }   → ready to pass to setFormAndRef
//   { mappedItems } → ready to pass to loadDropdownsForMappedItems
//
// Having this as a pure function means:
//   1. Edit-mode useEffect calls it.
//   2. Search handler calls it.
//   Zero code duplication, single source of truth for mapping logic.
// ─────────────────────────────────────────────────────────────────────────────
const mapJobToForm = (job, { forNewJob = false } = {}) => {
  // ── Date formatters (pure, no state) ──────────────────────────────────────
  const formatDateTimeLocal = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60000);
    return localDate.toISOString().slice(0, 16);
  };

  const formatDateOnly = (isoString) => {
    if (!isoString) return "";
    return new Date(isoString).toISOString().slice(0, 10);
  };

  // ── Map items ─────────────────────────────────────────────────────────────
  const safeItems = Array.isArray(job?.items) ? job.items : [];

  const mappedItems = safeItems.map((item) => {
    let insidePapers;
    if (item.category === "Multiple Sheet") {
      if (
        Array.isArray(item.inside_papers) &&
        item.inside_papers.length > 0
      ) {
        // New format — ensure _id and available_gsm exist
        insidePapers = item.inside_papers.map((p) => ({
          ...p,
        // Only generate a new _id if none exists (truly old/corrupted data).
        // This applies to BOTH edit mode AND forNewJob=true (search load):
        //   - Edit mode: _id must match DB binding_targets references.
        //   - New job:   binding_targets is also loaded from DB with same UUIDs, so references must still match until user saves the new job.
          _id: p._id || (crypto.randomUUID?.() ?? (Date.now().toString() + Math.random())),
          available_gsm: [],
        }));
      } else {
        // Old format: single paper stored at item level → migrate to array
        insidePapers = [
          {
            _id: crypto.randomUUID?.() ?? Date.now().toString(),
            paper_type: item.selectedPaper?.paper_name || "",
            paper_gsm: item.selectedPaper?.gsm || "",
            to_print: !!item.selectedPaper,
            color_scheme: item.color_scheme || "",
            press_type: item.inside_press_type || "",
            available_gsm: [],
          },
        ];
      }
    } else {
      insidePapers = [createEmptyInsidePaper()];
    }

    return {
      ...item,
// ── CRITICAL FIX 1: Strip ALL DB-generated identity fields ────────────
      // Without this, every loaded item gets id=undefined AND _temp_id=undefined.
      // removeItem/findItemIndexById use (item.id ?? item._temp_id) as the key.
      // If both are undefined, every item matches undefined → all get removed..
      id: forNewJob ? undefined : item.id,
      _temp_id: forNewJob
        ? (crypto.randomUUID?.() ?? (Date.now().toString() + Math.random()))
        : item._temp_id, // may be undefined in edit mode — that's fine, id is the key

      // ── CRITICAL FIX 2: Strip ALL timestamp/ownership fields ──────────────
      // Sequelize with underscored:true serializes as snake_case in JSON.
      // Stripping only camelCase (createdAt/updatedAt) misses the real keys.
      // If these leak to the backend, Sequelize tries to INSERT the old timestamps.
      created_at: undefined,    // ← actual key in JSON response (snake_case)
      updated_at: undefined,    // ← actual key in JSON response (snake_case)
      createdAt: undefined,     // ← camelCase fallback, strip both to be safe
      updatedAt: undefined,
      // ── Strip for new job only ────────────────────────────────────────────
      // job_no: edit mode uses existingJob.job_no from the prop (PUT /:job_no), not from form state, so it's safe to strip in both modes.
      job_no: undefined,        // ← never carry old job_no into a new job
      item_master_id: undefined, // ←  regenerated by afterCreate hook / findOrCreate

      // ── Strip DB association object — not a column ────────────────────────
      // item.costing is the JobItemCosting association, not a DB column.
      // Sending it would cause "unknown column" errors.
      costing: undefined,
      selectedPaper:        undefined,
      selectedCoverPaper:   undefined,
      selectedWideMaterial: undefined,
      itemMaster:           undefined,
      jobCard:              undefined,

      // ── Rebuild display/form fields from association objects ──────────────
      // (Before stripping above, item.selectedPaper etc. are still accessible
      // because we spread ...item first, then override below.)
      paper_type: item.selectedPaper?.paper_name || "",
      paper_gsm: item.selectedPaper?.gsm || "",
      cover_paper_type: item.selectedCoverPaper?.paper_name || "",
      cover_paper_gsm: item.selectedCoverPaper?.gsm || "",
      wide_material_name: item.selectedWideMaterial?.material_name || "",
      wide_material_gsm: item.selectedWideMaterial?.gsm || "",
      wide_material_thickness: item.selectedWideMaterial?.thickness_mm || "",
      cover_to_print: item.cover_to_print !== undefined ? item.cover_to_print : true,
      
      binding_types: Array.isArray(item.binding_types) ? item.binding_types : [],
      binding_targets: item.binding_targets || {
        numbering_paper_ids: [],
        perforation_paper_ids: [],
      },
      folds_per_sheet: item.no_of_foldings || "",
      creases_per_sheet: item.no_of_creases || "",
      // ── UI-only dropdown caches (always empty on load) ────────────────────
      available_sizes: [],
      available_items: [],
      available_papers: [],
      available_gsm: [],
      available_gsm_cover: [],
      available_bindings: [],
      available_wide_materials: [],
      available_wide_gsm: [],
      inside_papers: insidePapers,
      costing_snapshot: rebuildCostingSnapshotFromDB(item.category, item.costing),
    };
  });

  // ── Build form state ───
  // sanitize(job) spreads the entire job object including job_no, status,
  // current_stage etc. We explicitly override the fields we don't want.
  const formState = {
    ...sanitize(job),
    // ── Strip job-level identity fields ──────────────────────────────────
    // job_no must NOT carry over — a new job gets auto-generated job_no.
    // status/current_stage are controlled by createJobCard, not the form.
    job_no: undefined,
    status: undefined,
    current_stage: undefined,
    assigned_designer: undefined,
    completed_at: undefined,
    created_at: undefined,
    updated_at: undefined,
    // Strip association objects that sanitize(job) might spread
    items:             undefined,
    client:            undefined,
    assignments:       undefined,
    quotation:         undefined,
    costing:           undefined,

    delivery_date: forNewJob ? undefined : formatDateTimeLocal(job.delivery_date),
    proof_date: forNewJob ? undefined : formatDateOnly(job.proof_date),
    receiving_date_for_mm: forNewJob ? undefined : formatDateOnly(job.receiving_date_for_mm),
    gst_percentage: job.gst_percentage ?? "",
    job_items: mappedItems,
  };

  return { formState, mappedItems };
};
// ── END NEW ──────────────────────────────────────────────────────────────────

export default function JobCardForm({
  onCreated,
  onUpdated,
  existingJob,
  isEditMode,
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  const formRef = useRef(form);

  // It wraps setForm to always keep formRef in sync instantly
  const setFormAndRef = useCallback((updater) => {
    setForm((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      formRef.current = next; // sync immediately, before any setTimeout fires
      return next;
    });
  }, []);

  const [clientSuggestions, setClientSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const [users, setUsers] = useState([]);
  const [crmUsers, setCrmUsers] = useState([]);

  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // ── NEW: Job No search state ───────────────────────────────────────────────
  const [searchJobNo, setSearchJobNo] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchSuccess, setSearchSuccess] = useState("");
  // ── END NEW ───────────────────────────────────────────────────────────────

  const timeoutsRef = useRef([]);

  // ── Per-item AbortControllers — cancel in-flight calc on new trigger ──────────
  // key: uniqueKey (item.id ?? item._temp_id) → AbortController
  const calcAbortControllersRef = useRef(new Map());
  // ── Per-item debounce timers — collapse rapid field changes into one request ──
  // key: uniqueKey → setTimeout id
  const calcTimersRef = useRef(new Map());

  // Helper to register timeouts
  const safeTimeout = useCallback((fn, delay) => {
    const id = setTimeout(fn, delay);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const findItemIndexById = useCallback((items, id) => {
    return items.findIndex((item) => (item.id ?? item._temp_id) === id);
  }, []);

  const showSoftError = useCallback((message) => {
    setErr(message);
    setTimeout(() => setErr(""), 20000);
  }, []);


  useEffect(() => {
    async function loadUsers() {
      try {
        const [nonBossRes, crmRes] = await Promise.all([
          api.get("/api/users/non-boss"),
          api.get("/api/users/crm"),
        ]);
        setUsers(nonBossRes.data);
        setCrmUsers(crmRes.data);
      } catch (err) {
        console.error("Failed to fetch users", err);
        showSoftError("Failed to fetch users.");
      }
    }
    loadUsers();
  }, [showSoftError]);

  useEffect(() => {
    const el = document.querySelector(".active-suggestion");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel registered timeouts
      timeoutsRef.current.forEach(clearTimeout);
      // Cancel all pending calc timers
      calcTimersRef.current.forEach(clearTimeout);
      calcTimersRef.current.clear();
      // Abort all in-flight calculation requests
      calcAbortControllersRef.current.forEach((ctrl) => ctrl.abort());
      calcAbortControllersRef.current.clear();
    };
  }, []);

  const searchClients = useMemo(
    () =>
      debounce(async (query) => {
        if (!query) return setClientSuggestions([]);
        try {
          const { data } = await api.get(`/api/clients/search?q=${query}`);
          setClientSuggestions(data);
        } catch (err) {
          console.error("Failed to fetch clients", err);
          showSoftError("Failed to fetch client suggestions.");
        }
      }, 400),
    [],
  );

  useEffect(() => {
    return () => {
      searchClients.cancel();
    };
  }, [searchClients]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [clientSuggestions]);

  const onChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      setFormAndRef((f) => {
        if (name === "execution_location" && value !== "Out-Bound") {
          return {
            ...f,
            execution_location: value,
            outbound_sent_to: "",
            paper_ordered_from: "",
            receiving_date_for_mm: "",
          };
        }
        return { ...f, [name]: value };
      });

      if (name === "client_name") {
        searchClients(value);
      }
    },
    [searchClients, setFormAndRef],
  );

  // ── Dropdown loaders ─────────────────────────────────────────────────────────
  const patchItem = useCallback(
    (itemId, patch) => {
      setFormAndRef((prev) => {
        const idx = findItemIndexById(prev.job_items, itemId);
        if (idx === -1) return prev;
        const items = [...prev.job_items];
        items[idx] = { ...items[idx], ...patch };
        return { ...prev, job_items: items };
      });
    },
    [findItemIndexById, setFormAndRef],
  );

  // Added inside_papers reset so switching category starts fresh.
  const loadCategoryItems = useCallback(
    async (itemId, category) => {
      try {
        const { data } = await api.get(
          `/api/fms/items/by-category?category=${category}`,
        );
        patchItem(itemId, {
          available_items: data, // store category items
          enquiry_for: "",
          size: "",
          sides: "",
          color_scheme: "",
          inside_pages: "",
          cover_pages: "",
          quantity: "",
          paper_type: "",
          paper_gsm: "",
          binding_types: [],
          available_gsm: [],
          available_gsm_cover: [],
          available_wide_materials: [],
          wide_material_name: "",
          wide_material_gsm: "",
          wide_material_thickness: "",
          available_wide_gsm: [],
          cover_paper_type: "",
          cover_paper_gsm: "",
          cover_color_scheme: "",
          cover_press_type: "",
          cover_to_print: true,
          unit_rate: "",
          item_total: "",
          best_inside_sheet: "",
          best_inside_sheet_name: "",
          best_cover_sheet: "",

          selected_material: "",
          calculation_type: "",
          rolls_or_boards_used: "",
          wastage_sqft: "",
          wide_ups: "",
          folds_per_sheet: "",
          creases_per_sheet: "",
          press_type: "",
          // reset inside papers to a single empty paper
          inside_papers: [createEmptyInsidePaper()],
        });
      } catch (err) {
        console.error("Failed to load category items", err);
        showSoftError("Failed to load category items. Please try again.");
      }
    },
    [patchItem, showSoftError],
  );

  const loadCategoryBindings = useCallback(
    async (itemId, category) => {
      try {
        const { data } = await api.get(
          `/api/fms/items/bindings?category=${category}`,
        );

        patchItem(itemId, {
          available_bindings: data,
        });
      } catch (err) {
        console.error("Failed to load category bindings", err);
        showSoftError("Failed to load category bindings. Please try again.");
      }
    },
    [patchItem, showSoftError],
  );
  // Loads available paper types list — shared across ALL inside papers in
  // the item, stored at item level (available_papers).
  const loadItemPapers = useCallback(
    async (itemId) => {
      try {
        const { data } = await api.get(`/api/fms/items/paper-types`);

        patchItem(itemId, {
          available_papers: data,
        });
      } catch (err) {
        console.error("Failed to load papers:", err);
        showSoftError("Failed to load papers. Please try again.");
      }
    },
    [patchItem, showSoftError],
  );

  const loadWideMaterials = useCallback(
    async (itemId) => {
      try {
        const { data } = await api.get("/api/fms/items/wide-materials");

        patchItem(itemId, { available_wide_materials: data });
      } catch (err) {
        console.error("Failed to load wide materials", err);
        showSoftError("Failed to load wide materials. Please try again.");
      }
    },
    [patchItem, showSoftError],
  );

  const loadWideMaterialGsm = useCallback(
    async (itemId, materialName) => {
      try {
        const { data } = await api.get(
          `/api/fms/items/wide-materials/gsm?materialName=${materialName}`,
        );

        patchItem(itemId, {
          available_wide_gsm: data,
        });
      } catch (err) {
        console.error("Failed to load wide GSM");
        showSoftError("Failed to load wide GSM. Please try again.");
      }
    },
    [patchItem, showSoftError],
  );

  // Used for Single Sheet paper GSM (stored at item level: available_gsm / available_gsm_cover).
  const loadItemPapersGsm = useCallback(
    async (itemId, paperName, type = "inside") => {
      try {
        const { data } = await api.get(
          `/api/fms/items/paper-types/gsm?paperName=${paperName}`,
        );

        patchItem(
          itemId,
          type === "inside"
            ? { available_gsm: data }
            : { available_gsm_cover: data },
        );
      } catch (err) {
        console.error("Failed to load paper gsm:", err);
        showSoftError("Failed to load paper GSM. Please try again.");
      }
    },
    [patchItem, showSoftError],
  );

  // Loads GSM options for a SPECIFIC inside paper (by its _id).
  // This is separate from loadItemPapersGsm because each inside paper can
  // have a different paper_type, so each needs its own GSM list.
  const loadInsidePaperGsm = useCallback(
    async (itemId, paperId, paperName, clearGsm = true) => {
      try {
        const { data } = await api.get(
          `/api/fms/items/paper-types/gsm?paperName=${paperName}`,
        );
        setFormAndRef((prev) => {
          const itemIndex = findItemIndexById(prev.job_items, itemId);
          if (itemIndex === -1) return prev;
          const items = [...prev.job_items];
          const item = { ...items[itemIndex] };
          const papers = [...(item.inside_papers || [])];
          const paperIndex = papers.findIndex((p) => p._id === paperId);
          if (paperIndex === -1) return prev;
          // Update only this paper's available_gsm and clear its previous GSM selection
          papers[paperIndex] = {
            ...papers[paperIndex],
            available_gsm: data,
            // Only wipe the saved selection when the user actively changes paper_type.
            // In edit-mode initial load, preserve whatever was saved in the DB.
            ...(clearGsm ? { paper_gsm: "" } : {}),
          };
          item.inside_papers = papers;
          items[itemIndex] = item;
          return { ...prev, job_items: items };
        });
      } catch (err) {
        console.error("Failed to load inside paper GSM:", err);
        showSoftError("Failed to load paper GSM. Please try again.");
      }
    },
    [findItemIndexById, showSoftError, setFormAndRef],
  );

  const loadSizes = useCallback(
    async (itemId, search) => {
      try {
        const { data } = await api.get(`/api/fms/items/sizes?search=${search}`);

        patchItem(itemId, {
          available_sizes: data,
        });
      } catch (err) {
        console.error("Failed to load sizes", err);
        showSoftError("Failed to load sizes. Please try again.");
      }
    },
    [patchItem, showSoftError],
  );


  // ── NEW ──────────────────────────────────────────────────────────────────────
  // Fires all dropdown-loading API calls for a list of already-mapped items.
  // Called both from:
  //   1. Edit-mode useEffect (after existingJob is received via props)
  //   2. Search handler (after job is fetched by job no)
  //
  // IMPORTANT: Takes `mappedItems` (not `form.job_items`) so it works
  // synchronously without needing a re-render first.
  // ─────────────────────────────────────────────────────────────────────────────
  const loadDropdownsForMappedItems = useCallback(
    (mappedItems) => {
      mappedItems.forEach((item) => {
        // item.id exists for DB-saved items; new temp items use _temp_id
        const itemId = item.id ?? item._temp_id;

        if (item.category) {
          loadCategoryBindings(itemId, item.category);
          if (item.category === "Wide Format") {
            loadWideMaterials(itemId);
          }
        }

        if (item.enquiry_for) {
          loadItemPapers(itemId);
        }

        if (item.category === "Single Sheet" && item.paper_type) {
          loadItemPapersGsm(itemId, item.paper_type, "inside");
        }

        if (item.category === "Multiple Sheet") {
          item.inside_papers?.forEach((paper) => {
            if (paper.paper_type) {
              // clearGsm = false → preserve saved GSM selection
              loadInsidePaperGsm(itemId, paper._id, paper.paper_type, false);
            }
          });
        }

        if (item.cover_paper_type) {
          loadItemPapersGsm(itemId, item.cover_paper_type, "cover");
        }

        if (item.wide_material_name) {
          loadWideMaterialGsm(itemId, item.wide_material_name);
        }
      });
    },
    [
      loadCategoryBindings,
      loadWideMaterials,
      loadItemPapers,
      loadItemPapersGsm,
      loadInsidePaperGsm,
      loadWideMaterialGsm,
    ],
  );
  // ── END NEW ───────────────────────────────────────────────────────────────








  const calculateItemBackend = useCallback(
    async (index, uniqueKey) => {
      console.log("calculateItemBackend Triggered:", uniqueKey);

      const item = formRef.current.job_items[index];
      if (!item || !isItemReady(item)) return; // safety net — isItemReady already checked in handleItemChange

      // ── Cancel any in-flight request for this item ────────────────────────
      const prevController = calcAbortControllersRef.current.get(uniqueKey);
      if (prevController) {
        prevController.abort();
      }
      const controller = new AbortController();
      calcAbortControllersRef.current.set(uniqueKey, controller);

      // ── Mark item as "calculating" so UI can show spinner ─────────────────
      setFormAndRef((prev) => {
        const idx = findItemIndexById(prev.job_items, uniqueKey);
        if (idx === -1) return prev;
        const items = [...prev.job_items];
        items[idx] = { ...items[idx], is_calculating: true, calc_error: null };
        return { ...prev, job_items: items };
      });


      // Clean the items before sending
      const cleanedItems = cleanJobItems(formRef.current.job_items);

      // For Multiple Sheet: pass first inside paper's data at item level
      // so backend (unchanged) can still calculate. Remove when backend updated.
      let itemToSend = { ...item, unit_rate: null, item_total: null };
      if (
        item.category === "Multiple Sheet" &&
        item.inside_papers?.length > 0
      ) {
        const firstPaper = item.inside_papers[0];
        itemToSend = {
          ...itemToSend,
          paper_type: firstPaper.paper_type,
          paper_gsm: firstPaper.paper_gsm,
          color_scheme: firstPaper.to_print ? firstPaper.color_scheme : "",
          inside_press_type: firstPaper.to_print ? firstPaper.press_type : "",
        };
      }
      const cleanedItem = cleanJobItems([itemToSend])[0];

      // const cleanedItem = cleanJobItems([item])[0];
      // const cleanedItem = cleanJobItems([
      //   { ...item, unit_rate: null, item_total: null },
      // ])[0];

      // Send all required fields to backend
      const payload = {
        item: cleanedItem,
        all_items: cleanedItems, // send all items so backend can recalc total_amount
      };

      try {
        const { data } = await api.post(
          `/api/fms/items/calculate-item`,
          payload,
          { signal: controller.signal }, // ← abort signal
        );

        // Calculation succeeded — remove controller
        calcAbortControllersRef.current.delete(uniqueKey);

        const qty = Number(formRef.current.job_items[index].quantity || 1);

        // Build costing_snapshot from the API response
        const costingSnapshot = buildCostingSnapshot(item.category, data, qty);

        // [FIX 1A] Merge inside_papers_results back into item.inside_papers
        setFormAndRef((prev) => {
          // Guard: item may have been removed while request was in flight
          const currentIdx = findItemIndexById(prev.job_items, uniqueKey);
          if (currentIdx === -1) return prev;

          const updatedItems = [...prev.job_items];
          const currentInsidePapers = updatedItems[index].inside_papers || [];

          const mergedInsidePapers = data.inside_papers_results?.length
            ? currentInsidePapers.map((paper, pIdx) => {
                const result = data.inside_papers_results[pIdx];
                if (!result) return paper;
                // Merge calc result fields but preserve frontend-only fields (_id, available_gsm)
                return {
                  ...paper,
                  selected_paper_id:
                    result.selected_paper_id ?? paper.selected_paper_id,
                  ups: result.ups,
                  effective_ups: result.effective_ups,
                  sheets: result.sheets,
                  sheets_with_wastage: result.sheets_with_wastage,
                  sheet_rate: result.sheet_rate,
                  sheet_cost: result.sheet_cost,
                  printing_cost: result.printing_cost,
                  best_sheet_size_name: result.best_sheet_size_name,
                  best_sheet_name: result.best_sheet_name,
                  best_sheet_dims: result.best_sheet_dims,
                };
              })
            : currentInsidePapers;

          updatedItems[index] = {
            ...updatedItems[index],
            // Store unit & item total
            unit_rate: data.totals.unit_rate,
            item_total: data.totals.item_total,
            is_calculating:    false,
            calc_error:        null,      // ← clear any previous error
            costing_snapshot: costingSnapshot, // ← sent to backend for JobItemCosting
            // ← NEW: inside papers now carry per-paper calc results
            inside_papers: mergedInsidePapers,
            // Store inside best-sheet details
            best_inside_sheet: data.inside.sheet_selected,
            best_inside_dimensions: data.inside.sheet_dimensions,
            best_inside_ups: data.inside.ups,
            best_inside_sheet_name: data.inside.sheet_name,
            // Store cover best-sheet details (may be null for Single Sheet)
            best_cover_sheet: data.cover.sheet_selected,
            best_cover_dimensions: data.cover.sheet_dimensions,
            best_cover_ups: data.cover.ups,
            // wide format fields
            selected_material: data.wide?.selected_material,
            calculation_type: data.wide?.calculation_type,
            rolls_or_boards_used: data.wide?.details?.rolls_or_boards_used,
            wastage_sqft: data.wide?.details?.wastage_sqft,
            wide_ups: data.wide?.details?.ups,
            material_info: data.wide?.details?.selected_material_info,
          };

          // Recompute grand total from all items
          const grandTotal = updatedItems.reduce(
            (sum, it) => sum + Number(it.item_total || 0),
            0,
          );
          return {
            ...prev,
            job_items: updatedItems,
            total_amount: grandTotal,
          };
        });
      } catch (err) {
        // ── Aborted request — not an error, silently ignore ──────────────────
        // Axios wraps AbortController errors as CanceledError.
        // Fetch wraps them as AbortError. Handle both.
        if (
          err.name === "AbortError" ||
          err.name === "CanceledError" ||
          err.code === "ERR_CANCELED"
        ) {
          return;
        }

        calcAbortControllersRef.current.delete(uniqueKey);

        const errorMsg =
          err?.response?.data?.message ||
          "Calculation failed. Please check the selected paper, size, and press type.";

        console.error("Item calculation failed:", errorMsg);

        // ── Clear totals and set inline error on the item ────────────────────
        setFormAndRef((prev) => {
          const currentIdx = findItemIndexById(prev.job_items, uniqueKey);
          if (currentIdx === -1) return prev;

          const updatedItems = [...prev.job_items];
          updatedItems[currentIdx] = {
            ...updatedItems[currentIdx],
            unit_rate:        "",
            item_total:       "",
            is_calculating:   false,
            calc_error:       errorMsg,
            costing_snapshot: null,
          };

          // Recompute grand total — this item now contributes 0
          const grandTotal = updatedItems.reduce(
            (sum, it) => sum + Number(it.item_total || 0),
            0,
          );

          return {
            ...prev,
            job_items: updatedItems,
            total_amount: grandTotal, // ← subtotal updates immediately
          };
        });
      }
    },
    [findItemIndexById, setFormAndRef],
  );

    // ── triggerCalculation ────────────────────────────────────────────────────────
  // Debounced calculation trigger.
  // - Clears any pending timer for this item (collapses rapid changes).
  // - After 200ms of silence, reads latest item from formRef and fires calc.
  // - AbortController inside calculateItemBackend handles in-flight cancellation.
  // Called by handleItemChange and handleInsidePaperChange instead of raw setTimeout.
  // ─────────────────────────────────────────────────────────────────────────────
  const triggerCalculation = useCallback(
    (uniqueKey) => {
      // Cancel pending timer for this item (debounce)
      if (calcTimersRef.current.has(uniqueKey)) {
        clearTimeout(calcTimersRef.current.get(uniqueKey));
      }

      const timerId = setTimeout(() => {
        calcTimersRef.current.delete(uniqueKey);

        const latestIndex = findItemIndexById(formRef.current.job_items, uniqueKey);
        if (latestIndex === -1) return;

        const latestItem = formRef.current.job_items[latestIndex];
        if (isItemReady(latestItem)) {
          calculateItemBackend(latestIndex, uniqueKey);
        }
      }, 200);

      calcTimersRef.current.set(uniqueKey, timerId);
    },
    [findItemIndexById, calculateItemBackend],
  );

  // ── NEW ──────────────────────────────────────────────────────────────────────
  // Search handler. Called on button click OR Enter key in the search input.
  // Flow:
  //   1. Validate input is not empty.
  //   2. Call GET /api/fms/jobcards/:jobNo (same endpoint used by edit mode).
  //   3. On 404  → show inline error next to search field.
  //   4. On 200  → mapJobToForm → setFormAndRef → loadDropdownsForMappedItems.
  //   5. Show brief success banner. Clear search input.
  //
  // Why NOT debounced: user explicitly presses Load/Enter.
  // Debouncing would be dangerous here — auto-filling the entire form on each
  // keystroke would be a UX disaster.
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSearchJob = useCallback(async () => {
    const trimmed = searchJobNo.trim();

    if (!trimmed) {
      setSearchError("Please enter a Job No to search.");
      return;
    }

    // Basic sanity: job no should be numeric
    if (!/^\d+$/.test(trimmed)) {
      setSearchError("Job No must be a number.");
      return;
    }

    setSearchLoading(true);
    setSearchError("");
    setSearchSuccess("");

    try {
      // ── FIX: use the lean endpoint, not the full detail endpoint ──────────
      // The full endpoint has problematic includes (FileAttachment etc.) that
      // cause 500 errors. The form-load endpoint only includes what we need.
      const { data } = await api.get(`/api/fms/jobcards/${trimmed}/form-load`);

      // Map DB response → form state using the same pure function
      // that the edit-mode useEffect uses
      const { formState, mappedItems } = mapJobToForm(data, { forNewJob: true });

      // Populate the form
      setFormAndRef(formState);

      // Fire all dropdown loaders for the loaded items
      loadDropdownsForMappedItems(mappedItems);

      // Clear search input — job no is already in the form data (non-editable)
      setSearchJobNo("");

      // Show success banner with the loaded job no
      setSearchSuccess(
        `✅ Loaded Job #${trimmed} — modify and save as a new job"}`,
      );

      // Auto-dismiss after 4 seconds
      setTimeout(() => setSearchSuccess(""), 4000);

      // ── FIX: trigger recalculation for all ready items ────────────────────
      // Why: even though rebuildCostingSnapshotFromDB fills costing_snapshot
      // from the DB, we MUST recalculate when creating a new job because:
      //   1. Paper prices may have changed since the original job.
      //   2. The backend's createJobCard validates ms_cover_paper_id,
      //      ss_paper_id, wf_material_id from a FRESH calculation result.
      //   3. It gives the user accurate pricing before they submit.
      //
      // formRef.current is already updated by setFormAndRef above (synchronous),
      // so we can read the items immediately in the setTimeout.
      setTimeout(() => {
        const items = formRef.current.job_items;
        items.forEach((item, index) => {
          const key = item.id ?? item._temp_id;
          if (isItemReady(item)) {
            console.log(`Auto-calculating item ${index} on load:`, item);
            calculateItemBackend(index, key);
          }
          else{
            console.log(`Skipping calculation for item ${index} because it's not ready:`, item);
          }
        });
      }, 0);
      // ── END FIX ─────

    } catch (error) {
      if (error.response?.status === 404) {
        setSearchError(`No job found with Job No: ${trimmed}`);
      } else {
        setSearchError(
          error.response?.data?.message ||
            "Failed to search. Please try again.",
        );
      }
    } finally {
      setSearchLoading(false);
    }
  }, [searchJobNo, calculateItemBackend, setFormAndRef, loadDropdownsForMappedItems]);
  // ── END NEW ───────────────────────────────────────────────────────────────


    // ── NEW ──────────────────────────────────────────────────────────────────────
  // Allow pressing Enter in the search input to trigger the search.
  // Prevents form submission bubbling (important: the input is OUTSIDE <form>).
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSearchKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault(); // never submit the main form
        handleSearchJob();
      }
      // Clear inline error as soon as user starts correcting the input
      if (e.key !== "Enter" && searchError) {
        setSearchError("");
      }
    },
    [handleSearchJob, searchError],
  );
  // ── END NEW 

  const handleItemChange = useCallback(
    (id, field, value) => {
      // 1. Update the field (and handle "Other" calculation)
      setFormAndRef((prev) => {
        const index = findItemIndexById(prev.job_items, id);
        if (index === -1) return prev;

        const items = [...prev.job_items];
        let updatedItem = { ...items[index], [field]: value };

        // Inline the gsm clear here, no second setForm needed
        if (field === "wide_material_name") {
          updatedItem = {
            ...updatedItem,
            wide_material_gsm: "",
            wide_material_thickness: "",
            available_wide_gsm: [],
          };
        }
        // ── NEW: When cover is marked "not printed", clear related fields ──────
        if (field === "cover_to_print" && !value) {
          updatedItem = {
            ...updatedItem,
            cover_color_scheme: "",
            cover_press_type: "",
          };
        }

        // 🔹 "Other" category inline calculation
        if (
          updatedItem.category === "Other" &&
          (field === "unit_rate" || field === "quantity")
        ) {
          const quantity = Number(updatedItem.quantity || 0);
          const rate = Number(updatedItem.unit_rate || 0);
          updatedItem.item_total = quantity * rate;
        }

        items[index] = updatedItem;

        const grandTotal = items.reduce(
          (sum, it) => sum + Number(it.item_total || 0),
          0,
        );

        return {
          ...prev,
          job_items: items,
          total_amount: grandTotal,
        };
      });

      // 2. Trigger dropdown loading (pass id, not index)
      if (field === "category") {
        loadCategoryItems(id, value);
        loadCategoryBindings(id, value);
        if (value === "Wide Format") {
          loadWideMaterials(id);
        }
      }

      if (field === "wide_material_name") {
        loadWideMaterialGsm(id, value);
      }

      if (field === "enquiry_for") {
        loadItemPapers(id);
      }
      // paper_type at item level is only for Single Sheet now
      if (field === "paper_type") {
        loadItemPapersGsm(id, value);
      }

      if (field === "cover_paper_type") {
        loadItemPapersGsm(id, value, "cover");
      }

      if (field === "size") {
        loadSizes(id, value);
      }

      if (CALC_TRIGGER_FIELDS.has(field)) {
        triggerCalculation(id); // debounced + abort-safe
      }
    },
    // Dependencies: only stable functions (no form.job_items)
    [
      findItemIndexById,
      setFormAndRef,
      loadCategoryItems,
      loadCategoryBindings,
      loadWideMaterials,
      loadWideMaterialGsm,
      loadItemPapers,
      loadItemPapersGsm,
      loadSizes,
      triggerCalculation,
    ],
  );

  // Handles changes to an individual inside paper within a Multiple Sheet item.
  // itemId  → identifies the job item (via id or _temp_id)
  // paperId → identifies the specific inside paper (via _id)
  // field   → which field changed (paper_type, paper_gsm, to_print, color_scheme, press_type)
  // value   → new value

  // [FIX 1B] Handles changes to an individual inside paper within a Multiple Sheet item.
  // Now also triggers backend recalculation when calc-relevant fields change.
  const handleInsidePaperChange = useCallback(
    (itemId, paperId, field, value) => {
      setFormAndRef((prev) => {
        const itemIndex = findItemIndexById(prev.job_items, itemId);
        if (itemIndex === -1) return prev;

        const items = [...prev.job_items];
        const item = { ...items[itemIndex] };
        const papers = [...(item.inside_papers || [])];
        const paperIndex = papers.findIndex((p) => p._id === paperId);
        if (paperIndex === -1) return prev;

        let updatedPaper = { ...papers[paperIndex], [field]: value };

        // When paper_type changes → clear GSM since it's no longer valid
        if (field === "paper_type") {
          updatedPaper.paper_gsm = "";
          updatedPaper.available_gsm = [];
        }

        // When color_scheme changes → clear press_type (it may no longer be valid)
        if (field === "color_scheme") {
          updatedPaper.press_type = "";
        }

        // When to_print is unchecked → clear color and press fields
        if (field === "to_print" && !value) {
          updatedPaper.color_scheme = "";
          updatedPaper.press_type = "";
        }

        papers[paperIndex] = updatedPaper;
        item.inside_papers = papers;
        items[itemIndex] = item;
        return { ...prev, job_items: items };
      });

      // Load GSM list for this specific inside paper when its paper_type changes
      if (field === "paper_type" && value) {
        loadInsidePaperGsm(itemId, paperId, value, true);
      }

      // [FIX 1B] Trigger backend recalculation when a calc-relevant inside paper
      // field changes (paper_type triggers recalc only after GSM is also filled,
      // so isItemReady naturally guards that).
      if (INSIDE_PAPER_CALC_TRIGGER_FIELDS.has(field)) {
        triggerCalculation(itemId); // debounced + abort-safe
      }
    },
    [
      findItemIndexById,
      setFormAndRef,
      loadInsidePaperGsm,
      triggerCalculation,
    ],
  );

  // Adds a new empty inside paper to a Multiple Sheet item (max 4).
  const addInsidePaper = useCallback(
    (itemId) => {
      setFormAndRef((prev) => {
        const index = findItemIndexById(prev.job_items, itemId);
        if (index === -1) return prev;
        const items = [...prev.job_items];
        const item = { ...items[index] };
        if ((item.inside_papers || []).length >= 4) return prev; // max 4
        item.inside_papers = [
          ...(item.inside_papers || []),
          createEmptyInsidePaper(),
        ];
        items[index] = item;
        return { ...prev, job_items: items };
      });
    },
    [findItemIndexById, setFormAndRef],
  );

  // Removes an inside paper from a Multiple Sheet item (min 1 must remain).
  const removeInsidePaper = useCallback(
    (itemId, paperId) => {
      setFormAndRef((prev) => {
        const index = findItemIndexById(prev.job_items, itemId);
        if (index === -1) return prev;
        const items = [...prev.job_items];
        const item = { ...items[index] };
        if ((item.inside_papers || []).length <= 1) return prev; // min 1
        item.inside_papers = item.inside_papers.filter(
          (p) => p._id !== paperId,
        );
        items[index] = item;
        return { ...prev, job_items: items };
      });
    },
    [findItemIndexById, setFormAndRef],
  );

  const createEmptyItem = React.useCallback(
    () => ({
      id: undefined,
      _temp_id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString() + Math.random(),
      category: "",
      enquiry_for: "",
      size: "",
      quantity: "",
      uom: "",
      binding_types: [],
      binding_targets: {
        numbering_paper_ids: [],
        perforation_paper_ids: [],
      },
      // Multiple Sheet: starts with one empty inside paper
      inside_papers: [createEmptyInsidePaper()],
      // Single Sheet: paper fields stay at item level
      paper_type: "",
      paper_gsm: "",
      color_scheme: "",
      press_type: "",
      // ── Cover fields ──
      cover_paper_type: "",
      cover_paper_gsm: "",
      cover_color_scheme: "",
      cover_press_type: "",
      cover_to_print: true, // ← ADD: cover is printed by default
      // Shared dropdowns
      available_items: [],
      available_papers: [], // shared across all inside papers
      available_gsm: [], // for Single Sheet item-level paper
      available_gsm_cover: [],
      available_bindings: [],
      available_wide_materials: [],
      wide_material_gsm: "",
      wide_material_thickness: "",
      available_wide_gsm: [],
    }),
    [],
  );

  const addItem = useCallback(() => {
    setFormAndRef((prev) => ({
      ...prev,
      job_items: [...prev.job_items, createEmptyItem()],
    }));
  }, [createEmptyItem, setFormAndRef]);

  const removeItem = useCallback((id) => {
    setFormAndRef((prev) => {
      const updatedItems = prev.job_items.filter(
        (item) => (item.id ?? item._temp_id) !== id,
      );

      const grandTotal = updatedItems.reduce(
        (sum, it) => sum + Number(it.item_total || 0),
        0,
      );

      return {
        ...prev,
        job_items: updatedItems,
        total_amount: grandTotal,
      };
    });
  }, []);

  const onSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setErr("");
      setLoading(true);

      const currentForm = formRef.current; // ← use ref, not state

      const isValidJobItems = currentForm.job_items.every(
        (item) =>
          item.quantity && item.uom && item.unit_rate && item.item_total,
      );

      if (!isValidJobItems) {
        setErr("Please complete all job items before submitting");
        setLoading(false);
        return;
      }

      const rawPayload = {
        ...currentForm,
        job_items: cleanJobItems(currentForm.job_items),
      };
      const payload = normalizePayload(rawPayload);

      try {
        if (isEditMode && existingJob?.job_no) {
          await api.put(`/api/fms/jobcards/${existingJob.job_no}`, payload);
          setSuccessMsg("✅ Job Card updated successfully!");
          setShowSuccessPopup(true);

          // ⏳ Wait 2 seconds before closing modal (after popup)
          safeTimeout(() => {
            setShowSuccessPopup(false);
            onUpdated?.(); // Now close the modal AFTER showing popup
          }, 2000);
        } else {
          const res = await api.post("/api/fms/jobcards", payload);
          setSuccessMsg("✅ Job Card created successfully!");
          setShowSuccessPopup(true);
          onCreated?.(res.data);

          // 🧹 Reset form after creation only
          setFormAndRef(EMPTY_FORM);
        }

        // 🕒 Auto-hide popup after 2 seconds
        safeTimeout(() => setShowSuccessPopup(false), 2000);
      } catch (error) {
        console.error(error);
        setErr(error.response?.data?.message || "Failed to save Job Card");
      } finally {
        setLoading(false);
      }
    },
    [isEditMode, existingJob, onCreated, onUpdated, safeTimeout, setFormAndRef],
  );

  // ✅ Add refs that shadow the state for use inside the callback
  const clientSuggestionsRef = useRef([]);
  const activeIndexRef = useRef(-1);

  // Keep them in sync
  useEffect(() => {
    clientSuggestionsRef.current = clientSuggestions;
  }, [clientSuggestions]);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // suggestion scroll feature
  const handleKeyDown = useCallback(
    async (e) => {
      const suggestions = clientSuggestionsRef.current;
      const currentIndex = activeIndexRef.current;

      if (suggestions.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1,
        );
      } else if (e.key === "Enter" && currentIndex >= 0) {
        e.preventDefault();
        const selectedName = suggestions[currentIndex];
        setFormAndRef((f) => ({ ...f, client_name: selectedName }));
        setClientSuggestions([]);
        setActiveIndex(-1);

        try {
          const { data } = await api.get(`/api/clients/${selectedName}`);
          setFormAndRef((f) => ({
            ...f,
            client_name: selectedName,
            client_type: data.client_type,
            // order_type: data.order_type,
            address: data.address || "",
            contact_number: data.contact_number || "",
            email_id: data.email_id || "",
          }));
        } catch (err) {
          console.error("Failed to fetch client details", err);
          showSoftError("Failed to fetch client details.");
        }
      } else if (e.key === "Escape") {
        setClientSuggestions([]);
        setActiveIndex(-1);
      }
    },
    [showSoftError, setFormAndRef],
  );

  // resetItemFields in Jobitem.jsx
  const resetItemFields = useCallback(
    (id, fields) => {
      setFormAndRef((prev) => {
        const index = findItemIndexById(prev.job_items, id);
        if (index === -1) return prev;
        const items = [...prev.job_items];
        items[index] = { ...items[index], ...fields };
        return { ...prev, job_items: items };
      });
    },
    [findItemIndexById, setFormAndRef],
  );

  // After resetItemFields...
  const batchItemChange = useCallback(
    (id, updates) => {
      setFormAndRef((prev) => {
        const index = findItemIndexById(prev.job_items, id);
        if (index === -1) return prev;

        const items = [...prev.job_items];
        const updatedItem = { ...items[index], ...updates };

        // Recalc total only if "Other" category totals are affected
        if (
          ("unit_rate" in updates || "quantity" in updates) &&
          updatedItem.category === "Other"
        ) {
          updatedItem.item_total =
            Number(updatedItem.quantity || 0) *
            Number(updatedItem.unit_rate || 0);
        }

        items[index] = updatedItem;

        const grandTotal = items.reduce(
          (sum, it) => sum + Number(it.item_total || 0),
          0,
        );

        return { ...prev, job_items: items, total_amount: grandTotal };
      });
    },
    [findItemIndexById, setFormAndRef],
  );

  // Edit mode: map existing DB job items to the new inside_papers structure.
  // ── REFACTORED ────────────────────────────────────────────────────────────
  // Edit-mode population. Now uses the extracted mapJobToForm and
  // loadDropdownsForMappedItems — no logic lives here anymore.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!existingJob) return;
    const { formState, mappedItems } = mapJobToForm(existingJob, { forNewJob: false });
    setFormAndRef(formState);
    loadDropdownsForMappedItems(mappedItems);
  }, [existingJob, setFormAndRef, loadDropdownsForMappedItems]);
  // ── END REFACTORED ────────────────────────────────────────────────────────

  return (
    <FormCard title="Job Card Entry">
      {showSuccessPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30 backdrop-blur-sm">
          <div className="bg-white shadow-2xl rounded-xl px-8 py-6 border border-green-200 animate-fade-in text-center">
            <h3 className="text-2xl font-semibold text-green-700 mb-2">
              🎉 Success!
            </h3>
            <p className="text-slate-600 text-sm">{successMsg}</p>
          </div>
        </div>
      )}
      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}


      {/* ── NEW: Job No Search Panel ────────────────────────────────────────
          Sits ABOVE the <form> tag — intentionally outside it so pressing
          Enter in the search input never accidentally submits the job form.
          This is purely a data-loading utility, not a form field.
      ─────────────────────────────────────────────────────────────────────── */}
      {!isEditMode && (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
            🔍 Load from Existing Job
          </p>
          <p className="text-xs text-slate-500 mb-3">
            Enter a Job No to pre-fill this form with that job's data.
              <span className="ml-1 text-blue-600 font-medium">
                Submitting will create a brand-new job.
              </span>
          </p>

          <div className="flex items-start gap-2">
            <div className="flex flex-col flex-1 max-w-xs">
              <input
                type="text"
                inputMode="numeric"
                pattern="\d*"
                value={searchJobNo}
                onChange={(e) => {
                  // Only allow digits
                  const val = e.target.value.replace(/\D/g, "");
                  setSearchJobNo(val);
                  // Clear errors as user types
                  if (searchError) setSearchError("");
                  if (searchSuccess) setSearchSuccess("");
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="e.g. 10872"
                disabled={searchLoading}
                className={`border rounded px-3 py-2 text-sm w-full transition-colors ${
                  searchError
                    ? "border-red-400 bg-red-50 focus:ring-red-300"
                    : "border-slate-300 bg-white focus:border-blue-400"
                } focus:outline-none focus:ring-2`}
                aria-label="Search by Job No"
                aria-describedby={searchError ? "search-job-error" : undefined}
              />
              {/* Inline error — shown below the input, not in a global banner */}
              {searchError && (
                <p
                  id="search-job-error"
                  className="mt-1 text-xs text-red-600 font-medium"
                  role="alert"
                >
                  {searchError}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleSearchJob}
              disabled={searchLoading || !searchJobNo.trim()}
              className={`px-4 py-2 rounded text-sm font-medium text-white transition-all
                ${
                  searchLoading || !searchJobNo.trim()
                    ? "bg-blue-300 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 active:scale-95"
                }`}
            >
              {searchLoading ? (
                <span className="flex items-center gap-1.5">
                  <svg
                    className="animate-spin h-3.5 w-3.5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8z"
                    />
                  </svg>
                  Searching…
                </span>
              ) : (
                "Load Job"
              )}
            </button>
          </div>

          {/* Success banner — auto-dismisses after 4 seconds */}
          {searchSuccess && (
            <div
              className="mt-2 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 font-medium"
              role="status"
            >
              {searchSuccess}
            </div>
          )}
        </div>
      )}
      {/* ── END NEW */}





      <form className="grid md:grid-cols-3 gap-4" onSubmit={onSubmit}>
        {/* ---------------- JOB CARD FIELDS ---------------- */}
        <Field label="Client Name" required>
          <div className="relative">
            <Input
              name="client_name"
              value={form.client_name}
              onChange={onChange}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              required
            />
            {clientSuggestions.length > 0 && (
              <ul className="absolute z-10 bg-white border border-slate-300 rounded-md shadow-md w-full max-h-40 overflow-y-auto">
                {clientSuggestions.map((name, i) => (
                  <li
                    key={name}
                    onClick={async () => {
                      setFormAndRef((f) => ({ ...f, client_name: name }));
                      setClientSuggestions([]);
                      setActiveIndex(-1);

                      try {
                        const { data } = await api.get(`/api/clients/${name}`);
                        setFormAndRef((f) => ({
                          ...f,
                          client_name: name,
                          department: data.department || "",
                          client_type: data.client_type,
                          address: data.address || "",
                          contact_number: data.contact_number || "",
                          email_id: data.email_id || "",
                        }));
                      } catch (err) {
                        console.error("Failed to fetch client details", err);
                      }
                    }}
                    className={`px-3 py-2 cursor-pointer text-sm transition-colors ${
                      i === activeIndex
                        ? "active-suggestion bg-blue-400 text-blue-700"
                        : ""
                    }`}
                  >
                    {highlightMatch(name, form.client_name)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>

        <Field label="Client department">
          <Input
            name="department"
            value={form.department}
            onChange={onChange}
          />
        </Field>

        <Field label="Reference">
          <Input name="reference" value={form.reference} onChange={onChange} />
        </Field>

        <Field label="Client Type" required>
          <Select
            name="client_type"
            value={form.client_type}
            onChange={onChange}
            required
          >
            <option value="">Select</option>
            <option>Govt</option>
            <option>Pvt</option>
            <option>Institution</option>
            <option>Other</option>
          </Select>
        </Field>

        <Field label="Email ID">
          <Input
            name="email_id"
            type="email"
            value={form.email_id}
            onChange={onChange}
          />
        </Field>

        <Field label="Contact Number" required>
          <Input
            name="contact_number"
            type="tel"
            value={form.contact_number}
            onChange={onChange}
            required
          />
        </Field>

        <Field label="Address" required>
          <textarea
            name="address"
            value={form.address}
            onChange={onChange}
            className="border border-slate-300 rounded px-3 py-2 w-full text-sm h-[2.3rem]"
            required
          />
        </Field>

        <Field label="Order Source" required>
          <Select
            name="order_source"
            value={form.order_source}
            onChange={onChange}
            required
          >
            <option value="">Select</option>
            <option>Email</option>
            <option>WhatsApp</option>
            <option>ClientReference</option>
            <option>WalkIn</option>
            <option>Call</option>
          </Select>
        </Field>

        <Field label="Order Type" required>
          <Select
            name="order_type"
            value={form.order_type}
            onChange={onChange}
            required
          >
            <option value="">Select</option>
            <option>Work Order</option>
            <option>Project Based Order</option>
            <option>Job Order</option>
          </Select>
        </Field>

        <Field label="Order Received By" required>
          <Select
            name="order_received_by"
            value={form.order_received_by}
            onChange={onChange}
            required
          >
            <option value="">Select</option>
            {users.map((u) => (
              <option key={u.id} value={u.username}>
                {u.username}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Execution Location" required>
          <Select
            name="execution_location"
            value={form.execution_location}
            onChange={onChange}
            required
          >
            <option value="">Select</option>
            <option>In-Bound</option>
            <option>Out-Bound</option>
          </Select>
        </Field>

        {form.execution_location === "Out-Bound" && (
          <>
            <Field label="Outbound Sent To (Vendor Name) " required>
              <Input
                name="outbound_sent_to"
                value={form.outbound_sent_to || ""}
                onChange={onChange}
                required
              />
            </Field>

            <Field label="Paper Ordered From" required>
              <Input
                name="paper_ordered_from"
                value={form.paper_ordered_from || ""}
                onChange={onChange}
                required
              />
            </Field>

            <Field label="MM Receiving Date" required>
              <Input
                type="date"
                name="receiving_date_for_mm"
                value={form.receiving_date_for_mm || ""}
                onChange={onChange}
                required
              />
            </Field>
          </>
        )}

        <Field label="Delivery Location" required>
          <Select
            name="delivery_location"
            value={form.delivery_location}
            onChange={onChange}
            required
          >
            <option value="">Select</option>

            <option value="EPO_TO_CUSTOMER_SHIPMENT">
              EPO → Customer (Shipment)
            </option>
            <option value="EPO_TO_CUSTOMER_PICKUP">
              EPO → Customer (Customer Pickup)
            </option>
            <option value="MM_TO_CUSTOMER_SHIPMENT">
              MM → Customer (Shipment)
            </option>
            <option value="MM_TO_CUSTOMER_PICKUP">
              MM → Customer (Customer Pickup)
            </option>
            <option value="MM_TO_EPO_TO_CUSTOMER_SHIPMENT">
              MM → EPO → Customer (Shipment)
            </option>
            <option value="MM_TO_EPO_TO_CUSTOMER_PICKUP">
              MM → EPO → Customer (Customer Pickup)
            </option>
          </Select>
        </Field>

        {form.delivery_location !== "EPO_TO_CUSTOMER_PICKUP" &&
          form.delivery_location !== "MM_TO_CUSTOMER_PICKUP" &&
          form.delivery_location !== "MM_TO_EPO_TO_CUSTOMER_PICKUP" && (
            <Field label="Delivery Address" required>
              <textarea
                name="delivery_address"
                value={form.delivery_address || ""}
                onChange={onChange}
                className="border border-slate-300 rounded px-3 py-2 w-full text-sm"
                required
              />
            </Field>
          )}

        <Field label="Delivery Date" required>
          <Input
            type="datetime-local"
            name="delivery_date"
            value={form.delivery_date}
            onChange={onChange}
            required
          />
        </Field>

        <Field label="Proof Date">
          <Input
            type="date"
            name="proof_date"
            value={form.proof_date}
            onChange={onChange}
          />
        </Field>

        <Field label="Priority" required>
          <Select
            name="task_priority"
            value={form.task_priority}
            onChange={onChange}
            required
          >
            <option value="">Select</option>
            <option>Urgent</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </Select>
        </Field>

        <Field label="Order Handled By" required>
          <Select
            name="order_handled_by"
            value={form.order_handled_by}
            onChange={onChange}
            required
          >
            <option value="">Select</option>
            {crmUsers.map((u) => (
              <option key={u.id} value={u.username}>
                {u.username}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Instructions">
          <textarea
            name="instructions"
            value={form.instructions || ""}
            onChange={onChange}
            className="border border-slate-300 rounded px-3 py-2 w-full text-sm"
          />
        </Field>

        <Field label="Production Flow">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_direct_to_production}
              onChange={(e) =>
                setFormAndRef((f) => ({
                  ...f,
                  is_direct_to_production: e.target.checked,
                }))
              }
              className="mt-1"
            />
            <div className="text-sm">
              <div className="font-medium text-slate-700">
                Direct to Production
              </div>
              <div className="text-xs text-slate-500">
                Artwork is final. Skip coordinator review and send directly to
                production.
              </div>
            </div>
          </label>
        </Field>

        <Field label="No of Files" required>
          <Input
            type="number"
            name="no_of_files"
            min="1"
            value={form.no_of_files}
            onChange={onChange}
            required
          />
        </Field>

        {/* ---------------- JOB ITEMS ---------------- */}
        <div className="md:col-span-3 mt-6">
          <h3 className="font-semibold text-blue-700 mb-3">📦 Job Items</h3>

          {form.job_items.map((item, index) => (
            <JobItem
              key={item.id || item._temp_id}
              item={item}
              index={index}
              handleItemChange={handleItemChange}
              batchItemChange={batchItemChange}
              resetItemFields={resetItemFields}
              onRemove={removeItem}
              // NEW props for inside papers in Multiple Sheet
              handleInsidePaperChange={handleInsidePaperChange}
              addInsidePaper={addInsidePaper}
              removeInsidePaper={removeInsidePaper}
            />
          ))}

          <Button
            type="button"
            className="mt-3 bg-green-600 hover:bg-green-700"
            onClick={addItem}
          >
            ➕ Add Job Item
          </Button>
        </div>

        {/* ══════════════════ BILLING SUMMARY ══════════════════ */}
        <div className="md:col-span-3 mt-4">
          <h3 className="font-semibold text-blue-700 mb-3">
            💰 Billing Summary
          </h3>

          {/* ── Input row ── */}
          <div className="grid md:grid-cols-4 gap-4">
            {/* Subtotal — read-only, auto-computed from job items */}
            <Field label="Subtotal (auto)">
              <Input
                type="number"
                name="total_amount"
                value={form.total_amount || 0}
                readOnly
                className="bg-slate-50 cursor-not-allowed"
              />
            </Field>

            {/* Discount */}
            <Field label="Discount (₹)">
              <Input
                type="number"
                name="discount"
                min="0"
                step="0.01"
                value={form.discount || ""}
                placeholder="0.00"
                onChange={(e) => {
                  const raw = e.target.value;
                  const subtotal = Number(form.total_amount || 0);
                  // Clamp: can never exceed subtotal
                  const val = raw === "" ? "" : Math.min(Number(raw), subtotal);
                  setFormAndRef((f) => ({ ...f, discount: val }));
                }}
              />
            </Field>

            {/* GST */}
            <Field label="GST">
              <Select
                name="gst_percentage"
                value={form.gst_percentage || ""}
                onChange={onChange}
              >
                <option value="">No GST</option>
                <option value="5.00">5% GST</option>
                <option value="18.00">18% GST</option>
              </Select>
            </Field>

            {/* Mode of Payment */}
            <Field label="Mode of Payment">
              <Select
                name="mode_of_payment"
                value={form.mode_of_payment}
                onChange={onChange}
              >
                <option value="">Select</option>
                <option value="upi">UPI</option>
                <option value="neft">NEFT</option>
                <option value="rtgs">RTGS</option>
                <option value="pfms">PFMS</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
              </Select>
            </Field>
          </div>

          {/* ── Live breakdown panel ── */}
          {(() => {
            const { subtotal, disc, afterDisc, gstAmount, finalAmount } =
              computeBilling(
                form.total_amount,
                form.discount,
                form.gst_percentage,
              );

            // Only show when there's something meaningful
            if (subtotal === 0 && !form.gst_percentage) return null;

            return (
              <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden text-sm">
                {/* Subtotal row */}
                <div className="flex justify-between items-center px-4 py-2.5 bg-white border-b border-slate-100">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium text-slate-700">
                    ₹
                    {subtotal.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>

                {/* Discount row — only shown when discount > 0 */}
                {disc > 0 && (
                  <div className="flex justify-between items-center px-4 py-2.5 bg-white border-b border-slate-100">
                    <span className="text-slate-500">
                      Discount
                      <span className="ml-2 text-xs text-red-500 font-medium">
                        − ₹
                        {disc.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </span>
                    <span className="font-medium text-slate-700">
                      ₹
                      {afterDisc.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}

                {/* GST row — only shown when GST is selected */}
                {form.gst_percentage && (
                  <div className="flex justify-between items-center px-4 py-2.5 bg-blue-50 border-b border-blue-100">
                    <span className="text-blue-600">
                      GST @ {form.gst_percentage}%
                      <span className="ml-1.5 text-xs text-blue-400">
                        on ₹
                        {afterDisc.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </span>
                    <span className="font-medium text-blue-700">
                      + ₹
                      {gstAmount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}

                {/* Final amount — always shown */}
                <div className="flex justify-between items-center px-4 py-3 bg-green-50">
                  <span className="font-semibold text-green-800">
                    Final Amount
                    {form.gst_percentage
                      ? ` (incl. ${form.gst_percentage}% GST)`
                      : disc > 0
                        ? " (after discount)"
                        : ""}
                  </span>
                  <span className="text-xl font-bold text-green-700">
                    ₹
                    {finalAmount.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* ── Payment fields row ── */}
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <Field label="Advance Payment (₹)">
              <Input
                type="number"
                min="0"
                step="0.01"
                name="advance_payment"
                value={form.advance_payment || ""}
                placeholder="0.00"
                onChange={onChange}
              />
            </Field>

            <Field label="Payment Status">
              <Select
                name="payment_status"
                value={form.payment_status}
                onChange={onChange}
              >
                <option value="">Select</option>
                <option>Paid</option>
                <option>Half Paid</option>
                <option>Un-paid</option>
              </Select>
            </Field>
          </div>
        </div>

        {/* ══════════════════ SUBMIT ══════════════════ */}
        <div className="md:col-span-3 mt-6 mx-auto">
          <Button type="submit" disabled={loading}>
            {loading
              ? isEditMode
                ? "Saving..."
                : "Creating..."
              : isEditMode
                ? "Save Changes"
                : "Create Job Card"}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}
