import { useState } from 'react';
import { formatISTTime, formatMinutes } from '../../utils/attendance/formatIST';

const STATUS_STYLES = {
    PRESENT:     'bg-green-100 text-green-800',
    LATE:        'bg-yellow-100 text-yellow-800',
    HOLIDAY:     'bg-blue-100 text-blue-800',
    WEEK_OFF:    'bg-slate-200 text-slate-600',
    LEAVE:       'bg-purple-100 text-purple-800',
    ABSENT:      'bg-red-100 text-red-800',
    UNRESOLVED:  'bg-gray-100 text-gray-600',
};

function LocationCell({ recordId, prefix, hasTime, label, offsite, lat, lng, accuracy, expandedKey, setExpandedKey }) {
    if (!hasTime) return <span className="text-gray-300">—</span>;
    if (!label) {
        return <span className="text-[11px] text-gray-400 italic">No location recorded</span>;
    }

    const key = `${recordId}-${prefix}`;
    const isExpanded = expandedKey === key;
    const mapUrl = (lat != null && lng != null) ? `https://www.google.com/maps?q=${lat},${lng}` : null;

    return (
        <div className={offsite ? 'border-l-2 border-amber-400 pl-2' : ''}>
            <button
                onClick={() => setExpandedKey(isExpanded ? null : key)}
                className="text-left text-[11px] hover:underline inline-flex items-center gap-1"
            >
                {offsite ? (
                    <span className="inline-flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">⚠ Off-site</span>
                        <span className="text-gray-500">{isExpanded ? 'hide address' : 'tap for address'}</span>
                    </span>
                ) : (
                    <span className="text-gray-500">📍 {label}</span>
                )}
            </button>

            {isExpanded && (
                <div className="mt-1 text-[10px] text-gray-500 space-y-0.5">
                    {offsite && <p className="text-gray-700">{label}</p>}
                    {accuracy != null && <p>Accuracy: within {Math.round(accuracy)}m</p>}
                    {mapUrl && (
                        <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            View on map ↗
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}

const AttendanceTable = ({ attendance, loading, onOverride }) => {
    const [expandedKey, setExpandedKey] = useState(null);

    return (
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
                                <td className="px-6 py-4">
                                    <div>{formatISTTime(record.check_in_time)}</div>
                                    <LocationCell
                                        recordId={record.id} prefix="in" hasTime={!!record.check_in_time}
                                        label={record.check_in_location_label} offsite={record.check_in_offsite}
                                        lat={record.check_in_lat} lng={record.check_in_lng} accuracy={record.check_in_accuracy_m}
                                        expandedKey={expandedKey} setExpandedKey={setExpandedKey}
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <div>{formatISTTime(record.check_out_time)}</div>
                                    <LocationCell
                                        recordId={record.id} prefix="out" hasTime={!!record.check_out_time}
                                        label={record.check_out_location_label} offsite={record.check_out_offsite}
                                        lat={record.check_out_lat} lng={record.check_out_lng} accuracy={record.check_out_accuracy_m}
                                        expandedKey={expandedKey} setExpandedKey={setExpandedKey}
                                    />
                                </td>
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
};
export default AttendanceTable;

