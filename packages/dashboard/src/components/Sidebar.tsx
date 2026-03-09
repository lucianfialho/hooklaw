import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '', label: 'Dashboard', icon: DashboardIcon },
  { to: 'recipes', label: 'Recipes', icon: RecipeIcon },
  { to: 'executions', label: 'Executions', icon: ExecutionIcon },
  { to: 'webhooks', label: 'Webhooks', icon: WebhookIcon },
  { to: 'config', label: 'Config', icon: ConfigIcon },
];

interface SidebarProps {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
}

export function Sidebar({ open, collapsed, onClose, onToggleCollapse }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 border-r border-zinc-800 bg-zinc-900 flex flex-col
          transform transition-all duration-200 ease-in-out
          md:relative md:translate-x-0
          ${open ? 'translate-x-0' : '-translate-x-full'}
          ${collapsed ? 'md:w-16' : 'md:w-56'} w-56
        `}
      >
        {/* Logo + collapse toggle */}
        <div className="p-3 border-b border-zinc-800">
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
            {collapsed ? (
              <button
                onClick={onToggleCollapse}
                className="hidden md:block"
                title="Expand sidebar"
              >
                <img src="/dashboard/logo.png" alt="HookLaw" className="w-8 h-8 rounded-lg hover:ring-1 hover:ring-zinc-600 transition-all" />
              </button>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <img src="/dashboard/logo.png" alt="HookLaw" className="w-9 h-9 rounded-lg shrink-0" />
                  <div className="min-w-0">
                    <h1 className="text-sm font-bold text-zinc-100">HookLaw</h1>
                    <p className="text-[10px] text-zinc-500">v2.0</p>
                  </div>
                </div>
                <button
                  onClick={onToggleCollapse}
                  className="hidden md:flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
                  title="Collapse sidebar"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 19l-7-7 7-7" />
                    <path d="M18 19V5" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === ''}
              onClick={onClose}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-lg text-sm transition-colors ${
                  collapsed ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-3 py-2'
                } ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`
              }
            >
              <item.icon size={collapsed ? 18 : 16} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer (expanded only) */}
        {!collapsed && (
          <div className="p-4 border-t border-zinc-800">
            <p className="text-[10px] text-zinc-600 text-center">
              Webhooks in. MCP tools out.
            </p>
          </div>
        )}
      </aside>
    </>
  );
}

// ── SVG Icons ──────────────────────────────────────

function DashboardIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function RecipeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      <path d="M8 7h8M8 11h5" />
    </svg>
  );
}

function ExecutionIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function WebhookIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function ConfigIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
