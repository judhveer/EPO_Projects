// FilterPanel.jsx
const FilterPanel = ({ filter, setFilter }) => (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <input
                type="date"
                className="p-2 border rounded"
                value={filter.date}
                onChange={(e) => setFilter({ ...filter, date: e.target.value, month: '' })}
                disabled={!!filter.month}
            />
            <input
                type="month" className="p-2 border rounded" value={filter.month} onChange={(e) => setFilter({ ...filter, month: e.target.value, date: '' })}
                disabled={!!filter.date}
                />
            <input
                type="text"
                placeholder="Search name"
                className="p-2 border rounded"
                value={filter.name}
                onChange={(e) => setFilter({ ...filter, name: e.target.value })}
            />
            <select
                className="p-2 border rounded"
                value={filter.office}
                onChange={(e) => setFilter({ ...filter, office: e.target.value })}
            >
                <option value="">All Offices</option>
                <option value="EPO">EPO</option>
                <option value="MM">MM</option>
            </select>
            <select
                className="p-2 border rounded"
                value={filter.locationFilter}
                onChange={(e) => setFilter({ ...filter, locationFilter: e.target.value })}
            >
                <option value="">All Locations</option>
                <option value="offsite">⚠ Off-site Only</option>
                <option value="missing">No Location Recorded</option>
            </select>
            <label className="flex items-center space-x-2">
                <input
                    type="checkbox"
                    checked={filter.showLate}
                    onChange={(e) => setFilter({ ...filter, showLate: e.target.checked })}
                />
                <span>Show Latecomers Only</span>
            </label>
            <button
                className="bg-gray-200 p-2 rounded"
                onClick={() => setFilter({ date: '', month: '', name: '', showLate: false, office: '', locationFilter: '' })}>
                Clear Filters
            </button>
        </div>
    </div>
);

export default FilterPanel;