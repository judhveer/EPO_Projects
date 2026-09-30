import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import AttendanceDashboard from '../../components/attendance/AttendanceDashboard';
import MyAttendance from './MyAttendance';
import LeaveApprovals from './LeaveApprovals';
import HolidayManagement from './HolidayManagement';
import AttendanceLeaveConfig from './AttendanceLeaveConfig';
import AuditLogViewer from './AuditLogViewer';

export default function AttendanceAdminHub() {
  const { user } = useAuth();
  // const canConfig = user?.role === 'BOSS' || user?.role === 'ADMIN'; // matches leave.config — deliberately excludes HR
  const isBoss = user?.role === 'BOSS'; // the ONE role with no attendance of its own — everyone else who can see this hub (ADMIN, HR) still needs to check in daily

  const TABS = [
    ...(!isBoss ? [{ key: 'myAttendance', label: '✅ My Attendance' }] : []),
    { key: 'team',       label: '📋 Team Attendance' },
    { key: 'approvals',  label: '🌴 Leave Approvals' },
    { key: 'holidays',   label: '🎉 Holidays' },
    { key: 'config',     label: '⚙️ Config' }, // BOSS/ADMIN/HR — everyone who can reach this hub can now also configure, per the fix above
    { key: 'audit',      label: '📜 Audit Log' },
  ];

  // ADMIN/HR land on their own check-in by default, same as any other employee. BOSS — who has nothing to check in for — lands on the company-wide view instead, since "My Attendance" isn't even a tab they see.
  const [activeTab, setActiveTab] = useState(isBoss ? 'team' : 'myAttendance');

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-blue-700 mb-4">🕒 Attendance & Leave Administration</h1>

      <div className="flex gap-2 mb-4 border-b border-gray-200 flex-wrap">
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'myAttendance' && !isBoss && <MyAttendance />}
      {activeTab === 'team' && <AttendanceDashboard />}
      {activeTab === 'approvals' && <LeaveApprovals />}
      {activeTab === 'holidays' && <HolidayManagement />}
      {activeTab === 'config' && <AttendanceLeaveConfig />}
      {activeTab === 'audit' && <AuditLogViewer />}
    </div>
  );
}