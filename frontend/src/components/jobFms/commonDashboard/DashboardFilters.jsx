export default function DashboardFilters({ filters, setFilters, resetPage, crmUsers = [] }) {
  const update = (key, value) => {
    resetPage();
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const emptyFilters = {
    search: "",
    order_type: "",
    order_handled_by: "",
    execution_location: "",
    payment_status: "",
    status: "",
    is_direct_to_production: "",
    delivery_range: "",
    delivery_from: "",
    delivery_to: "",
    created_range: "",
    created_from: "",
    created_to: "",
  };



  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm grid grid-cols-8 gap-3 sticky top-0 z-20">

      {/* SEARCH */}
      <input
        value={filters.search}
        onChange={(e) => update("search", e.target.value)}
        placeholder="🔍 Job No, Client, Contact, Email, Designer Name"
        className="col-span-2 border rounded px-2 py-1 text-xs"
      />

      {/* ORDER TYPE */}
      <select
        value={filters.order_type}
        onChange={(e) => update("order_type", e.target.value)}
        className="border rounded px-2 py-1 text-xs"
      >
        <option value="">Order Type</option>
        <option value="Work Order">Work Order</option>
        <option value="Project Based Order">Project Based</option>
        <option value="Job Order">Job Order</option>
      </select>

      {/* ORDER HANDLED BY */}
      <select
        value={filters.order_handled_by}
        onChange={(e) => update("order_handled_by", e.target.value)}
        className="border rounded px-3 py-1 text-xs"
      >
        <option value="">Order handled by</option>
        {crmUsers.length === 0 ? (
          <option disabled>Loading CRM users...</option>
        ) : (
          crmUsers.map((crm) => (
            <option key={crm.id} value={crm.username}>
              {crm.username}
            </option>
          ))
        )}
      </select>

      {/* EXECUTION LOCATION */}
      <select
        value={filters.execution_location}
        onChange={(e) => update("execution_location", e.target.value)}
        className="border rounded px-2 py-1 text-xs"
      >
        <option value="">Execution Location</option>
        <option value="In-Bound">In-Bound</option>
        <option value="Out-Bound">Out-Bound</option>
      </select>

      {/* PAYMENT STATUS */}
      <select
        value={filters.payment_status}
        onChange={(e) => update("payment_status", e.target.value)}
        className="border rounded px-2 py-1 text-xs"
      >
        <option value="">Payment</option>
        <option value="Paid">Paid</option>
        <option value="Half Paid">Half Paid</option>
        <option value="Un-paid">Un-paid</option>
      </select>

      {/* STATUS / STAGE */}
      <select
        value={filters.status}
        onChange={(e) => update("status", e.target.value)}
        className="border rounded px-2 py-1 text-xs"
      >
        <option value="">Stage</option>
        <option value="assigned_to_designer">Assigned</option>
        <option value="design_in_progress">Design In Progress</option>
        <option value="sent_for_approval">Sent for Approval</option>
        <option value="awaiting_client_response">Awaiting Client</option>
        <option value="client_changes">Client Changes</option>
        <option value="approved">Approved</option>
        <option value="production">Production</option>
        <option value="completed">Completed</option>
      </select>

      {/* DIRECT TO PRODUCTION */}
      <select
        value={filters.is_direct_to_production}
        onChange={(e) => update("is_direct_to_production", e.target.value)}
        className="border rounded px-2 py-1 text-xs"
      >
        <option value="">Direct to Production?</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>

        {/* DELIVERY DATE RANGE */}
      <select
        value={filters.delivery_range || ""}
        onChange={(e) => {
          const value = e.target.value;
          resetPage();

          const now = new Date();
          let from = "";
          let to = "";

          if (value === "this_month") {
            from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
          }

          if (value === "last_6_months") {
            from = new Date(now.setMonth(now.getMonth() - 6)).toISOString();
            to = new Date().toISOString();
          }

          if (value === "this_year") {
            from = new Date(now.getFullYear(), 0, 1).toISOString();
            to = new Date(now.getFullYear(), 11, 31).toISOString();
          }

          setFilters((prev) => ({
            ...prev,
            delivery_range: value,
            delivery_from: from,
            delivery_to: to,
          }));
        }}
        className="border rounded px-2 py-1 text-xs"
      >
        <option value="">Delivery Date</option>
        <option value="this_month">This Month</option>
        <option value="last_6_months">Last 6 Months</option>
        <option value="this_year">This Year</option>
        <option value="custom">Custom Range</option>
      </select>

      {filters.delivery_range === "custom" && (
        <div className="col-span-2 flex items-center gap-4">
          {/* FROM */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="delivery_from"
              className="text-xs text-gray-600 whitespace-nowrap"
            >
              From
            </label>
            <input
              id="delivery_from"
              type="date"
              value={filters.delivery_from?.slice(0, 10) || ""}
              onChange={(e) => update("delivery_from", e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            />
          </div>

          {/* TO */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="delivery_to"
              className="text-xs text-gray-600 whitespace-nowrap"
            >
              To
            </label>
            <input
              id="delivery_to"
              type="date"
              value={filters.delivery_to?.slice(0, 10) || ""}
              onChange={(e) => update("delivery_to", e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            />
          </div>
        </div>
      )}



      {/* CREATED DATE RANGE */}
      <select
        value={filters.created_range || ""}
        onChange={(e) => {
          const value = e.target.value;
          resetPage();

          const now = new Date();
          let from = "";
          let to = "";

          if (value === "this_month") {
            from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
          }

          if (value === "last_6_months") {
            const d = new Date();
            d.setMonth(d.getMonth() - 6);
            from = d.toISOString();
            to = new Date().toISOString();
          }

          if (value === "this_year") {
            from = new Date(now.getFullYear(), 0, 1).toISOString();
            to = new Date(now.getFullYear(), 11, 31).toISOString();
          }

          setFilters((prev) => ({
            ...prev,
            created_range: value,
            created_from: from,
            created_to: to,
          }));
        }}
        className="border rounded px-2 py-1 text-xs"
      >
        <option value="">Created On</option>
        <option value="this_month">This Month</option>
        <option value="last_6_months">Last 6 Months</option>
        <option value="this_year">This Year</option>
        <option value="custom">Custom Range</option>
      </select>


      {filters.created_range === "custom" && (
        <div className="col-span-2 flex items-center gap-4">
          {/* FROM */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 whitespace-nowrap">
              From
            </label>
            <input
              type="date"
              value={filters.created_from?.slice(0, 10) || ""}
              onChange={(e) => update("created_from", e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            />
          </div>

          {/* TO */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 whitespace-nowrap">
              To
            </label>
            <input
              type="date"
              value={filters.created_to?.slice(0, 10) || ""}
              onChange={(e) => update("created_to", e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            />
          </div>
        </div>
      )}




      {/* CLEAR */}
      <button
        onClick={() => {
          resetPage();
          setFilters(emptyFilters);
        }}
        className="bg-gray-300 hover:bg-gray-500 hover:text-white rounded px-3 py-2 text-xs col-span-1"
      >
        Clear
      </button>
    </div>
  );
}
