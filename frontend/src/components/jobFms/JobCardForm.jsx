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

// ✅ At module level, outside the component empty the form
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
  job_items: [],
};

const sanitize = (obj) =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v ?? ""])
  );



// module level — pure function, zero cost, never recreated
// O(1) lookup instead of array.includes() on every keystroke
const CALC_TRIGGER_FIELDS = new Set([
  // Common across all categories
  "quantity",
  "size",
  "uom",
  "enquiry_for",
  "sides",
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

  // Wide Format
  "wide_material_name",
  "wide_material_gsm",
  "wide_material_thickness",

  // Binding specific
  "binding_types",
  "creases_per_sheet",
  "folds_per_sheet",
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

    case "Multiple Sheet":
      return !!(
        item.paper_type &&
        item.paper_gsm &&
        item.inside_pages &&
        item.cover_paper_type &&
        item.cover_paper_gsm &&
        item.cover_pages
      );

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

const cleanJobItems = (items) => {
  return items.map((item) => {
    const {
      available_items,
      available_papers,
      available_gsm,
      available_gsm_cover,
      available_bindings,
      available_sizes,
      available_wide_materials,
      available_wide_gsm,
      ...cleaned
    } = item;
    return cleaned;
  });
};

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

  // ✅ Add a cleanup ref at component top
  const timeoutsRef = useRef([]);

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
      timeoutsRef.current.forEach(clearTimeout);
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

  // useEffect(() => {
  //   formRef.current = form;
  // }, [form]);

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

  const loadCategoryItems = useCallback(
    async (itemId, category) => {
      try {
        const { data } = await api.get(
          `/api/fms/items/by-category?category=${category}`,
        );

        setFormAndRef((prev) => {
          const index = findItemIndexById(prev.job_items, itemId);
          if (index === -1) return prev;
          const items = [...prev.job_items];
          items[index] = {
            ...items[index],
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
          };
          return { ...prev, job_items: items };
        });
      } catch (err) {
        console.error("Failed to load category items", err);
        showSoftError("Failed to load category items. Please try again.");
      }
    },
    [findItemIndexById, showSoftError, setFormAndRef],
  );

  const loadCategoryBindings = useCallback(
    async (itemId, category) => {
      try {
        const { data } = await api.get(
          `/api/fms/items/bindings?category=${category}`,
        );

        setFormAndRef((prev) => {
          const index = findItemIndexById(prev.job_items, itemId);
          if (index === -1) return prev;
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
    },
    [findItemIndexById, showSoftError, setFormAndRef],
  );

  const loadItemPapers = useCallback(
    async (itemId, itemName) => {
      try {
        const { data } = await api.get(`/api/fms/items/paper-types`);

        setFormAndRef((prev) => {
          const index = findItemIndexById(prev.job_items, itemId);
          if (index === -1) return prev;
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
    },
    [findItemIndexById, showSoftError, setFormAndRef],
  );

  const loadWideMaterials = useCallback(
    async (itemId) => {
      try {
        const { data } = await api.get("/api/fms/items/wide-materials");

        setFormAndRef((prev) => {
          const index = findItemIndexById(prev.job_items, itemId);
          if (index === -1) return prev;
          const items = [...prev.job_items];
          items[index] = { ...items[index], available_wide_materials: data }; // store wide format materials
          return { ...prev, job_items: items };
        });
      } catch (err) {
        console.error("Failed to load wide materials", err);
      }
    },
    [findItemIndexById, showSoftError, setFormAndRef],
  );

  const loadWideMaterialGsm = useCallback(
    async (itemId, materialName) => {
      try {
        const { data } = await api.get(
          `/api/fms/items/wide-materials/gsm?materialName=${materialName}`,
        );

        setFormAndRef((prev) => {
          const index = findItemIndexById(prev.job_items, itemId);
          if (index === -1) return prev;
          const items = [...prev.job_items];
          items[index] = { ...items[index], available_wide_gsm: data };
          return { ...prev, job_items: items };
        });
      } catch (err) {
        console.error("Failed to load wide GSM");
      }
    },
    [findItemIndexById, showSoftError, setFormAndRef],
  );

  const loadItemPapersGsm = useCallback(
    async (itemId, paperName, type = "inside") => {
      try {
        const { data } = await api.get(
          `/api/fms/items/paper-types/gsm?paperName=${paperName}`,
        );

        setFormAndRef((prev) => {
          const index = findItemIndexById(prev.job_items, itemId);
          if (index === -1) return prev;
          const items = [...prev.job_items];

          if (type === "inside") {
            items[index] = {
              ...items[index],
              available_gsm: data,
            };
          } else {
            items[index] = { ...items[index], available_gsm_cover: data };
          }

          return { ...prev, job_items: items };
        });
      } catch (err) {
        console.error("Failed to load paper gsm:", err);
        showSoftError("Failed to load paper GSM. Please try again.");
      }
    },
    [findItemIndexById, showSoftError, setFormAndRef],
  );

  const loadSizes = useCallback(
    async (itemId, search) => {
      try {
        const { data } = await api.get(`/api/fms/items/sizes?search=${search}`);

        setFormAndRef((prev) => {
          const index = findItemIndexById(prev.job_items, itemId);
          if (index === -1) return prev;
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
    },
    [findItemIndexById, showSoftError, setFormAndRef],
  );

  const calculateItemBackend = useCallback(
    async (index) => {
      console.log("calculateItemBackend Triggered:");

      const item = formRef.current.job_items[index];
      if (!item || !isItemReady(item)) return; // safety net — isItemReady already checked in handleItemChange

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

      try {
        const { data } = await api.post(
          `/api/fms/items/calculate-item`,
          payload,
        );
        // Backend returns: { unit_rate, item_total, total_amount }
        console.log("Backend response:", data);
        setFormAndRef((prev) => {
          const updatedItems = [...prev.job_items];

          updatedItems[index] = {
            ...updatedItems[index],
            // Store unit & item total
            unit_rate: data.totals.unit_rate,
            item_total: data.totals.item_total,

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

          return {
            ...prev,
            job_items: updatedItems,
            total_amount: data.totals?.grand_total ?? prev.total_amount,
          };
        });
      } catch (err) {
        console.error(
          "Item calculation failed:",
          err?.response?.data?.message || err,
        );
        showSoftError("Calculation failed: " + err?.response?.data?.message);
      }
    },
    [showSoftError],
  );

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
        // formRef is now updated synchronously inside setFormAndRef above,
        // so by the time this setTimeout fires, formRef.current is already current
        setTimeout(() => {
          const latestIndex = findItemIndexById(formRef.current.job_items, id);
          if (latestIndex === -1) return;
          const latestItem = formRef.current.job_items[latestIndex];

          // Only fire if ALL required fields for this category are filled
          // No wasted API calls, no mid-fill error messages
          if (isItemReady(latestItem)) {
            calculateItemBackend(latestIndex);
          }
        }, 0);
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
      calculateItemBackend,
      showSoftError,
    ],
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
      available_items: [],
      available_papers: [],
      available_gsm: [],
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
    [isEditMode, existingJob, onCreated, onUpdated],
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
    [showSoftError],
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

    const safeItems = Array.isArray(existingJob?.items)
      ? existingJob.items
      : [];

    const mappedItems = safeItems.map((item, index) => {
      console.log("existing item: ", item);
      return {
        ...item,
        enquiry_for: item.enquiry_for,
        available_sizes: [],
        // Rebuild paper fields from selectedPaper
        paper_type: item.selectedPaper?.paper_name || "",
        paper_gsm: item.selectedPaper?.gsm || "",

        // Rebuild cover fields if available
        cover_paper_type: item.selectedCoverPaper?.paper_name || "",
        cover_paper_gsm: item.selectedCoverPaper?.gsm || "",

        // Wide format specific fields
        wide_material_name: item.selectedWideMaterial?.material_name || "",
        wide_material_gsm: item.selectedWideMaterial?.gsm || "",
        wide_material_thickness: item.selectedWideMaterial?.thickness_mm || "",

        // Ensure binding_types is an array
        binding_types: Array.isArray(item.binding_types)
          ? item.binding_types
          : [],

        // extra binding details
        folds_per_sheet: item.no_of_foldings || "",
        creases_per_sheet: item.no_of_creases || "",

        // Client-side fields needed for dropdowns
        available_items: [],
        available_papers: [],
        available_gsm: [],
        available_gsm_cover: [],
        available_bindings: [],
        // Wide format specific dropdown data
        available_wide_materials: [],
        available_wide_gsm: [],
      };
    });

    setFormAndRef({
      ...sanitize(existingJob),
      delivery_date: formatDateTimeLocal(existingJob.delivery_date),
      proof_date: formatDateOnly(existingJob.proof_date),
      receiving_date_for_mm: formatDateOnly(existingJob.receiving_date_for_mm),
      job_items: mappedItems,
    });

    // NOW LOAD DROPDOWN OPTIONS FOR EACH ITEM
    mappedItems.forEach((item) => {
      const itemId = item.id ?? item._temp_id;

      if (item.category) {
        // loadCategoryItems(itemId, item.category);
        loadCategoryBindings(itemId, item.category);
        if (item.category === "Wide Format") {
          loadWideMaterials(itemId);
        }
      }

      if (item.enquiry_for) {
        loadItemPapers(itemId, item.enquiry_for);
      }

      if (item.paper_type) {
        loadItemPapersGsm(itemId, item.paper_type, "inside");
      }

      if (item.cover_paper_type) {
        loadItemPapersGsm(itemId, item.cover_paper_type, "cover");
      }

      if (item.wide_material_name) {
        loadWideMaterialGsm(itemId, item.wide_material_name);
      }
    });
  }, [
    existingJob,
    loadCategoryBindings,
    loadWideMaterials,
    loadItemPapers,
    loadItemPapersGsm,
    loadWideMaterialGsm,
  ]);

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
            value={form.total_amount || 0}
            onChange={onChange}
            readOnly
          />
        </Field>

        <Field label="Discount">
          <Input
            type="number"
            step="0.1"
            name="discount"
            value={form.discount || 0}
            onChange={onChange}
          />
        </Field>

        <Field label="Advance Payment">
          <Input
            type="number"
            min="0"
            name="advance_payment"
            value={form.advance_payment || 0}
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
            <option value="upi">UPI</option>
            <option value="neft">NEFT</option>
            <option value="rtgs">RTGS</option>
            <option value="pfms">PFMS</option>
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
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
