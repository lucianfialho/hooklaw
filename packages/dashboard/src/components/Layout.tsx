import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.tsx';

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen">
      <Sidebar
        open={sidebarOpen}
        collapsed={collapsed}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 p-3 border-b border-zinc-800 bg-zinc-900">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <img src="/dashboard/logo.png" alt="HookLaw" className="w-6 h-6 rounded" />
          <span className="text-sm font-bold text-zinc-100">HookLaw</span>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6 relative min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
