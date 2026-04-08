import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useMemo } from "react";
import api from "../../../lib/api";

import { DateTime } from "luxon";

function formatSeconds(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    secs ? `${secs}s` : ""
  ].filter(Boolean).join(" ");
}

export default function JobDetailsSidebar({ jobNo, onClose }) {
  const [job, setJob] = useState(null);


  const timelineEvents = useMemo(() => {
    if (!job) return [];
    const events = [];

    // DESIGNER ASSIGNMENTS
    job.assignments?.forEach((a, index) => {
      const isRedesign = a.instance > 1;
      events.push({
        time: a.assigned_at,
        title: `Assigned to designer (${a.designer?.username})`,
        description: `Assigned by ${a.assignedBy?.username}`,
        icon: "🎨",
        color: "blue",
        stage: a.instance > 1 ? "redesign" : "design",
        statusBadge: a.instance > 1 ? `Reassigned ${a.instance} times` : "Assigned",
        order: 2,
        redesignInstance: isRedesign ? a.instance - 1 : null,
      });

      if (a.designer_start_time) {
        events.push({
          time: a.designer_start_time,
          title: "Design work started",
          icon: "▶️",
          color: "indigo",
          stage: a.instance > 1 ? "redesign" : "design",
          statusBadge: "In Progress",
          order: 3,
        });
      }

      if (a.is_paused) {
        events.push({
          time: a.updatedAt,
          title: "Design paused",
          icon: "⏸",
          color: "yellow",
          statusBadge: "Paused",
          order: 3,
        });
      }

      if (a.designer_end_time) {
        events.push({
          time: a.designer_end_time,
          title: "Design completed",
          description: `Duration: ${a.designer_duration_seconds}s`,
          icon: "✅",
          color: "green",
          stage: a.instance > 1 ? "redesign" : "design",
          statusBadge: "Completed",
          order: 3,
        });
      }
    });

    // CLIENT APPROVALS
    job.clientApprovals?.forEach((c) => {
      if (c.sent_at) {
        events.push({
          time: c.sent_at,
          title: "Sent to client for approval",
          description: `Handled by ${c.handledBy?.username}`,
          icon: "📤",
          color: "purple",
          stage: "approval",
          statusBadge: "Awaiting Client Response",
        });
      }

      if (c.status === "changes_requested") {
        events.push({
          time: c.updatedAt,
          title: "Client requested changes",
          description: c.client_feedback || "Client requested modifications",
          icon: "🔁",
          color: "orange",
          stage: "approval",
          statusBadge: "Changes Requested",
          order: 1,
        });
      }

      if (c.status === "approved") {
        events.push({
          time: c.approved_at,
          title: "Approved by client",
          icon: "✔️",
          color: "green",
          stage: "approval",
          statusBadge: "Approved",
          order: 1,
        });
      }
    });

    return events
      .filter((e) => e.time)
      .sort((a, b) => {
        const timeDiff = new Date(a.time) - new Date(b.time);
        if (timeDiff !== 0) return timeDiff;
        return (a.order || 99) - (b.order || 99);
      });
  }, [job]);


  useEffect(() => {
    if (!jobNo) return;
    api.get(`/api/fms/common-dashboard/jobs/${jobNo}`).then((res) => {
      setJob(res.data);
    });
  }, [jobNo]);

  if (!jobNo) return null;

  const latestApproval =
    job?.clientApprovals?.[job.clientApprovals.length - 1];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        className="fixed top-0 right-0 w-[40%] h-full bg-white shadow-2xl z-50 overflow-y-auto"
      >
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-semibold text-lg text-blue-700">
            Job #{jobNo} — Detailed View
          </h2>
          <button onClick={onClose} className="text-2xl">×</button>
        </div>

        {!job ? (
          <div className="p-6 text-gray-500">Loading job details…</div>
        ) : (
          <div className="p-6 space-y-8">

            {/* ================= DESIGNER SECTION ================= */}
            <section>
              <h3 className="text-md font-semibold text-gray-800 mb-3">
                🎨 Designer Assignment
              </h3>

              {job.assignments.length === 0 ? (
                <p className="text-sm text-gray-500 italic">
                  Not assigned to designer yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {job.assignments.map((a, idx) => (
                    <div
                      key={a.id}
                      className="border rounded-lg p-4 bg-slate-50"
                    >
                      <p className="text-sm font-semibold text-blue-600 mb-2">
                        Assignment Instance #{idx + 1}
                      </p>

                      <Detail label="Designer" value={a.designer?.username} />
                      <Detail label="Assigned By" value={a.assignedBy?.username} />
                      <Detail
                        label="Assigned At"
                        value={format(a.assigned_at)}
                      />
                      <Detail
                        label="Estimated Completion"
                        value={
                          a.estimated_completion_time
                            ? format(a.estimated_completion_time)
                            : "Not set yet"
                        }
                      />
                      <Detail
                        label="Design Started At"
                        value={
                          a.designer_start_time
                            ? format(a.designer_start_time)
                            : "Not started yet"
                        }
                      />
                      <Detail
                        label="Design Completed At"
                        value={
                          a.designer_end_time
                            ? format(a.designer_end_time)
                            : "In progress"
                        }
                      />
                      <Detail
                        label="Design Duration"
                        value={a.designer_duration_seconds ? formatSeconds(a.designer_duration_seconds) : "—"}
                      />
                      <Detail
                        label="Current Status"
                        value={
                          a.is_paused
                            ? "⏸ Paused"
                            : a.status === "completed"
                            ? "✅ Completed"
                            : "🎨 In Progress"
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ================= CLIENT APPROVAL SECTION ================= */}
            <section>
              <h3 className="text-md font-semibold text-gray-800 mb-3">
                🧾 Client Approval
              </h3>

              {!latestApproval ? (
                <p className="text-sm text-gray-500 italic">
                  Client approval stage not reached yet.
                </p>
              ) : (
                <div className="border rounded-lg p-4 bg-slate-50 space-y-2">
                  <Detail label="CRM Handler" value={latestApproval.handledBy?.username} />

                  <Detail
                    label="Approval Status"
                    value={
                      latestApproval.status === "approved"
                        ? "✅ Approved by client"
                        : latestApproval.status === "changes_requested"
                        ? "🔁 Changes requested by client and reassigned"
                        : "⏳ Awaiting client response"
                    }
                  />

                  <Detail
                    label="Sent For Approval At"
                    value={format(latestApproval.sent_at)}
                  />

                  {latestApproval.approved_at && (
                    <Detail
                      label="Approved At"
                      value={format(latestApproval.approved_at)}
                    />
                  )}

                  {latestApproval.client_feedback && (
                    <Detail
                      label="Client Instructions"
                      value={latestApproval.client_feedback}
                    />
                  )}
                </div>
              )}
            </section>


            <section>
              <h3 className="text-md font-semibold text-gray-800 mb-3">
                🕒 Job Timeline
              </h3>

              <Timeline events={timelineEvents} />
            </section>


          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-800">{value || "—"}</span>
    </div>
  );
}

function format(date) {
  return DateTime.fromISO(date)
    .setZone("Asia/Kolkata")
    .toFormat("dd LLL yyyy, hh:mm a");
}



function StatusBadge({ status }) {
  if (!status) return null;

  const styles = {
    Assigned: "bg-gray-100 text-gray-700",
    "In Progress": "bg-blue-100 text-blue-700",
    Paused: "bg-yellow-100 text-yellow-700",
    Completed: "bg-green-100 text-green-700",
    "Awaiting Response": "bg-purple-100 text-purple-700",
    "Changes Requested": "bg-orange-100 text-orange-700",
    Approved: "bg-green-100 text-green-700",
  };

  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
        styles[status] || "bg-gray-100 text-gray-700"
      }`}
    >
      {status}
    </span>
  );
}




function Timeline({ events }) {
  if (!events.length) {
    return (
      <p className="text-sm text-gray-500 italic">
        Timeline will appear once job activity starts.
      </p>
    );
  }

  let lastStage = null;
  let lastRedesignInstance = null;

  return (
    <div className="relative border-l-2 border-gray-200 ml-3 space-y-6">
      {events.map((e, idx) => {
        const showStageHeader = e.stage !== lastStage;
        lastStage = e.stage;
        const showRedesignLabel =
          e.redesignInstance &&
          e.redesignInstance !== lastRedesignInstance;

        if (e.redesignInstance) {
          lastRedesignInstance = e.redesignInstance;
        }

        
        return (
          <div key={idx}>


            {/* STAGE LABEL */}
            {showStageHeader && (
              <div className="ml-6 mb-2">
                {["design", "approval", "redesign"].includes(e.stage) && (
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      e.stage === "design"
                        ? "bg-blue-100 text-blue-700"
                        : e.stage === "approval"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    {e.stage === "design"
                      ? "DESIGN STAGE"
                      : e.stage === "approval"
                      ? "CLIENT APPROVAL STAGE"
                      : "REDESIGN STAGE"}

                    {showRedesignLabel && (
                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-orange-100 text-orange-700">
                          #{e.redesignInstance}
                        </span>
                    )}
                  </span>
                )}


              </div>
            )}

              {/* EVENT */}
            <div className="ml-6 relative">
              {/* DOT */}
              <span
                className={`absolute -left-[38px] top-1 w-8 h-8 rounded-full bg-${e.color}-100 flex items-center justify-center text-sm`}
              >
                {e.icon}
              </span>

              {/* CONTENT */}
              <div className="bg-white border rounded-lg p-3 shadow-sm">
                <div className="flex justify-between items-start gap-2">
                  <p className="font-semibold text-sm text-gray-800">
                    {e.title}
                  </p>
                  <StatusBadge status={e.statusBadge} />
                </div>

                {e.description && (
                  <p className="text-xs text-gray-600 mt-1">
                    {e.description}
                  </p>
                )}

                <p className="text-[11px] text-gray-400 mt-1">
                  {DateTime.fromISO(e.time)
                    .setZone("Asia/Kolkata")
                    .toFormat("dd LLL yyyy, hh:mm a")}
                </p>
              </div>
            </div>

          </div>
        );
      })}
      
    </div>
  );
}
