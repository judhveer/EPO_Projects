// AttendanceDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import FilterPanel from './FilterPanel';
import StatsSummary from './StatsSummary';
import AttendanceTable from './AttendanceTable';
import PaginationControls from './PaginationControls';
import AbsentEmployees from './AbsentEmployees';
import api from '../../lib/api';

const AttendanceDashboard = () => {
    const [attendance, setAttendance] = useState([]);
    const [summary, setSummary] = useState({ totalEmployees: 0, onTimeCount: 0, lateCount: 0, absentCount: 0 });
    const [absentEmployees, setAbsentEmployees] = useState([]);
    const [filter, setFilter] = useState({ date: '', month: '', name: '', showLate: false });
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });

    // New states for manual sync
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState(''); // show success or error
    const [lastSyncAt, setLastSyncAt] = useState(null); // optional timestamp returned from API

    useEffect(() => { fetchData(); }, [pagination.page, filter]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Main attendance list (with pagination and filters)
            const params = { ...pagination, ...filter };
            const attendanceRes = await api.get('/api/attendance', { params });
            const { data, total, totalPages } = attendanceRes.data;
            setAttendance(data);
            setPagination(prev => ({ ...prev, total, totalPages }));

            // Stats summary
            const summaryRes = await api.get('/api/attendance/summary', { params: { date: filter.date } });
            setSummary(summaryRes.data);

            // Absent employees
            const absentRes = await api.get('/api/attendance/absent', { params: { date: filter.date, month: filter.month, name: filter.name } });
            setAbsentEmployees(absentRes.data);
        } catch (error) {
            console.error('Error fetching data:', error);
            setAttendance([]);
            setSummary({ totalEmployees: 0, onTimeCount: 0, lateCount: 0, absentCount: 0 });
            setAbsentEmployees([]);
        } finally {
            setLoading(false);
        }
    };

    // Manual sync handler: calls your backend sync endpoint then refreshes UI
    const handleManualSync = async () => {
        // prevent double clicks
        if (syncing) return;
        setSyncing(true);
        setSyncMessage('');
        try {
            // Use the same BASE_URL as your cron (api instance or axios)
            // Prefer using your api instance; adjust if auth or headers required
            const res = await api.get('/api/attendance/sync');
            // Backend should ideally return something like { success: true, syncedAt: '2025-09-18T12:34:56Z', message: '...' }
            setSyncMessage(res.data?.message || 'Sync completed successfully');
            if (res.data?.syncedAt) setLastSyncAt(res.data.syncedAt);
            // Refresh attendance & related data immediately after successful sync
            await fetchData();
        } catch (error) {
            console.error('Manual sync failed:', error);
            // Prefer showing backend error message if present
            const msg = error?.response?.data?.message || error?.message || 'Sync failed';
            setSyncMessage(`Sync failed: ${msg}`);
        } finally {
            setSyncing(false);
            // auto-clear the message after a short time (optional)
            setTimeout(() => setSyncMessage(''), 8000);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6 max-w-7xl mx-auto">
            {/* Header with Refresh + Sync Buttons */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4"> 
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Employee Attendance Dashboard</h1>
                    <p className="text-gray-600 mt-1">Track and manage employee attendance records</p>
                    {lastSyncAt && (
                        <p className="text-xs text-gray-500 mt-1">Last synced: {new Date(lastSyncAt).toLocaleString('en-IN')}</p>
                    )}
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={fetchData}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow hover:from-indigo-600 hover:to-purple-700 transition"
                    >
                        <svg
                            className="w-5 h-5"
                            style={{ animation: "spin 1.5s linear infinite" }}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M5.6 5.6a9 9 0 0112.8 0M18.4 18.4a9 9 0 01-12.8 0" />
                        </svg>
                        Refresh
                    </button>

                    <button
                        onClick={handleManualSync}
                        disabled={syncing}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold ${syncing ? 'bg-gray-200 text-gray-600 cursor-not-allowed' : 'bg-green-600 text-white hover:opacity-90'}`}
                        title="Sync attendance from sheet now"
                    >
                        {syncing ? (
                            <>
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                                    <path d="M22 12a10 10 0 00-10-10" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Syncing...
                            </>
                        ) : (
                            <>
                                <svg
                                    className="w-5 h-5"
                                    style={{ animation: "spin 1.5s linear infinite" }}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M5.6 5.6a9 9 0 0112.8 0M18.4 18.4a9 9 0 01-12.8 0" />
                                </svg>
                                Sync from Sheet
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* show a small sync message */}
            {syncMessage && (
                <div className="mb-4 text-sm px-4 py-2 rounded-md bg-yellow-50 border border-yellow-100 text-yellow-800">
                    {syncMessage}
                </div>
            )}

            <FilterPanel filter={filter} setFilter={setFilter} />
            <StatsSummary {...summary} />
            <AttendanceTable attendance={attendance} loading={loading} />
            <PaginationControls pagination={pagination} setPagination={setPagination} />
            <AbsentEmployees absentEmployees={absentEmployees} />
        </div>
    );
};

export default AttendanceDashboard;
