import React, { useEffect, useMemo, useCallback, useState } from "react";
import FormCard from "../../components/salesPipeline/FormCard.jsx";
import Field from "../../components/salesPipeline/Field.jsx";
import Input from "../../components/salesPipeline/Input.jsx";
import Select from "../../components/salesPipeline/Select.jsx";
import Button from "../../components/salesPipeline/Button.jsx";

// Define PRESS_TYPES outside component (or inside but stable)
const PRESS_TYPES = [
  { value: "FLEX MACHINE", label: "Flex Machine" },
  { value: "DIGITAL BLACK WHITE", label: "Digital Black & White" },
  { value: "DIGITAL MULTICOLOR", label: "Digital Multicolor" },
  { value: "HMT BLACK WHITE", label: "HMT Black & White" },
  { value: "HMT MULTICOLOR", label: "HMT Multicolor" },
  { value: "AUTOPRINT", label: "Autoprint Machine" },
  { value: "PLOTTER BLACK WHITE", label: "Plotter Black & White" },
  { value: "PLOTTER MULTICOLOR", label: "Plotter Multicolor" },
];

const thicknessMaterials = [
  "Acrylic Export",
  "Acrylic Indiana",
  "Sun Board",
  "ACP Board",
  "Sun Board With Vinyl",
];

const isBindingDisabled = (bindingName, selectedBindings = []) => {
  const groups = [
    [
      "Gloss Lamination (Single Side)",
      "Gloss Lamination (Both Side)",
      "Matt Lamination (Single Side)",
      "Matt Lamination (Both Side)",
    ],
    ["Tin Mounting (single Side)", "Tin Mounting (both Side)"],
  ];

  for (const group of groups) {
    const selected = selectedBindings.find((b) => group.includes(b));

    if (selected && selected !== bindingName && group.includes(bindingName)) {
      return true;
    }
  }

  return false;
};

// validate the size -> ft cannot be used in single sheet and multiple sheet else both have in, mm, cm and the format will be according to this -> 2x3 mm, 2x3 cm, 2x3 in, 2x3 mm or can be selected from drop down.
const validateSize = (value, availableSizes, category) => {
  if (!value) return false;

  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d+(\.\d+)?)x(\d+(\.\d+)?)\s?(mm|cm|in|ft)$/);

  // ✅ If custom format
  if (match) {
    const unit = match[5];
    // ❌ Restrict ft for non-wide categories
    if (category !== "Wide Format" && unit === "ft") {
      return false;
    }

    return true;
  }

  // ✅ If dropdown value
  if (
    Array.isArray(availableSizes) &&
    availableSizes.some((opt) => opt.name === value)
  ) {
    return true;
  }

  return false;
};

// Pure function outside the component — returns the allowed press types for a
// given color scheme inside Multiple Sheet's inside papers.
// Also used for Single Sheet (passed category to distinguish plotter edge case).

const getAllowedPressTypesForPaper = (colorScheme) => {
  if (colorScheme === "Black and White") {
    return PRESS_TYPES.filter((p) =>
      ["DIGITAL BLACK WHITE", "HMT BLACK WHITE", "AUTOPRINT"].includes(p.value),
    );
  }
  if (colorScheme === "Multicolor") {
    return PRESS_TYPES.filter((p) =>
      ["DIGITAL MULTICOLOR", "HMT MULTICOLOR"].includes(p.value),
    );
  }
  return [];
};

// Small helper to format ₹ amounts
const rs = (v) => v != null ? `₹${Number(v).toFixed(2)}` : null;


// ── CalcErrorBanner ───────────────────────────────────────────────────────────
// Inline error shown directly inside the item card when backend calc fails.
// Visible immediately — no scrolling required.
// ─────────────────────────────────────────────────────────────────────────────
const CalcErrorBanner = ({ message }) => {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="col-span-2 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-700"
    >
      {/* Icon */}
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

// ── CalcSpinner ───────────────────────────────────────────────────────────────
// Tiny pill shown beside the unit rate field while a calc request is in flight.
// ─────────────────────────────────────────────────────────────────────────────
const CalcSpinner = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
    <svg
      className="h-3 w-3 animate-spin text-blue-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
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
    Calculating…
  </span>
);


