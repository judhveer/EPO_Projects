import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  memo,
} from "react";
import api from "../../lib/api.js";
import { createEmptyInsidePaper } from "./JobCardForm.jsx";

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
    phone: "",
    email: "",
    gst: "",
    regLine1: "",
    regLine2: "",
    rgb: [15, 118, 110],
    lightRgb: [204, 251, 241],
  },
  "MM Enterprise": {
    displayName: "MM ENTERPRISE",
    tagline: "Your Trusted Printing Partner",
    address: "Shillong, Meghalaya - 793001",
    phone: "",
    email: "",
    gst: "",
    regLine1: "",
    regLine2: "",
    rgb: [91, 33, 182],
    lightRgb: [237, 233, 254],
  },
  "Hill Publication": {
    displayName: "HILL PUBLICATION",
    tagline: "Words Worth Publishing",
    address: "Shillong, Meghalaya - 793001",
    phone: "",
    email: "",
    gst: "",
    regLine1: "",
    regLine2: "",
    rgb: [154, 52, 18],
    lightRgb: [255, 237, 213],
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
  // binding
  "binding_types","binding_targets",
  "creases_per_sheet","folds_per_sheet",

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
      ["DIGITAL BLACK WHITE","HMT BLACK WHITE","AUTOPRINT"].includes(p.value),
    );
  if (colorScheme === "Multicolor")
    return PRESS_TYPES.filter((p) =>
      ["DIGITAL MULTICOLOR","HMT MULTICOLOR"].includes(p.value),
    );
  return [];
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
  _temp_id:          crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`,
  category:          "",
  enquiry_for:       "",
  size:              "",
  sides:             "",
  quantity:          "",
  uom:               "",
  // Single Sheet
  paper_type:        "",
  paper_gsm:         "",
  color_scheme:      "",
  press_type:        "",
  // Multiple Sheet
  inside_papers:     [createEmptyInsidePaper()],
  inside_pages:      "",
  cover_paper_type:  "",
  cover_paper_gsm:   "",
  cover_pages:       "",
  cover_color_scheme:"",
  cover_press_type:  "",
  cover_to_print:    true,
  // Wide Format
  wide_material_name:      "",
  wide_material_gsm:       "",
  wide_material_thickness: "",
  // ── BINDING ──────────────────────────────────────
  binding_types:     [],                          // selected binding names
  binding_targets:   {                            // for MS multi-paper numbering/perforation
    numbering_paper_ids:   [],
    perforation_paper_ids: [],
  },
  creases_per_sheet: "",
  folds_per_sheet:   "",
  // Dropdown data (UI-only)
  available_items:         [],
  available_papers:        [],
  available_gsm:           [],
  available_gsm_cover:     [],
  available_wide_materials:[],
  available_wide_gsm:      [],
  available_bindings:      [],
  // Calculated
  unit_rate:  null,
  item_total: null,
});

const stripUiFields = (item) => {
  const {
    available_items, available_papers, available_gsm, available_gsm_cover,
    available_wide_materials, available_wide_gsm, _temp_id, available_sizes, available_bindings,
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
// QUOTATION ITEM — simplified form per item
// ─────────────────────────────────────────────────────────────────────────────

const QuotationItem = memo(function QuotationItem({
  item,
  index,
  onChange,
  onInsidePaperChange,
  onAddInsidePaper,
  onRemoveInsidePaper,
  onRemove,
}) {
  const { category, _temp_id: key } = item;

  const allowedPressTypes = useMemo(
    () => getAllowedPressTypes(item.color_scheme, category, item.paper_type),
    [item.color_scheme, category, item.paper_type],
  );

  const allowedCoverPressTypes = useMemo(() => {
    if (category !== "Multiple Sheet" || item.cover_to_print === false) return [];
    return getAllowedPressTypes(item.cover_color_scheme, "Multiple Sheet");
  }, [category, item.cover_color_scheme, item.cover_to_print]);

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
      className={`border border-slate-200 rounded-lg px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all ${props.readOnly ? "bg-slate-50 text-slate-600 cursor-not-allowed" : ""} ${props.className || ""}`}
    />
  );

  const sel = (props) => (
    <select
      {...props}
      className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
    />
  );

  const isCalculated = item.unit_rate != null && item.item_total != null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-4">
      {/* Item header */}
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

        {/* Size */}
        {field("Size", true,
          <div className="relative">
            {inp({
              list: `size-${index}`,
              value: item.size,
              onChange: (e) => onChange(key, "size", e.target.value),
              placeholder: category === "Wide Format" ? "e.g. 3x4 ft" : "e.g. A4 or 4x6 in",
            })}
            <datalist id={`size-${index}`}>
              {(item.available_sizes || []).map((o) => (
                <option key={o.id} value={o.name} />
              ))}
            </datalist>
          </div>,
        )}

        {/* ── Single Sheet fields ── */}
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

        {/* ── Wide Format fields ── */}
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
              (item.available_wide_gsm || []).some(
                (m) => m.gsm !== null || m.thickness_mm !== null,
              ) &&
              field("GSM / Thickness", true,
                sel({
                  value: item.wide_material_gsm || item.wide_material_thickness || "",
                  onChange: (e) => {
                    const thicknessMaterials = ["Acrylic Export","Acrylic Indiana","Sun Board","ACP Board","Sun Board With Vinyl"];
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

        {/* ── Multiple Sheet fields ── */}
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

            {/* Inside papers */}
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

              {/* Send cover to press */}
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

        {/* ── BINDING ──────────────────────────────────────────────────────────── */}
        {category !== "Other" && (item.available_bindings || []).length > 0 && (
          <div className="md:col-span-3 space-y-2">
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Binding / Finishing
              </p>

              {/* Binding type checkboxes */}
              <div className="flex flex-wrap gap-2 mb-2">
                {(item.available_bindings || []).map((b) => {
                  const checked = (item.binding_types || []).includes(b.binding_name);
                  return (
                    <label
                      key={b.binding_name}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                        checked
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onChange(key, "binding_type_toggle", b.binding_name)}
                        className="sr-only"
                      />
                      {b.binding_name}
                    </label>
                  );
                })}
              </div>

              {/* Creasing — show creases_per_sheet input */}
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

              {/* Folding — show folds_per_sheet for Single Sheet */}
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

              {/* Designing — show hours input */}
              {(item.binding_types || []).some((b) => b.toLowerCase().includes("designing")) && (
                <div className="mt-2 max-w-[200px]">
                  {field("Designing Hours", false,
                    inp({
                      type: "number", min: "1",
                      value: item.designing_hours || "",
                      onChange: (e) => onChange(key, "designing_hours", e.target.value),
                      placeholder: "e.g. 2",
                    }),
                  )}
                </div>
              )}

              {/* Numbering / Perforation paper targets — only for Multiple Sheet with ≥2 inside papers */}
              {category === "Multiple Sheet" &&
                (item.inside_papers || []).length >= 2 && (
                  <>
                    {(item.binding_types || []).some((b) => b.toLowerCase().includes("numbering")) && (
                      <div className="mt-3 pt-2 border-t border-slate-200">
                        <p className="text-xs font-medium text-slate-500 mb-1.5">
                          Apply Numbering to which inside papers?
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(item.inside_papers || []).map((paper, pIdx) => {
                            const checked = (item.binding_targets?.numbering_paper_ids || [])
                              .includes(paper._id);
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
                            const checked = (item.binding_targets?.perforation_paper_ids || [])
                              .includes(paper._id);
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

                    {/* Interleaf info banner */}
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

        {category === "Other" && (
          <>
            {field("Unit Rate (₹)", true,
              inp({
                type: "number",
                value: item.unit_rate ?? "",
                onChange: (e) => onChange(key, "unit_rate_manual", e.target.value),
              }),
            )}
          </>
        )}

      </div>

      {/* ── Calculated result strip ── */}
      {isCalculated && (
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-t border-emerald-100 flex flex-wrap gap-6 items-center">
          <div>
            <span className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Unit Rate</span>
            <p className="text-lg font-bold text-emerald-700">
              {inr(item.unit_rate)}
            </p>
          </div>
          <div>
            <span className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Item Total</span>
            <p className="text-lg font-bold text-emerald-700">
              {inr(item.item_total)}
            </p>
          </div>
          <div className="ml-auto text-xs text-emerald-500 italic">
            ✓ Calculated
          </div>
        </div>
      )}

      {!isCalculated && isItemReady(item) && (
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
  const [err,           setErr]           = useState("");

  const itemsRef = useRef(items);
  const calcTimers = useRef({});

  // Keep ref in sync
  const setItemsAndRef = useCallback((updater) => {
    setItems((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      itemsRef.current = next;
      return next;
    });
  }, []);

  // ── Item state helpers ────────────────────────────────────────────────────

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
      
      const { data } = await api.get(`api/fms/items/bindings?category=${category}`);
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
        available_gsm: [], available_gsm_cover: [],
        available_wide_materials: [], available_wide_gsm: [],
        // reset binding
        binding_types: [], binding_targets: { numbering_paper_ids: [], perforation_paper_ids: [] },
        creases_per_sheet: "", folds_per_sheet: "", available_bindings: [],
      });
    } catch { /* silent */ }
    if (cat === "Wide Format") {
      try {
        const { data } = await api.get("/api/fms/items/wide-materials");
        patchItem(key, { available_wide_materials: data });
      } catch { /* silent */ }
    }
    // load bindings for this category
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

  // ── Backend calculation ───────────────────────────────────────────────────

  const calculateItem = useCallback(async (key) => {
    const latestItems = itemsRef.current;
    const item = latestItems.find((it) => (it._temp_id ?? it.id) === key);
    if (!item || !isItemReady(item)) return;

    // Build payload — strip UI-only data
    const cleaned = latestItems.map(stripUiFields);
    let itemToSend = { ...stripUiFields(item), unit_rate: null, item_total: null };

    // Multiple Sheet: pass first paper at item level for backend compat
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
      const { data } = await api.post("/api/fms/items/calculate-item", {
        item:      itemToSend,
        all_items: cleaned,
      });

      setItemsAndRef((prev) =>
        prev.map((it) => {
          if ((it._temp_id ?? it.id) !== key) return it;

          // Merge inside_papers results back
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
            unit_rate:     data.totals.unit_rate,
            item_total:    data.totals.item_total,
            inside_papers: mergedPapers,
          };
        }),
      );

      // Update grand total in billing
      const newItems = itemsRef.current;
      // (billing is computed live from items, no extra state needed)
    } catch (e) {
      console.error("Quotation calc error:", e?.response?.data?.message || e);
    }
  }, [setItemsAndRef]);

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
        // Other category inline
        if (it.category === "Other" && (field === "unit_rate_manual" || field === "quantity")) {
          const qty  = Number(field === "quantity" ? value : it.quantity || 0);
          const rate = Number(field === "unit_rate_manual" ? value : it.unit_rate || 0);
          updated.unit_rate  = rate;
          updated.item_total = qty * rate;
        }
        // ── binding_types toggle ─────────────────────────────────────────────
        if (field === "binding_type_toggle") {
          // value = binding_name string to toggle on/off
          const already = (it.binding_types || []).includes(value);
          updated = {
            ...it,
            binding_types: already
              ? it.binding_types.filter((b) => b !== value)
              : [...(it.binding_types || []), value],
          };
        }
        // ── binding_targets (numbering / perforation paper selection) ────────
        if (field === "binding_target_numbering") {
          // value = paper._id string to toggle
          const cur = it.binding_targets?.numbering_paper_ids || [];
          const has = cur.includes(value);
          updated = {
            ...it,
            binding_targets: {
              ...it.binding_targets,
              numbering_paper_ids: has ? cur.filter((x) => x !== value) : [...cur, value],
            },
          };
        }
        if (field === "binding_target_perforation") {
          const cur = it.binding_targets?.perforation_paper_ids || [];
          const has = cur.includes(value);
          updated = {
            ...it,
            binding_targets: {
              ...it.binding_targets,
              perforation_paper_ids: has ? cur.filter((x) => x !== value) : [...cur, value],
            },
          };
        }


        return updated;
      }),
    );

    // Side-effects
    if (field === "category")        loadCategoryItems(key, value);
    if (field === "enquiry_for")     loadPapers(key);
    if (field === "paper_type")      loadGsm(key, value, "inside");
    if (field === "cover_paper_type") loadGsm(key, value, "cover");
    if (field === "size")            loadSizes(key, value);
    if (field === "wide_material_name") loadWideMaterialGsm(key, value);

    if (CALC_TRIGGER_FIELDS.has(field) ||
      field === "binding_type_toggle" ||
      field === "binding_target_numbering" ||
      field === "binding_target_perforation") {
      clearTimeout(calcTimers.current[key]);
      calcTimers.current[key] = setTimeout(() => calculateItem(key), 50);
    }
  }, [setItemsAndRef, loadCategoryItems, loadPapers, loadGsm, loadSizes, loadWideMaterialGsm, calculateItem]);

  const handleInsidePaperChange = useCallback((key, paperId, field, value) => {
    setItemsAndRef((prev) =>
      prev.map((it) => {
        if ((it._temp_id ?? it.id) !== key) return it;
        const papers = (it.inside_papers || []).map((p) => {
          if (p._id !== paperId) return p;
          let up = { ...p, [field]: value };
          if (field === "paper_type") { up.paper_gsm = ""; up.available_gsm = []; }
          if (field === "color_scheme") up.press_type = "";
          if (field === "to_print" && !value) { up.color_scheme = ""; up.press_type = ""; }
          return up;
        });
        return { ...it, inside_papers: papers };
      }),
    );

    if (field === "paper_type" && value) loadInsidePaperGsm(key, paperId, value);

    if (INSIDE_PAPER_TRIGGER.has(field)) {
      clearTimeout(calcTimers.current[key]);
      calcTimers.current[key] = setTimeout(() => calculateItem(key), 50);
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
    setItemsAndRef((prev) => prev.filter((it) => (it._temp_id ?? it.id) !== key));
  }, [setItemsAndRef]);

  const handleAddItem = useCallback(() => {
    setItemsAndRef((prev) => [...prev, createEmptyItem()]);
  }, [setItemsAndRef]);

  // ── Billing (live) ─────────────────────────────────────────────────────────
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
      setErr("Client name is required to generate quotation.");
      return;
    }
    const readyItems = items.filter((it) => it.item_total != null && it.unit_rate != null);
    if (readyItems.length === 0) {
      setErr("At least one calculated item is required.");
      return;
    }



    setGenerating(true);
    setErr("");

    try {
      const payload = {
        clientName,
        department,
        clientAddress,
        items:    readyItems.map(stripUiFields),
        billing:  { ...billing, gstPct },
        firmName: selectedFirm,
      };
      console.log("Generating PDF with payload:", payload);
      const response = await api.post("/api/fms/quotation/generate-pdf", payload, {
        responseType: "blob",          // ← critical: receive binary
      });

      // Extract filename from Content-Disposition header
      const disposition = response.headers["content-disposition"] || "";
      const match       = disposition.match(/filename="(.+?)"/);
      const filename    = match?.[1] ?? `Quotation_${clientName.replace(/\s/g, "_")}.pdf`;

      // Trigger browser download
      const url  = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href     = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (e) {
      console.error("PDF download error:", e);
      const msg = e?.response?.data instanceof Blob
        ? await e.response.data.text()       // parse error blob from backend
        : e?.response?.data?.message;
      setErr(msg || "Failed to generate PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [clientName, department, clientAddress, items, billing, gstPct, selectedFirm]);


  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📄 Quotation Generator</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Build a quotation and download it as a professional PDF.
          </p>
        </div>
      </div>

      {err && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <span>⚠️</span> {err}
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
          <div className="flex flex-col gap-1 md:col-span-1">
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
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-700 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">2</span>
            Items
          </h2>
        </div>

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

        {/* Inputs */}
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
              type="number"
              min="0"
              step="0.01"
              value={discount}
              placeholder="0.00"
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
              <option value="5">5% GST</option>
              <option value="18">18% GST</option>
            </select>
          </div>
        </div>

        {/* Live breakdown */}
        {totalAmount > 0 && (
          <div className="rounded-xl border border-slate-200 overflow-hidden text-sm">
            <div className="flex justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium text-slate-700">{inr(billing.subtotal)}</span>
            </div>
            {billing.disc > 0 && (
              <div className="flex justify-between px-4 py-2.5 bg-white border-b border-slate-100">
                <span className="text-slate-500">
                  Discount{" "}
                  <span className="text-red-500 text-xs font-medium">
                    − {inr(billing.disc)}
                  </span>
                </span>
                <span className="font-medium text-slate-700">{inr(billing.afterDisc)}</span>
              </div>
            )}
            {gstPct && (
              <div className="flex justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100">
                <span className="text-blue-600">
                  GST @ {gstPct}%{" "}
                  <span className="text-blue-400 text-xs">on {inr(billing.afterDisc)}</span>
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
                  isSelected
                    ? "border-transparent shadow-md"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
                style={
                  isSelected
                    ? { backgroundColor: `rgb(${r},${g},${b})`, color: "white" }
                    : {}
                }
              >
                {/* Firm initial circle */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                  style={{
                    backgroundColor: isSelected
                      ? "rgba(255,255,255,0.25)"
                      : `rgba(${r},${g},${b},0.12)`,
                    color: isSelected ? "white" : `rgb(${r},${g},${b})`,
                  }}
                >
                  {firm.displayName.charAt(0)}
                </div>
                <div>
                  <p className={`font-bold text-sm ${isSelected ? "text-white" : "text-slate-800"}`}>
                    {firm.displayName}
                  </p>
                  <p className={`text-xs mt-0.5 ${isSelected ? "text-white/80" : "text-slate-500"}`}>
                    {firm.tagline}
                  </p>
                  {firm.address && (
                    <p className={`text-xs mt-1 ${isSelected ? "text-white/70" : "text-slate-400"}`}>
                      📍 {firm.address}
                    </p>
                  )}
                </div>
                {isSelected && (
                  <div className="ml-auto text-white text-lg leading-none">✓</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Download ─────────────────────────────────────────────────────── */}
      <div className="flex justify-end pb-6">
        <button
          type="button"
          onClick={handleDownload}
          disabled={generating}
          className={`flex items-center gap-2 px-8 py-3 rounded-xl text-white font-semibold text-base shadow-lg transition-all ${
            generating
              ? "bg-slate-400 cursor-not-allowed"
              : "bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-800 hover:to-blue-700 hover:shadow-xl active:scale-95"
          }`}
        >
          {generating ? (
            <>
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Generating PDF…
            </>
          ) : (
            <>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Download Quotation PDF
            </>
          )}
        </button>
      </div>
    </div>
  );
}






const generatePDF = (clientName, department, clientAddress, items, billing, firmKey) => {
  const firm   = FIRM_DATA[firmKey];
  const doc    = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW     = doc.internal.pageSize.getWidth();
  const PH     = doc.internal.pageSize.getHeight();
  const M      = 14;
  const CW     = PW - 2 * M;
  const [r, g, b] = firm.rgb;

  const readyItems = items.filter((it) => it.item_total != null);
  const hasGst     = !!billing.gstPct && Number(billing.gstPct) > 0;
  const gstRate    = hasGst ? Number(billing.gstPct) : 0;

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, PW, 38, "F");

  // Accent thin strip below header
  const [lr, lg, lb] = firm.lightRgb;
  doc.setFillColor(lr, lg, lb);
  doc.rect(0, 38, PW, 5, "F");

  // Firm name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.setTextColor(255, 255, 255);
  doc.text(firm.displayName, M, 17);

  // Tagline below name
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(lr, lg, lb);
  doc.text(firm.tagline, M + 1, 24);

  // Registration block (right side of header)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(lr, lg, lb);
  let rY = 11;
  if (firm.regLine1) { doc.text(firm.regLine1, PW - M, rY, { align: "right" }); rY += 5; }
  if (firm.regLine2) { doc.text(firm.regLine2, PW - M, rY, { align: "right" }); rY += 5; }
  if (firm.gst)      { doc.text(`GST No: ${firm.gst}`, PW - M, rY, { align: "right" }); rY += 5; }

  // Date (right side, lower)
  const dateStr = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`Date: ${dateStr}`, PW - M, 33, { align: "right" });

  // Contact strip text
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(r, g, b);
  const contactParts = [
    firm.address && `📍 ${firm.address}`,
    firm.phone   && `📞 ${firm.phone}`,
    firm.email   && `✉ ${firm.email}`,
  ].filter(Boolean);
  doc.text(contactParts.join("     "), PW / 2, 41.5, { align: "center" });

  let y = 52;

  // ── Client block ─────────────────────────────────────────────────────────
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("To,", M, y); y += 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(clientName || "—", M, y); y += 5;

  if (department) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(department, M, y); y += 5;
  }

  if (clientAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const addrLines = doc.splitTextToSize(clientAddress, 95);
    addrLines.forEach((line) => { doc.text(line, M, y); y += 4.5; });
  }

  y += 5;

  // ── Subject line ───────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(r, g, b);
  const subjectText = "Sub: Quotation for Printing Services";
  const subjectW    = doc.getTextWidth(subjectText);
  doc.text(subjectText, PW / 2, y, { align: "center" });
  // Underline
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.4);
  doc.line((PW - subjectW) / 2, y + 1, (PW + subjectW) / 2, y + 1);
  y += 7;

  // Salutation
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(50, 50, 50);
  doc.text("Dear Sir / Madam,", M, y); y += 4.5;
  doc.text(
    "Kindly find below the rate for your printing requirement:",
    M, y,
  ); y += 7;

  // ── Items table ────────────────────────────────────────────────────────────
  const tableHead = hasGst
    ? [["S.No", "Item Description", "Qty", "UOM", "Rate (₹)", "Amount (₹)", `GST\n${gstRate}%`, "Total (₹)"]]
    : [["S.No", "Item Description", "Qty", "UOM", "Rate (₹)", "Amount (₹)"]];

  const tableBody = readyItems.map((item, idx) => {
    const amount = Number(item.item_total || 0);
    const rate   = Number(item.unit_rate  || 0);
    const fmt    = (n) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

    if (hasGst) {
      const gstAmt      = parseFloat(((amount * gstRate) / 100).toFixed(2));
      const totalWithGst = parseFloat((amount + gstAmt).toFixed(2));
      return [
        idx + 1,
        buildDescription(item),
        item.quantity  || "—",
        item.uom       || "—",
        fmt(rate),
        fmt(amount),
        fmt(gstAmt),
        fmt(totalWithGst),
      ];
    }
    return [
      idx + 1,
      buildDescription(item),
      item.quantity || "—",
      item.uom      || "—",
      rate.toLocaleString("en-IN", { minimumFractionDigits: 2 }),
      amount.toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ];
  });

  autoTable(doc, {
    startY: y,
    head:   tableHead,
    body:   tableBody,
    theme:  "grid",
    margin: { left: M, right: M },

    headStyles: {
      fillColor:   [r, g, b],
      textColor:   [255, 255, 255],
      fontStyle:   "bold",
      fontSize:    8.5,
      halign:      "center",
      cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
    },

    bodyStyles: {
      fontSize:    8,
      cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
      textColor:   [30, 30, 30],
      valign:      "middle",
    },

    alternateRowStyles: {
      fillColor: [lr, lg, lb].map((c) => Math.min(255, c + 30)),
    },

    columnStyles: hasGst
      ? {
          0: { halign: "center", cellWidth: 10 },
          1: { cellWidth: 52 },
          2: { halign: "center", cellWidth: 12 },
          3: { halign: "center", cellWidth: 14 },
          4: { halign: "right",  cellWidth: 22 },
          5: { halign: "right",  cellWidth: 22 },
          6: { halign: "right",  cellWidth: 20 },
          7: { halign: "right",  cellWidth: 24 },
        }
      : {
          0: { halign: "center", cellWidth: 12  },
          1: { cellWidth: 80                    },
          2: { halign: "center", cellWidth: 16  },
          3: { halign: "center", cellWidth: 16  },
          4: { halign: "right",  cellWidth: 26  },
          5: { halign: "right",  cellWidth: 32  },
        },

    // Page footer drawn on every page
    didDrawPage: (data) => {
      doc.setFillColor(r, g, b);
      doc.rect(0, PH - 11, PW, 11, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      const footerStr = [
        firm.address,
        firm.phone && `Ph: ${firm.phone}`,
        firm.email,
      ].filter(Boolean).join("   |   ");
      doc.text(footerStr, PW / 2, PH - 4, { align: "center" });
      doc.text(`Page ${data.pageNumber}`, PW - M, PH - 4, { align: "right" });
    },
  });

  y = doc.lastAutoTable.finalY + 6;

  // ── Billing summary (right-aligned box) ────────────────────────────────────
  const SW = 84;
  const SX = M + CW - SW;

  const summaryRows = [
    ["Subtotal", `₹ ${billing.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`],
  ];
  if (billing.disc > 0) {
    summaryRows.push([
      "Discount",
      `(−) ₹ ${billing.disc.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    ]);
    summaryRows.push([
      "After Discount",
      `₹ ${billing.afterDisc.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    ]);
  }
  if (billing.gstPct) {
    summaryRows.push([
      `GST @ ${billing.gstPct}%`,
      `₹ ${billing.gstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    ]);
  }

  autoTable(doc, {
    startY:     y,
    body:       summaryRows,
    theme:      "plain",
    margin:     { left: SX, right: M },
    tableWidth: SW,
    styles:     { fontSize: 9, cellPadding: 2.5 },
    columnStyles: {
      0: { fontStyle: "normal", textColor: [80, 80, 80], cellWidth: SW / 2 },
      1: { halign: "right", textColor: [20, 20, 20], cellWidth: SW / 2 },
    },
    bodyStyles: { fillColor: [lr, lg, lb].map((c) => Math.min(255, c + 25)) },
  });

  y = doc.lastAutoTable.finalY + 1;

  // Final amount highlight bar
  doc.setFillColor(r, g, b);
  doc.roundedRect(SX, y, SW, 11, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("FINAL AMOUNT", SX + 4, y + 7);
  doc.text(
    `₹ ${billing.finalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    SX + SW - 4, y + 7, { align: "right" },
  );

  y += 18;

  // ── Notes ──────────────────────────────────────────────────────────────────
  // Check if there's enough space, else add page
  if (y > PH - 55) { doc.addPage(); y = 20; }

  doc.setFillColor(lr, lg, lb);
  doc.roundedRect(M, y, CW, 22, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(r, g, b);
  doc.text("Terms & Notes:", M + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(50, 50, 50);
  const notes = [
    "➤  All above rates are inclusive of material & printing charges.",
    "➤  Rates are valid for 30 days from the date of this quotation.",
    "➤  Delivery / transportation charges (if applicable) will be billed separately.",
    "➤  For any queries, feel free to contact us.",
  ];
  let ny = y + 11;
  notes.forEach((n) => { doc.text(n, M + 4, ny); ny += 4.5; });

  y += 28;

  // ── Signature block ────────────────────────────────────────────────────────
  if (y > PH - 45) { doc.addPage(); y = 20; }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  doc.text("Thank You for Your Enquiry!", M, y);

  // Signature area on right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(r, g, b);
  doc.text(`For ${firm.displayName}`, PW - M, y + 2, { align: "right" });

  // Signature line
  y += 24;
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.4);
  doc.line(PW - M - 55, y, PW - M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text("Authorised Signatory", PW - M - 55, y + 4);

  return doc;
};