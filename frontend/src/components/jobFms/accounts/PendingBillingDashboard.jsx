import React, { useEffect, useState, useMemo } from "react";
import api from "../../../lib/api.js";
import { DateTime } from "luxon";

export default function PendingBillingDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search filters
  const [jobSearch, setJobSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");

  // Date range filters
  const [jobRange, setJobRange] = useState("all");
  const [deliveryRange, setDeliveryRange] = useState("all");

  // Custom date ranges
  const [customJobStart, setCustomJobStart] = useState("");
  const [customJobEnd, setCustomJobEnd] = useState("");
  const [customDelStart, setCustomDelStart] = useState("");
  const [customDelEnd, setCustomDelEnd] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/billing/pending-bills");
      setData(res.data.data || []);
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Helper for range comparison
  const getRangeDate = (range) => {
    const now = DateTime.now();
    if (range === "1m") return now.minus({ months: 1 });
    if (range === "6m") return now.minus({ months: 6 });
    if (range === "12m") return now.minus({ months: 12 });
    return null;
  };

  // Filter logic
  const filtered = useMemo(() => {
    return data.filter((job) => {
      // Job number search
      if (jobSearch && !job.job_no?.toString().includes(jobSearch))
        return false;

      // Client name search
      if (
        clientSearch &&
        !job.client_name?.toLowerCase().includes(clientSearch.toLowerCase())
      )
        return false;

      // Job created date filter
      if (job.job_created_on) {
        const created = DateTime.fromFormat(job.job_created_on, "dd/MM/yyyy");

        if (jobRange !== "all" && jobRange !== "custom") {
          const rangeDate = getRangeDate(jobRange);
          if (created < rangeDate) return false;
        }

        if (jobRange === "custom" && customJobStart && customJobEnd) {
          const start = DateTime.fromISO(customJobStart);
          const end = DateTime.fromISO(customJobEnd);
          if (created < start || created > end) return false;
        }
      }

      // Delivery date filter
      if (job.delivery_date) {
        const delivery = DateTime.fromFormat(job.delivery_date, "dd/MM/yyyy");

        if (deliveryRange !== "all" && deliveryRange !== "custom") {
          const rangeDate = getRangeDate(deliveryRange);
          if (delivery < rangeDate) return false;
        }

        if (deliveryRange === "custom" && customDelStart && customDelEnd) {
          const start = DateTime.fromISO(customDelStart);
          const end = DateTime.fromISO(customDelEnd);
          if (delivery < start || delivery > end) return false;
        }
      }

      return true;
    });
  }, [
    data,
    jobSearch,
    clientSearch,
    jobRange,
    deliveryRange,
    customJobStart,
    customJobEnd,
    customDelStart,
    customDelEnd,
  ]);

  // Pagination calculations
  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, currentPage, rowsPerPage]);

  // Clear all filters
  const clearFilters = () => {
    setJobSearch("");
    setClientSearch("");
    setJobRange("all");
    setDeliveryRange("all");
    setCustomJobStart("");
    setCustomJobEnd("");
    setCustomDelStart("");
    setCustomDelEnd("");
    setCurrentPage(1);
  };

  // Handle page changes
  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Reusable pagination component (used in both views)
  const PaginationControls = () => (
    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 border-t border-gray-200 bg-gray-50">
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <span>Show</span>
        <select
          value={rowsPerPage}
          onChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setCurrentPage(1);
          }}
          className="border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500"
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span>entries</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1 rounded border border-gray-300 bg-white text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition"
        >
          Previous
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let pageNum;
          if (totalPages <= 5) {
            pageNum = i + 1;
          } else if (currentPage <= 3) {
            pageNum = i + 1;
          } else if (currentPage >= totalPages - 2) {
            pageNum = totalPages - 4 + i;
          } else {
            pageNum = currentPage - 2 + i;
          }
          return (
            <button
              key={pageNum}
              onClick={() => goToPage(pageNum)}
              className={`px-3 py-1 rounded border text-sm ${
                currentPage === pageNum
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white border-gray-300 hover:bg-gray-100"
              } transition`}
            >
              {pageNum}
            </button>
          );
        })}
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1 rounded border border-gray-300 bg-white text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition"
        >
          Next
        </button>
      </div>
    </div>
  );

  return (
    <div className="px-4 max-w-7xl mx-auto">
      {/* Header with title, total, and refresh */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Pending Billing Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Total pending: <span className="font-semibold">{filtered.length}</span> bills
          </p>
        </div>
        <button
          onClick={fetchData}
          className="px-5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters Card */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 px-5 py-2 mb-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Job No Search */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Job No
            </label>
            <input
              type="text"
              placeholder="Search job number..."
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>

          {/* Client Search */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Client
            </label>
            <input
              type="text"
              placeholder="Search client name..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>

          {/* Job Date Range */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Job Date
            </label>
            <select
              value={jobRange}
              onChange={(e) => setJobRange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white"
            >
              <option value="all">All time</option>
              <option value="1m">Last 1 month</option>
              <option value="6m">Last 6 months</option>
              <option value="12m">Last 12 months</option>
              <option value="custom">Custom range</option>
            </select>
          </div>

          {/* Delivery Date Range */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Delivery Date
            </label>
            <select
              value={deliveryRange}
              onChange={(e) => setDeliveryRange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white"
            >
              <option value="all">All time</option>
              <option value="1m">Last 1 month</option>
              <option value="6m">Last 6 months</option>
              <option value="12m">Last 12 months</option>
              <option value="custom">Custom range</option>
            </select>
          </div>
        </div>

        {/* Custom Date Inputs */}
        {jobRange === "custom" && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Job Start Date</label>
              <input
                type="date"
                value={customJobStart}
                onChange={(e) => setCustomJobStart(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Job End Date</label>
              <input
                type="date"
                value={customJobEnd}
                onChange={(e) => setCustomJobEnd(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              />
            </div>
          </div>
        )}

        {deliveryRange === "custom" && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Delivery Start Date</label>
              <input
                type="date"
                value={customDelStart}
                onChange={(e) => setCustomDelStart(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Delivery End Date</label>
              <input
                type="date"
                value={customDelEnd}
                onChange={(e) => setCustomDelEnd(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              />
            </div>
          </div>
        )}

        {/* Clear Filters Button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={clearFilters}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-300 hover:cursor-pointer transition flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear filters
          </button>
        </div>
      </div>

    {/* Mobile View (visible only on small screens) */}
    <div className="block sm:hidden">
    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden p-3">
        {loading ? (
        <div className="flex justify-center items-center gap-2 p-8 text-gray-500">
            <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading pending bills...
        </div>
        ) : paginatedData.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
            {paginatedData.map((job, index) => (
            <div
                key={`${job.job_no}-${index}`}
                className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center hover:bg-blue-100 transition"
            >
                <span className="font-medium text-blue-700">{job.job_no}</span>
            </div>
            ))}
        </div>
        ) : (
        <div className="text-center p-8 text-gray-500">No pending bills match your filters</div>
        )}

        {/* Pagination for mobile */}
        {!loading && filtered.length > 0 && <PaginationControls />}
    </div>
    </div>

      {/* Desktop View (hidden on small screens) */}
      <div className="hidden sm:block shadow-2xl shadow-neutral-500">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
          <div className="relative overflow-auto max-h-[70vh]">
            <table className="min-w-[900px] w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-gradient-to-r from-blue-700 to-blue-600 text-white">
                <tr>
                  <th className="border-r border-blue-500 p-3 text-left sticky left-0 bg-blue-700 z-20">Job No</th>
                  <th className="border-r border-blue-500 p-3 text-left">Job Created On</th>
                  <th className="border-r border-blue-500 p-3 text-left">Client Name</th>
                  <th className="p-3 text-left">Delivery Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4" className="text-center p-8 text-gray-500">
                      <div className="flex justify-center items-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Loading pending bills...
                      </div>
                    </td>
                  </tr>
                ) : paginatedData.length > 0 ? (
                  paginatedData.map((job, index) => (
                    <tr
                      key={`${job.job_no}-${index}`}
                      className={`border-b ${index % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50 transition`}
                    >
                      <td className="border-r p-3 sticky left-0 bg-inherit font-medium text-blue-700">
                        {job.job_no}
                      </td>
                      <td className="border-r p-3">{job.job_created_on || "-"}</td>
                      <td className="border-r p-3">{job.client_name}</td>
                      <td className="p-3 font-medium text-blue-600">{job.delivery_date || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="text-center p-8 text-gray-500">
                      No pending bills match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination for desktop */}
          {!loading && filtered.length > 0 && <PaginationControls />}
        </div>
      </div>
    </div>
  );
}