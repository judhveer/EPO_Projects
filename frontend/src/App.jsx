import React, { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { Gate } from './components/Permission.jsx';
import AppShell from './components/AppShell.jsx';

import Layout from './components/salesPipeline/Layout.jsx';
import Dashboard from './pages/salesPipeline/Dashboard.jsx';
import LeadDetail from './pages/salesPipeline/LeadDetail.jsx';
import ResearchForm from './pages/salesPipeline/forms/ResearchForm.jsx';
import ApprovalForm from './pages/salesPipeline/forms/ApprovalForm.jsx';
import TelecallForm from './pages/salesPipeline/forms/TelecallForm.jsx';
import MeetingForm from './pages/salesPipeline/forms/MeetingForm.jsx';
import CrmForm from './pages/salesPipeline/forms/CrmForm.jsx';
import ExportLeads from './components/salesPipeline/ExportLeads.jsx';
import CoordinatorDashboard from './components/salesPipeline/CoordinatorDashboard.jsx';

// Attendance
import AttendanceDashboard from './components/attendance/AttendanceDashboard';
// TaskBot 
import TaskDashboard from './components/taskBot/TaskDashboard';

import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import CreateUser from './pages/CreateUser.jsx';

// ✅ Public DISC test
import DiscTest from './pages/discPage/DiscTest.jsx';



/**
 * Simple auth hook.
 * - By default it checks localStorage for "authToken" or "user" keys.
 * - If you have a different auth mechanism (Redux/context/cookie), replace the check inside `checkAuth`.
 */


function useAuth() {
  const [isAuthed, setIsAuthed] = useState(false);

  const checkAuth = useCallback(() => {
    // adapt this to your real auth storage: token, user object, etc.
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    const user = localStorage.getItem('user'); // optional
    setIsAuthed(Boolean(token || user));
  }, []);

  useEffect(() => {
    checkAuth();

    // listen to storage events so login/logout in another tab updates this tab
    const onStorage = (e) => {
      if (e.key === 'authToken' || e.key === 'token' || e.key === 'user') checkAuth();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [checkAuth]);

  return { isAuthed, checkAuth };
}

export default function App() {
  const { isAuthed } = useAuth();

  return (
    <Routes>

      {/* ✅ PUBLIC ROUTES */}
      <Route path="/disc-test" element={<DiscTest />} />

      {/* Public: /login -> if already authed redirect to /home */}
      <Route
        path="/login"
        element={isAuthed ? <Navigate to="/home" replace /> : <Login />}
      />

      {/* root: send to appropriate landing based on auth */}
      <Route
        path="/"
        element={isAuthed ? <Navigate to="/home" replace /> : <Navigate to="/login" replace />}
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
              <Gate perm="ea.dashboard.view" fallback={<div className='p-6'>Not Authorized</div>}>
                <TaskDashboard />
              </Gate>
            }
          />

          {/* Create user */}
          <Route
            path="/create-user"
            element={
              <Gate perm="attendance.view" fallback={<div className='p-6'>Not Authorized</div>}>
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
                <Gate perm="sales.dashboard.view" fallback={<div className='p-6'>Not Authorized</div>}>
                  <Dashboard />
                </Gate>
              }
            />

            <Route path="leads/:ticketId" element={<LeadDetail />} />

            <Route
              path="forms/research"
              element={
                <Gate perm="sales.research.view" fallback={<div className='p-6'>Not Authorized</div>}>
                  <ResearchForm />
                </Gate>
              }
            />

            <Route
              path="forms/approval"
              element={
                <Gate perm="sales.approval.view" fallback={<div className='p-6'>Not Authorized</div>}>
                  <ApprovalForm />
                </Gate>
              }
            />

            <Route
              path="forms/telecall"
              element={
                <Gate perm="sales.telecall.view" fallback={<div className='p-6'>Not Authorized</div>}>
                  <TelecallForm />
                </Gate>
              }
            />

            <Route
              path="forms/meeting"
              element={
                <Gate perm="sales.meeting.view" fallback={<div className='p-6'>Not Authorized</div>}>
                  <MeetingForm />
                </Gate>
              }
            />

            <Route
              path="forms/crm"
              element={
                <Gate perm="sales.crm.view" fallback={<div className='p-6'>Not Authorized</div>}>
                  <CrmForm />
                </Gate>
              }
            />

            <Route path="export-leads" element={<ExportLeads />} />
            <Route path="coordinator" element={<CoordinatorDashboard />} />
          </Route>
        </Route>
      </Route>

      {/* wildcard: if unmatched route under protected area, send to home */}
      <Route path="*" element={<Navigate to={isAuthed ? "/home" : "/login"} replace />} />
    </Routes>
  );
}

