// StatsSummary.jsx
const STAT_COLOR = {
  'Total Employees': 'text-gray-800',
  'On Time':          'text-green-600',
  'Late':              'text-yellow-600',
  'Absent':            'text-red-600',
  'On Leave':          'text-blue-600',
  'Holiday':           'text-purple-600',
  'Week Off':          'text-slate-500',
};

const StatsSummary = ({
    totalEmployees, onTimeCount, lateCount, absentCount,
    holidayCount = 0, weekOffCount = 0, leaveCount = 0,
}) => {
  const stats = [
    { label: 'Total Employees', value: totalEmployees },
    { label: 'On Time',         value: onTimeCount },
    { label: 'Late',            value: lateCount },
    { label: 'Absent',          value: absentCount },
    { label: 'On Leave',        value: leaveCount },
    { label: 'Holiday',         value: holidayCount },
    { label: 'Week Off',        value: weekOffCount },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-white rounded-xl shadow-md p-4">
          <div className={`text-2xl font-bold ${STAT_COLOR[stat.label]}`}>{stat.value}</div>
          <div className="text-gray-600 mt-1 text-sm">{stat.label}</div>
        </div>
      ))}
    </div>
  );
};
export default StatsSummary;