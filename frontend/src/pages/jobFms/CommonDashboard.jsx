import React, { useEffect, useState } from "react";
import { getJobCards } from "../../lib/jobFmsApi";
import dayjs from "dayjs";

export default function CommonDashboard() {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const res = await getJobCards();
      setJobs(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="overflow-x-auto">
      <h2 className="text-xl font-semibold text-blue-700 mb-4">
        📊 Common Dashboard — All Job Details
      </h2>
      <table className="min-w-[1200px] border-collapse text-sm">
        <thead className="bg-blue-600 text-white">
          <tr>
            <th className="p-2 border">Job No</th>
            <th className="p-2 border">Party Name</th>
            <th className="p-2 border">Client Type</th>
            <th className="p-2 border">Order Type</th>
            <th className="p-2 border">Priority</th>
            <th className="p-2 border">Handled By</th>
            <th className="p-2 border">Email</th>
            <th className="p-2 border">Contact</th>
            <th className="p-2 border">Instructions</th>
            <th className="p-2 border">Delivery Date</th>
            <th className="p-2 border">Status</th>
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 ? (
            <tr>
              <td colSpan="11" className="text-center py-4 text-gray-500">
                No job records found.
              </td>
            </tr>
          ) : (
            jobs.map((j) => (
              <tr key={j.job_no} className="hover:bg-blue-50">
                <td className="p-2 border">{j.job_no}</td>
                <td className="p-2 border">{j.client_name}</td>
                <td className="p-2 border">{j.client_type}</td>
                <td className="p-2 border">{j.order_type}</td>
                <td className="p-2 border">{j.task_priority}</td>
                <td className="p-2 border">{j.order_handled_by}</td>
                <td className="p-2 border">{j.email_id}</td>
                <td className="p-2 border">{j.contact_number}</td>
                <td className="p-2 border">{j.instructions}</td>
                <td className="p-2 border">
                  {dayjs(j.delivery_date).format("DD/MM/YYYY")}
                </td>
                <td className="p-2 border">
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    {j.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
