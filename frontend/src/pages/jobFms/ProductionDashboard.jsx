import { useState } from "react";
import ProductionTable from "../../components/jobFms/ProductionTable.jsx";
import WorkerManagement from "../../components/jobFms/production/WorkerManagement.jsx";


export default function ProductionDashboard() {
  const [tab, setTab] = useState("pipeline");
  
  return (
    <div>
      <div className="flex gap-1 border-b border-gray-300 mb-4">
        <button
          onClick={() => setTab("pipeline")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition ${
            tab === "pipeline"
              ? "border-blue-600 text-blue-700 bg-blue-50"
              : "border-transparent text-gray-500 hover:text-blue-700 hover:bg-gray-50"
          }`}
        >
          🏭 Production Pipeline
        </button>
        <button
          onClick={() => setTab("workers")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition ${
            tab === "workers"
              ? "border-blue-600 text-blue-700 bg-blue-50"
              : "border-transparent text-gray-500 hover:text-blue-700 hover:bg-gray-50"
          }`}
        >
          👷 Workers
        </button>
      </div>

      {tab === "pipeline" ? <ProductionTable /> : <WorkerManagement />}
    </div>
  );
}