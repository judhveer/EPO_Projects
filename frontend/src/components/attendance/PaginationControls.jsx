// PaginationControls.jsx
const PaginationControls = ({ pagination, setPagination }) => (
    <div className="flex justify-between items-center mt-4">
        <button disabled={pagination.page === 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))} className={`px-4 py-2 rounded-md ${pagination.page === 1 ? 'bg-gray-200 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>Previous</button>
        <span className="text-gray-700">Page {pagination.page} of {pagination.totalPages}</span>
        <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))} className={`px-4 py-2 rounded-md ${pagination.page >= pagination.totalPages ? 'bg-gray-200 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>Next</button>
    </div>
);
export default PaginationControls;
