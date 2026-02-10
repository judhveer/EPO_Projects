import React from "react";
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

  return (
    <FormCard key={item.id || item._temp_id}>
      <div className="flex flex-wrap items-center justify-between">
        <h4 className="font-semibold text-blue-700">📦 Item {index + 1}</h4>
        <Button
          type="button"
          className="bg-red-600 hover:bg-red-700 px-3 py-1 text-sm"
          onClick={() => onRemove(item.id)}
        >
          🗑 Remove
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Category" required>
          <Select
            value={item.category}
            onChange={(e) =>
              handleItemChange(item.id, "category", e.target.value)
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
                handleItemChange(item.id, "enquiry_for", e.target.value)
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

        {item.enquiry_for && (
          <Field label="Paper Type" required>
            <Select
              value={item.paper_type || ""}
              onChange={(e) =>
                handleItemChange(item.id, "paper_type", e.target.value)
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

        {item.paper_type && (
          <Field label="Paper GSM" required>
            <Select
              value={item.paper_gsm || ""}
              onChange={(e) =>
                handleItemChange(item.id, "paper_gsm", e.target.value)
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

        {/* Category-specific options */}

        {category === "Multiple Sheet" && (
          <React.Fragment key={`multiple-${index}`}>
            <Field label="Inside Paper Color" required>
              <Select
                value={item.color_scheme || ""}
                onChange={(e) =>
                  handleItemChange(item.id, "color_scheme", e.target.value)
                }
              >
                <option value="">Select</option>
                <option>Black and White</option>
                <option>Multicolor</option>
              </Select>
            </Field>

            <Field label="Inside Pages" required>
              <Input
                type="number"
                min="1"
                value={item.inside_pages || ""}
                onChange={(e) =>
                  handleItemChange(item.id, "inside_pages", e.target.value)
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
                  handleItemChange(item.id, "cover_paper_type", e.target.value)
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
                    handleItemChange(item.id, "cover_paper_gsm", e.target.value)
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
                    item.id,
                    "cover_color_scheme",
                    e.target.value
                  )
                }
              >
                <option value="">Select</option>
                <option>Black and White</option>
                <option>Multicolor</option>
              </Select>
            </Field>

            <Field label="Cover Pages" required>
              <Select
                value={item.cover_pages || ""}
                onChange={(e) =>
                  handleItemChange(item.id, "cover_pages", e.target.value)
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
                handleItemChange(item.id, "size", e.target.value)
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

          {/* <Input
                      value={item.size || ""}
                      onChange={(e) =>
                        handleItemChange(index, "size", e.target.value)
                      }
                      placeholder="12x24"
                      required
                    /> */}
        </Field>

        {(category === "Multiple Sheet" || category === "Single Sheet") && (
          <Field label="Sides" required>
            <Select
              value={item.sides || ""}
              onChange={(e) =>
                handleItemChange(item.id, "sides", e.target.value)
              }
            >
              <option value="">Select</option>
              <option>Single Side</option>
              <option>Both Side</option>
            </Select>
          </Field>
        )}

        {item.available_bindings && item.available_bindings.length > 0 && (
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

                      handleItemChange(item.id, "binding_types", updated);
                    }}
                  />
                  {b.binding_name}
                  {/* {b.rate !== null && (
                                <span className="text-xs text-gray-500">
                                  ₹{b.rate_per_unit}
                                </span>
                              )} */}
                </label>
              ))}
            </div>
          </Field>
        )}

        {category !== "Multiple Sheet" && (
          <Field label="Color Scheme" required>
            <Select
              value={item.color_scheme || ""}
              onChange={(e) =>
                handleItemChange(item.id, "color_scheme", e.target.value)
              }
            >
              <option value="">Select</option>
              <option>Black and White</option>
              <option>Multicolor</option>
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
              handleItemChange(item.id, "quantity", e.target.value)
            }
            required
          />
        </Field>

        <Field label="Unit Of Measurment" required>
          <Select
            value={item.uom}
            onChange={(e) => handleItemChange(item.id, "uom", e.target.value)}
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
            readOnly
            onChange={(e) =>
              handleItemChange(item.id, "unit_rate", e.target.value)
            }
          />
        </Field>

        <Field label="Item Total" required>
          <Input
            value={item.item_total || ""}
            onChange={(e) =>
              handleItemChange(item.id, "item_total", e.target.value)
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
        </div>
      </div>
    </FormCard>
  );
});

export default JobItem;
