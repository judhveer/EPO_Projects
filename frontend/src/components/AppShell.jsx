import { Outlet } from 'react-router-dom';
import GlobalNav from './GlobalNav';

export default function AppShell() {
  return (
    <div className="min-h-screen bg-gray-50">
      <GlobalNav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
