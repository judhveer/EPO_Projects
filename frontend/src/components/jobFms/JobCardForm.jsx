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
    is_direct_to_production: false,
    job_items: [],
  });

  const formRef = useRef(form);

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
        showSoftError("Failed to fetch users.");
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

    const safeItems = Array.isArray(existingJob?.items) ? existingJob.items : [];


    const mappedItems = safeItems.map((item, index) => {
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
          showSoftError("Failed to fetch client suggestions.");
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

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const emptyToNull = (obj) =>
    Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, v === "" ? null : v])
    );

  const normalizePayload = (payload) => {
    const normalizedPayload = {
      ...payload,
      advance_payment: payload.advance_payment
        ? Number(payload.advance_payment)
        : 0,
      total_amount: payload.total_amount ? Number(payload.total_amount) : 0,
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
      })),
    };
    return emptyToNull(normalizedPayload);
  };

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
          available_items: data, // store category items
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
      showSoftError("Failed to load category items. Please try again.");
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
      console.error("Failed to load category bindings", err);
      showSoftError("Failed to load category bindings. Please try again.");
    }
  };

  const loadItemPapers = async (index, itemName) => {
    try {
      const { data } = await api.get(`/api/fms/items/paper-types`);

      setForm((prev) => {
        const items = [...prev.job_items];
        items[index] = {
          ...items[index],
          available_papers: data,
        }; // store all papers
        return { ...prev, job_items: items };
      });
    } catch (err) {
      console.error("Failed to load papers:", err);
      showSoftError("Failed to load papers. Please try again.");
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
      showSoftError("Failed to load paper GSM. Please try again.");
    }
  };

  const calculateItemBackend = async (index) => {
    try {
      // const item = form.job_items[index];
      const item = formRef.current.job_items[index];

      // basic guard
      if (!item.quantity || !item.paper_type || !item.paper_gsm) {
        alert("Please fill all required fields before calculating");
        return;
      }

      // Clean the items before sending
      const cleanedItems = cleanJobItems(formRef.current.job_items);
      // const cleanedItem = cleanJobItems([item])[0];
      const cleanedItem = cleanJobItems([
        { ...item, unit_rate: null, item_total: null },
      ])[0];

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
      showSoftError("Calculation failed. Please re-check item details.");
    }
  };

  const calculateTotalAmountAfterRemoval = async (id) => {
    try {
      const cleanedItems = cleanJobItems(formRef.current.job_items);

      const payload = {
        all_items: cleanedItems,
        removed_item_id: id,
      };

      const { data } = await api.post(
        `/api/fms/items/calculate-total-amount`,
        payload
      );

      setForm((prev) => ({
        ...prev,
        total_amount: data.total_amount,
      }));
    } catch (err) {
      console.error("Total amount recalculation failed:", err);
      showSoftError("Failed to recalculate total amount.");
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
      showSoftError("Failed to load sizes. Please try again.");
    }
  };

  const handleItemChange = useCallback(
    async (id, field, value) => {
      const index = findItemIndexById(form.job_items, id);
      if (index === -1) return;
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
    },
    [form.job_items]
  );

  const createEmptyItem = React.useCallback(() => ({
    id: undefined,
    _temp_id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString() + Math.random(),
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
  }), []);


  const addItem = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      job_items: [...prev.job_items, createEmptyItem()],
    }));
  }, [createEmptyItem]);

  const removeItem = useCallback( async (id) => {
    await calculateTotalAmountAfterRemoval(id);
    setForm((prev) => ({
      ...prev,
      job_items: prev.job_items.filter((item) => item.id !== id),
    }));
  }, []);

  const findItemIndexById = useCallback(
    (items, id) => items.findIndex((item) => item.id === id),
    []
  );

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

    const rawPayload = {
      ...form,
      job_items: cleanJobItems(form.job_items),
    };
    const payload = normalizePayload(rawPayload);

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
        const res = await api.post("/api/fms/jobcards", payload);
        const data = res.data;
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
          is_direct_to_production: false,
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
        showSoftError("Failed to fetch client details.");
      }
    } else if (e.key === "Escape") {
      setClientSuggestions([]);
      setActiveIndex(-1);
    }
  };

  const showSoftError = (message) => {
    setErr(message);
    setTimeout(() => setErr(""), 4000);
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
                setForm((f) => ({
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
                Artwork is final. Skip coordinator review and send directly to production.
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
              onRemove={removeItem}
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
