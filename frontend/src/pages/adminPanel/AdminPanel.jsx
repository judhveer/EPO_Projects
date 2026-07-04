import React, { useState } from "react";
import UserManagement from "../../components/adminPanel/users/UserManagement.jsx";
import PaperManagement from "../../components/adminPanel/papers/PaperManagement.jsx";

const TABS = [
  { key: "users", label: "👥 Users" },
  { key: "papers", label: "📄 Papers" },
  // Next: papers, wideFormat, insights
];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-blue-700 mb-4">⚙️ Admin Panel</h1>

      <div className="flex gap-2 mb-4 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "users" && <UserManagement />}
      {activeTab === "papers" && <PaperManagement />}
    </div>
  );
}