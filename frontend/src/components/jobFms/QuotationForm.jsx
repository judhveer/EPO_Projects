import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  memo,
} from "react";
import api from "../../lib/api.js";
import { createEmptyInsidePaper } from "./utils/jobHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const FIRM_DATA = {
  "Eastern Panorama Offset": {
    displayName: "EASTERN PANORAMA OFFSET",
    tagline: "QUALITY GUARANTEED",
    address: "2nd Floor, RPG Complex, Keating Road, Shillong - 793001",
    phone: "0364 - 2504885",
    email: "office@easternpanorama.in",
    gst: "18AAGPE0778A1Z4",
    regLine1: "Government Registered Enterprise",
    regLine2: "ISO 9001:2015 Certified",
    rgb: [14, 59, 134],
    lightRgb: [219, 234, 254],
  },
  "Darilin Tang": {
    displayName: "DARILIN TANG",
    tagline: "Printing & Publishing Solutions",
    address: "Shillong, Meghalaya - 793001",
    phone: "", email: "", gst: "", regLine1: "", regLine2: "",
    rgb: [15, 118, 110], lightRgb: [204, 251, 241],
  },
  "MM Enterprise": {
    displayName: "MM ENTERPRISE",
    tagline: "Your Trusted Printing Partner",
    address: "Shillong, Meghalaya - 793001",
    phone: "", email: "", gst: "", regLine1: "", regLine2: "",
    rgb: [91, 33, 182], lightRgb: [237, 233, 254],
  },
  "Hill Publication": {
    displayName: "HILL PUBLICATION",
    tagline: "Words Worth Publishing",
    address: "Shillong, Meghalaya - 793001",
    phone: "", email: "", gst: "", regLine1: "", regLine2: "",
    rgb: [154, 52, 18], lightRgb: [255, 237, 213],
  },
};

const PRESS_TYPES = [
  { value: "DIGITAL BLACK WHITE", label: "Digital Black & White" },
  { value: "DIGITAL MULTICOLOR",  label: "Digital Multicolor"   },
  { value: "HMT BLACK WHITE",     label: "HMT Black & White"    },
  { value: "HMT MULTICOLOR",      label: "HMT Multicolor"       },
  { value: "AUTOPRINT",           label: "Autoprint"            },
  { value: "FLEX MACHINE",        label: "Flex Machine"         },
  { value: "PLOTTER BLACK WHITE", label: "Plotter Black & White"},
  { value: "PLOTTER MULTICOLOR",  label: "Plotter Multicolor"   },
];

const CALC_TRIGGER_FIELDS = new Set([
  "quantity","size","enquiry_for","sides","uom",
  "paper_type","paper_gsm","press_type","color_scheme",
  "inside_pages","cover_paper_type","cover_paper_gsm","cover_pages",
  "cover_press_type","cover_to_print","cover_color_scheme",
  "wide_material_name","wide_material_gsm","wide_material_thickness",
  "binding_types","binding_targets","creases_per_sheet","folds_per_sheet",
]);

const INSIDE_PAPER_TRIGGER = new Set([
  "paper_type","paper_gsm","to_print","color_scheme","press_type",
]);

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const getAllowedPressTypes = (colorScheme, category, paperType = "") => {
  if (category === "Wide Format")
    return PRESS_TYPES.filter((p) => p.value === "FLEX MACHINE");
  if (paperType === "Maplitho Plotter Paper" || paperType === "Photo Plotter Paper") {
    if (colorScheme === "Black and White")
      return PRESS_TYPES.filter((p) => p.value === "PLOTTER BLACK WHITE");
    if (colorScheme === "Multicolor")
      return PRESS_TYPES.filter((p) => p.value === "PLOTTER MULTICOLOR");
  }
  if (colorScheme === "Black and White")
    return PRESS_TYPES.filter((p) =>
      ["DIGITAL BLACK WHITE","HMT BLACK WHITE","AUTOPRINT"].includes(p.value));
  if (colorScheme === "Multicolor")
    return PRESS_TYPES.filter((p) =>
      ["DIGITAL MULTICOLOR","HMT MULTICOLOR"].includes(p.value));
  return [];
};

// Mirrors JobItem's isBindingDisabled — prevents selecting mutually exclusive bindings
// (e.g. Gloss + Matt lamination on same side)
const isBindingDisabled = (bindingName, selectedBindings = []) => {
  const groups = [
    [
      "Gloss Lamination (Single Side)", "Gloss Lamination (Both Side)",
      "Matt Lamination (Single Side)",  "Matt Lamination (Both Side)",
    ],
    ["Tin Mounting (single Side)", "Tin Mounting (both Side)"],
  ];
  for (const group of groups) {
    const selected = selectedBindings.find((b) => group.includes(b));
    if (selected && selected !== bindingName && group.includes(bindingName))
      return true;
  }
  return false;
};

// Mirrors JobItem's validateSize
const validateSize = (value, availableSizes, category) => {
  if (!value) return false;
  const match = value.trim().toLowerCase()
    .match(/^(\d+(\.\d+)?)x(\d+(\.\d+)?)\s?(mm|cm|in|ft)$/);
  if (match) {
    const unit = match[5];
    if (category !== "Wide Format" && unit === "ft") return false;
    return true;
  }
  if (Array.isArray(availableSizes) && availableSizes.some((opt) => opt.name === value))
    return true;
  return false;
};

const isItemReady = (item) => {
  if (item.category === "Other") return false;
  if (!item.quantity || !item.size || !item.enquiry_for) return false;
  switch (item.category) {
    case "Single Sheet":
      return !!(item.paper_type && item.paper_gsm);
    case "Multiple Sheet": {
      const fp = item.inside_papers?.[0];
      return !!(
        fp?.paper_type && fp?.paper_gsm &&
        item.inside_pages &&
        item.cover_paper_type && item.cover_paper_gsm && item.cover_pages
      );
    }
    case "Wide Format":
      return !!item.wide_material_name;
    default:
      return false;
  }
};

const computeBilling = (totalAmount, discount, gstPct) => {
  const subtotal    = parseFloat(Number(totalAmount || 0).toFixed(2));
  const disc        = parseFloat(Math.min(Number(discount || 0), subtotal).toFixed(2));
  const afterDisc   = parseFloat((subtotal - disc).toFixed(2));
  const rate        = gstPct ? Number(gstPct) : 0;
  const gstAmount   = parseFloat(((afterDisc * rate) / 100).toFixed(2));
  const finalAmount = parseFloat((afterDisc + gstAmount).toFixed(2));
  return { subtotal, disc, afterDisc, gstAmount, finalAmount };
};

