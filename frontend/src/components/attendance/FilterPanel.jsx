// FilterPanel.jsx
const FilterPanel = ({ filter, setFilter }) => (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <input
                type="date"
                className="p-2 border rounded"
                value={filter.date}
                onChange={(e) => setFilter({ ...filter, date: e.target.value, month: '' })}
                disabled={!!filter.month}  // disable if month is selected
            />
            <input
                type="month" className="p-2 border rounded" value={filter.month} onChange={(e) => setFilter({ ...filter, month: e.target.value, date: '' })} 
                disabled={!!filter.date}  // disable if date is selected
                />
            <input
                type="text"
                placeholder="Search name"
                className="p-2 border rounded"
                value={filter.name}
                onChange={(e) => setFilter({ ...filter, name: e.target.value })}
            />
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
                onClick={() => setFilter({ date: '', month: '', name: '', showLate: false })}>
                Clear Filters
            </button>
        </div>
    </div>
);
export default FilterPanel;