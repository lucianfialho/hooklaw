import { useState } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  className?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  expandable?: (row: T) => React.ReactNode;
  emptyMessage?: string;
  emptySubMessage?: string;
  loading?: boolean;
}

export function DataTable<T>({ columns, data, rowKey, expandable, emptyMessage, emptySubMessage, loading }: DataTableProps<T>) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-12 text-center">
        <div className="inline-flex items-center gap-2 text-zinc-500 text-sm">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
          Loading...
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-12 text-center">
        <div className="w-10 h-10 rounded-full bg-zinc-800/50 flex items-center justify-center mx-auto mb-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-zinc-600">
            <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="13 2 13 9 20 9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-zinc-500 text-sm">{emptyMessage ?? 'No data found'}</p>
        {emptySubMessage && <p className="text-zinc-600 text-xs mt-1">{emptySubMessage}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800/60 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800/60">
            {columns.map((col) => (
              <th key={col.key} className={`text-left px-4 py-3 text-[11px] text-zinc-500 uppercase tracking-wider font-medium bg-zinc-900/50 ${col.className ?? ''}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const id = rowKey(row);
            const isExpanded = expandedId === id;
            return (
              <TableRow
                key={id}
                row={row}
                columns={columns}
                isExpanded={isExpanded}
                expandable={expandable}
                onToggle={() => setExpandedId(isExpanded ? null : id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableRow<T>({ row, columns, isExpanded, expandable, onToggle }: {
  row: T;
  columns: Column<T>[];
  isExpanded: boolean;
  expandable?: (row: T) => React.ReactNode;
  onToggle: () => void;
}) {
  const isClickable = !!expandable;

  return (
    <>
      <tr
        className={`border-b border-zinc-800/30 transition-colors ${isClickable ? 'cursor-pointer hover:bg-zinc-800/20' : ''} ${isExpanded ? 'bg-zinc-800/10' : ''}`}
        onClick={isClickable ? onToggle : undefined}
      >
        {columns.map((col) => (
          <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
            {col.render(row)}
          </td>
        ))}
      </tr>
      {isExpanded && expandable && (
        <tr className="border-b border-zinc-800/30">
          <td colSpan={columns.length} className="px-4 py-4 bg-zinc-950/30">
            {expandable(row)}
          </td>
        </tr>
      )}
    </>
  );
}

// Reusable page header
export function PageHeader({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-100">{title}</h2>
        <p className="text-sm text-zinc-500 mt-0.5">{description}</p>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

// Reusable badge
export function Badge({ children, color = 'zinc' }: { children: React.ReactNode; color?: 'zinc' | 'emerald' | 'blue' | 'amber' | 'red' | 'purple' }) {
  const colors = {
    zinc: 'bg-zinc-800/80 text-zinc-400 border-zinc-700/50',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    red: 'bg-red-500/10 text-red-400 border-red-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  };

  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${colors[color]}`}>
      {children}
    </span>
  );
}
