// components/salesPipeline/Layout.jsx
import { Outlet } from 'react-router-dom';
import NavBar from './NavBar.jsx';

export default function Layout() {
  return (
    <div className="min-h-full bg-slate-50">
      <NavBar />
      <main className="max-w-6xl mx-auto p-4 md:p-6">
        <Outlet />   {/* <- renders matched child route */}
      </main>
    </div>
  );
}
