// StatsSummary.jsx
const StatsSummary = ({ totalEmployees, onTimeCount, lateCount, absentCount }) => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[{ label: 'Total Employees', value: totalEmployees, color: 'gray-800' },
        { label: 'On Time', value: onTimeCount, color: 'green-600' },
        { label: 'Late Today', value: lateCount, color: 'yellow-600' },
        { label: 'Absent Today', value: absentCount, color: 'red-600' }]
            .map((stat, idx) => (
                <div key={idx} className="bg-white rounded-xl shadow-md p-6">
                    <div className={`text-3xl font-bold text-${stat.color}`}>{stat.value}</div>
                    <div className="text-gray-600 mt-1">{stat.label}</div>
                </div>
            ))}
    </div>
);
export default StatsSummary;