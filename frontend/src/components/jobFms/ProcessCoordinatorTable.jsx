import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import api from "../../lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { DateTime } from "luxon";

export default function ProcessCoordinatorTable() {
  const [jobs, setJobs] = useState([]);
  const [designers, setDesigners] = useState([]);
  // const [openDropdownJob, setOpenDropdownJob] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedJobForAssign, setSelectedJobForAssign] = useState(null);

  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [err, setErr] = useState("");
  const [assigning, setAssigning] = useState(false);

  const assignLock = useRef(false);


  // const dropdownRef = useRef(null);

  // Load jobs
  const fetchJobs = async (signal) => {
    try{
      const { data } = await api.get("/api/fms/process-coordinator/jobs", { signal } );  
      setJobs(Array.isArray(data) ? data : data.data || data.jobCards || []);
    }
    catch(error){
      if (error.name === "CanceledError") return;
      console.error("Failed to fetch jobs", error);
      setErr("Unable to load jobs");
    }
  };

  // Load designers with status
  const fetchDesigners = async (signal) => {
    try{
      const { data } = await api.get(
        "/api/fms/process-coordinator/designers/status",  { signal }
      );
      setDesigners(data);
    }
    catch(error){
      if (error.name === "CanceledError") return;
      console.error("Failed to fetch designers", error);
      setErr("Unable to load designers");
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;
    setLoading(true);

    Promise.allSettled([
      fetchJobs(controller.signal),
      fetchDesigners(controller.signal),
    ]).finally(() => {
      if(isMounted){
        setLoading(false);
      } 
    });

    return () => {
      isMounted = false;
      controller.abort();   // cancel all in-flight requests
    }
  }, []);


  const assignDesigner = async (job_no, designer_id) => {
    if (!job_no || !designer_id) return;
    if (assignLock.current) return;

    const controller = new AbortController();
    assignLock.current = true;
    setAssigning(true);
    // if (assigning) return; // prevent multiple clicks
    // setAssigning(true);

    try {
      await api.patch(`/api/fms/process-coordinator/${job_no}/assign`, 
        { designer_id }, { signal: controller.signal } );
      
      setErr("");
      setSuccessMsg("✅ Job Assigned to Designer successfully!");
      setShowSuccessPopup(true);

      // ⏳ Wait 2 seconds before closing modal (after popup)
      setTimeout(() => {
        setShowSuccessPopup(false);
        setShowAssignModal(false); // close modal AFTER popup
      }, 2000);

      // setOpenDropdownJob(null);
      fetchJobs(controller.signal);
      fetchDesigners(controller.signal);
    } catch (error) {
      if (error.name === "CanceledError") return;
      console.error(error);
      setErr(error.response?.data?.message || "Failed to Assign Job Card");
    } finally {
      assignLock.current = false;
      setAssigning(false);
    }
  };


  const designerMap = React.useMemo(() => {
    const map = new Map();
    designers.forEach((d) => map.set(d.name, d));
    return map;
  }, [designers]);

  return (
    <div>
      {showSuccessPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-[500] bg-black/30 backdrop-blur-sm">
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

      <h2 className="text-2xl font-bold text-blue-700 mb-4">
        🧑‍💼 Process Coordinator Dashboard
      </h2>

      <div className="relative overflow-auto border rounded-lg shadow max-h-[80vh]">
        <table className="w-full text-xs border-collapse border border-gray-300">
          <thead className="sticky top-0 bg-blue-700 text-white">
            <tr>
              <th className="p-2 border sticky left-0 bg-blue-800 z-40  text-center font-semibold">
                Job No
              </th>
              <th className="p-2 border">Job Created On</th>
              <th className="p-2 border">Client</th>
              <th className="p-2 border">Order Type</th>
              <th className="p-2 border">Order Handled By</th>
              <th className="p-2 border">Execution Location</th>
              <th className="p-2 border">Delivery Date</th>
              <th className="border p-2 max-w-[500px] ">Delivery Location</th>
              <th className="border p-2 max-w-[500px] ">Priority</th>
              <th className="p-2 border">Status</th>
              <th className="p-2 border">Assign Designer</th>
            </tr>
          </thead>

          <tbody>

            {jobs.length === 0 && (
              <tr>
                <td colSpan="11" className="text-center p-4 text-gray-500">
                  No jobs available
                </td>
              </tr>
            )}

            {jobs.map((job) => {
              // const assignedDesigner = designers.find(
              //   (d) => d.name === job.assigned_designer
              // );
              const assignedDesigner = designerMap.get(job.assigned_designer);

              return (
                <tr key={job.job_no} className="hover:bg-blue-50">
                  <td className="border p-2 sticky left-0 bg-blue-800 z-40  text-center font-semibold text-white">
                    {job.job_no}
                  </td>
                  <td className="border p-2">
                    {job.createdAt
                      ? DateTime.fromJSDate(new Date(job.createdAt)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a")
                      : "-"}
                  </td>
                  <td className="border p-2">{job.client_name}</td>
                  <td className="border p-2">{job.order_type}</td>
                  <td className="border p-2">{job.order_handled_by}</td>
                  <td className="border p-2">{job.execution_location}</td>
                  <td className="border p-2">
                    {job.delivery_date ? DateTime.fromJSDate(new Date(job.delivery_date)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a") : "-"}
                  </td>
                  {/* <td className="border p-2">{job.delivery_location}</td> */}
                  <td className="border-b px-2  max-w-[500px]">
                    {job.delivery_location}
                    {job.delivery_location === "Delivery Address" && (
                      <div className=" text-[11px] text-gray-500 italic mt-1">
                        {job.delivery_address}
                      </div>
                    )}
                  </td>

                  <td className="border p-2">{job.task_priority}</td>
                  <td className="border p-2">{job.status}</td>

                  {/* CLICKABLE ASSIGN DESIGNER CELL */}
                  <td
                    className="border p-2 cursor-pointer relative"
                    onClick={() => {
                      setSelectedJobForAssign(job);
                      setShowAssignModal(true);
                    }}
                  >
                    <div className="font-semibold text-blue-700">
                      {assignedDesigner
                        ? `${assignedDesigner.name}`
                        : "Click to Assign"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showAssignModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 20 }}
              className="bg-white rounded-xl shadow-2xl w-[90%] max-w-xl max-h-[80vh] overflow-y-auto p-6"
            >
              {/* Header */}
              <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h3 className="text-xl font-semibold text-blue-700">
                  Assign Designer for Job #{selectedJobForAssign?.job_no}
                </h3>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="text-red-600 hover:text-red-800 text-3xl leading-none"
                >
                  &times;
                </button>
              </div>

              {/* Designer List */}
              <div className="space-y-3">
                {designers.map((designer) => (
                  <button
                    disabled={assigning || designer.name === selectedJobForAssign?.assigned_designer}
                    key={designer.designer_id}
                    onClick={() => {
                      assignDesigner(
                        selectedJobForAssign.job_no,
                        designer.designer_id
                      );
                    }}
                    className="w-full text-left p-4 border rounded-lg hover:bg-blue-200 transition shadow-sm cursor-pointer"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-800">
                        {designer.name}
                      </span>

                      {designer.status === "idle" ? (
                        <span className="text-green-600 text-sm">🟢 Idle</span>
                      ) : (
                        <span className="text-yellow-600 text-sm">
                          🟡 Active
                        </span>
                      )}
                    </div>

                    {/* Workload bar */}
                    <div className="w-full bg-gray-200 rounded h-2 mt-2">
                      <div
                        className="bg-blue-600 h-2 rounded"
                        style={{ width: `${designer.workload_score}%` }}
                      ></div>
                    </div>

                    <div className="text-s text-gray-600 mt-1">
                      Active Jobs: {designer.active_jobs.length} | Pending:{" "}
                      {designer.pending_jobs.length} | Today Completed:{" "}
                      {designer.today_completed}
                    </div>

                    {designer.urgent_flag && (
                      <div className="text-[11px] text-red-500 font-medium">
                        {" "}
                        ⚠ Urgent tasks present{" "}
                      </div>
                    )}

                    {designer.status === "active" && (
                      <div className="text-xs text-red-600">
                        Free at:{" "}
                        {designer.expected_free_time ? DateTime.fromJSDate(new Date(designer.expected_free_time)).setZone("Asia/Kolkata").toFormat("dd LLL yyyy, hh:mm a") : "-"}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
