import React, { useState, useEffect, useMemo, useRef } from "react";
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
    const el = document.querySelector(".active-suggestion");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    if (!existingJob) return;

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

    // Build job_items properly using DB values
    const mappedItems = existingJob.items.map((item, index) => {
      return {
        ...item,
        enquiry_for: item.enquiry_for,
        // Rebuild paper fields from selectedPaper
        paper_type: item.selectedPaper?.paper_name || "",
        paper_gsm: item.selectedPaper?.gsm || "",

        // Rebuild cover fields if available
        cover_paper_type: item.selectedCoverPaper?.paper_name || "",
        cover_paper_gsm: item.selectedCoverPaper?.gsm || "",

        // Ensure binding_types is an array
        binding_types: Array.isArray(item.binding_types)
          ? item.binding_types
          : [],

        // Client-side fields needed for dropdowns
        available_items: [],
        available_papers: [],
        available_gsm: [],
        available_gsm_cover: [],
        available_bindings: [],
      };
    });

    setForm({
      ...existingJob,
      delivery_date: formatDateTimeLocal(existingJob.delivery_date),
      proof_date: formatDateOnly(existingJob.proof_date),
      job_items: mappedItems,
    });

    // NOW LOAD DROPDOWN OPTIONS FOR EACH ITEM
    mappedItems.forEach((item, index) => {
      if (item.category) {
        // loadCategoryItems(index, item.category);
        loadCategoryBindings(index, item.category);
      }

      if (item.enquiry_for) {
        loadItemPapers(index, item.enquiry_for);
      }

      if (item.paper_type) {
        loadItemPapersGsm(index, item.paper_type, "inside");
      }

      if (item.cover_paper_type) {
        loadItemPapersGsm(index, item.cover_paper_type, "cover");
      }
    });
  }, [existingJob]);

  const searchClients = useMemo(
    () =>
      debounce(async (query) => {
        if (!query) return setClientSuggestions([]);
        try {
          const { data } = await api.get(`/api/clients/search?q=${query}`);
          setClientSuggestions(data);
        } catch (err) {
          console.error("Failed to fetch clients", err);
        }
      }, 400),
    []
  );

  useEffect(() => {
    return () => {
      searchClients.cancel();
    };
  }, [searchClients]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [clientSuggestions]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));

    if (name === "client_name") {
      searchClients(value);
    }
  };

  const loadCategoryItems = async (index, category) => {
    try {
      const { data } = await api.get(
        `/api/fms/items/by-category?category=${category}`
      );

      setForm((prev) => {
        const items = [...prev.job_items];

        items[index] = {
          ...items[index],
          available_items: data,  // store category items
          enquiry_for: "",
          paper_type: "",
          paper_gsm: "",
          available_gsm: [],
          available_gsm_cover: [],
          cover_paper_type: "",
          cover_paper_gsm: "",
          cover_color_scheme: "",
        };
        return { ...prev, job_items: items };
      });
    } catch (err) {
      console.error("Failed to load category items", err);
    }
  };

  const loadCategoryBindings = async (index, category) => {
    try {
      const { data } = await api.get(
        `/api/fms/items/bindings?category=${category}`
      );

      setForm((prev) => {
        const items = [...prev.job_items];
        items[index] = {
          ...items[index],
          available_bindings: data, // store category items
        };

        return { ...prev, job_items: items };
      });
    } catch (err) {
      console.error("Failed to load category items", err);
    }
  };

  const loadItemPapers = async (index, itemName) => {
    try {
      const { data } = await api.get(`/api/fms/items/paper-types`);

      setForm((prev) => {
        const items = [...prev.job_items];
        items[index] = {
          ...items[index],
          available_papers: data
        }; // store all papers
        return { ...prev, job_items: items };
      });
    } catch (err) {
      console.error("Failed to load papers:", err);
    }
  };

  const loadItemPapersGsm = async (index, paperName, type = "inside") => {
    try {
      const { data } = await api.get(
        `/api/fms/items/paper-types/gsm?paperName=${paperName}`
      );

      setForm((prev) => {
        const items = [...prev.job_items];

        if (type === "inside") {
          items[index] = {
            ...items[index],
            available_gsm: data,
          };
        } else {
          items[index].available_gsm_cover = data;
        }

        return { ...prev, job_items: items };
      });
    } catch (err) {
      console.error("Failed to load paper gsm:", err);
    }
  };

  const calculateItemBackend = async (index) => {
    try {
      const item = form.job_items[index];
      
      // basic guard
      if (!item.quantity || !item.paper_type || !item.paper_gsm) {
        alert("Please fill all required fields before calculating");
        return;
      }

      // Clean the items before sending
      const cleanedItems = cleanJobItems(form.job_items);
      const cleanedItem = cleanJobItems([item])[0];

      // Send all required fields to backend
      const payload = {
        item: cleanedItem,
        all_items: cleanedItems, // send all items so backend can recalc total_amount
      };

      const { data } = await api.post(`/api/fms/items/calculate-item`, payload);
      // Backend returns: { unit_rate, item_total, total_amount }
      setForm((prev) => {
        const updatedItems = [...prev.job_items];

        updatedItems[index] = {
          ...updatedItems[index],

          // 🔥 Store unit & item total
          unit_rate: data.totals.unit_rate,
          item_total: data.totals.item_total,

          // 🔥 Store inside best-sheet details
          best_inside_sheet: data.inside.sheet_selected,
          best_inside_dimensions: data.inside.sheet_dimensions,
          best_inside_ups: data.inside.ups,

          // 🔥 Store cover best-sheet details (may be null for Single Sheet)
          best_cover_sheet: data.cover.sheet_selected,
          best_cover_dimensions: data.cover.sheet_dimensions,
          best_cover_ups: data.cover.ups,
        };

        return {
          ...prev,
          job_items: updatedItems,
          total_amount: data.totals?.grand_total ?? prev.total_amount,
        };
      });
    } catch (err) {
      console.error("Item calculation failed:", err);
    }
  };

  const loadSizes = async (index, search) => {
    try {
      const { data } = await api.get(`/api/fms/items/sizes?search=${search}`);

      setForm((prev) => {
        const items = [...prev.job_items];
        items[index] = {
          ...items[index],
          available_sizes: data,
        };
        return { ...prev, job_items: items };
      });
    } catch (err) {
      console.error("Failed to load sizes", err);
    }
  };

  const handleItemChange = async (index, field, value) => {
    setForm((prev) => {
      const items = [...prev.job_items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, job_items: items };
    });
    // If category changes → fetch items from backend
    if (field === "category") {
      loadCategoryItems(index, value);
      loadCategoryBindings(index, value);
    }

    if (field === "enquiry_for") {
      loadItemPapers(index, value);
    }

    if (field === "paper_type") {
      loadItemPapersGsm(index, value);
    }

    if (field === "cover_paper_type") {
      loadItemPapersGsm(index, value, "cover");
    }

    if (field === "size") {
      loadSizes(index, value);
    }

    // 🔥 Run backend calculation ONLY when quantity is entered
    if (field === "uom") {
      await calculateItemBackend(index);
    }
  };

  const createEmptyItem = () => ({
    id: crypto.randomUUID(),
    category: "",
    enquiry_for: "",
    quantity: "",
    uom: "",
    binding_types: [],
    available_items: [],
    available_papers: [],
    available_gsm: [],
    available_gsm_cover: [],
    available_bindings: [],
  });

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      job_items: [...prev.job_items, createEmptyItem()],
    }));
  };

  const removeItem = (index) => {
    setForm((prev) => ({
      ...prev,
      job_items: prev.job_items.filter((_, i) => i !== index),
    }));
  };

  const cleanJobItems = (items) => {
    return items.map((item) => {
      const {
        available_items,
        available_papers,
        available_gsm,
        available_gsm_cover,
        available_bindings,
        available_sizes,
        ...cleaned
      } = item;
      return cleaned;
    });
  };
  

  async function onSubmit(e) {
    e.preventDefault();
    setOk(false);
    setErr("");
    setLoading(true);

    const isValidJobItems = form.job_items.every(
      (item) => item.quantity && item.uom && item.unit_rate && item.item_total
    );

    if (!isValidJobItems) {
      setErr("Please complete all job items before submitting");
      setLoading(false);
      return;
    }

    const payload = {
      ...form,
      job_items: cleanJobItems(form.job_items),
    };

    try {
      if (isEditMode && existingJob?.job_no) {
        await api.put(`/api/fms/jobcards/${existingJob.job_no}`, payload);
        setSuccessMsg("✅ Job Card updated successfully!");
        setShowSuccessPopup(true);
        setOk(true);

        // ⏳ Wait 2 seconds before closing modal (after popup)
        setTimeout(() => {
          setShowSuccessPopup(false);
          onUpdated?.(); // Now close the modal AFTER showing popup
        }, 2000);
      } else {
        const { data } = await createJobCard(payload);
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
                    key={name}
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
            value={form.instructions}
            onChange={onChange}
            className="border border-slate-300 rounded px-3 py-2 w-full text-sm"
          />
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

          {form.job_items.map((item, index) => {
            const category = item.category;
            return (
              <FormCard key={item.id}>
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
                          handleItemChange(index, "enquiry_for", e.target.value)
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
                          handleItemChange(index, "paper_type", e.target.value)
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
                          handleItemChange(index, "paper_gsm", e.target.value)
                        }
                        required
                      >
                        <option value="">Select GSM</option>

                        {item.available_gsm?.map((p) => (
                          <option key={p.id} value={p.gsm}>
                            {p.gsm}{" "}
                            {p.size_category ? ` (${p.size_category})` : ""}
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
                            handleItemChange(
                              index,
                              "color_scheme",
                              e.target.value
                            )
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
                            handleItemChange(
                              index,
                              "inside_pages",
                              e.target.value
                            )
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
                            handleItemChange(
                              index,
                              "cover_paper_type",
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

                      {item.cover_paper_type && (
                        <Field label="Cover Paper GSM" required>
                          <Select
                            value={item.cover_paper_gsm || ""}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "cover_paper_gsm",
                                e.target.value
                              )
                            }
                            required
                          >
                            <option value="">Select GSM</option>
                            {item.available_gsm_cover?.map((g) => (
                              <option key={g.id} value={g.gsm}>
                                {g.gsm}{" "}
                                {g.size_category ? ` (${g.size_category})` : ""}
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
                              index,
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
                            handleItemChange(
                              index,
                              "cover_pages",
                              e.target.value
                            )
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
                          handleItemChange(index, "size", e.target.value)
                        }
                        placeholder="Select size or type custom..."
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

                  {(category === "Multiple Sheet" ||
                    category === "Single Sheet") && (
                    <Field label="Sides" required>
                      <Select
                        value={item.sides || ""}
                        onChange={(e) =>
                          handleItemChange(index, "sides", e.target.value)
                        }
                      >
                        <option value="">Select</option>
                        <option>Single Side</option>
                        <option>Both Side</option>
                      </Select>
                    </Field>
                  )}

                  {item.available_bindings &&
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
                                checked={item.binding_types?.includes(
                                  b.binding_name
                                )}
                                onChange={(e) => {
                                  const prev = item.binding_types || [];
                                  const updated = e.target.checked
                                    ? [...prev, b.binding_name]
                                    : prev.filter((x) => x !== b.binding_name);

                                  handleItemChange(
                                    index,
                                    "binding_types",
                                    updated
                                  );
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
                          handleItemChange(
                            index,
                            "color_scheme",
                            e.target.value
                          )
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
                        handleItemChange(index, "unit_rate", e.target.value)
                      }
                    />
                  </Field>

                  <Field label="Item Total" required>
                    <Input
                      value={item.item_total || ""}
                      onChange={(e) =>
                        handleItemChange(index, "item_total", e.target.value)
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

                    {item.category === "Multiple Sheet" &&
                      item.best_cover_sheet && (
                        <p className="text-xs text-blue-700 mt-1">
                          Cover Sheet: <b>{item.best_cover_sheet}</b> (
                          {item.best_cover_dimensions}) — UPS:{" "}
                          <b>{item.best_cover_ups}</b>
                        </p>
                      )}
                  </div>


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

        <Field label="Total Amount">
          <Input
            type="number"
            name="total_amount"
            value={form.total_amount}
            onChange={onChange}
            readOnly
          />
        </Field>

        <Field label="Advance Payment">
          <Input
            type="number"
            min="0"
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
