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
import DeliveryChallanPage from "./pages/jobFms/DeliveryChallanPage.jsx";
// ── Standalone worker dashboards (outside AppShell) ──
import WorkerDashboard from "./pages/worker/WorkerDashboard.jsx";
import DeliveryWorkerDashboard from "./pages/worker/DeliveryWorkerDashboard.jsx";



// Blocks restricted-department users from entering AppShell.
// They can only access their own standalone dashboard or /login.
function WorkerGuard({ user, children }) {
  const restrictedDepts = ["Production Worker", "Delivery"];
  if (user && restrictedDepts.includes(user.department)) {
    return <Navigate to={getHomeRoute(user)} replace />;
  }
  return children;
}



/**
 * Returns the correct landing route based on user department.
 * Production Worker and Delivery users have standalone dashboards
 * completely outside the main AppShell navigation.
 */
function getHomeRoute(user) {
  if (!user) return "/login";
  if (user.department === "Production Worker") return "/worker";
  if (user.department === "Delivery") return "/delivery-dashboard";
  return "/home";
}



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

      {/* ADD this route BEFORE the ProtectedRoute block (after the /disc-test route) */}
      <Route path="/delivery/confirm/:token" element={<DeliveryChallanPage />} />

      {/* Public: /login -> if already authed redirect to /home */}
      <Route
        path="/login"
        element={user ? <Navigate to={getHomeRoute(user)} replace /> : <Login />}
      />


      {/* root: send to appropriate landing based on auth */}
      <Route
        path="/"
        element={
          user
            ? <Navigate to={getHomeRoute(user)} replace />
            : <Navigate to="/login" replace />
        }
      />


      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>

        {/* ── Standalone worker dashboards ──
          These are OUTSIDE AppShell intentionally. Workers on phones see ONLY their simple dashboard — no nav bar, no complex UI, no access to other modules. */}
        <Route
          path="/worker"
          element={
            user?.department === "Production Worker"
              ? <WorkerDashboard />
              : <Navigate to={getHomeRoute(user)} replace />
          }
        />
        <Route
          path="/delivery-dashboard"
          element={
            user?.department === "Delivery"
              ? <DeliveryWorkerDashboard />
              : <Navigate to={getHomeRoute(user)} replace />
          }
        />

        <Route element={
          <WorkerGuard user={user}> 
            <AppShell />
          </WorkerGuard>
        }>
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
        element={<Navigate to={user ? getHomeRoute(user) : "/login"} replace />}
      />

    </Routes>
  );
}
