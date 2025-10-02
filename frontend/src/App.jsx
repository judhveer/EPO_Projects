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

// Attendance
import AttendanceDashboard from './components/attendance/AttendanceDashboard';
// TaskBot 
import TaskDashboard from './components/taskBot/TaskDashboard';

import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import CreateUser from './pages/CreateUser.jsx';
import ExportLeads from './components/salesPipeline/ExportLeads.jsx';


export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/home" replace />} />

      {/* Protected  */}
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

          {/* Boss/Admin: Create User */}
          <Route
            path="/create-user"
            element={
              <Gate
                perm="attendance.view" // everyone has this; we’ll check role inside page
                fallback={<div className='p-6'>Not Authorized</div>}
              >
                <CreateUser />
              </Gate>
            }
          />

          {/* Sales (use your Layout around sales pages only) */}
          <Route path="/sales" element={<Layout />}>
            {/* Default under /sales -> /sales/dashboard */}
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

            {/* Forms with view/mutate guards per role */}
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

            <Route path='/sales/export-leads' element={<ExportLeads />} />

          </Route>

          <Route path="*" element={<div className="p-6">Not Found</div>} />

        </Route>

      </Route>
    </Routes>
  );
}

