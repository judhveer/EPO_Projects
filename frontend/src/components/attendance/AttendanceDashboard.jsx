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
    // const [employees, setEmployees] = useState([]);

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

            // const employeesRes = await axios.get('http://localhost:5000/api/attendance/employees');
            // setEmployees(employeesRes.data);
        } catch (error) {
            console.error('Error fetching data:', error);
            setAttendance([]);
            setSummary({ totalEmployees: 0, onTimeCount: 0, lateCount: 0, absentCount: 0 });
            setAbsentEmployees([]);
        } finally {
            setLoading(false);
        }
    };

    // const getStatus = (record) => {
    //     if (!record.check_in_time) return 'No Check-in';
    //     return isLate(record.check_in_time) ? 'Late' : 'On Time';
    // };

    // const getAbsentEmployees = () => {
    //     const today = new Date().toISOString().slice(0, 10);
    //     const presentNames = attendance.filter(r => r.date === today).map(r => r.name);
    //     return employees.filter(e => !presentNames.includes(e) && (!filter.name || e.toLowerCase().includes(filter.name.toLowerCase())));
    // };

    // const stats = {
    //     totalEmployees: employees.length,
    //     onTimeCount: attendance.filter(a => a.check_in_time && !isLate(a.check_in_time)).length,
    //     lateCount: attendance.filter(a => a.check_in_time && isLate(a.check_in_time)).length,
    //     absentCount: getAbsentEmployees().length
    // };

    return (
        <div className="min-h-screen bg-gray-50 p-6 max-w-7xl mx-auto">
            {/* Header with Refresh Button */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Employee Attendance Dashboard</h1>
                    <p className="text-gray-600 mt-1">Track and manage employee attendance records</p>
                </div>
                <button
                    onClick={fetchData}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow hover:from-indigo-600 hover:to-purple-700 transition"
                >
                    <svg
                        className="w-5 h-5"
                        style={ { animation: "spin 1.5s linear infinite" }}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M5.6 5.6a9 9 0 0112.8 0M18.4 18.4a9 9 0 01-12.8 0" />
                    </svg>
                    Refresh
                </button>
            </div>


            <FilterPanel filter={filter} setFilter={setFilter} />
            <StatsSummary {...summary} />
            <AttendanceTable attendance={attendance} loading={loading} />
            <PaginationControls pagination={pagination} setPagination={setPagination} />
            <AbsentEmployees absentEmployees={absentEmployees} />
        </div>
    );
};

export default AttendanceDashboard;
