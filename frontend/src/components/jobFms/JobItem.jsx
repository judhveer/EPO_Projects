import React, {useEffect, useMemo} from "react";
import FormCard from "../../components/salesPipeline/FormCard.jsx";
import Field from "../../components/salesPipeline/Field.jsx";
import Input from "../../components/salesPipeline/Input.jsx";
import Select from "../../components/salesPipeline/Select.jsx";
import Button from "../../components/salesPipeline/Button.jsx";

const JobItem = React.memo(function JobItem({
  item,
  index,
  handleItemChange,
  onRemove,
}) {
  const category = item.category;
  const uniqueKey = item.id ?? item._temp_id;


// Define PRESS_TYPES outside component (or inside but stable)
const PRESS_TYPES = [
  { value: "FLEX MACHINE", label: "Flex Machine" },
  { value: "DIGITAL BLACK WHITE", label: "Digital Black & White" },
  { value: "DIGITAL MULTICOLOR", label: "Digital Multicolor" },
  { value: "HMT", label: "HMT Machine" },
  { value: "AUTOPRINT", label: "Autoprint Machine" },
  { value: "PLOTTER PRINTING", label: "Plotter Printing" },
];

// Inside your component:
const allowedPressTypes = useMemo(() => {
  switch (category) {
    case 'Single Sheet':
      return PRESS_TYPES.filter(p => 
        ['DIGITAL BLACK WHITE', 'DIGITAL MULTICOLOR', 'HMT', 'AUTOPRINT', 'PLOTTER PRINTING'].includes(p.value)
      );
    case 'Multiple Sheet':
      return PRESS_TYPES.filter(p => 
        ['DIGITAL BLACK WHITE', 'DIGITAL MULTICOLOR', 'HMT', 'AUTOPRINT'].includes(p.value)
      );
    case 'Wide Format':
      return PRESS_TYPES.filter(p => p.value === 'FLEX MACHINE');
    default:
      return [];
  }
}, [category]);

useEffect(() => {
  // If current press_type is not in allowed list, clear it
  if (item.press_type && !allowedPressTypes.some(p => p.value === item.press_type)) {
    handleItemChange(uniqueKey, 'press_type', '');
  }
}, [category, item.press_type, allowedPressTypes, uniqueKey, handleItemChange]);

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

        {(category === "Single Sheet" || category === "Multiple Sheet") && item.enquiry_for && (
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

        {(category === "Single Sheet" || category === "Multiple Sheet") && item.paper_type && (
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
                    e.target.value
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
              item.available_wide_gsm?.some( (m) => m.gsm !== null || m.thickness_mm !== null ) && (
              <Field
                label={
                  item.wide_material_name === "Sun Board"
                    ? "Thickness"
                    : "GSM"
                }
                required
              >
                <Select
                  value={item.wide_material_name === "Sun Board"
                      ? item.wide_material_thickness || ""
                      : item.wide_material_gsm || ""
                  }
                  onChange={(e) => {
                    const value = e.target.value;

                    if (item.wide_material_name === "Sun Board") {
                      handleItemChange(uniqueKey, "wide_material_thickness", value);
                    } else {
                      handleItemChange(uniqueKey, "wide_material_gsm", value);
                    }
                  }}
                  required
                >
                  <option value="">Select</option>

                  {item.available_wide_gsm
                  ?.filter( (m) => m.gsm !== null || m.thickness_mm !== null )
                  .map((m) => (
                    <option
                      key={m.id}
                      value={
                        item.wide_material_name === "Sun Board"
                          ? m.thickness_mm
                          : m.gsm
                      }
                    >
                      {item.wide_material_name === "Sun Board" ? m.thickness_mm : m.gsm}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}







        {/* Category-specific options */}

        {category === "Multiple Sheet" && (
          <React.Fragment key={`multiple-${index}`}>
            <Field label="Inside Paper Color" required>
              <Select
                value={item.color_scheme || ""}
                onChange={(e) =>
                  handleItemChange(uniqueKey, "color_scheme", e.target.value)
                }
              >
                <option value="">Select</option>
                <option>Black and White</option>
                <option>Bi-Color</option>
                <option>Tri-Color</option>
                <option>Multicolor</option>
              </Select>
            </Field>

            <Field label="Inside Pages" required>
              <Input
                type="number"
                min="1"
                value={item.inside_pages || ""}
                onChange={(e) =>
                  handleItemChange(uniqueKey, "inside_pages", e.target.value)
                }
                placeholder="200"
                required
              />
            </Field>

            {/* COVER PAPER */}
            <Field label="Cover Paper Type" required>
              <Select
                value={item.cover_paper_type || ""}
                onChange={(e) =>
                  handleItemChange(uniqueKey, "cover_paper_type", e.target.value)
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
                    handleItemChange(uniqueKey, "cover_paper_gsm", e.target.value)
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

            <Field label="Cover Paper Color" required>
              <Select
                value={item.cover_color_scheme || ""}
                onChange={(e) =>
                  handleItemChange(
                    uniqueKey,
                    "cover_color_scheme",
                    e.target.value
                  )
                }
              >
                <option value="">Select</option>
                <option>Black and White</option>
                <option>Bi-Color</option>
                <option>Tri-Color</option>
                <option>Multicolor</option>
              </Select>
            </Field>

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
          </React.Fragment>
        )}

        <Field label="Size" required>
          <div className="relative">
            <input
              list={`size-list-${index}`}
              value={item.size || ""}
              onChange={(e) =>
                handleItemChange(uniqueKey, "size", e.target.value)
              }
              placeholder="Select size or type custom (6x9 inches)..."
              className="border border-slate-300 rounded px-3 py-2 w-full text-sm"
              required
            />

            <datalist id={`size-list-${index}`}>
              {item.available_sizes?.map((opt) => (
                <option key={opt.id} value={opt.name} />
              ))}
            </datalist>
          </div>
        </Field>

        {(category !== "Other" ) && (
          <Field label="Sides" required>
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

        {category !== "Other" && item.available_bindings && item.available_bindings.length > 0 && (
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
                    onChange={(e) => {
                      const prev = item.binding_types || [];
                      const updated = e.target.checked
                        ? [...prev, b.binding_name]
                        : prev.filter((x) => x !== b.binding_name);

                      handleItemChange(uniqueKey, "binding_types", updated);

                      // Clear extra fields if unchecked
                      if (!e.target.checked && b.binding_name === "Creasing") {
                        handleItemChange(uniqueKey, "no_of_crease", "");
                      }

                      if (!e.target.checked && b.binding_name === "Folding") {
                        handleItemChange(uniqueKey, "no_of_folding", "");
                      }
                    }}
                  />
                  {b.binding_name}
                </label>
              ))}
            </div>
          </Field>
        )}

        {/* ----- EXTRA INPUTS FOR SINGLE SHEET ----- */}
        {category === "Single Sheet" &&
          item.binding_types?.includes("Creasing") && (
            <Field label="No. of Crease per Sheet" required>
              <Input
                type="number"
                min="1"
                value={item.creases_per_sheet || ""}
                onChange={(e) =>
                  handleItemChange(uniqueKey, "creases_per_sheet", e.target.value)
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

        {category !== "Multiple Sheet" && category !== "Wide Format" && category !== "Other" && (
          <Field label="Color Scheme" required>
            <Select
              value={item.color_scheme || ""}
              onChange={(e) =>
                handleItemChange(uniqueKey, "color_scheme", e.target.value)
              }
            >
              <option value="">Select</option>
              <option>Black and White</option>
              <option>Bi-Color</option>
              <option>Tri-Color</option>
              <option>Multicolor</option>
            </Select>
          </Field>
        )}


        {category !== "Other" && (
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

        <Field label="Unit Rate" required>
          <Input
            value={item.unit_rate || ""}
            readOnly={category !== "Other"}
            onChange={(e) =>
              handleItemChange(uniqueKey, "unit_rate", e.target.value)
            }
          />
        </Field>

        <Field label="Item Total" required>
          <Input
            value={item.item_total || ""}
            onChange={(e) =>
              handleItemChange(uniqueKey, "item_total", e.target.value)
            }
            readOnly
          />
        </Field>

        {/* ---------- Best Sheet Results (Inside + Cover) ---------- */}
        <div className="col-span-2">
          {item.best_inside_sheet && (
            <p className="text-xs text-green-700 mt-1">
              Inside Sheet: <b>{item.best_inside_sheet}</b> (
              {item.best_inside_dimensions}) — UPS:{" "}
              <b>{item.best_inside_ups}</b>
            </p>
          )}

          {item.category === "Multiple Sheet" && item.best_cover_sheet && (
            <p className="text-xs text-blue-700 mt-1">
              Cover Sheet: <b>{item.best_cover_sheet}</b> (
              {item.best_cover_dimensions}) — UPS: <b>{item.best_cover_ups}</b>
            </p>
          )}

          {item.category === "Wide Format" && item.calculation_type && (
            <p className="text-xs text-purple-700 mt-1">
              Material: <b>{item.selected_material}</b>
              {item.material_info.roll_width_ft && (
                <>
                  {" "}—<b>{item.material_info.roll_width_ft}ft x {item.material_info.roll_length_mtr}mtr</b>
                </>
              )}

              {item.material_info.board_width_ft && (
                <>
                  {" "}—<b>{item.material_info.board_width_ft} x {item.material_info.board_height_ft}ft</b>
                </>
              )}

              
              — Type:{" "}
              <b>{item.calculation_type.toUpperCase()}</b>
              {item.rolls_or_boards_used && (
                <>
                  {" "}— Used: <b>{item.rolls_or_boards_used}</b>
                </>
              )}
              {item.wide_ups && (
                <>
                  {" "}— UPS: <b>{item.wide_ups}</b>
                </>
              )}
              {item.wastage_sqft !== undefined && (
                <>
                  {" "}— Wastage: <b>{item.wastage_sqft.toFixed(2)} sqft</b>
                </>
              )}
            </p>
          )}

        </div>
      </div>
    </FormCard>
  );
});

export default JobItem;