const JobItem = React.memo(function JobItem({
  item,
  index,
  handleItemChange,
  batchItemChange,
  resetItemFields,
  onRemove,
  handleInsidePaperChange, // handles changes within a single inside paper
  addInsidePaper, // adds a new empty inside paper to this item
  removeInsidePaper, // removes an inside paper from this item
}) {
  const category = item.category;
  const uniqueKey = item.id ?? item._temp_id;
  const isThicknessMaterial = thicknessMaterials.includes(
    item.wide_material_name,
  );
  const cs = item.costing_snapshot;

  const [editingField, setEditingField] = useState(null);

  const isEditing = editingField === uniqueKey;
  // ─── Cover press types —─
  const allowedCoverPressTypes = useMemo(() => {
    // No printing → no press type needed
    if (category !== "Multiple Sheet" || item.cover_to_print === false) return [];

    if (item.cover_color_scheme === "Black and White") {
      return PRESS_TYPES.filter((p) =>
        ["DIGITAL BLACK WHITE", "HMT BLACK WHITE", "AUTOPRINT"].includes(
          p.value,
        ),
      );
    }
    if (item.cover_color_scheme === "Multicolor") {
      return PRESS_TYPES.filter((p) =>
        ["DIGITAL MULTICOLOR", "HMT MULTICOLOR"].includes(p.value),
      );
    }

    return [];
  }, [category, item.cover_color_scheme, item.cover_to_print]);

  // allowedPressTypes is now only for Single Sheet and Wide Format.
  // Multiple Sheet inside press types are computed per inside paper inline.
  // Inside your component:
  const allowedPressTypes = useMemo(() => {
    switch (category) {
      case "Single Sheet":
        // Plotter papers → only plotter printing
        if (
          item.paper_type === "Maplitho Plotter Paper" ||
          item.paper_type === "Photo Plotter Paper"
        ) {
          if (item.color_scheme === "Black and White") {
            return PRESS_TYPES.filter((p) => p.value === "PLOTTER BLACK WHITE");
          } else if (item.color_scheme === "Multicolor") {
            return PRESS_TYPES.filter((p) => p.value === "PLOTTER MULTICOLOR");
          }
        }

        if (item.color_scheme === "Black and White") {
          return PRESS_TYPES.filter((p) =>
            ["DIGITAL BLACK WHITE", "HMT BLACK WHITE", "AUTOPRINT"].includes(
              p.value,
            ),
          );
        }

        if (item.color_scheme === "Multicolor") {
          return PRESS_TYPES.filter((p) =>
            ["DIGITAL MULTICOLOR", "HMT MULTICOLOR"].includes(p.value),
          );
        }

        return [];

      case "Wide Format":
        return PRESS_TYPES.filter((p) => p.value === "FLEX MACHINE");

      default:
        return [];
    }
  }, [category, item.color_scheme, item.paper_type]);

  // Only resets press_type for Single Sheet / Wide Format, and cover press type
  // for Multiple Sheet. Inside paper press types are self-managed in
  // handleInsidePaperChange (when color_scheme changes, press_type clears).

  useEffect(() => {
    const resets = {};

    // If current press_type is not in allowed list, clear it
    if (
      category !== "Multiple Sheet" &&
      item.press_type &&
      Array.isArray(allowedPressTypes) &&
      !allowedPressTypes.some((p) => p.value === item.press_type)
    ) {
      resets.press_type = "";
    }

    // Only validate cover press type when cover is actually going to press
    if (
      category === "Multiple Sheet" &&
      item.cover_to_print !== false &&
      item.cover_press_type &&
      Array.isArray(allowedCoverPressTypes) &&
      !allowedCoverPressTypes.some((p) => p.value === item.cover_press_type)
    ) {
      resets.cover_press_type = "";
    }

    if (Object.keys(resets).length > 0) {
      resetItemFields(uniqueKey, resets); // ← single state update = single render
    }
  }, [
    category,
    item.color_scheme,
    item.cover_color_scheme,
    item.cover_to_print,       
    item.press_type,
    item.cover_press_type,
    allowedPressTypes,
    allowedCoverPressTypes,
    uniqueKey,
    resetItemFields,
  ]);

  // a stable binding handler
  const handleBindingChange = useCallback(
    (bindingName, checked) => {
      const prev = item.binding_types ?? [];
      const updated = checked
        ? [...prev, bindingName]
        : prev.filter((x) => x !== bindingName);

      handleItemChange(uniqueKey, "binding_types", updated);

      // Clear targets when binding is removed
      if (!checked) {
        if (bindingName === "Numbering") {
          handleItemChange(uniqueKey, "binding_targets", {
            ...item.binding_targets,
            numbering_paper_ids: [],
          });
        }
        if (bindingName === "Perforation") {
          handleItemChange(uniqueKey, "binding_targets", {
            ...item.binding_targets,
            perforation_paper_ids: [],
          });
        }
        if (bindingName === "Creasing")
          handleItemChange(uniqueKey, "creases_per_sheet", "");
        if (bindingName === "Folding")
          handleItemChange(uniqueKey, "folds_per_sheet", "");
      }
    },
    [item.binding_types, item.binding_targets, uniqueKey, handleItemChange],
  );

  return (
    <FormCard>
      <div className="flex flex-wrap items-center justify-between">
        <h4 className="font-semibold text-blue-700">📦 Item {index + 1}</h4>
        <Button
          type="button"
          className="bg-red-600 hover:bg-red-700 px-3 py-1 text-sm"
          onClick={() => onRemove(uniqueKey)}
        >
          🗑 Remove
        </Button>
      </div>

      {/* ── Inline calculation error — shown at the TOP of the item card ───────
          Positioned here (not page top) so the user sees it immediately when
          they interact with the item. Uses role="alert" for screen readers.
      ──────────────────────────────────────────────────────────────────────── */}
      {item.calc_error && (
        <div className="mt-2 mb-1">
          <CalcErrorBanner message={item.calc_error} />
        </div>
      )}


      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Category" required>
          <Select
            value={item.category}
            onChange={(e) =>
              handleItemChange(uniqueKey, "category", e.target.value)
            }
          >
            <option value="">Select</option>
            <option>Single Sheet</option>
            <option>Multiple Sheet</option>
            <option>Wide Format</option>
            <option>Other</option>
          </Select>
        </Field>

        <Field label="Enquiry For" required>
          <div className="relative">
            <input
              list={`enquiry-for-list-${index}`}
              value={item.enquiry_for || ""}
              onChange={(e) =>
                handleItemChange(uniqueKey, "enquiry_for", e.target.value)
              }
              placeholder="Select item..."
              className="border border-slate-300 rounded px-3 py-2 w-full text-sm"
              required
            />

            <datalist id={`enquiry-for-list-${index}`}>
              {item.available_items?.map((opt) => (
                <option key={opt.id} value={opt.item_name} />
              ))}
            </datalist>
          </div>
        </Field>

        {category === "Single Sheet" && item.enquiry_for && (
          <Field label="Paper Type" required>
            <Select
              value={item.paper_type || ""}
              onChange={(e) =>
                handleItemChange(uniqueKey, "paper_type", e.target.value)
              }
              required
            >
              <option value="">Select Paper</option>

              {item.available_papers?.map((p) => (
                <option key={p.paper_name} value={p.paper_name}>
                  {p.paper_name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {category === "Single Sheet" && item.paper_type && (
          <Field label="Paper GSM" required>
            <Select
              value={item.paper_gsm || ""}
              onChange={(e) =>
                handleItemChange(uniqueKey, "paper_gsm", e.target.value)
              }
              required
            >
              <option value="">Select GSM</option>

              {item.available_gsm?.map((p) => (
                <option key={p.id} value={p.gsm}>
                  {p.gsm} {p.size_category ? ` (${p.size_category})` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {/* ================= WIDE FORMAT ================= */}

        {category === "Wide Format" && (
          <>
            {/* MATERIAL NAME */}
            <Field label="Material Name" required>
              <Select
                value={item.wide_material_name || ""}
                onChange={(e) =>
                  handleItemChange(
                    uniqueKey,
                    "wide_material_name",
                    e.target.value,
                  )
                }
                required
              >
                <option value="">Select Material</option>

                {item.available_wide_materials?.map((m) => (
                  <option key={m.material_name} value={m.material_name}>
                    {m.material_name}
                  </option>
                ))}
              </Select>
            </Field>

            {/* GSM / THICKNESS */}
            {item.wide_material_name &&
              Array.isArray(item.available_wide_gsm) &&
              item.available_wide_gsm?.some(
                (m) => m.gsm !== null || m.thickness_mm !== null,
              ) && (
                <Field
                  label={isThicknessMaterial ? "Thickness" : "GSM"}
                  required
                >
                  <Select
                    value={
                      isThicknessMaterial
                        ? item.wide_material_thickness || ""
                        : item.wide_material_gsm || ""
                    }
                    onChange={(e) => {
                      const value = e.target.value;

                      if (isThicknessMaterial) {
                        handleItemChange(
                          uniqueKey,
                          "wide_material_thickness",
                          value,
                        );
                      } else {
                        handleItemChange(uniqueKey, "wide_material_gsm", value);
                      }
                    }}
                    required
                  >
                    <option value="">Select</option>

                    {item.available_wide_gsm
                      ?.filter((m) => m.gsm !== null || m.thickness_mm !== null)
                      .map((m) => (
                        <option
                          key={m.id}
                          value={isThicknessMaterial ? m.thickness_mm : m.gsm}
                        >
                          {isThicknessMaterial ? m.thickness_mm : m.gsm}
                        </option>
                      ))}
                  </Select>
                </Field>
              )}
          </>
        )}

        {/* Category-specific options */}
        {/* MULTIPLE SHEET — NEW: inside papers loop */}

        {category === "Multiple Sheet" && (
          <React.Fragment key={`multiple-${index}`}>
            {/* Inside Pages — shared across all inside papers */}
            <Field label="Inside Pages" required>
              <Input
                type="number"
                min="1"
                value={item.inside_pages || ""}
                onChange={(e) =>
                  handleItemChange(uniqueKey, "inside_pages", e.target.value)
                }
                placeholder="e.g. 200"
                required
              />
            </Field>
            {/* ── Inside Papers Loop ─────────────────────────────────────
                Each inside paper has its own: paper type, GSM,
                "send to press" checkbox, color scheme, press machine.
                Max 4 inside papers allowed.
            ─────────────────────────────────────────────────────────────── */}
            <div className="col-span-2 space-y-3">
              {(item.inside_papers || []).map((paper, pIdx) => {
                // Compute allowed press types for this specific inside paper
                // based on its own color_scheme selection.
                const paperPressTypes = getAllowedPressTypesForPaper(
                  paper.color_scheme
                );

                return (
                  <div
                    key={paper._id}
                    className="border border-slate-300 bg-slate-50 rounded-lg p-3 grid md:grid-cols-2 gap-3"
                  >
                    {/* Header row: label + remove button */}
                    <div className="col-span-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-blue-600">
                        🗒 Inside Paper {pIdx + 1}
                      </span>
                      {/* Only show remove if more than 1 inside paper */}
                      {(item.inside_papers || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            removeInsidePaper(uniqueKey, paper._id)
                          }
                          className="text-xs text-red-500 border border-red-300 rounded px-2 py-0.5 hover:bg-red-50"
                        >
                          ✕ Remove
                        </button>
                      )}
                    </div>

                    {/* Paper Type — uses shared available_papers at item level */}
                    <Field label="Paper Type" required>
                      <Select
                        value={paper.paper_type || ""}
                        onChange={(e) =>
                          handleInsidePaperChange(
                            uniqueKey,
                            paper._id,
                            "paper_type",
                            e.target.value
                          )
                        }
                        required
                      >
                        <option value="">Select Paper</option>
                        {item.available_papers?.map((p) => (
                          <option key={p.paper_name} value={p.paper_name}>
                            {p.paper_name}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    {/* Paper GSM — uses this paper's own available_gsm */}
                    {paper.paper_type && (
                      <Field label="Paper GSM" required>
                        <Select
                          value={paper.paper_gsm || ""}
                          onChange={(e) =>
                            handleInsidePaperChange(
                              uniqueKey,
                              paper._id,
                              "paper_gsm",
                              e.target.value
                            )
                          }
                          required
                        >
                          <option value="">Select GSM</option>
                          {paper.available_gsm?.map((g) => (
                            <option key={g.id} value={g.gsm}>
                              {g.gsm}
                              {g.size_category
                                ? ` (${g.size_category})`
                                : ""}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}

                    {/* Send to Press checkbox */}
                    <Field label="Send to Press?">
                      <label className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={paper.to_print || false}
                          onChange={(e) =>
                            handleInsidePaperChange(
                              uniqueKey,
                              paper._id,
                              "to_print",
                              e.target.checked
                            )
                          }
                          className="w-4 h-4"
                        />
                        <span className="text-slate-700">
                          This paper will be printed
                        </span>
                      </label>
                    </Field>

                    {/* Color Scheme + Press Machine — only shown when to_print is checked */}
                    {paper.to_print && (
                      <>
                        <Field label="Color Scheme" required>
                          <Select
                            value={paper.color_scheme || ""}
                            onChange={(e) =>
                              handleInsidePaperChange(
                                uniqueKey,
                                paper._id,
                                "color_scheme",
                                e.target.value
                              )
                            }
                            required
                          >
                            <option value="">Select</option>
                            <option>Black and White</option>
                            <option>Multicolor</option>
                          </Select>
                        </Field>

                        <Field label="Press Machine" required>
                          <Select
                            value={paper.press_type || ""}
                            onChange={(e) =>
                              handleInsidePaperChange(
                                uniqueKey,
                                paper._id,
                                "press_type",
                                e.target.value
                              )
                            }
                            required
                          >
                            <option value="" disabled>
                              Select Press Machine
                            </option>
                            {paperPressTypes.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Add inside paper button — visible when less than 4 papers */}
              {(item.inside_papers || []).length < 4 && (
                <button
                  type="button"
                  onClick={() => addInsidePaper(uniqueKey)}
                  className="text-sm text-blue-600 border border-blue-300 rounded px-3 py-1.5 hover:bg-blue-50 transition-colors"
                >
                  ➕ Add Another Inside Paper
                </button>
              )}
            </div>


            {/* COVER PAPER */}
            <Field label="Cover Paper Type" required>
              <Select
                value={item.cover_paper_type || ""}
                onChange={(e) =>
                  handleItemChange(
                    uniqueKey,
                    "cover_paper_type",
                    e.target.value,
                  )
                }
                required
              >
                <option value="">Select Paper</option>
                {item.available_papers?.map((p) => (
                  <option key={p.paper_name} value={p.paper_name}>
                    {p.paper_name}
                  </option>
                ))}
              </Select>
            </Field>

            {item.cover_paper_type && (
              <Field label="Cover Paper GSM" required>
                <Select
                  value={item.cover_paper_gsm || ""}
                  onChange={(e) =>
                    handleItemChange(
                      uniqueKey,
                      "cover_paper_gsm",
                      e.target.value,
                    )
                  }
                  required
                >
                  <option value="">Select GSM</option>
                  {item.available_gsm_cover?.map((g) => (
                    <option key={g.id} value={g.gsm}>
                      {g.gsm} {g.size_category ? ` (${g.size_category})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label="Cover Pages" required>
              <Select
                value={item.cover_pages || ""}
                onChange={(e) =>
                  handleItemChange(uniqueKey, "cover_pages", e.target.value)
                }
              >
                <option value="">Select</option>
                <option>2</option>
                <option>4</option>
              </Select>
            </Field>

            {/* ── NEW: Send Cover to Press toggle ───────────────────────────────── */}
            <Field label="Send Cover to Press?">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={item.cover_to_print !== false}
                  onChange={(e) =>
                    handleItemChange(uniqueKey, "cover_to_print", e.target.checked)
                  }
                  className="w-4 h-4"
                />
                <span className="text-slate-700">
                  Cover will be printed (uncheck for paper cost only)
                </span>
              </label>
            </Field>
            

            {/* Color scheme and press machine — ONLY when cover_to_print is true */}
            {item.cover_to_print !== false && (
              <>
                <Field label="Cover Color Scheme" required>
                  <Select
                    value={item.cover_color_scheme || ""}
                    onChange={(e) =>
                      batchItemChange(uniqueKey, {
                        cover_color_scheme: e.target.value,
                        cover_press_type: "",
                      })
                    }
                  >
                    <option value="">Select</option>
                    <option>Black and White</option>
                    <option>Multicolor</option>
                  </Select>
                </Field>

                {/* ── Cover Press Machine (Multiple Sheet only) ── */}
                <Field label="Press Machine For Cover" required>
                  <Select
                    value={item.cover_press_type || ""}
                    onChange={(e) =>
                      handleItemChange(uniqueKey, "cover_press_type", e.target.value)
                    }
                  >
                    <option value="" disabled>
                      Select Press Machine
                    </option>

                    {allowedCoverPressTypes.map((press) => (
                      <option key={press.value} value={press.value}>
                        {press.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
          </React.Fragment>
        )}

        {category !== "Other" && (
          <Field
            label={
              category === "Multiple Sheet" ? "Sides For Inside Paper" : "Sides"
            }
            required
          >
            <Select
              value={item.sides || ""}
              onChange={(e) =>
                handleItemChange(uniqueKey, "sides", e.target.value)
              }
            >
              <option value="">Select</option>
              <option>Single Side</option>
              <option>Both Side</option>
            </Select>
          </Field>
        )}

        <Field label="Size" required>
          <div className="relative">
            <input
              list={`size-list-${index}`}
              value={item.size || ""}
              onChange={(e) => {
                const value = e.target.value;

                handleItemChange(uniqueKey, "size", value);

                // Instant validation
                // Other category me koi validation nahi
                if (category === "Other") {
                  e.target.setCustomValidity("");
                } else if (!validateSize(value, item.available_sizes, item.category)) {
                  e.target.setCustomValidity(
                    item.category === "Wide Format"
                      ? "Use format: 2x3 ft (or mm/cm/in)"
                      : "Use format: 2x3 mm | 2x3 cm | 2x3 in (ft not allowed)",
                  );
                } else {
                  e.target.setCustomValidity("");
                }
              }}
              onInvalid={(e) => {
                // ✅ Other category me invalid message bhi nahi
                if (category !== "Other") {
                  e.target.setCustomValidity(
                    item.category === "Wide Format"
                      ? "Use format: 2x3 ft (or mm/cm/in)"
                      : "Use format: 2x3 mm | 2x3 cm | 2x3 in (ft not allowed)",
                  );
                }
              }}
              placeholder={
                category === "Other"
                  ? "e.g. Small, Large, 12x18 ft..."   // ✅ generic placeholder
                : item.category === "Wide Format" ? "e.g. 2x3 ft" : "e.g. 4x6 in or 2x3 cm or 2x3 mm"
              }
              className={`border rounded px-3 py-2 w-full text-sm ${
                category !== "Other" &&  // Other me red border nahi 
                item.size &&
                !validateSize(item.size, item.available_sizes, item.category)
                  ? "border-red-500"
                  : "border-slate-300"
              }`}
              required
            />

            <datalist id={`size-list-${index}`}>
              {item.available_sizes
                ?.filter((opt) => {
                  if (
                    item.paper_type === "Maplitho Plotter Paper" ||
                    item.paper_type === "Photo Plotter Paper"
                  ) {
                    return ["A0", "A1", "A2"].includes(opt.name);
                  }
                  return true;
                })
                .map((opt) => (
                  <option key={opt.id} value={opt.name} />
                ))}
            </datalist>
          </div>
        </Field>

        {/* ── Color Scheme — Single Sheet only (Wide Format has none) */}
        {category !== "Multiple Sheet" &&
          category !== "Wide Format" &&
          category !== "Other" && (
            <Field label="Color Scheme" required>
              <Select
                value={item.color_scheme || ""}
                onChange={(e) =>
                  handleItemChange(uniqueKey, "color_scheme", e.target.value)
                }
              >
                <option value="">Select</option>
                <option>Black and White</option>
                <option>Multicolor</option>
              </Select>
            </Field>
          )}
        {/* ── Press Machine — Single Sheet and Wide Format only ── */}
        {category !== "Other" && category !== "Multiple Sheet" && (
          <Field label="Press Machine" required>
            <Select
              value={item.press_type || ""}
              onChange={(e) =>
                handleItemChange(uniqueKey, "press_type", e.target.value)
              }
            >
              <option value="" disabled>
                Select Press Machine
              </option>

              {allowedPressTypes.map((press) => (
                <option key={press.value} value={press.value}>
                  {press.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {/* ── Bindings ── */}
        {category !== "Other" &&
          item.available_bindings &&
          item.available_bindings.length > 0 && (
            <Field label="Type of Binding" required>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                {item.available_bindings.map((b) => (
                  <label
                    key={b.binding_name}
                    className="text-sm flex items-center gap-1"
                  >
                    <input
                      type="checkbox"
                      checked={item.binding_types?.includes(b.binding_name)}
                      disabled={isBindingDisabled(
                        b.binding_name,
                        item.binding_types,
                      )}
                      onChange={(e) =>
                        handleBindingChange(b.binding_name, e.target.checked)
                      }
                    />
                    {b.binding_name}
                  </label>
                ))}
              </div>
            </Field>
          )}

        {/* ── Binding targets — only for Multiple Sheet with 2+ inside papers ── */}
        {category === "Multiple Sheet" &&
          (item.inside_papers || []).length >= 2 && (
            <>
              {/* NUMBERING target selector */}
              {item.binding_types?.includes("Numbering") && (
                <Field label="Numbering — Apply to Which Paper(s)?">
                  <div className="space-y-1">
                    {(item.inside_papers || []).map((paper, pIdx) => {
                      const isChecked = (
                        item.binding_targets?.numbering_paper_ids || []
                      ).includes(paper._id);

                      const label = [
                        `Inside Paper ${pIdx + 1}`,
                        paper.paper_type,
                        paper.paper_gsm ? `${paper.paper_gsm} GSM` : null,
                      ]
                        .filter(Boolean)
                        .join(" — ");

                      return (
                        <label
                          key={paper._id || pIdx}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const prev =
                                item.binding_targets?.numbering_paper_ids || [];
                              const updated = e.target.checked
                                ? [...prev, paper._id]
                                : prev.filter((id) => id !== paper._id);
                              handleItemChange(uniqueKey, "binding_targets", {
                                ...item.binding_targets,
                                numbering_paper_ids: updated,
                              });
                            }}
                          />
                          <span className="text-slate-700">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                  {(item.binding_targets?.numbering_paper_ids || []).length > 1 && (
                    <p className="text-xs text-blue-600 mt-1">
                      ₹ cost will be multiplied by{" "}
                      {item.binding_targets.numbering_paper_ids.length} papers.
                    </p>
                  )}
                </Field>
              )}

              {/* PERFORATION target selector */}
              {item.binding_types?.includes("Perforation") && (
                <Field label="Perforation — Apply to Which Paper(s)?">
                  <div className="space-y-1">
                    {(item.inside_papers || []).map((paper, pIdx) => {
                      const isChecked = (
                        item.binding_targets?.perforation_paper_ids || []
                      ).includes(paper._id);

                      const label = [
                        `Inside Paper ${pIdx + 1}`,
                        paper.paper_type,
                        paper.paper_gsm ? `${paper.paper_gsm} GSM` : null,
                      ]
                        .filter(Boolean)
                        .join(" — ");

                      return (
                        <label
                          key={paper._id || pIdx}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const prev =
                                item.binding_targets?.perforation_paper_ids || [];
                              const updated = e.target.checked
                                ? [...prev, paper._id]
                                : prev.filter((id) => id !== paper._id);
                              handleItemChange(uniqueKey, "binding_targets", {
                                ...item.binding_targets,
                                perforation_paper_ids: updated,
                              });
                            }}
                          />
                          <span className="text-slate-700">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                  {(item.binding_targets?.perforation_paper_ids || []).length > 1 && (
                    <p className="text-xs text-blue-600 mt-1">
                      ₹ cost will be multiplied by{" "}
                      {item.binding_targets.perforation_paper_ids.length} papers.
                    </p>
                  )}
                </Field>
              )}

              {/* INTERLEAF info — no target needed, auto-applies to all */}
              {item.binding_types?.includes("Interleaf") && (
                <div className="col-span-2 text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2 text-amber-800">
                  ℹ️ <b>Interleaf</b> goes between all{" "}
                  <b>{(item.inside_papers || []).length} inside papers</b> automatically.
                  Cost = <b>{item.inside_pages || "?"} pages × {(item.inside_papers || []).length} papers × {item.quantity || "?"} qty → slabs</b>.
                </div>
              )}
            </>
          )}

        {/* ── Crease / Fold extra inputs ── */}
        {/* ----- EXTRA INPUTS FOR SINGLE SHEET ----- */}
        {category === "Single Sheet" &&
          item.binding_types?.includes("Creasing") && (
            <Field label="No. of Crease per Sheet" required>
              <Input
                type="number"
                min="1"
                value={item.creases_per_sheet || ""}
                onChange={(e) =>
                  handleItemChange(
                    uniqueKey,
                    "creases_per_sheet",
                    e.target.value,
                  )
                }
                required
              />
            </Field>
          )}

        {category === "Single Sheet" &&
          item.binding_types?.includes("Folding") && (
            <Field label="No. of Folding per Sheet" required>
              <Input
                type="number"
                min="1"
                value={item.folds_per_sheet || ""}
                onChange={(e) =>
                  handleItemChange(uniqueKey, "folds_per_sheet", e.target.value)
                }
                required
              />
            </Field>
          )}

        {/* Common Fields */}
        <Field label="Quantity" required>
          <Input
            type="number"
            min="1"
            value={item.quantity || ""}
            onChange={(e) =>
              handleItemChange(uniqueKey, "quantity", e.target.value)
            }
            required
          />
        </Field>

        <Field label="Unit Of Measurment" required>
          <Select
            value={item.uom}
            onChange={(e) => handleItemChange(uniqueKey, "uom", e.target.value)}
            required
          >
            <option value="">Select</option>
            <option>Nos</option>
            <option>Pc</option>
            <option>Copies</option>
            <option>Books</option>
            <option>Sheets</option>
          </Select>
        </Field>

        {/* ── Per-item Instructions ── */}
        <Field label="Item Instructions" className="col-span-2">
          <textarea
            value={item.item_instructions || ""}
            onChange={(e) =>
              handleItemChange(uniqueKey, "item_instructions", e.target.value)
            }
            placeholder="Special instructions for this item (e.g. special finish, Serial No)..."
            rows={2}
            className="border border-slate-300 rounded px-3 py-2 w-full text-sm resize-none"
          />
        </Field>

        {/* ── Unit Rate — with calculating spinner ── */}
        <Field label="Unit Rate" required>
          <div className="relative">
            <Input
              value={
                item.is_calculating
                  ? ""
                  : isEditing
                  ? item.unit_rate ?? ""
                  : item.unit_rate
                  ? Number(item.unit_rate).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })
                  : ""
              }
              readOnly={category !== "Other"}
              placeholder={item.is_calculating ? "Calculating…" : ""}
              onFocus={() => {
                if (category === "Other") {
                  setEditingField(uniqueKey);
                }
              }}
              onBlur={() => {
                setEditingField(null);
                const num = parseFloat(item.unit_rate);
                if (!isNaN(num)) {
                  handleItemChange(uniqueKey, "unit_rate", num.toFixed(2));
                }
              }}
              onChange={(e) =>
                handleItemChange(uniqueKey, "unit_rate", e.target.value)
              }
              className={item.is_calculating ? "bg-blue-50 text-blue-400 italic" : ""}
            />
            {item.is_calculating && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                <svg
                  className="h-4 w-4 animate-spin text-blue-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              </span>
            )}
          </div>
        </Field>

        <Field label="Item Total" required>
          <Input
            value={
              item.is_calculating
                ? ""
                : item.item_total?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || ""
            }
            placeholder={item.is_calculating ? "Calculating…" : ""}
            onChange={(e) =>
              handleItemChange(uniqueKey, "item_total", e.target.value)
            }
            readOnly
            className={item.is_calculating ? "bg-blue-50 text-blue-400 italic" : ""}
          />
        </Field>


        {/* ---------- Best Sheet Results (Inside + Cover) ---------- */}
        {/* ── [FIX 4] Best Sheet Results — all inside papers + cover + wide ── */}
        <div className="col-span-2 space-y-1 mt-1">

          {/* SINGLE SHEET */}
          {category === "Single Sheet" && cs?.ss_sheets_with_wastage != null && (
            <div className="text-xs bg-green-50 border border-green-200 rounded px-3 py-2 space-y-0.5">
              <p className="font-semibold text-green-800">📄 Single Sheet Breakdown</p>
              <p className="text-green-700">
                Sheet: <b>{item.best_inside_sheet_name}</b> ({item.best_inside_dimensions})
                {" "}· UPS: <b>{cs.ss_ups}</b>
                {" "}· Sheets: <b>{cs.ss_sheets}</b> → with wastage: <b>{cs.ss_sheets_with_wastage}</b>
                {" "}· Rate: <b>{rs(cs.ss_sheet_rate)}</b>
                {" "}· Sheet cost: <b>{rs(cs.ss_sheet_cost)}</b>
                {" "}· Print cost: <b>{rs(cs.ss_printing_cost)}</b>
                {cs.binding_cost > 0 && <> · Binding: <b>{rs(cs.binding_cost)}</b></>}
              </p>
            </div>
          )}

          {/* MULTIPLE SHEET — per inside paper */}
          {category === "Multiple Sheet" && item.inside_papers?.map((paper, pIdx) =>
            paper.best_sheet_size_name ? (
              <div key={paper._id || pIdx} className="text-xs bg-green-50 border border-green-200 rounded px-3 py-1.5">
                <span className="font-semibold text-green-800">🗒 Inside Paper {pIdx + 1}: </span>
                <span className="text-green-700">
                  <b>{paper.best_sheet_name}</b> ({paper.best_sheet_dims})
                  {" "}· UPS: <b>{paper.ups}</b>
                  {" "}· Sheets: <b>{paper.sheets}</b> → <b>{paper.sheets_with_wastage}</b>
                  {" "}· {rs(paper.sheet_rate)}/sheet
                  {" "}· Sheet cost: <b>{rs(paper.sheet_cost)}</b>

                  {paper.to_print && paper.printing_cost != null && <> · Print: <b>{rs(paper.printing_cost)}</b></>}
                  {paper.to_print && paper.press_type && (
                    <> · Press: <b>{paper.press_type}</b></>
                  )}
                  {!paper.to_print && <> · <i>not printed</i></>}
                </span>
              </div>
            ) : null,
          )}

          {/* MULTIPLE SHEET — cover */}
          {category === "Multiple Sheet" && cs?.ms_cover_sheets_with_wastage != null && (
            <div className="text-xs bg-blue-50 border border-blue-200 rounded px-3 py-2 space-y-1">
              <p className="font-semibold text-blue-800">📘 Cover Breakdown</p>

              {/* Sheet info */}
              <p className="text-blue-700">
                Sheet: <b>{item.best_cover_sheet_name}</b> ({item.best_cover_dimensions})
                {" "}· UPS: <b>{cs.ms_cover_ups}</b>
                {" "}· Sheets: <b>{cs.ms_cover_sheets}</b> → with wastage: <b>{cs.ms_cover_sheets_with_wastage}</b>
                {" "}· Rate: <b>{rs(cs.ms_cover_sheet_rate)}</b>
                {" "}· Sheet cost: <b>{rs(cs.ms_cover_sheet_cost)}</b>
              </p>

              {/* Spine + flat size — only for 4-page wrap covers */}
              {item.cover_spine_width_mm != null && item.cover_spine_width_mm > 0 && (
                <p className="text-blue-600">
                  Spine: <b>{Number(item.cover_spine_width_mm).toFixed(1)} mm</b>
                  {item.cover_flat_width_inches != null && (
                    <>
                      {" "}· Flat cover width: <b>{Number(item.cover_flat_width_inches).toFixed(3)}"</b>
                      <span className="text-blue-400 ml-1">
                        (back + spine + front)
                      </span>
                    </>
                  )}
                </p>
              )}

              {/* Printing cost — only when cover is sent to press */}
              {cs.ms_cover_to_print !== false && cs.ms_cover_printing_cost > 0 && (
                <p className="text-blue-700">
                  Print cost: <b>{rs(cs.ms_cover_printing_cost)}</b>
                  {item.cover_press_type && <> · Press: <b>{item.cover_press_type}</b></>}
                  {item.cover_color_scheme && <> · Color: <b>{item.cover_color_scheme}</b></>}
                </p>
              )}

              {cs.ms_cover_to_print === false && (
                <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  🚫 Cover not sent to press — paper cost only
                </p>
              )}

              {cs.binding_cost > 0 && (
                <p className="text-blue-700">Binding: <b>{rs(cs.binding_cost)}</b></p>
              )}
            </div>
          )}

          {/* WIDE FORMAT */}
          {category === "Wide Format" && item.calculation_type && (
            <div className="text-xs bg-purple-50 border border-purple-200 rounded px-3 py-2 space-y-0.5">
              <p className="font-semibold text-purple-800">🖼 Wide Format Breakdown</p>
              <p className="text-purple-700">
                Material: <b>{item.selected_material}</b>
                {item.material_info?.board_width_ft && <> · Board: <b>{item.material_info.board_width_ft}×{item.material_info.board_height_ft}ft</b></>}
                {" "}· Type: <b>{item.calculation_type.toUpperCase()}</b>
                {item.wide_ups    != null && <> · UPS: <b>{item.wide_ups}</b></>}
                {item.rolls_or_boards_used != null && <> · Used: <b>{item.rolls_or_boards_used}</b></>}
                {item.wastage_sqft != null && <> · Wastage: <b>{Number(item.wastage_sqft).toFixed(2)} sqft</b></>}
                {cs?.wf_material_cost != null && <> · Material: <b>{rs(cs.wf_material_cost)}</b></>}
                {cs?.wf_printing_cost > 0 && <> · Print: <b>{rs(cs.wf_printing_cost)}</b></>}
                {cs?.binding_cost > 0 && <> · Binding: <b>{rs(cs.binding_cost)}</b></>}
              </p>
            </div>
          )}

          {/* Summary total line — shown for all calculated categories */}
          {cs && category !== "Other" && (
            <div className="text-xs bg-slate-100 border border-slate-200 rounded px-3 py-1.5 flex flex-wrap gap-4">
              {cs.total_sheet_cost    > 0 && <span>Sheet total: <b>{rs(cs.total_sheet_cost)}</b></span>}
              {cs.total_printing_cost > 0 && <span>Print total: <b>{rs(cs.total_printing_cost)}</b></span>}
              {cs.binding_cost        > 0 && <span>Binding: <b>{rs(cs.binding_cost)}</b></span>}
              <span className="ml-auto font-semibold text-slate-700">Unit rate: <b>{rs(cs.unit_rate)}</b></span>
            </div>
          )}


        </div>
      </div>
    </FormCard>
  );
});

export default JobItem;
