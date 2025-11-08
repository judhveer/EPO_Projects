import React, { useEffect, useState } from "react";
import { getJobCards, deleteJobCard } from "../../lib/jobFmsApi";
import dayjs from "dayjs";

export default function JobWriterTable({ refresh }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    loadData();
  }, [refresh]);

  const loadData = async () => {
    try {
      const res = await getJobCards(); // You can filter by writer ID if needed
      setData(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (job_no) => {
    if (window.confirm(`Are you sure you want to delete Job ${job_no}?`)) {
      try {
        await deleteJobCard(job_no);
        alert("🗑️ Deleted successfully");
        loadData();
      } catch (err) {
        console.error(err);
        alert("❌ Delete failed");
      }
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1000px] border-collapse text-sm">
        <thead className="bg-blue-600 text-white">
          <tr>
            <th className="p-2 border">Job No</th>
            <th className="p-2 border">Party</th>
            <th className="p-2 border">Client</th>
            <th className="p-2 border">Order Type</th>
            <th className="p-2 border">Priority</th>
            <th className="p-2 border">Delivery</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan="7" className="text-center py-4 text-gray-500">
                No records found.
              </td>
            </tr>
          ) : (
            data.map((job) => (
              <tr key={job.job_no} className="hover:bg-blue-50">
                <td className="p-2 border font-medium text-blue-600">
                  {job.job_no}
                </td>
                <td className="p-2 border">{job.client_name}</td>
                <td className="p-2 border">{job.client_type}</td>
                <td className="p-2 border">{job.order_type}</td>
                <td className="p-2 border">{job.task_priority}</td>
                <td className="p-2 border">
                  {dayjs(job.delivery_date).format("DD/MM/YYYY")}
                </td>
                <td className="p-2 border flex gap-2 justify-center">
                  <button
                    onClick={() => alert("Edit logic here")}
                    className="bg-yellow-400 px-3 py-1 rounded text-white hover:bg-yellow-500"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(job.job_no)}
                    className="bg-red-500 px-3 py-1 rounded text-white hover:bg-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
