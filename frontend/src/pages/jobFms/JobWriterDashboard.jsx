import React, { useState } from "react";
import JobCardForm from "../../components/jobFms/JobCardForm";
import JobWriterTable from "../../components/jobFms/JobWriterTable";

export default function JobWriterDashboard() {
  const [activeTab, setActiveTab] = useState("form");
  const [refresh, setRefresh] = useState(false);

  return (
    <div>
      <div className="flex gap-4 mb-6 border-b border-gray-300 items-center justify-center">
        <button
          className={`px-4 py-2 font-medium ${
            activeTab === "form"
              ? "border-b-2 border-blue-600 text-blue-700"
              : "text-gray-500 hover:text-blue-600"
          }`}
          onClick={() => setActiveTab("form")}
        >
          📝 Job Card Entry
        </button>
        <button
          className={`px-4 py-2 font-medium ${
            activeTab === "dashboard"
              ? "border-b-2 border-blue-600 text-blue-700"
              : "text-gray-500 hover:text-blue-600"
          }`}
          onClick={() => setActiveTab("dashboard")}
        >
          📂 My Job Cards
        </button>
      </div>

      {activeTab === "form" ? (
        <JobCardForm onCreated={() => setRefresh(!refresh)} />
      ) : (
        <JobWriterTable refresh={refresh} />
      )}
    </div>
  );
}
