import React, { useEffect, useState, useCallback } from "react";
import api from "../../lib/api.js";
import { DateTime } from "luxon";
import JobItemsSidebar from "../../components/jobFms/commonDashboard/JobItemsSidebar";
import CreateBillModal from "../../components/jobFms/accounts/CreateBillModal.jsx";
import UpdatePaymentModal from "../../components/jobFms/accounts/UpdatePaymentModal";

// ── Constants ────────────────────────────────────────────────────────
const FILTER_TABS = [
  { value: "all",           label: "All Active" },
  { value: "unbilled",      label: "Unbilled" },
  { value: "billed",        label: "Billed" },
  { value: "half_paid",     label: "Half-Paid" },
  { value: "unpaid",        label: "Unpaid" },
  { value: "paid",          label: "Paid" },
  { value: "complimentary", label: "Complimentary" },
];

// Must use full class strings — Tailwind JIT cannot resolve dynamic `text-${color}` patterns
const STAT_CARDS = [
  { label: "Total Jobs",     key: "total",         numCls: "text-blue-700",    bgCls: "bg-blue-50",    borderCls: "border-blue-200",    subCls: "text-blue-500"    },
  { label: "Billed",         key: "billed",        numCls: "text-green-700",   bgCls: "bg-green-50",   borderCls: "border-green-200",   subCls: "text-green-500"   },
  { label: "Unbilled",       key: "unbilled",      numCls: "text-red-700",     bgCls: "bg-red-50",     borderCls: "border-red-200",     subCls: "text-red-500"     },
  { label: "Paid",           key: "paid",          numCls: "text-emerald-700", bgCls: "bg-emerald-50", borderCls: "border-emerald-200", subCls: "text-emerald-500" },
  { label: "Half-Paid",      key: "halfPaid",      numCls: "text-orange-700",  bgCls: "bg-orange-50",  borderCls: "border-orange-200",  subCls: "text-orange-500"  },
  { label: "Unpaid",         key: "unpaid",        numCls: "text-rose-700",    bgCls: "bg-rose-50",    borderCls: "border-rose-200",    subCls: "text-rose-500"    },
  { label: "Complimentary",  key: "complimentary", numCls: "text-purple-700",  bgCls: "bg-purple-50",  borderCls: "border-purple-200",  subCls: "text-purple-500"  },
];

const PAYMENT_STATUS_STYLE = {
  "Paid":          "bg-green-100 text-green-700",
  "Half Paid":     "bg-orange-100 text-orange-700",
  "Un-paid":       "bg-red-100 text-red-700",
  "Complimentary": "bg-purple-100 text-purple-700",
};

const BILL_CREATED_STYLE = {
  "no":            "bg-gray-100 text-gray-500",
  "yes":           "bg-blue-100 text-blue-700",
  "complimentary": "bg-purple-100 text-purple-700",
};

