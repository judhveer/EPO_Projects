import React, { useEffect, useState, useMemo } from "react";
import api from "../../../lib/api.js";
import { motion, AnimatePresence } from "framer-motion";
import { DateTime } from "luxon";

export default function DashboardTable({ 
  jobs,
  loading,
  page,
  total,
  limit,
  onPageChange,
  onLimitChange,
  onSelectJob, 
  onViewItems, 
}) {

  const totalPages = Math.ceil(total / limit);


  if (loading)
    return (
      <div className="text-center py-10 text-slate-600 text-lg">
        Loading job cards...
      </div>
    );

  return (
    <div className="">
      {/* ✅ Table */}
      <div className="relative overflow-auto border rounded-lg shadow max-h-[80vh]">
        <table className="min-w-[4000px] max-w-[6000px] text-xs border-collapse border border-gray-300 table-fixed">
          <thead className="sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow-sm">
            <tr>
              <th className="border p-2 sticky left-0 bg-blue-800 z-40  text-center font-semibold">
                Job No
              </th>
              <th className="border p-2"> Job Created On</th>
              <th className="border p-2">Client Name</th>
              <th className="border p-2">Client Type</th>
              <th className="border p-2">Order Type</th>
              <th className="border p-2">Address</th>
              <th className="border p-2">Contact</th>
              <th className="border p-2">Email</th>
              <th className="border p-2">Order Handled By</th>
              <th className="border p-2">Execution Location</th>
              <th className="border p-2">Delivery Date</th>
              <th className="border p-2 max-w-[500px] ">Delivery Location</th>
              <th className="border p-2">Proof Date</th>
              <th className="border p-2">Priority</th>
              <th className="border p-2">Instructions</th>
              <th className="border p-2">Payment Status</th>
              <th className="border p-2 sticky right-0 bg-blue-800 z-30 text-center font-semibold">
                Status
              </th>
              <th className="border p-2">Job Completion Deadline</th>
              <th className="border p-2">Items</th>
              <th className="border p-2">Designer State</th>
              <th className="border p-2">Approval State</th>
            </tr>
          </thead>

          <tbody>
            {jobs.length > 0 ? (
              jobs.map((job, index) => (
                <tr
                  key={job.job_no}
                  className={`border-b transition-all duration-200 ${
                    index % 2 === 0 ? "bg-white" : "bg-slate-300"
                  } hover:bg-blue-500 hover:text-white`}
                >
                  <td className="border p-2 sticky left-0 bg-white z-20 text-center font-bold text-blue-700 cursor-pointer hover:underline"
                  onClick={() => onSelectJob(job.job_no)} >
                    {job.job_no}
                    {job.clientApprovals?.[0]?.instance > 1 && (
                      <div className="text-[11px] text-red-800 italic mt-1">
                        {"Redesign"}
                      </div>
                    )}
                  </td>
                  <td className="border p-2">
                    {DateTime
                      .fromJSDate(new Date(job.createdAt))
                      .setZone("Asia/Kolkata")
                      .toFormat("dd LLL yyyy, hh:mm a")}
                  </td>
                  <td className="border p-2">{job.client_name}</td>
                  <td className="border p-2">{job.client_type}</td>
                  <td className="border p-2 ">{job.order_type}</td>
                  <td className="border p-2 ">{job.address}</td>
                  <td className="border p-2">{job.contact_number}</td>
                  <td className="border p-2">{job.email_id}</td>
                  <td className="border p-2">{job.order_handled_by}</td>
                  <td className="border p-2">{job.execution_location}</td>
                  <td className="border p-2 font-semibold text-blue-600 hover:text-white">
                    {/* {new Date(job.delivery_date).toLocaleString()} */}
                    {DateTime
                      .fromJSDate(new Date(job.delivery_date))
                      .setZone("Asia/Kolkata")
                      .toFormat("dd LLL yyyy, hh:mm a")}
                  </td>
                  <td className="border-r border-gray-200 px-2  max-w-[500px]">
                    {job.delivery_location?.replace(/_/g, " ")}
                    {job.delivery_address && (
                      <div className=" text-[11px] text-gray-500 italic mt-1">
                        {job.delivery_address}
                      </div>
                    )}
                  </td>
                  <td className="border p-2 ">
                    {/* {new Date(job.proof_date).toLocaleDateString()} */}
                    {DateTime
                      .fromJSDate(new Date(job.proof_date))
                      .setZone("Asia/Kolkata")
                      .toFormat("dd LLL yyyy")}
                  </td>
                  <td className="border p-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        job.task_priority === "Urgent"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {job.task_priority}
                    </span>
                  </td>
                  <td className="border p-2">{job.instructions}</td>
                  <td className="border p-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        job.payment_status === "Paid"
                          ? "bg-green-100 text-green-700"
                          : job.payment_status === "Half Paid"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {job.payment_status}
                    </span>
                  </td>
                  <td className="border p-2 sticky right-0 bg-inherit z-20">
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-semibold ${
                        job.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : job.status === "cancelled"
                          ? "bg-gray-300 text-gray-600"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="border p-2">
                    {DateTime
                      .fromJSDate(new Date(job.job_completion_deadline))
                      .setZone("Asia/Kolkata")
                      .toFormat("dd LLL yyyy, hh:mm a")}
                  </td>

                  <td className="border p-2 text-center text-xs">
                    {job.item_count} items
                    {job.item_count > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation(); // VERY IMPORTANT
                          onViewItems(job.job_no);
                        }}
                        className="ml-2 text-blue-600 underline cursor-pointer relative z-30"
                      >
                        View
                      </button>
                    )}
                  </td>

                  
                  <td className="border p-2">
                    {job.assignments?.[0]
                      ? job.assignments[0].is_paused
                        ? "⏸ Paused"
                        : job.assignments[0].status === "in_progress"
                        ? "🎨 In Progress" 
                        : job.assignments[0].status === "assigned"
                        ? "Not Started Yet"
                        : "✅ Completed"
                      : "—"}
                  </td>
                  <td className="border p-2">
                    {job.clientApprovals?.[0]
                      ? job.clientApprovals[0].status === "approved"
                        ? "✅ Approved"
                        : job.clientApprovals[0].status === "changes_requested"
                        ? "🔁 Changes"
                        : "⏳ Pending"
                      : "—"}
                  </td>


                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="15" className="text-center py-4 text-gray-500">
                  No jobs found
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 📄 Sticky Pagination Controls */}
        <div className="sticky bottom-0 left-0 right-0 bg-gray-50 backdrop-blur-sm border-t border-gray-300 p-3 flex justify-between items-center z-30 shadow-md">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Rows per page:</label>
            <select
              value={limit}
              onChange={(e) => {
                onPageChange(1);
                onLimitChange(Number(e.target.value));
              }}
              className="border rounded-md p-1 text-sm"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <button
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
              className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-100"
            >
              ⬅ Prev
            </button>
            <span className="text-gray-700">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-100"
            >
              Next ➡
            </button>
          </div>
        </div>
      </div>
      


    </div>
  );
}
