import React, { useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { Gate } from "./components/Permission.jsx";
import AppShell from "./components/AppShell.jsx";
import { useAuth } from "./context/AuthContext";


import Layout from "./components/salesPipeline/Layout.jsx";
import Dashboard from "./pages/salesPipeline/Dashboard.jsx";
import LeadDetail from "./pages/salesPipeline/LeadDetail.jsx";
import ResearchForm from "./pages/salesPipeline/forms/ResearchForm.jsx";
import ApprovalForm from "./pages/salesPipeline/forms/ApprovalForm.jsx";
import TelecallForm from "./pages/salesPipeline/forms/TelecallForm.jsx";
import MeetingForm from "./pages/salesPipeline/forms/MeetingForm.jsx";
import CrmForm from "./pages/salesPipeline/forms/CrmForm.jsx";
import ExportLeads from "./components/salesPipeline/ExportLeads.jsx";
import CoordinatorDashboard from "./components/salesPipeline/CoordinatorDashboard.jsx";

// Attendance
import AttendanceDashboard from "./components/attendance/AttendanceDashboard";
// TaskBot
import TaskDashboard from "./components/taskBot/TaskDashboard";

import Login from "./pages/Login.jsx";
import Home from "./pages/Home.jsx";
import CreateUser from "./pages/CreateUser.jsx";

// ✅ Public DISC test
import DiscTest from "./pages/discPage/DiscTest.jsx";

// Job FMS
import JobFmsLayout from "./components/jobFms/Layout.jsx";
import JobWriterDashboard from "./pages/jobFms/JobWriterDashboard.jsx";
import ProcessCoordinatorDashboard from "./pages/jobFms/ProcessCoordinatorDashboard.jsx";
import DesignerDashboard from "./pages/jobFms/DesignerDashboard.jsx";
import CrmDashboard from "./pages/jobFms/CrmDashboard.jsx";
import CommonDashboard from "./pages/jobFms/CommonDashboard.jsx";
import ProductionDashboard from "./pages/jobFms/ProductionDashboard.jsx"
import OutboundOrders from "./components/jobFms/OutboundOrders.jsx";
import PendingBillingDashboard from "./components/jobFms/accounts/PendingBillingDashboard.jsx";
import QuotationDashboard from "./pages/jobFms/QuotationDashboard.jsx";



export default function App() {
  // const { isAuthed } = useAuth();
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-gray-500">Loading...</div>;
  }

  return (
    <Routes>
      {/* ✅ PUBLIC ROUTES */}
      <Route path="/disc-test" element={<DiscTest />} />

      {/* Public: /login -> if already authed redirect to /home */}

      <Route
        path="/login"
        element={user ? <Navigate to="/home" replace /> : <Login />}
      />


      {/* root: send to appropriate landing based on auth */}
      <Route
        path="/"
        element={
          user ? (<Navigate to="/home" replace />) : (<Navigate to="/login" replace />)
        }
      />


      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/home" element={<Home />} />
          {/* Attendance: everyone authenticated */}
          <Route path="/attendance" element={<AttendanceDashboard />} />

          {/* EA dashboard guarded */}
          <Route
            path="/task"
            element={
              <Gate
                perm="ea.dashboard.view"
                fallback={<div className="p-6">Not Authorized</div>}
              >
                <TaskDashboard />
              </Gate>
            }
          />

          {/* Create user */}
          <Route
            path="/create-user"
            element={
              <Gate
                perm="attendance.view"
                fallback={<div className="p-6">Not Authorized</div>}
              >
                <CreateUser />
              </Gate>
            }
          />

          {/* Sales */}
          <Route path="/sales" element={<Layout />}>
            <Route index element={<Navigate to="dashboard" replace />} />

            <Route
              path="dashboard"
              element={
                <Gate
                  perm="sales.dashboard.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <Dashboard />
                </Gate>
              }
            />

            <Route path="leads/:ticketId" element={<LeadDetail />} />

            <Route
              path="forms/research"
              element={
                <Gate
                  perm="sales.research.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <ResearchForm />
                </Gate>
              }
            />

            <Route
              path="forms/approval"
              element={
                <Gate
                  perm="sales.approval.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <ApprovalForm />
                </Gate>
              }
            />

            <Route
              path="forms/telecall"
              element={
                <Gate
                  perm="sales.telecall.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <TelecallForm />
                </Gate>
              }
            />

            <Route
              path="forms/meeting"
              element={
                <Gate
                  perm="sales.meeting.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <MeetingForm />
                </Gate>
              }
            />

            <Route
              path="forms/crm"
              element={
                <Gate
                  perm="sales.crm.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <CrmForm />
                </Gate>
              }
            />

            <Route path="export-leads" element={<ExportLeads />} />
            <Route path="coordinator" element={<CoordinatorDashboard />} />
          </Route>

          {/* ---------------- JOB FMS MODULE ---------------- */}
          <Route path="/job-fms" element={<JobFmsLayout />}>

            <Route index element={<Navigate to="common" replace />} />

              {/* Permission is missing yet */}
            <Route
              path="quotation"
              element={
                <Gate
                  perm="jobfms.quotation.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <QuotationDashboard />
                </Gate>
              }
            />

            <Route
              path="common"
              element={<CommonDashboard />}
            />

            <Route
              path="writer"
              element={
                <Gate
                  perm="jobfms.writer.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <JobWriterDashboard />
                </Gate>
              }
            />
            <Route
              path="coordinator"
              element={
                <Gate
                  perm="jobfms.coordinator.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <ProcessCoordinatorDashboard />
                </Gate>
              }
            />
            <Route
              path="designer"
              element={
                <Gate
                  perm="jobfms.designer.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <DesignerDashboard />
                </Gate>
              }
            />
            <Route
              path="crm"
              element={
                <Gate
                  perm="jobfms.crm.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <CrmDashboard />
                </Gate>
              }
            />

            <Route
              path="outbound"
              element={
                <Gate
                  perm="jobfms.outbound.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <OutboundOrders />
                </Gate>
              }
            />

            <Route
              path="production"
              element={
                <Gate
                  perm="jobfms.production.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <ProductionDashboard />
                </Gate>
              }
            />

            <Route
              path="pending-bills"
              element={
                <Gate
                  perm="jobfms.bills.view"
                  fallback={<div className="p-6">Not Authorized</div>}
                >
                  <PendingBillingDashboard />
                </Gate>
              }
            />
          </Route>
          
          {/* --------------- END JOB FMS MODULE --------------- */}
        </Route>
      </Route>

      {/* wildcard: if unmatched route under protected area, send to home */}
      <Route
        path="*"
        element={<Navigate to={user ? "/home" : "/login"} replace />}
      />

    </Routes>
  );
}