const inr = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const createEmptyItem = () => ({
  _temp_id:                crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`,
  category:                "",
  enquiry_for:             "",
  size:                    "",
  sides:                   "",
  quantity:                "",
  uom:                     "",
  paper_type:              "",
  paper_gsm:               "",
  color_scheme:            "",
  press_type:              "",
  inside_papers:           [createEmptyInsidePaper()],
  inside_pages:            "",
  cover_paper_type:        "",
  cover_paper_gsm:         "",
  cover_pages:             "",
  cover_color_scheme:      "",
  cover_press_type:        "",
  cover_to_print:          true,
  wide_material_name:      "",
  wide_material_gsm:       "",
  wide_material_thickness: "",
  binding_types:           [],
  binding_targets:         { numbering_paper_ids: [], perforation_paper_ids: [] },
  creases_per_sheet:       "",
  folds_per_sheet:         "",
  available_items:         [],
  available_papers:        [],
  available_gsm:           [],
  available_gsm_cover:     [],
  available_wide_materials:[],
  available_wide_gsm:      [],
  available_bindings:      [],
  available_sizes:         [],
  // ── Calculation state ─────────────────────────────────────────────────────
  unit_rate:               null,
  item_total:              null,
  is_calculating:          false,  // ← shows spinner, empties fields
  calc_error:              null,   // ← inline error banner inside item card
});

const stripUiFields = (item) => {
  const {
    available_items, available_papers, available_gsm, available_gsm_cover,
    available_wide_materials, available_wide_gsm, _temp_id, available_sizes,
    available_bindings, is_calculating, calc_error,
    ...rest
  } = item;
  if (Array.isArray(rest.inside_papers)) {
    rest.inside_papers = rest.inside_papers.map(({
      available_gsm: _ag,
      ups:_u, effective_ups:_eu, sheets:_sh, sheets_with_wastage:_shw,
      sheet_rate:_sr, sheet_cost:_sc, printing_cost:_pc,
      best_sheet_size_name:_bssn, best_sheet_name:_bsn, best_sheet_dims:_bd,
      ...p
    }) => p);
  }
  return rest;
};

// ─────────────────────────────────────────────────────────────────────────────
// CalcErrorBanner — mirrors JobItem exactly
// ─────────────────────────────────────────────────────────────────────────────
const CalcErrorBanner = ({ message }) => {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-700"
    >
      <svg
        className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-4.75a.75.75 0 001.5 0v-4.5a.75.75 0 00-1.5 0v4.5zm.75-7a.75.75 0 100 1.5.75.75 0 000-1.5z"
          clipRule="evenodd"
        />
      </svg>
      <div>
        <p className="font-semibold">Calculation Error</p>
        <p className="mt-0.5 text-xs text-red-600">{message}</p>
        <p className="mt-0.5 text-xs text-red-500">
          Unit rate and item total have been cleared. Fix the issue above and the
          form will recalculate automatically.
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// QuotationItem
// ─────────────────────────────────────────────────────────────────────────────
const QuotationItem = memo(function QuotationItem({
  item,
  index,
  onChange,
  onInsidePaperChange,
  onAddInsidePaper,
  onRemoveInsidePaper,
  onRemove,
  onResetFields,   // ← new: for press_type reset on color change (mirrors resetItemFields)
}) {
  const { category } = item;
  const key = item._temp_id ?? item.id;

  const allowedPressTypes = useMemo(
    () => getAllowedPressTypes(item.color_scheme, category, item.paper_type),
    [item.color_scheme, category, item.paper_type],
  );

  const allowedCoverPressTypes = useMemo(() => {
    if (category !== "Multiple Sheet" || item.cover_to_print === false) return [];
    return getAllowedPressTypes(item.cover_color_scheme, "Multiple Sheet");
  }, [category, item.cover_color_scheme, item.cover_to_print]);

  // Mirror JobItem's useEffect — auto-clear press_type when color changes
  // and the current press_type is no longer in the allowed list
  useEffect(() => {
    const resets = {};
    if (
      category !== "Multiple Sheet" &&
      item.press_type &&
      !allowedPressTypes.some((p) => p.value === item.press_type)
    ) {
      resets.press_type = "";
    }
    if (
      category === "Multiple Sheet" &&
      item.cover_to_print !== false &&
      item.cover_press_type &&
      !allowedCoverPressTypes.some((p) => p.value === item.cover_press_type)
    ) {
      resets.cover_press_type = "";
    }
    if (Object.keys(resets).length > 0) {
      onResetFields(key, resets);
    }
  }, [
    category, item.color_scheme, item.cover_color_scheme, item.cover_to_print,
    item.press_type, item.cover_press_type,
    allowedPressTypes, allowedCoverPressTypes,
    key, onResetFields,
  ]);

  const isCalculated = item.unit_rate != null && item.item_total != null;
  const isCalc       = item.is_calculating;

  const field = (label, required, children) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );

  const inp = (props) => (
    <input
      {...props}
      className={`border border-slate-200 rounded-lg px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all ${
        props.readOnly ? "bg-slate-50 text-slate-600 cursor-not-allowed" : ""
      } ${props.className || ""}`}
    />
  );

  const sel = (props) => (
    <select
      {...props}
      className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
    />
  );

  const thicknessMaterials = [
    "Acrylic Export","Acrylic Indiana","Sun Board","ACP Board","Sun Board With Vinyl",
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-700 to-slate-600">
        <span className="text-sm font-semibold text-white tracking-wide">
          ITEM {index + 1}
          {item.enquiry_for && (
            <span className="ml-2 text-slate-300 font-normal">— {item.enquiry_for}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => onRemove(key)}
          className="text-slate-400 hover:text-red-400 transition-colors text-lg leading-none"
        >
          ✕
        </button>
      </div>

      {/* ── Inline calc error — shown at TOP of item body, mirrors JobItem ── */}
      {item.calc_error && (
        <div className="px-4 pt-3">
          <CalcErrorBanner message={item.calc_error} />
        </div>
      )}

      <div className="p-4 grid md:grid-cols-3 gap-3">

        {/* Category */}
        {field("Category", true,
          sel({
            value: category,
            onChange: (e) => onChange(key, "category", e.target.value),
            children: (
              <>
                <option value="">Select Category</option>
                <option>Single Sheet</option>
                <option>Multiple Sheet</option>
                <option>Wide Format</option>
                <option>Other</option>
              </>
            ),
          }),
        )}

        {/* Item Name */}
        {field("Item Name", true,
          <div className="relative">
            {inp({
              list: `enquiry-${index}`,
              value: item.enquiry_for,
              onChange: (e) => onChange(key, "enquiry_for", e.target.value),
              placeholder: "e.g. Table Calendar",
            })}
            <datalist id={`enquiry-${index}`}>
              {(item.available_items || []).map((o) => (
                <option key={o.id} value={o.item_name} />
              ))}
            </datalist>
          </div>,
        )}

        {/* Size — with validation, mirrors JobItem */}
        {field("Size", true,
          <div className="relative">
            <input
              list={`size-${index}`}
              value={item.size}
              onChange={(e) => {
                const val = e.target.value;
                onChange(key, "size", val);
                if (category === "Other") {
                  e.target.setCustomValidity("");
                } else if (!validateSize(val, item.available_sizes, category)) {
                  e.target.setCustomValidity(
                    category === "Wide Format"
                      ? "Use format: 2x3 ft (or mm/cm/in)"
                      : "Use format: 2x3 mm | 2x3 cm | 2x3 in (ft not allowed)",
                  );
                } else {
                  e.target.setCustomValidity("");
                }
              }}
              onInvalid={(e) => {
                if (category !== "Other") {
                  e.target.setCustomValidity(
                    category === "Wide Format"
                      ? "Use format: 2x3 ft (or mm/cm/in)"
                      : "Use format: 2x3 mm | 2x3 cm | 2x3 in (ft not allowed)",
                  );
                }
              }}
              placeholder={
                category === "Other"
                  ? "e.g. Small, Large..."
                  : category === "Wide Format"
                  ? "e.g. 3x4 ft"
                  : "e.g. A4 or 4x6 in"
              }
              className={`border rounded-lg px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all ${
                category !== "Other" &&
                item.size &&
                !validateSize(item.size, item.available_sizes, category)
                  ? "border-red-400"
                  : "border-slate-200"
              }`}
            />
            <datalist id={`size-${index}`}>
              {(item.available_sizes || []).map((o) => (
                <option key={o.id} value={o.name} />
              ))}
            </datalist>
          </div>,
        )}

        {/* ── Single Sheet ── */}
        {category === "Single Sheet" && item.enquiry_for && (
          <>
            {field("Paper Type", true,
              sel({
                value: item.paper_type,
                onChange: (e) => onChange(key, "paper_type", e.target.value),
                children: (
                  <>
                    <option value="">Select Paper</option>
                    {(item.available_papers || []).map((p) => (
                      <option key={p.paper_name} value={p.paper_name}>{p.paper_name}</option>
                    ))}
                  </>
                ),
              }),
            )}
            {item.paper_type && field("GSM", true,
              sel({
                value: item.paper_gsm,
                onChange: (e) => onChange(key, "paper_gsm", e.target.value),
                children: (
                  <>
                    <option value="">Select GSM</option>
                    {(item.available_gsm || []).map((g) => (
                      <option key={g.id} value={g.gsm}>
                        {g.gsm}{g.size_category ? ` (${g.size_category})` : ""}
                      </option>
                    ))}
                  </>
                ),
              }),
            )}
            {field("Color Scheme", true,
              sel({
                value: item.color_scheme,
                onChange: (e) => onChange(key, "color_scheme", e.target.value),
                children: (
                  <>
                    <option value="">Select</option>
                    <option>Black and White</option>
                    <option>Multicolor</option>
                  </>
                ),
              }),
            )}
            {item.color_scheme && field("Press Machine", true,
              sel({
                value: item.press_type,
                onChange: (e) => onChange(key, "press_type", e.target.value),
                children: (
                  <>
                    <option value="">Select</option>
                    {allowedPressTypes.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </>
                ),
              }),
            )}
          </>
        )}

        {/* ── Wide Format ── */}
        {category === "Wide Format" && (
          <>
            {field("Material", true,
              sel({
                value: item.wide_material_name,
                onChange: (e) => onChange(key, "wide_material_name", e.target.value),
                children: (
                  <>
                    <option value="">Select Material</option>
                    {(item.available_wide_materials || []).map((m) => (
                      <option key={m.material_name} value={m.material_name}>{m.material_name}</option>
                    ))}
                  </>
                ),
              }),
            )}
            {item.wide_material_name &&
              (item.available_wide_gsm || []).some((m) => m.gsm !== null || m.thickness_mm !== null) &&
              field("GSM / Thickness", true,
                sel({
                  value: item.wide_material_gsm || item.wide_material_thickness || "",
                  onChange: (e) => {
                    const isThickness = thicknessMaterials.includes(item.wide_material_name);
                    onChange(key, isThickness ? "wide_material_thickness" : "wide_material_gsm", e.target.value);
                  },
                  children: (
                    <>
                      <option value="">Select</option>
                      {(item.available_wide_gsm || [])
                        .filter((m) => m.gsm !== null || m.thickness_mm !== null)
                        .map((m) => {
                          const v = m.gsm ?? m.thickness_mm;
                          return <option key={m.id} value={v}>{v}</option>;
                        })}
                    </>
                  ),
                }),
              )}
          </>
        )}

        {/* ── Multiple Sheet ── */}
        {category === "Multiple Sheet" && (
          <div className="md:col-span-3 space-y-3">
            <div className="grid md:grid-cols-3 gap-3">
              {field("Inside Pages", true,
                inp({
                  type: "number", min: "1",
                  value: item.inside_pages,
                  onChange: (e) => onChange(key, "inside_pages", e.target.value),
                  placeholder: "e.g. 200",
                }),
              )}
            </div>

            {/* Inside papers loop */}
            {(item.inside_papers || []).map((paper, pIdx) => {
              const paperPressTypes = getAllowedPressTypes(paper.color_scheme, "Multiple Sheet");
              return (
                <div key={paper._id} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                      Inside Paper {pIdx + 1}
                    </span>
                    {(item.inside_papers || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveInsidePaper(key, paper._id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  <div className="grid md:grid-cols-3 gap-3">
                    {field("Paper Type", true,
                      sel({
                        value: paper.paper_type,
                        onChange: (e) => onInsidePaperChange(key, paper._id, "paper_type", e.target.value),
                        children: (
                          <>
                            <option value="">Select Paper</option>
                            {(item.available_papers || []).map((p) => (
                              <option key={p.paper_name} value={p.paper_name}>{p.paper_name}</option>
                            ))}
                          </>
                        ),
                      }),
                    )}
                    {paper.paper_type && field("GSM", true,
                      sel({
                        value: paper.paper_gsm,
                        onChange: (e) => onInsidePaperChange(key, paper._id, "paper_gsm", e.target.value),
                        children: (
                          <>
                            <option value="">Select GSM</option>
                            {(paper.available_gsm || []).map((g) => (
                              <option key={g.id} value={g.gsm}>{g.gsm}</option>
                            ))}
                          </>
                        ),
                      }),
                    )}
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={paper.to_print || false}
                          onChange={(e) => onInsidePaperChange(key, paper._id, "to_print", e.target.checked)}
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className="text-slate-700 text-xs">Send to press</span>
                      </label>
                    </div>
                    {paper.to_print && (
                      <>
                        {field("Color Scheme", true,
                          sel({
                            value: paper.color_scheme,
                            onChange: (e) => onInsidePaperChange(key, paper._id, "color_scheme", e.target.value),
                            children: (
                              <>
                                <option value="">Select</option>
                                <option>Black and White</option>
                                <option>Multicolor</option>
                              </>
                            ),
                          }),
                        )}
                        {field("Press Machine", true,
                          sel({
                            value: paper.press_type,
                            onChange: (e) => onInsidePaperChange(key, paper._id, "press_type", e.target.value),
                            children: (
                              <>
                                <option value="">Select</option>
                                {paperPressTypes.map((p) => (
                                  <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                              </>
                            ),
                          }),
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {(item.inside_papers || []).length < 4 && (
              <button
                type="button"
                onClick={() => onAddInsidePaper(key)}
                className="text-sm text-blue-600 border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
              >
                ➕ Add Inside Paper
              </button>
            )}

            {/* Cover paper */}
            <div className="grid md:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
              {field("Cover Paper Type", true,
                sel({
                  value: item.cover_paper_type,
                  onChange: (e) => onChange(key, "cover_paper_type", e.target.value),
                  children: (
                    <>
                      <option value="">Select Paper</option>
                      {(item.available_papers || []).map((p) => (
                        <option key={p.paper_name} value={p.paper_name}>{p.paper_name}</option>
                      ))}
                    </>
                  ),
                }),
              )}
              {item.cover_paper_type && field("Cover GSM", true,
                sel({
                  value: item.cover_paper_gsm,
                  onChange: (e) => onChange(key, "cover_paper_gsm", e.target.value),
                  children: (
                    <>
                      <option value="">Select GSM</option>
                      {(item.available_gsm_cover || []).map((g) => (
                        <option key={g.id} value={g.gsm}>{g.gsm}</option>
                      ))}
                    </>
                  ),
                }),
              )}
              {field("Cover Pages", true,
                sel({
                  value: item.cover_pages,
                  onChange: (e) => onChange(key, "cover_pages", e.target.value),
                  children: (
                    <>
                      <option value="">Select</option>
                      <option>2</option>
                      <option>4</option>
                    </>
                  ),
                }),
              )}
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={item.cover_to_print !== false}
                    onChange={(e) => onChange(key, "cover_to_print", e.target.checked)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-slate-700 text-xs">Print cover</span>
                </label>
              </div>
              {item.cover_to_print !== false && (
                <>
                  {field("Cover Color", true,
                    sel({
                      value: item.cover_color_scheme,
                      onChange: (e) => onChange(key, "cover_color_scheme", e.target.value),
                      children: (
                        <>
                          <option value="">Select</option>
                          <option>Black and White</option>
                          <option>Multicolor</option>
                        </>
                      ),
                    }),
                  )}
                  {field("Cover Press", true,
                    sel({
                      value: item.cover_press_type,
                      onChange: (e) => onChange(key, "cover_press_type", e.target.value),
                      children: (
                        <>
                          <option value="">Select</option>
                          {allowedCoverPressTypes.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </>
                      ),
                    }),
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Bindings — mirrors JobItem with isBindingDisabled ── */}
        {category !== "Other" && (item.available_bindings || []).length > 0 && (
          <div className="md:col-span-3 space-y-2">
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Binding / Finishing
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {(item.available_bindings || []).map((b) => {
                  const checked  = (item.binding_types || []).includes(b.binding_name);
                  const disabled = isBindingDisabled(b.binding_name, item.binding_types);
                  return (
                    <label
                      key={b.binding_name}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                        disabled
                          ? "opacity-40 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400"
                          : checked
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => !disabled && onChange(key, "binding_type_toggle", b.binding_name)}
                        className="sr-only"
                      />
                      {b.binding_name}
                    </label>
                  );
                })}
              </div>

              {/* Creasing */}
              {(item.binding_types || []).some((b) => b.toLowerCase().includes("creasing")) &&
                category === "Single Sheet" && (
                  <div className="mt-2 max-w-[200px]">
                    {field("Creases Per Sheet", false,
                      inp({
                        type: "number", min: "1",
                        value: item.creases_per_sheet || "",
                        onChange: (e) => onChange(key, "creases_per_sheet", e.target.value),
                        placeholder: "e.g. 2",
                      }),
                    )}
                  </div>
                )}

              {/* Folding */}
              {(item.binding_types || []).some((b) => b.toLowerCase().includes("folding")) &&
                category === "Single Sheet" && (
                  <div className="mt-2 max-w-[200px]">
                    {field("Folds Per Sheet", false,
                      inp({
                        type: "number", min: "1",
                        value: item.folds_per_sheet || "",
                        onChange: (e) => onChange(key, "folds_per_sheet", e.target.value),
                        placeholder: "e.g. 1",
                      }),
                    )}
                  </div>
                )}

              {/* Numbering / Perforation targets — Multiple Sheet with ≥2 papers */}
              {category === "Multiple Sheet" && (item.inside_papers || []).length >= 2 && (
                <>
                  {(item.binding_types || []).some((b) => b.toLowerCase().includes("numbering")) && (
                    <div className="mt-3 pt-2 border-t border-slate-200">
                      <p className="text-xs font-medium text-slate-500 mb-1.5">
                        Apply Numbering to which inside papers?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(item.inside_papers || []).map((paper, pIdx) => {
                          const checked = (item.binding_targets?.numbering_paper_ids || []).includes(paper._id);
                          return (
                            <label
                              key={paper._id}
                              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs cursor-pointer select-none ${
                                checked
                                  ? "bg-indigo-600 border-indigo-600 text-white"
                                  : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => onChange(key, "binding_target_numbering", paper._id)}
                                className="sr-only"
                              />
                              Inside Paper {pIdx + 1}
                              {paper.paper_type ? ` (${paper.paper_type})` : ""}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(item.binding_types || []).some((b) => b.toLowerCase().includes("perforation")) && (
                    <div className="mt-3 pt-2 border-t border-slate-200">
                      <p className="text-xs font-medium text-slate-500 mb-1.5">
                        Apply Perforation to which inside papers?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(item.inside_papers || []).map((paper, pIdx) => {
                          const checked = (item.binding_targets?.perforation_paper_ids || []).includes(paper._id);
                          return (
                            <label
                              key={paper._id}
                              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs cursor-pointer select-none ${
                                checked
                                  ? "bg-rose-600 border-rose-600 text-white"
                                  : "bg-white border-slate-200 text-slate-600 hover:border-rose-300"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => onChange(key, "binding_target_perforation", paper._id)}
                                className="sr-only"
                              />
                              Inside Paper {pIdx + 1}
                              {paper.paper_type ? ` (${paper.paper_type})` : ""}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(item.binding_types || []).some((b) => b.toLowerCase().includes("interleaf")) && (
                    <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-700">
                      ℹ️ Interleaf applies to all {(item.inside_papers || []).length} inside papers automatically.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Common bottom row ── */}
        {category !== "Other" &&
          field("Sides", true,
            sel({
              value: item.sides,
              onChange: (e) => onChange(key, "sides", e.target.value),
              children: (
                <>
                  <option value="">Select</option>
                  <option>Single Side</option>
                  <option>Both Side</option>
                </>
              ),
            }),
          )}

        {field("Quantity", true,
          inp({
            type: "number", min: "1",
            value: item.quantity,
            onChange: (e) => onChange(key, "quantity", e.target.value),
            placeholder: "e.g. 100",
          }),
        )}

        {field("UOM", true,
          sel({
            value: item.uom,
            onChange: (e) => onChange(key, "uom", e.target.value),
            children: (
              <>
                <option value="">Select</option>
                <option>Nos</option>
                <option>Pc</option>
                <option>Copies</option>
                <option>Books</option>
                <option>Sheets</option>
              </>
            ),
          }),
        )}

        {category === "Other" && field("Unit Rate (₹)", true,
          inp({
            type: "number",
            value: item.unit_rate ?? "",
            onChange: (e) => onChange(key, "unit_rate_manual", e.target.value),
          }),
        )}
      </div>

      {/* ── Calculated result strip — unit rate + item total ── */}
      {/* Mirrors JobItem: empty when is_calculating, shown when calculated */}
      {isCalc && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 text-xs text-blue-600 flex items-center gap-2">
          <svg className="h-3.5 w-3.5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Calculating…
        </div>
      )}

      {!isCalc && isCalculated && (
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-t border-emerald-100 flex flex-wrap gap-6 items-center">
          <div>
            <span className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Unit Rate</span>
            <p className="text-lg font-bold text-emerald-700">{inr(item.unit_rate)}</p>
          </div>
          <div>
            <span className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Item Total</span>
            <p className="text-lg font-bold text-emerald-700">{inr(item.item_total)}</p>
          </div>
          <div className="ml-auto text-xs text-emerald-500 italic">✓ Calculated</div>
        </div>
      )}

      {!isCalc && !isCalculated && !item.calc_error && isItemReady(item) && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 text-xs text-amber-600 animate-pulse">
          ⏳ Calculating…
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function QuotationForm() {
  const [clientName,    setClientName]    = useState("");
  const [department,    setDepartment]    = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [items,         setItems]         = useState([createEmptyItem()]);
  const [discount,      setDiscount]      = useState("");
  const [gstPct,        setGstPct]        = useState("");
  const [selectedFirm,  setSelectedFirm]  = useState("Eastern Panorama Offset");
  const [generating,    setGenerating]    = useState(false);
  const [downloadErr,   setDownloadErr]   = useState(""); // page-level: only for PDF download errors

  const [saving,     setSaving]     = useState(false);
  const [savedRefNo, setSavedRefNo] = useState(null);

  const itemsRef  = useRef(items);
  const calcTimers   = useRef({});
  const abortControllers = useRef(new Map()); // ← per-item AbortControllers

  const setItemsAndRef = useCallback((updater) => {
    setItems((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      itemsRef.current = next;
      return next;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(calcTimers.current).forEach(clearTimeout);
      abortControllers.current.forEach((ctrl) => ctrl.abort());
      abortControllers.current.clear();
    };
  }, []);

  const patchItem = useCallback((key, patch) => {
    setItemsAndRef((prev) =>
      prev.map((it) =>
        (it._temp_id === key || it.id === key) ? { ...it, ...patch } : it,
      ),
    );
  }, [setItemsAndRef]);

  // ── Loaders ───────────────────────────────────────────────────────────────

  const loadBindings = useCallback(async (key, category) => {
    if (!category || category === "Other") return;
    try {
      const { data } = await api.get(`/api/fms/items/bindings?category=${category}`);
      patchItem(key, { available_bindings: data });
    } catch { /* silent */ }
  }, [patchItem]);

  const loadCategoryItems = useCallback(async (key, cat) => {
    try {
      const { data } = await api.get(`/api/fms/items/by-category?category=${cat}`);
      patchItem(key, {
        available_items: data,
        enquiry_for: "", size: "", sides: "", quantity: "",
        paper_type: "", paper_gsm: "", color_scheme: "", press_type: "",
        wide_material_name: "", wide_material_gsm: "", wide_material_thickness: "",
        inside_papers: [createEmptyInsidePaper()],
        inside_pages: "", cover_paper_type: "", cover_paper_gsm: "",
        cover_pages: "", cover_color_scheme: "", cover_press_type: "",
        cover_to_print: true, unit_rate: null, item_total: null,
        is_calculating: false, calc_error: null,
        available_gsm: [], available_gsm_cover: [],
        available_wide_materials: [], available_wide_gsm: [],
        binding_types: [],
        binding_targets: { numbering_paper_ids: [], perforation_paper_ids: [] },
        creases_per_sheet: "", folds_per_sheet: "", available_bindings: [],
      });
    } catch { /* silent */ }
    if (cat === "Wide Format") {
      try {
        const { data } = await api.get("/api/fms/items/wide-materials");
        patchItem(key, { available_wide_materials: data });
      } catch { /* silent */ }
    }
    loadBindings(key, cat);
  }, [patchItem, loadBindings]);

  const loadPapers = useCallback(async (key) => {
    try {
      const { data } = await api.get("/api/fms/items/paper-types");
      patchItem(key, { available_papers: data });
    } catch { /* silent */ }
  }, [patchItem]);

  const loadGsm = useCallback(async (key, paperName, type = "inside") => {
    try {
      const { data } = await api.get(`/api/fms/items/paper-types/gsm?paperName=${paperName}`);
      patchItem(key, type === "inside" ? { available_gsm: data } : { available_gsm_cover: data });
    } catch { /* silent */ }
  }, [patchItem]);

  const loadInsidePaperGsm = useCallback(async (key, paperId, paperName) => {
    try {
      const { data } = await api.get(`/api/fms/items/paper-types/gsm?paperName=${paperName}`);
      setItemsAndRef((prev) =>
        prev.map((it) => {
          if ((it._temp_id ?? it.id) !== key) return it;
          const papers = (it.inside_papers || []).map((p) =>
            p._id === paperId ? { ...p, available_gsm: data, paper_gsm: "" } : p,
          );
          return { ...it, inside_papers: papers };
        }),
      );
    } catch { /* silent */ }
  }, [setItemsAndRef]);

  const loadWideMaterialGsm = useCallback(async (key, materialName) => {
    try {
      const { data } = await api.get(`/api/fms/items/wide-materials/gsm?materialName=${materialName}`);
      patchItem(key, { available_wide_gsm: data });
    } catch { /* silent */ }
  }, [patchItem]);

  const loadSizes = useCallback(async (key, search) => {
    try {
      const { data } = await api.get(`/api/fms/items/sizes?search=${search}`);
      patchItem(key, { available_sizes: data });
    } catch { /* silent */ }
  }, [patchItem]);

  // ── Backend calculation — now with AbortController + per-item error ────────
  const calculateItem = useCallback(async (key) => {
    const latestItems = itemsRef.current;
    const item = latestItems.find((it) => (it._temp_id ?? it.id) === key);
    if (!item || !isItemReady(item)) return;

    // Cancel any in-flight request for this item
    const prev = abortControllers.current.get(key);
    if (prev) prev.abort();
    const controller = new AbortController();
    abortControllers.current.set(key, controller);

    // Mark as calculating — empties unit rate / item total in UI
    patchItem(key, { is_calculating: true, calc_error: null });

    const cleaned    = latestItems.map(stripUiFields);
    let itemToSend   = { ...stripUiFields(item), unit_rate: null, item_total: null };

    if (item.category === "Multiple Sheet" && item.inside_papers?.length > 0) {
      const fp = item.inside_papers[0];
      itemToSend = {
        ...itemToSend,
        paper_type:        fp.paper_type,
        paper_gsm:         fp.paper_gsm,
        color_scheme:      fp.to_print ? fp.color_scheme : "",
        inside_press_type: fp.to_print ? fp.press_type   : "",
      };
    }

    try {
      const { data } = await api.post(
        "/api/fms/items/calculate-item",
        { item: itemToSend, all_items: cleaned },
        { signal: controller.signal },
      );

      abortControllers.current.delete(key);

      setItemsAndRef((prev) =>
        prev.map((it) => {
          if ((it._temp_id ?? it.id) !== key) return it;

          let mergedPapers = it.inside_papers;
          if (data.inside_papers_results?.length) {
            mergedPapers = (it.inside_papers || []).map((p, pIdx) => {
              const res = data.inside_papers_results[pIdx];
              if (!res) return p;
              return {
                ...p,
                selected_paper_id:    res.selected_paper_id,
                ups:                  res.ups,
                effective_ups:        res.effective_ups,
                sheets:               res.sheets,
                sheets_with_wastage:  res.sheets_with_wastage,
                sheet_rate:           res.sheet_rate,
                sheet_cost:           res.sheet_cost,
                printing_cost:        res.printing_cost,
                best_sheet_size_name: res.best_sheet_size_name,
                best_sheet_name:      res.best_sheet_name,
                best_sheet_dims:      res.best_sheet_dims,
              };
            });
          }

          return {
            ...it,
            unit_rate:      data.totals.unit_rate,
            item_total:     data.totals.item_total,
            is_calculating: false,
            calc_error:     null,
            inside_papers:  mergedPapers,
          };
        }),
      );
    } catch (e) {
      // Aborted — user changed a field before response came back, ignore silently
      if (
        e.name === "AbortError" ||
        e.name === "CanceledError" ||
        e.code === "ERR_CANCELED"
      ) return;

      abortControllers.current.delete(key);

      const errorMsg =
        e?.response?.data?.message ||
        "Calculation failed. Please check the selected paper, size, and press type.";

      // Clear totals + set inline error on the item (NOT page-level)
      // Subtotal auto-updates to 0 because totalAmount reduces from item_total
      setItemsAndRef((prev) =>
        prev.map((it) =>
          (it._temp_id ?? it.id) !== key
            ? it
            : { ...it, unit_rate: null, item_total: null, is_calculating: false, calc_error: errorMsg },
        ),
      );
    }
  }, [setItemsAndRef, patchItem]);

  // ── Item change handler ───────────────────────────────────────────────────

  const handleItemChange = useCallback((key, field, value) => {
    setItemsAndRef((prev) =>
      prev.map((it) => {
        if ((it._temp_id ?? it.id) !== key) return it;
        let updated = { ...it, [field]: value };

        if (field === "wide_material_name") {
          updated = { ...updated, wide_material_gsm: "", wide_material_thickness: "", available_wide_gsm: [] };
        }
        if (field === "cover_to_print" && !value) {
          updated = { ...updated, cover_color_scheme: "", cover_press_type: "" };
        }
        if (it.category === "Other" && (field === "unit_rate_manual" || field === "quantity")) {
          const qty  = Number(field === "quantity" ? value : it.quantity || 0);
          const rate = Number(field === "unit_rate_manual" ? value : it.unit_rate || 0);
          updated.unit_rate  = rate;
          updated.item_total = qty * rate;
        }
        if (field === "binding_type_toggle") {
          const already = (it.binding_types || []).includes(value);
          updated = {
            ...it,
            binding_types: already
              ? it.binding_types.filter((b) => b !== value)
              : [...(it.binding_types || []), value],
          };
          // Mirror JobItem: clear targets when binding removed
          if (already) {
            if (value === "Numbering") {
              updated.binding_targets = { ...updated.binding_targets, numbering_paper_ids: [] };
            }
            if (value === "Perforation") {
              updated.binding_targets = { ...updated.binding_targets, perforation_paper_ids: [] };
            }
            if (value === "Creasing")    updated.creases_per_sheet = "";
            if (value === "Folding")     updated.folds_per_sheet   = "";
          }
        }
        if (field === "binding_target_numbering") {
          const cur = it.binding_targets?.numbering_paper_ids || [];
          updated = {
            ...it,
            binding_targets: {
              ...it.binding_targets,
              numbering_paper_ids: cur.includes(value)
                ? cur.filter((x) => x !== value)
                : [...cur, value],
            },
          };
        }
        if (field === "binding_target_perforation") {
          const cur = it.binding_targets?.perforation_paper_ids || [];
          updated = {
            ...it,
            binding_targets: {
              ...it.binding_targets,
              perforation_paper_ids: cur.includes(value)
                ? cur.filter((x) => x !== value)
                : [...cur, value],
            },
          };
        }
        return updated;
      }),
    );

    if (field === "category")           loadCategoryItems(key, value);
    if (field === "enquiry_for")        loadPapers(key);
    if (field === "paper_type")         loadGsm(key, value, "inside");
    if (field === "cover_paper_type")   loadGsm(key, value, "cover");
    if (field === "size")               loadSizes(key, value);
    if (field === "wide_material_name") loadWideMaterialGsm(key, value);

    if (
      CALC_TRIGGER_FIELDS.has(field) ||
      field === "binding_type_toggle" ||
      field === "binding_target_numbering" ||
      field === "binding_target_perforation"
    ) {
      clearTimeout(calcTimers.current[key]);
      calcTimers.current[key] = setTimeout(() => calculateItem(key), 200);
    }
  }, [setItemsAndRef, loadCategoryItems, loadPapers, loadGsm, loadSizes, loadWideMaterialGsm, calculateItem]);

  // ── resetFields — mirrors JobCardForm's resetItemFields ──────────────────
  // Used by QuotationItem's useEffect to clear press_type when color changes
  const handleResetFields = useCallback((key, fields) => {
    setItemsAndRef((prev) =>
      prev.map((it) =>
        (it._temp_id ?? it.id) !== key ? it : { ...it, ...fields },
      ),
    );
  }, [setItemsAndRef]);

  const handleInsidePaperChange = useCallback((key, paperId, field, value) => {
    setItemsAndRef((prev) =>
      prev.map((it) => {
        if ((it._temp_id ?? it.id) !== key) return it;
        const papers = (it.inside_papers || []).map((p) => {
          if (p._id !== paperId) return p;
          let up = { ...p, [field]: value };
          if (field === "paper_type")             { up.paper_gsm = ""; up.available_gsm = []; }
          if (field === "color_scheme")           up.press_type = "";
          if (field === "to_print" && !value)     { up.color_scheme = ""; up.press_type = ""; }
          return up;
        });
        return { ...it, inside_papers: papers };
      }),
    );
    if (field === "paper_type" && value) loadInsidePaperGsm(key, paperId, value);
    if (INSIDE_PAPER_TRIGGER.has(field)) {
      clearTimeout(calcTimers.current[key]);
      calcTimers.current[key] = setTimeout(() => calculateItem(key), 200);
    }
  }, [setItemsAndRef, loadInsidePaperGsm, calculateItem]);

  const handleAddInsidePaper = useCallback((key) => {
    setItemsAndRef((prev) =>
      prev.map((it) => {
        if ((it._temp_id ?? it.id) !== key) return it;
        if ((it.inside_papers || []).length >= 4) return it;
        return { ...it, inside_papers: [...(it.inside_papers || []), createEmptyInsidePaper()] };
      }),
    );
  }, [setItemsAndRef]);

  const handleRemoveInsidePaper = useCallback((key, paperId) => {
    setItemsAndRef((prev) =>
      prev.map((it) => {
        if ((it._temp_id ?? it.id) !== key) return it;
        if ((it.inside_papers || []).length <= 1) return it;
        return { ...it, inside_papers: it.inside_papers.filter((p) => p._id !== paperId) };
      }),
    );
  }, [setItemsAndRef]);

  const handleRemoveItem = useCallback((key) => {
    // Also abort any in-flight calc for this item
    const ctrl = abortControllers.current.get(key);
    if (ctrl) { ctrl.abort(); abortControllers.current.delete(key); }
    clearTimeout(calcTimers.current[key]);
    setItemsAndRef((prev) => prev.filter((it) => (it._temp_id ?? it.id) !== key));
  }, [setItemsAndRef]);

  const handleAddItem = useCallback(() => {
    setItemsAndRef((prev) => [...prev, createEmptyItem()]);
  }, [setItemsAndRef]);

  // ── Billing — totalAmount auto-goes to 0 when item_total is null ──────────
  const totalAmount = useMemo(
    () => items.reduce((s, it) => s + Number(it.item_total || 0), 0),
    [items],
  );
  const billing = useMemo(
    () => computeBilling(totalAmount, discount, gstPct),
    [totalAmount, discount, gstPct],
  );

  // ── Download handler ───────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!clientName.trim()) {
      setDownloadErr("Client name is required to generate quotation.");
      return;
    }
    const readyItems = items.filter(
      (it) => it.item_total != null && it.unit_rate != null && !it.is_calculating,
    );
    if (readyItems.length === 0) {
      setDownloadErr("At least one fully calculated item is required.");
      return;
    }
    const calcInProgress = items.some((it) => it.is_calculating);
    if (calcInProgress) {
      setDownloadErr("Please wait for all items to finish calculating.");
      return;
    }

    setGenerating(true);
    setDownloadErr("");
    try {
      const payload = {
        clientName, department, clientAddress,
        items:    readyItems.map(stripUiFields),
        billing:  { ...billing, gstPct },
        firmName: selectedFirm,
      };
      const response = await api.post("/api/fms/quotation/generate-pdf", payload, {
        responseType: "blob",
      });
      const disposition = response.headers["content-disposition"] || "";
      const match       = disposition.match(/filename="(.+?)"/);
      const filename    = match?.[1] ?? `Quotation_${clientName.replace(/\s/g, "_")}.pdf`;
      const url  = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click();
      document.body.removeChild(link); URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e?.response?.data instanceof Blob
        ? await e.response.data.text()
        : e?.response?.data?.message;
      setDownloadErr(msg || "Failed to generate PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [clientName, department, clientAddress, items, billing, gstPct, selectedFirm]);


  const handleSave = useCallback(async () => {
    if (!clientName.trim()) {
      setDownloadErr("Client name is required.");
      return;
    }
    const readyItems = items.filter(
      (it) => it.item_total != null && it.unit_rate != null && !it.is_calculating,
    );
    if (readyItems.length === 0) {
      setDownloadErr("At least one fully calculated item is required.");
      return;
    }
    if (items.some((it) => it.is_calculating)) {
      setDownloadErr("Please wait for all items to finish calculating.");
      return;
    }

    setSaving(true);
    setDownloadErr("");

    let refNo;
    try {
      // Step 1: Save to DB
      const { data } = await api.post("/api/fms/quotations", {
        clientName,
        department,
        clientAddress,
        items:    readyItems.map(stripUiFields),
        billing:  { discount, gstPct, ...billing },
        firmName: selectedFirm,
      });
      refNo = data.quotation_ref_no;
      setSavedRefNo(refNo);
    } catch (e) {
      setDownloadErr(e?.response?.data?.message || "Failed to save quotation.");
      setSaving(false);
      return;
    }

    // Step 2: Download PDF with the saved ref no
    setGenerating(true);
    try {
      const payload = {
        clientName,
        department,
        clientAddress,
        items:          readyItems.map(stripUiFields),
        billing:        { ...billing, gstPct, discount },
        firmName:       selectedFirm,
        quotationRefNo: refNo, // ← pass the DB ref no to PDF
      };
      const response = await api.post("/api/fms/quotations/generate-pdf", payload, {
        responseType: "blob",
      });
      const disposition = response.headers["content-disposition"] || "";
      const match       = disposition.match(/filename="(.+?)"/);
      const filename    = match?.[1] ?? `Quotation_${refNo}_${clientName.replace(/\s/g, "_")}.pdf`;
      const url  = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click();
      document.body.removeChild(link); URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e?.response?.data instanceof Blob
        ? await e.response.data.text()
        : e?.response?.data?.message;
      setDownloadErr(msg || "Quotation saved but PDF download failed. Ref: " + refNo);
    } finally {
      setSaving(false);
      setGenerating(false);
    }
  }, [clientName, department, clientAddress, items, billing, gstPct, discount, selectedFirm]);


  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📄 Quotation Generator</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Build a quotation and download it as a professional PDF.
          </p>
        </div>
      </div>

      {/* Page-level error — ONLY for PDF download failures, not calc errors */}
      {downloadErr && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <span>⚠️</span> {downloadErr}
        </div>
      )}

      {/* ── Client Details ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">1</span>
          Client Details
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Client Name <span className="text-red-500">*</span>
            </label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Aramandala Foundation"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Department <span className="text-slate-400">(optional)</span>
            </label>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Marketing"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Client Address
            </label>
            <textarea
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
              placeholder="Full address for the quotation letter"
              rows={2}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>
        </div>
      </div>

      {/* ── Items ─────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">2</span>
          Items
        </h2>

        {items.map((item, idx) => (
          <QuotationItem
            key={item._temp_id ?? item.id}
            item={item}
            index={idx}
            onChange={handleItemChange}
            onInsidePaperChange={handleInsidePaperChange}
            onAddInsidePaper={handleAddInsidePaper}
            onRemoveInsidePaper={handleRemoveInsidePaper}
            onRemove={handleRemoveItem}
            onResetFields={handleResetFields}
          />
        ))}

        <button
          type="button"
          onClick={handleAddItem}
          className="flex items-center gap-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-xl shadow transition-colors"
        >
          <span className="text-base leading-none">＋</span> Add Item
        </button>
      </div>

      {/* ── Billing Summary ────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">3</span>
          Billing Summary
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Subtotal</label>
            <input
              readOnly
              value={inr(totalAmount)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-600 cursor-not-allowed"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Discount (₹)</label>
            <input
              type="number" min="0" step="0.01" value={discount} placeholder="0.00"
              onChange={(e) => {
                const val = e.target.value;
                const max = Number(totalAmount || 0);
                setDiscount(val === "" ? "" : Math.min(Number(val), max));
              }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">GST</label>
            <select
              value={gstPct}
              onChange={(e) => setGstPct(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">No GST</option>
              <option value="5.00">5% GST</option>
              <option value="18.00">18% GST</option>
            </select>
          </div>
        </div>

        {totalAmount > 0 && (
          <div className="rounded-xl border border-slate-200 overflow-hidden text-sm">
            <div className="flex justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium text-slate-700">{inr(billing.subtotal)}</span>
            </div>
            {billing.disc > 0 && (
              <div className="flex justify-between px-4 py-2.5 bg-white border-b border-slate-100">
                <span className="text-slate-500">
                  Discount <span className="text-red-500 text-xs font-medium">− {inr(billing.disc)}</span>
                </span>
                <span className="font-medium text-slate-700">{inr(billing.afterDisc)}</span>
              </div>
            )}
            {gstPct && (
              <div className="flex justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100">
                <span className="text-blue-600">
                  GST @ {gstPct}% <span className="text-blue-400 text-xs">on {inr(billing.afterDisc)}</span>
                </span>
                <span className="font-medium text-blue-700">+ {inr(billing.gstAmount)}</span>
              </div>
            )}
            <div className="flex justify-between px-4 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600">
              <span className="font-bold text-white text-base">
                Final Amount
                {gstPct ? ` (incl. ${gstPct}% GST)` : billing.disc > 0 ? " (after discount)" : ""}
              </span>
              <span className="text-xl font-black text-white">{inr(billing.finalAmount)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Firm Selection ────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">4</span>
          Select Firm
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {Object.entries(FIRM_DATA).map(([firmKey, firm]) => {
            const isSelected = selectedFirm === firmKey;
            const [r, g, b] = firm.rgb;
            return (
              <button
                key={firmKey}
                type="button"
                onClick={() => setSelectedFirm(firmKey)}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                  isSelected ? "border-transparent shadow-md" : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
                style={isSelected ? { backgroundColor: `rgb(${r},${g},${b})`, color: "white" } : {}}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                  style={{
                    backgroundColor: isSelected ? "rgba(255,255,255,0.25)" : `rgba(${r},${g},${b},0.12)`,
                    color: isSelected ? "white" : `rgb(${r},${g},${b})`,
                  }}
                >
                  {firm.displayName.charAt(0)}
                </div>
                <div>
                  <p className={`font-bold text-sm ${isSelected ? "text-white" : "text-slate-800"}`}>{firm.displayName}</p>
                  <p className={`text-xs mt-0.5 ${isSelected ? "text-white/80" : "text-slate-500"}`}>{firm.tagline}</p>
                  {firm.address && (
                    <p className={`text-xs mt-1 ${isSelected ? "text-white/70" : "text-slate-400"}`}>📍 {firm.address}</p>
                  )}
                </div>
                {isSelected && <div className="ml-auto text-white text-lg leading-none">✓</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Download ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-end gap-3 pb-6">
        {savedRefNo && (
          <div className="w-full max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 flex items-center justify-between">
            <span>✅ Saved as <strong>#{savedRefNo}</strong> — share this number with the client</span>
            <button onClick={() => setSavedRefNo(null)} className="ml-3 text-emerald-500 hover:text-emerald-700 text-lg">&times;</button>
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || generating}
          className={`flex items-center gap-2 px-8 py-3 rounded-xl text-white font-semibold text-base shadow-lg transition-all ${
            saving || generating
              ? "bg-slate-400 cursor-not-allowed"
              : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95"
          }`}
        >
          {saving ? (
            <><svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Saving…</>
          ) : generating ? (
            <><svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Generating PDF…</>
          ) : (
            <><svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>Save & Download PDF</>
          )}
        </button>
      </div>
    </div>
  );
}