const fmt = (d) =>
  d ? DateTime.fromJSDate(new Date(d)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy") : "—";

const fmtFull = (d) =>
  d ? DateTime.fromJSDate(new Date(d)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a") : "—";

const fmtINR = (v) =>
  v != null ? `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—";

// ── Component ─────────────────────────────────────────────────────────
export default function AccountsDashboard() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({
    total: 0, billed: 0, unbilled: 0,
    paid: 0, halfPaid: 0, unpaid: 0, complimentary: 0,
  });

  const [filter, setFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [billModalJob, setBillModalJob] = useState(null);
  const [paymentModalJob, setPaymentModalJob] = useState(null);
  const [itemSidebarJobNo, setItemSidebarJobNo] = useState(null);

  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

  // ── Fetch ─────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit, filter };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get("/api/fms/accounts", { params });
      setJobs(data.data || []);
      setTotal(data.total || 0);
      setStats(data.stats || {});
    } catch (err) {
      console.error("Accounts fetch failed:", err);
      setError("Failed to load accounts data.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, filter, debouncedSearch]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Debounce search: 300ms after last keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Escape key closes modals / sidebar
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key !== "Escape") return;
      setBillModalJob(null);
      setPaymentModalJob(null);
      setItemSidebarJobNo(null);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  const handleFilterChange = (val) => { setFilter(val); setPage(1); };

  // ── Error state ───────────────────────────────────────────────────
  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        {error}
        <button onClick={fetchJobs} className="ml-2 text-blue-600 underline">Retry</button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-blue-700">💰 Accounts Dashboard</h2>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="🔍 Search job no, client, reference, handled by..."
          className="border border-gray-300 rounded-full px-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-[300px]"
        />
      </div>

      {/* ── Stat Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
        {STAT_CARDS.map(({ label, key, numCls, bgCls, borderCls, subCls }) => (
          <div key={key} className={`${bgCls} border ${borderCls} rounded-xl p-3 text-center`}>
            <div className={`text-2xl font-bold ${numCls}`}>{stats[key] ?? 0}</div>
            <div className={`text-xs mt-1 ${subCls}`}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Filter Tabs ────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleFilterChange(tab.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
              filter === tab.value
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-blue-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
          <span className="text-xs text-blue-700 font-medium">Showing</span>
          <span className="text-sm font-bold text-blue-800">{total}</span>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="relative overflow-auto border rounded-lg shadow max-h-[65vh]">
        <table
          className={`${
            loading ? "opacity-50 pointer-events-none" : ""
          } min-w-[2200px] text-xs border-collapse border border-gray-300 table-fixed`}
        >
          <thead className="sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow-sm">
            <tr>
              <th className="border p-2 sticky left-0 bg-blue-800 z-40 text-center w-[80px]">Job No</th>
              <th className="border p-2 w-[180px]">Client</th>
              <th className="border p-2 w-[140px]">Job Status</th>
              <th className="border p-2 w-[90px]">Items</th>
              <th className="border p-2 w-[120px]">Bill Status</th>
              <th className="border p-2 w-[110px]">Bill Type</th>
              <th className="border p-2 w-[140px]">Payment Status</th>
              <th className="border p-2 w-[110px]">Mode of Payment</th>
              <th className="border p-2 w-[120px]">Total Amount</th>
              <th className="border p-2 w-[120px]">Discount</th>
              <th className="border p-2 w-[70px]">GST %</th>
              <th className="border p-2 w-[120px]">Final Amount</th>
              <th className="border p-2 w-[160px]">Delivery Date</th>
              <th className="border p-2 w-[150px]">Order Handled By</th>
              <th className="border p-2 w-[150px]">Order Received By</th>
              <th className="border p-2 w-[110px]">Order Type</th>
              <th className="border p-2 w-[110px]">Priority</th>
              <th className="border p-2 w-[160px]">Bill Created On</th>
              <th className="border p-2 w-[150px]">Job Created On</th>
              <th className="border p-2 sticky right-0 bg-blue-800 z-40 w-[130px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={20} className="text-center py-6">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700" />
                  </div>
                </td>
              </tr>
            ) : jobs.length > 0 ? (
              jobs.map((job, index) => {
                const canCreateBill = job.bill_created === "no";
                const canUpdatePayment =
                  job.bill_created === "yes" &&
                  !["Paid", "Complimentary"].includes(job.payment_status);
                const isSettled = !canCreateBill && !canUpdatePayment;

                return (
                  <tr
                    key={job.job_no}
                    className={`group border-b ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50"
                    } hover:bg-blue-50`}
                  >
                    {/* Job No */}
                    <td className="border p-2 sticky left-0 bg-inherit group-hover:bg-blue-50 z-20 text-center font-bold text-blue-700">
                      {job.job_no}
                    </td>

                    {/* Client */}
                    <td className="border p-2 font-medium">{job.client_name}
                      {job.reference && (
                        <> ({job.reference})</>
                      )}
                    </td>

                    {/* Job Status */}
                    <td className="border p-2">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-semibold capitalize">
                        {job.status?.replace(/_/g, " ")}
                      </span>
                    </td>

                    {/* Items */}
                    <td className="border p-2 text-center">
                      {job.item_count || 0}
                      {job.item_count > 0 && (
                        <button
                          onClick={() => setItemSidebarJobNo(job.job_no)}
                          className="ml-1 text-blue-600 hover:underline text-[10px]"
                        >
                          View
                        </button>
                      )}
                    </td>

                    {/* Bill Status */}
                    <td className="border p-2 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          BILL_CREATED_STYLE[job.bill_created] || "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {job.bill_created}
                      </span>
                    </td>

                    {/* Bill Type */}
                    <td className="border p-2 text-center">
                      {job.bill_type || <span className="text-gray-400">—</span>}
                    </td>

                    {/* Payment Status */}
                    <td className="border p-2 text-center">
                      {job.payment_status ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            PAYMENT_STATUS_STYLE[job.payment_status] || "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {job.payment_status}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Mode of Payment */}
                    <td className="border p-2 text-center">
                      {job.mode_of_payment ? (
                        <span className="uppercase font-medium">{job.mode_of_payment}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Total Amount */}
                    <td className="border p-2 text-right font-medium">
                      {fmtINR(job.total_amount)}
                    </td>

                    {/* Discount */}
                    <td className="border p-2 text-right">
                      {job.discount && Number(job.discount) > 0
                        ? fmtINR(job.discount)
                        : <span className="text-gray-400">—</span>}
                    </td>

                    {/* GST % */}
                    <td className="border p-2 text-center">
                      {job.gst_percentage != null
                        ? `${job.gst_percentage}%`
                        : <span className="text-gray-400">—</span>}
                    </td>

                    {/* Final Amount */}
                    <td className="border p-2 text-right font-semibold text-blue-700">
                      {fmtINR(job.final_amount)}
                    </td>

                    {/* Delivery Date */}
                    <td className="border p-2 text-center">
                      <span className="bg-yellow-200 text-blue-900 rounded px-1 font-semibold text-[10px]">
                        {fmt(job.delivery_date)}
                      </span>
                    </td>

                    {/* Order Handled By */}
                    <td className="border p-2">{job.order_handled_by}</td>

                    {/* Order Received By */}
                    <td className="border p-2">{job.order_received_by}</td>

                    {/* Order Type */}
                    <td className="border p-2 text-center text-[10px]">
                      {job.order_type || <span className="text-gray-400">—</span>}
                    </td>

                    {/* Priority */}
                    <td className="border p-2 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          job.task_priority === "Urgent"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {job.task_priority}
                      </span>
                    </td>

                    {/* Bill Created On */}
                    <td className="border p-2 text-gray-600 text-center">
                      {job.bill_created_at
                        ? fmtFull(job.bill_created_at)
                        : <span className="text-gray-400">—</span>}
                    </td>

                    {/* Job Created On */}
                    <td className="border p-2 text-gray-500 text-center">
                      {fmtFull(job.createdAt)}
                    </td>

                    {/* Action */}
                    <td className="border p-2 sticky right-0 bg-inherit group-hover:bg-blue-50 z-10 text-center">
                      {canCreateBill && (
                        <button
                          onClick={() => setBillModalJob(job)}
                          className="w-full px-2 py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                        >
                          Create Bill
                        </button>
                      )}
                      {canUpdatePayment && (
                        <button
                          onClick={() => setPaymentModalJob(job)}
                          className="w-full px-2 py-1.5 rounded-md text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 shadow-sm"
                        >
                          Update Payment
                        </button>
                      )}
                      {isSettled && (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={20} className="text-center py-6 text-gray-500">
                  No jobs found
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* ── Pagination ─────────────────────────────────────── */}
        <div className="sticky bottom-0 left-0 right-0 bg-gray-50 border-t border-gray-300 p-3 flex justify-between items-center z-30 shadow-md">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Rows:</label>
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className="border rounded-md p-1 text-sm"
            >
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-100"
            >⬅ Prev</button>
            <span className="text-gray-700">Page {page} of {totalPages}</span>
            <button
              disabled={page === totalPages || total === 0}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-100"
            >Next ➡</button>
          </div>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      {billModalJob && (
        <CreateBillModal
          job={billModalJob}
          onClose={() => setBillModalJob(null)}
          onSuccess={() => { setBillModalJob(null); fetchJobs(); }}
        />
      )}
      {paymentModalJob && (
        <UpdatePaymentModal
          job={paymentModalJob}
          onClose={() => setPaymentModalJob(null)}
          onSuccess={() => { setPaymentModalJob(null); fetchJobs(); }}
        />
      )}
      <JobItemsSidebar
        jobNo={itemSidebarJobNo}
        onClose={() => setItemSidebarJobNo(null)}
        viewMode="account"
      />
    </div>
  );
}