import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import DashboardFilters from "../../components/jobFms/commonDashboard/DashboardFilters";
import DashboardTable from "../../components/jobFms/commonDashboard/DashboardTable";
import JobDetailsSidebar from "../../components/jobFms/commonDashboard/JobDetailsSidebar";
import JobItemsSidebar from "../../components/jobFms/commonDashboard/JobItemsSidebar";

export default function CommonDashboard() {
  // 🔹 Data
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 50, total: 0 });
  const [loading, setLoading] = useState(false);
  // 🔹 CRM Users
  const [crmUsers, setCrmUsers] = useState([]);

  // 🔹 Filters (backend-driven)
  const [filters, setFilters] = useState({
    search: "",
    order_type: "",
    order_handled_by: "",
    execution_location: "",
    payment_status: "",
    status: "",
    is_direct_to_production: "",
    // client_type: "",
    delivery_range: "",
    delivery_from: "",
    delivery_to: "",
    created_range: "",
    created_from: "",
    created_to: "",
  });

  // 🔹 Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // 🔹 Sidebar
  const [selectedJobNo, setSelectedJobNo] = useState(null);
  const [itemSidebarJobNo, setItemSidebarJobNo] = useState(null);

  const cleanFilters = Object.fromEntries(
    Object.entries(filters).filter(([_, v]) => v !== "" && v !== null),
  );

  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  // 🔹 Fetch jobs (backend pagination)
  const fetchJobs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/fms/common-dashboard/jobs", {
        params: {
          page,
          limit,
          ...cleanFilters,
          search: debouncedSearch,
        },
      });

      setJobs(data.data);
      setMeta(data.meta);
    } catch (err) {
      console.error("Dashboard fetch failed", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCrmUsers = async () => {
    try {
      const { data } = await api.get("/api/users/crm");
      setCrmUsers(data);
    } catch (err) {
      console.error("Failed to fetch CRM users", err);
    }
  };

  useEffect(() => {
    fetchJobs();
    setSelectedJobNo(null);
  }, [
    page,
    limit,
    debouncedSearch,
    filters.status,
    filters.order_type,
    filters.order_handled_by,
    filters.execution_location,
    filters.payment_status,
    filters.is_direct_to_production,
    filters.delivery_from,
    filters.delivery_to,
    filters.created_from,
    filters.created_to,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300); // 300ms is ideal for dashboards

    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    fetchCrmUsers();
  }, []);



  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        setSelectedJobNo(null);
        setItemSidebarJobNo(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);


  return (
    <div className="px-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-blue-700">
            📊 Common Operations Dashboard
          </h1>

          {/* TOTAL JOBS TAG */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
            <span className="text-xs text-blue-700 font-medium">
              Total Jobs
            </span>
            <span className="text-sm font-bold text-blue-800">
              {meta.total}
            </span>
          </div>
        </div>

        <p className="text-sm text-gray-600">
          Unified view of all jobs across lifecycle
        </p>
      </div>

      {/* Filters */}
      <DashboardFilters
        filters={filters}
        setFilters={setFilters}
        resetPage={() => setPage(1)}
        crmUsers={crmUsers}
      />

      {/* Table */}
      <DashboardTable
        jobs={jobs}
        loading={loading}
        page={page}
        total={meta.total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
        onSelectJob={(jobNo) => {
          setItemSidebarJobNo(null);   // ⛔ CLOSE items sidebar
          setSelectedJobNo(jobNo);    // ✅ OPEN job details
        }}
        onViewItems={(jobNo) => {
          setSelectedJobNo(null);     // ⛔ CLOSE job details
          setItemSidebarJobNo(jobNo); // ✅ OPEN items sidebar
        }}

      />

      {/* Sidebar */}
      <JobDetailsSidebar
        jobNo={selectedJobNo}
        onClose={() => setSelectedJobNo(null)}
      />

      <JobItemsSidebar
        jobNo={itemSidebarJobNo}
        onClose={() => setItemSidebarJobNo(null)}
      />

    </div>
  );
}
