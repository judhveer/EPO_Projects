import { useState } from "react";
import { createJobCard } from "../../lib/jobFmsApi";
import FormCard from "../../components/salesPipeline/FormCard.jsx";
import Field from "../../components/salesPipeline/Field.jsx";
import Input from "../../components/salesPipeline/Input.jsx";
import Select from "../../components/salesPipeline/Select.jsx";
import Button from "../../components/salesPipeline/Button.jsx";

export default function JobCardForm({ onCreated }) {
  const [form, setForm] = useState({
    client_type: "",
    order_source: "",
    party_name: "",
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
    unit_rate: "",
    total_amount: "",
    advance_payment: "",
    mode_of_payment: "",
    no_of_files: "",
    order_received_by: "",
    job_items: [],
  });

  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleItemChange = (index, field, value) => {
    setForm((prev) => {
      const items = [...prev.job_items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, job_items: items };
    });
  };

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      job_items: [...prev.job_items, { category: "", enquiry_for: "", options: {} }],
    }));
  };

  const removeItem = (index) => {
    setForm((prev) => ({
      ...prev,
      job_items: prev.job_items.filter((_, i) => i !== index),
    }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setOk(false);
    setErr("");
    setLoading(true);

    try {
      const { data } = await createJobCard(form);
      setOk(true);
      setForm({
        client_type: "",
        order_source: "",
        party_name: "",
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
        unit_rate: "",
        total_amount: "",
        advance_payment: "",
        mode_of_payment: "",
        no_of_files: "",
        order_received_by: "",
        job_items: [],
      });
      onCreated?.(data);
    } catch (error) {
      console.error(error);
      setErr(error.response?.data?.message || "Failed to create Job Card");
    } finally {
      setLoading(false);
    }
  }

  const commonBindings = [
    "Cutting", "Trimming", "Lamination", "Creasing", "Folding",
    "Centre Pin", "Side Pin", "Gum Pasting", "Hard-Bound", "Spiral-Bound",
    "Wiro-Bound", "Perfect-Bound", "Numbering", "Interleaf", "Perforation",
    "Pad Binding", "Loose bound", "Tin Mounting", "Top Pin",
  ];

  const wideBindings = ["Cutting", "Pasting", "Lamination", "Eyelid", "Vinyl pasting"];
  const otherBindings = ["Pasting", "Cutting", "Fixing"];

  return (
    <FormCard title="🧾 Job Card Entry">
      {ok && (
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          ✅ Job Card created successfully!
        </div>
      )}
      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <form className="grid md:grid-cols-3 gap-4" onSubmit={onSubmit}>
        {/* ---------------- JOB CARD FIELDS ---------------- */}
        <Field label="Party Name" required>
          <Input name="party_name" value={form.party_name} onChange={onChange} required />
        </Field>

        <Field label="Client Type" required>
          <Select name="client_type" value={form.client_type} onChange={onChange} required>
            <option value="">Select</option>
            <option>Govt</option>
            <option>Pvt</option>
            <option>Institution</option>
            <option>Other</option>
          </Select>
        </Field>

        <Field label="Order Source" required>
          <Select name="order_source" value={form.order_source} onChange={onChange} required>
            <option value="">Select</option>
            <option>Email</option>
            <option>WhatsApp</option>
            <option>ClientReference</option>
            <option>WalkIn</option>
            <option>Call</option>
          </Select>
        </Field>

        <Field label="Order Type" required>
          <Select name="order_type" value={form.order_type} onChange={onChange} required>
            <option value="">Select</option>
            <option>Work Order</option>
            <option>Bulk Order</option>
            <option>Project Based Order</option>
            <option>Job Order</option>
          </Select>
        </Field>

        <Field label="Email ID">
          <Input name="email_id" type="email" value={form.email_id} onChange={onChange} />
        </Field>

        <Field label="Contact Number">
          <Input name="contact_number" type="tel" value={form.contact_number} onChange={onChange} />
        </Field>

        <Field label="Address">
          <textarea
            name="address"
            value={form.address}
            onChange={onChange}
            className="border border-slate-300 rounded px-3 py-2 w-full text-sm"
          />
        </Field>

        <Field label="Order Received By" required>
          <Input name="order_received_by" value={form.order_received_by} onChange={onChange} required/>
        </Field>


        <Field label="Execution Location" required>
          <Select name="execution_location" value={form.execution_location} onChange={onChange} required>
            <option value="">Select</option>
            <option>In-Bound</option>
            <option>Out-Bound</option>
          </Select>
        </Field>

        <Field label="Delivery Location" required>
          <Select name="delivery_location" value={form.delivery_location} onChange={onChange} required>
            <option value="">Select</option>
            <option>EPO to Customer</option>
            <option>MM to Customer</option>
            <option>Delivery Address</option>
          </Select>
        </Field>

        {form.delivery_location === "Delivery Address" && (
          <Field label="Delivery Address">
            <textarea
              name="delivery_address"
              value={form.delivery_address}
              onChange={onChange}
              className="border border-slate-300 rounded px-3 py-2 w-full text-sm"
            />
          </Field>
        )}

        <Field label="Delivery Date" required>
          <Input type="datetime-local" name="delivery_date" value={form.delivery_date} onChange={onChange} required />
        </Field>

        <Field label="Proof Date">
          <Input type="date" name="proof_date" value={form.proof_date} onChange={onChange} />
        </Field>

        <Field label="Priority" required>
          <Select name="task_priority" value={form.task_priority} onChange={onChange} required>
            <option value="">Select</option>
            <option>Urgent</option>
            <option>Complete By Date</option>
          </Select>
        </Field>

        <Field label="Instructions">
          <textarea
            name="instructions"
            value={form.instructions}
            onChange={onChange}
            className="border border-slate-300 rounded px-3 py-2 w-full text-sm"
          />
        </Field>

        <Field label="Unit Rate">
          <Input type="number" name="unit_rate" value={form.unit_rate} onChange={onChange} step="0.01" />
        </Field>

        <Field label="Total Amount">
          <Input type="number" name="total_amount" value={form.total_amount} onChange={onChange} step="0.01" />
        </Field>

        <Field label="Advance Payment">
          <Input type="number" name="advance_payment" value={form.advance_payment} onChange={onChange} step="0.01" />
        </Field>

        <Field label="Mode of Payment">
          <Select name="mode_of_payment" value={form.mode_of_payment} onChange={onChange}>
            <option value="">Select</option>
            <option>Cashmemo</option>
            <option>Bill</option>
            <option>Other</option>
          </Select>
        </Field>

        <Field label="Handled By" required>
          <Select name="order_handled_by" value={form.order_handled_by} onChange={onChange} required>
            <option value="">Select</option>
            <option>Fanny</option>
            <option>Saphiiaibet</option>
          </Select>
        </Field>

        <Field label="No of Files" required>
          <Input type="number" name="no_of_files" value={form.no_of_files} onChange={onChange} required />
        </Field>


        {/* ---------------- JOB ITEMS ---------------- */}
        <div className="md:col-span-3 mt-6">
          <h3 className="font-semibold text-blue-700 mb-3">📦 Job Items</h3>

          {form.job_items.map((item, index) => {
            const category = item.category;
            return (
              <FormCard key={index} title={`Item ${index + 1}`}>
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Category" required>
                    <Select
                      value={item.category}
                      onChange={(e) => handleItemChange(index, "category", e.target.value)}
                    >
                      <option value="">Select</option>
                      <option>SingleSheet</option>
                      <option>MultipleSheet</option>
                      <option>WideFormat</option>
                      <option>Other</option>
                    </Select>
                  </Field>

                  <Field label="Enquiry For">
                    <Input
                      value={item.enquiry_for || ""}
                      onChange={(e) => handleItemChange(index, "enquiry_for", e.target.value)}
                    />
                  </Field>

                  {/* Category-specific options */}
                  {(category === "SingleSheet" || category === "MultipleSheet") && (
                    <>
                      <Field label="Sides">
                        <Select
                          value={item.options?.sides || ""}
                          onChange={(e) =>
                            handleItemChange(index, "options", {
                              ...item.options,
                              sides: e.target.value,
                            })
                          }
                        >
                          <option>Single Side</option>
                          <option>Both Side</option>
                        </Select>
                      </Field>

                      <Field label="Color Scheme">
                        <Select
                          value={item.options?.color_scheme || ""}
                          onChange={(e) =>
                            handleItemChange(index, "options", {
                              ...item.options,
                              color_scheme: e.target.value,
                            })
                          }
                        >
                          <option>Black and White</option>
                          <option>Multi-color</option>
                        </Select>
                      </Field>

                      <Field label="Cover Pages">
                        <Input
                          type="number"
                          value={item.options?.cover_pages || ""}
                          onChange={(e) =>
                            handleItemChange(index, "options", {
                              ...item.options,
                              cover_pages: e.target.value,
                            })
                          }
                        />
                      </Field>

                      <Field label="Inside Pages">
                        <Input
                          type="number"
                          value={item.options?.inside_pages || ""}
                          onChange={(e) =>
                            handleItemChange(index, "options", {
                              ...item.options,
                              inside_pages: e.target.value,
                            })
                          }
                        />
                      </Field>

                      <Field label="Type of Binding">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                          {commonBindings.map((b) => (
                            <label key={b} className="text-sm">
                              <input
                                type="checkbox"
                                checked={item.options?.binding_types?.includes(b)}
                                onChange={(e) => {
                                  const prev = item.options?.binding_types || [];
                                  const updated = e.target.checked
                                    ? [...prev, b]
                                    : prev.filter((x) => x !== b);
                                  handleItemChange(index, "options", {
                                    ...item.options,
                                    binding_types: updated,
                                  });
                                }}
                                className="mr-1"
                              />
                              {b}
                            </label>
                          ))}
                        </div>
                      </Field>
                    </>
                  )}

                  {category === "WideFormat" && (
                    <>
                      <Field label="Type of Print">
                        <Select
                          value={item.options?.type_of_print || ""}
                          onChange={(e) =>
                            handleItemChange(index, "options", {
                              ...item.options,
                              type_of_print: e.target.value,
                            })
                          }
                        >
                          <option>Wide-Format</option>
                          <option>Digital Machine</option>
                          <option>Flex Machine</option>
                          <option>HMT</option>
                        </Select>
                      </Field>

                      <Field label="Type of Binding">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                          {wideBindings.map((b) => (
                            <label key={b} className="text-sm">
                              <input
                                type="checkbox"
                                checked={item.options?.binding_types?.includes(b)}
                                onChange={(e) => {
                                  const prev = item.options?.binding_types || [];
                                  const updated = e.target.checked
                                    ? [...prev, b]
                                    : prev.filter((x) => x !== b);
                                  handleItemChange(index, "options", {
                                    ...item.options,
                                    binding_types: updated,
                                  });
                                }}
                                className="mr-1"
                              />
                              {b}
                            </label>
                          ))}
                        </div>
                      </Field>
                    </>
                  )}

                  {category === "Other" && (
                    <Field label="Type of Binding">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                        {otherBindings.map((b) => (
                          <label key={b} className="text-sm">
                            <input
                              type="checkbox"
                              checked={item.options?.binding_types?.includes(b)}
                              onChange={(e) => {
                                const prev = item.options?.binding_types || [];
                                const updated = e.target.checked
                                  ? [...prev, b]
                                  : prev.filter((x) => x !== b);
                                handleItemChange(index, "options", {
                                  ...item.options,
                                  binding_types: updated,
                                });
                              }}
                              className="mr-1"
                            />
                            {b}
                          </label>
                        ))}
                      </div>
                    </Field>
                  )}

                  {/* Common Fields */}
                  <Field label="Size">
                    <Input
                      value={item.size || ""}
                      onChange={(e) => handleItemChange(index, "size", e.target.value)}
                    />
                  </Field>

                  <Field label="UOM">
                    <Select
                      value={item.uom || ""}
                      onChange={(e) => handleItemChange(index, "uom", e.target.value)}
                    >
                      <option>Pc</option>
                      <option>Nos</option>
                      <option>Copies</option>
                      <option>Books</option>
                      <option>Sheets</option>
                    </Select>
                  </Field>

                  <Field label="Quantity">
                    <Input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                    />
                  </Field>
                </div>

                <div className="pt-3">
                  <Button
                    type="button"
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => removeItem(index)}
                  >
                    🗑 Remove Item
                  </Button>
                </div>
              </FormCard>
            );
          })}

          <Button type="button" className="mt-3 bg-green-600 hover:bg-green-700" onClick={addItem}>
            ➕ Add Job Item
          </Button>
        </div>

        {/* ---------------- SUBMIT ---------------- */}
        <div className="md:col-span-3 mt-6">
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Job Card"}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}
