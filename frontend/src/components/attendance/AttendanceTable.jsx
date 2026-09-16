// AttendanceTable.jsx
import { formatISTTime, formatMinutes } from '../../utils/attendance/formatIST';

const STATUS_STYLES = {
  PRESENT:    'bg-green-100 text-green-800',
  LATE:       'bg-yellow-100 text-yellow-800',
  ABSENT:     'bg-red-100 text-red-800',
  HOLIDAY:    'bg-purple-100 text-purple-800',
  WEEK_OFF:   'bg-slate-200 text-slate-700',
  LEAVE:      'bg-blue-100 text-blue-800',
  UNRESOLVED: 'bg-gray-100 text-gray-600',
};

const AttendanceTable = ({ attendance, loading, onOverride }) => (
    <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8">
        {loading ? (
            <div className="flex justify-center items-center h-64">Loading...</div>
        ) : (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            {["Date", "Employee", "Office", "Check-in", "Check-out", "Late By", "Overtime", "Status", "Actions"].map((head, i) => (
                                <th key={i} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{head}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {attendance.length === 0 ? (
                            <tr><td colSpan="9" className="text-center px-6 py-4 text-gray-500">No attendance records found</td></tr>
                        ) : attendance.map((record) => (
                            <tr key={record.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4">{record.shift_date}</td>
                                <td className="px-6 py-4">{record.employee?.username || '—'}</td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-100 text-slate-700">{record.office || '—'}</span>
                                </td>
                                <td className="px-6 py-4">{formatISTTime(record.check_in_time)}</td>
                                <td className="px-6 py-4">{formatISTTime(record.check_out_time)}</td>
                                <td className="px-6 py-4">{record.status === 'LATE' ? formatMinutes(record.late_minutes) : '-'}</td>
                                <td className="px-6 py-4">{formatMinutes(record.overtime_minutes)}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_STYLES[record.status] || STATUS_STYLES.UNRESOLVED}`}>
                                        {record.status}
                                        {record.is_manual_override && <span className="ml-1" title="Manually overridden">✎</span>}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <button onClick={() => onOverride(record)} className="text-xs text-blue-600 hover:underline">Override</button>
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