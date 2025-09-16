const AbsentEmployees = ({ absentEmployees }) => (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-800">Absent Employees Today</h2>
        </div>
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {absentEmployees.length === 0 ? (
                        <tr><td colSpan="2" className="px-6 py-4 text-center text-gray-500">No absent employees today</td></tr>
                    ) : absentEmployees.map((emp, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-6 py-4">{emp.name}</td>
                            <td className="px-6 py-4">{emp.date}</td>
                            <td className="px-6 py-4">
                                <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">{emp.status}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);
export default AbsentEmployees;
