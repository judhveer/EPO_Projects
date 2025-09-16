// AttendanceTable.jsx
const AttendanceTable = ({ attendance, loading }) => (
    <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8">
        {loading ? (
            <div className="flex justify-center items-center h-64">Loading...</div>
        ) : (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            {["Date", "Employee", "Check-in", "Check-out", "Duration", "Late Minutes", "Location", "Status"].map((head, i) => (
                                <th key={i} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{head}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {attendance.length === 0 ? (
                            <tr><td colSpan="7" className="text-center px-6 py-4 text-gray-500">No attendance records found</td></tr>
                        ) : attendance.map((record, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-6 py-4">{record.date}</td>
                                <td className="px-6 py-4">{record.name}</td>
                                <td className="px-6 py-4">{record.check_in_time?.split(' ')[1] || '--:--:--'}</td>
                                <td className="px-6 py-4">{record.check_out_time?.split(' ')[1] || '--:--:--'}</td>
                                <td className="px-6 py-4">{record.shift_time || 'N/A'}</td>
                                <td className="px-6 py-4">{record.late_minutes ? `${record.late_minutes}` : ''}</td>
                                <td className="px-6 py-4">{record.location}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                        record.status === 'LATE' ? 'bg-yellow-100 text-yellow-800' :
                                        record.status === 'PRESENT' ? 'bg-green-100 text-green-800' :
                                        record.status === 'ABSENT' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                                    }`}>{record.status}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </div>
);
export default AttendanceTable;