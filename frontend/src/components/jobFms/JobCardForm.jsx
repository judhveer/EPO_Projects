import { useState, useEffect } from "react";
import { createJobCard } from "../../lib/jobFmsApi";
import api from "../../lib/api.js";
import debounce from "lodash.debounce";
import FormCard from "../../components/salesPipeline/FormCard.jsx";
import Field from "../../components/salesPipeline/Field.jsx";
import Input from "../../components/salesPipeline/Input.jsx";
import Select from "../../components/salesPipeline/Select.jsx";
import Button from "../../components/salesPipeline/Button.jsx";

export default function JobCardForm({
  onCreated,
  onUpdated,
  existingJob,
  isEditMode,
}) {
  const [form, setForm] = useState({
    client_type: "",
    order_source: "",
    client_name: "",
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
    payment_status: "",
    no_of_files: "",
    order_received_by: "",
    job_items: [],
  });

  const [clientSuggestions, setClientSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const [users, setUsers] = useState([]);
  const [crmUsers, setCrmUsers] = useState([]);

  const [enquiryItems, setEnquiryItems] = useState([]);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

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
      }
    }
    loadUsers();
  }, []);

  useEffect(() => {
    async function loadEnquiryItems() {
      try {
        const { data } = await api.get("/api/fms/jobcards/enquiry/items");
        setEnquiryItems(data || []);
      } catch (err) {
        console.error("Failed to load enquiry items:", err);
      }
    }
    loadEnquiryItems();
  }, []);

  useEffect(() => {
    const el = document.querySelector(".active-suggestion");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    if (existingJob) {
      const formatDateTimeLocal = (isoString) => {
        if (!isoString) return "";
        const date = new Date(isoString);
        const offset = date.getTimezoneOffset();
        const localDate = new Date(date.getTime() - offset * 60000);
        return localDate.toISOString().slice(0, 16);
      };

      const formatDateOnly = (isoString) => {
        if (!isoString) return "";
        const date = new Date(isoString);
        return date.toISOString().slice(0, 10);
      };

      setForm({
        ...existingJob,
        delivery_date: formatDateTimeLocal(existingJob.delivery_date),
        proof_date: formatDateOnly(existingJob.proof_date),
        job_items: existingJob.items || [],
      });
    }
  }, [existingJob]);

  const searchClients = debounce(async (query) => {
    if (!query) return setClientSuggestions([]);
    try {
      const { data } = await api.get(`/api/clients/search?q=${query}`);
      setClientSuggestions(data);
    } catch (err) {
      console.error("Failed to fetch clients", err);
    }
  }, 400);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));

    if (name === "client_name") {
      searchClients(value);
    }
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
      job_items: [
        ...prev.job_items,
        { category: "", enquiry_for: "", options: {} },
      ],
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
      if (isEditMode && existingJob?.job_no) {
        await api.put(`/api/fms/jobcards/${existingJob.job_no}`, form);
        setSuccessMsg("✅ Job Card updated successfully!");
        setShowSuccessPopup(true);
        setOk(true);

        // ⏳ Wait 2 seconds before closing modal (after popup)
        setTimeout(() => {
          setShowSuccessPopup(false);
          onUpdated?.(); // Now close the modal AFTER showing popup
        }, 2000);
      } else {
        const { data } = await createJobCard(form);
        setSuccessMsg("✅ Job Card created successfully!");
        setShowSuccessPopup(true);
        setOk(true);
        onCreated?.(data);

        // 🧹 Reset form after creation only
        setForm({
          client_type: "",
          order_source: "",
          client_name: "",
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
          payment_status: "",
          no_of_files: "",
          order_received_by: "",
          job_items: [],
        });
      }

      // 🕒 Auto-hide popup after 2 seconds
      setTimeout(() => setShowSuccessPopup(false), 2000);
    } catch (error) {
      console.error(error);
      setErr(error.response?.data?.message || "Failed to save Job Card");
    } finally {
      setLoading(false);
    }
  }

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
      )
    );
  };

  // suggestion scroll feature
  const handleKeyDown = async (e) => {
    if (clientSuggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < clientSuggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev > 0 ? prev - 1 : clientSuggestions.length - 1
      );
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const selectedName = clientSuggestions[activeIndex];
      setForm((f) => ({ ...f, client_name: selectedName }));
      setClientSuggestions([]);
      setActiveIndex(-1);

      try {
        const { data } = await api.get(`/api/clients/${selectedName}`);
        setForm((f) => ({
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
      }
    } else if (e.key === "Escape") {
      setClientSuggestions([]);
      setActiveIndex(-1);
    }
  };

  const commonBindings = [
    "Cutting",
    "Trimming",
    "Matt Lamination",
    "Gloss Lamination",
    "Creasing",
    "Folding",
    "Centre Pin",
    "Side Pin",
    "Gum Pasting",
    "Hard-Bound",
    "Spiral-Bound",
    "Wiro-Bound",
    "Perfect-Bound",
    "Numbering",
    "Interleaf",
    "Perforation",
    "Pad Binding",
    "Loose bound",
    "Tin Mounting",
    "Top Pin",
    "2 Folding",
    "3 Folding",
    "Stitching",
    "Plotter Cutting",
    "Installation",
  ];

  const wideBindings = [
    "Cutting",
    "Pasting",
    "Lamination",
    "Eyelid",
    "Vinyl pasting",
    "Installation",
  ];
  const otherBindings = ["Pasting", "Cutting", "Fixing", "Installation"];

  // cover color and inside color

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
                    key={i}
                    onClick={async () => {
                      setForm((f) => ({ ...f, client_name: name }));
                      setClientSuggestions([]);
                      setActiveIndex(-1);

                      try {
                        const { data } = await api.get(`/api/clients/${name}`);
                        setForm((f) => ({
                          ...f,
                          client_name: name,
                          client_type: data.client_type,
                          // order_type: data.order_type,
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
            <option>Bulk Order</option>
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

        <Field label="Delivery Location" required>
          <Select
            name="delivery_location"
            value={form.delivery_location}
            onChange={onChange}
            required
          >
            <option value="">Select</option>
            <option>EPO to Customer</option>
            <option>MM to Customer</option>
            <option>Delivery Address</option>
          </Select>
        </Field>

        {form.delivery_location === "Delivery Address" && (
          <Field label="Delivery Address" required>
            <textarea
              name="delivery_address"
              value={form.delivery_address}
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
            <option>Complete By Date</option>
          </Select>
        </Field>

        <Field label="Total Amount">
          <Input
            type="number"
            name="total_amount"
            value={form.total_amount}
            onChange={onChange}
            step="0.01"
          />
        </Field>

        <Field label="Advance Payment">
          <Input
            type="number"
            name="advance_payment"
            value={form.advance_payment}
            onChange={onChange}
            step="0.01"
          />
        </Field>

        <Field label="Mode of Payment">
          <Select
            name="mode_of_payment"
            value={form.mode_of_payment}
            onChange={onChange}
          >
            <option value="">Select</option>
            <option>GST BILL</option>
            <option>PI</option>
            <option>UPI</option>
            <option>Other</option>
          </Select>
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

        <Field label="No of Files" required>
          <Input
            type="number"
            name="no_of_files"
            value={form.no_of_files}
            onChange={onChange}
            required
          />
        </Field>

        <Field label="Unit Rate" required>
          <Input
            type="number"
            name="unit_rate"
            value={form.unit_rate}
            onChange={onChange}
            step="0.01"
            required
          />
        </Field>

        <Field label="Instructions">
          <textarea
            name="instructions"
            value={form.instructions}
            onChange={onChange}
            className="border border-slate-300 rounded px-3 py-2 w-full text-sm"
          />
        </Field>

        {/* ---------------- JOB ITEMS ---------------- */}
        <div className="md:col-span-3 mt-6">
          <h3 className="font-semibold text-blue-700 mb-3">📦 Job Items</h3>

          {form.job_items.map((item, index) => {
            const category = item.category;
            return (
              <FormCard key={index}>
                <div className="flex flex-wrap items-center justify-between">
                  <h4 className="font-semibold text-blue-700">
                    📦 Item {index + 1}
                  </h4>
                  <Button
                    type="button"
                    className="bg-red-600 hover:bg-red-700 px-3 py-1 text-sm"
                    onClick={() => removeItem(index)}
                  >
                    🗑 Remove
                  </Button>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Category" required>
                    <Select
                      value={item.category}
                      onChange={(e) =>
                        handleItemChange(index, "category", e.target.value)
                      }
                    >
                      <option value="">Select</option>
                      <option>SingleSheet</option>
                      <option>MultipleSheet</option>
                      <option>WideFormat</option>
                      <option>Other</option>
                    </Select>
                  </Field>

                  <Field label="Enquiry For" required>
                    <div className="relative">
                      <input
                        list={`enquiry-for-list-${index}`}
                        value={item.enquiry_for || ""}
                        onChange={(e) =>
                          handleItemChange(index, "enquiry_for", e.target.value)
                        }
                        placeholder="Type or select..."
                        className="border border-slate-300 rounded px-3 py-2 w-full text-sm"
                        required
                      />
                      <datalist id={`enquiry-for-list-${index}`}>
                        {enquiryItems.map((opt) => (
                          <option key={opt.id} value={opt.item} />
                        ))}
                      </datalist>
                    </div>
                  </Field>

                  {/* Common Fields */}
                  <Field label="Quantity" required>
                    <Input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) =>
                        handleItemChange(index, "quantity", e.target.value)
                      }
                      required
                    />
                  </Field>

                  <Field label="Unit Of Measurment" required>
                    <Select
                      value={item.uom}
                      onChange={(e) =>
                        handleItemChange(index, "uom", e.target.value)
                      }
                      required
                    >
                      <option value="">Select</option>
                      <option>Pc</option>
                      <option>Nos</option>
                      <option>Copies</option>
                      <option>Books</option>
                      <option>Sheets</option>
                    </Select>
                  </Field>

                  <Field label="Size" required>
                    <Input
                      value={item.size || ""}
                      onChange={(e) =>
                        handleItemChange(index, "size", e.target.value)
                      }
                      required
                    />
                  </Field>

                  {/* Category-specific options */}
                  {(category === "SingleSheet" ||
                    category === "MultipleSheet") && (
                    <>
                      <Field label="Sides" required>
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

                      <Field label="Inside Pages" required>
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

                      <Field label="Cover Pages" required>
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

                      <Field label="Cover Color" required>
                        <Input
                          value={item.options?.cover_color || ""}
                          onChange={(e) =>
                            handleItemChange(index, "options", {
                              ...item.options,
                              cover_color: e.target.value,
                            })
                          }
                        />
                      </Field>

                      <Field label="Inside Color" required>
                        <Input
                          value={item.options?.inside_color || ""}
                          onChange={(e) =>
                            handleItemChange(index, "options", {
                              ...item.options,
                              inside_color: e.target.value,
                            })
                          }
                        />
                      </Field>

                      <Field label="Cover Paper GSM" required>
                        <Input
                          value={item.options?.cover_paper_gsm || ""}
                          onChange={(e) =>
                            handleItemChange(index, "options", {
                              ...item.options,
                              cover_paper_gsm: e.target.value,
                            })
                          }
                        />
                      </Field>

                      <Field label="Inside Paper GSM" required>
                        <Input
                          value={item.options?.inside_paper_gsm || ""}
                          onChange={(e) =>
                            handleItemChange(index, "options", {
                              ...item.options,
                              inside_paper_gsm: e.target.value,
                            })
                          }
                        />
                      </Field>

                      {/* <Field label="Color Scheme" required>
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
                      </Field> */}

                      <Field label="Type of Binding" required>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                          {commonBindings.map((b) => (
                            <label key={b} className="text-sm">
                              <input
                                type="checkbox"
                                checked={item.options?.binding_types?.includes(
                                  b
                                )}
                                onChange={(e) => {
                                  const prev =
                                    item.options?.binding_types || [];
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
                      <Field label="Type of Binding" required>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                          {wideBindings.map((b) => (
                            <label key={b} className="text-sm">
                              <input
                                type="checkbox"
                                checked={item.options?.binding_types?.includes(
                                  b
                                )}
                                onChange={(e) => {
                                  const prev =
                                    item.options?.binding_types || [];
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
                    <Field label="Type of Binding" required>
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
                </div>
              </FormCard>
            );
          })}

          <Button
            type="button"
            className="mt-3 bg-green-600 hover:bg-green-700"
            onClick={addItem}
          >
            ➕ Add Job Item
          </Button>
        </div>

        {/* ---------------- SUBMIT ---------------- */}
        <div className="md:col-span-3 mt-6 mx-auto ">
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
