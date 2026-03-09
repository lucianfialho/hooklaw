import { useEffect, useState } from 'react';
import { api, type Execution } from '../api/client.ts';
import { DataTable, PageHeader, Badge, type Column } from '../components/DataTable.tsx';
import { timeAgo, formatDuration, tryParseJson } from '../lib/utils.ts';

function statusColor(status: string): 'emerald' | 'red' | 'amber' | 'blue' | 'zinc' {
  switch (status) {
    case 'success': return 'emerald';
    case 'error': return 'red';
    case 'running': return 'blue';
    case 'pending': return 'amber';
    default: return 'zinc';
  }
}

const columns: Column<Execution>[] = [
  {
    key: 'status',
    label: 'Status',
    className: 'w-24',
    render: (e) => <Badge color={statusColor(e.status)}>{e.status}</Badge>,
  },
  {
    key: 'webhook',
    label: 'Webhook',
    render: (e) => <span className="text-xs text-zinc-300 font-mono">/h/{e.hook_id}</span>,
  },
  {
    key: 'recipe',
    label: 'Recipe',
    className: 'hidden sm:table-cell',
    render: (e) => <span className="text-xs text-zinc-400">{e.recipe_id ?? '-'}</span>,
  },
  {
    key: 'duration',
    label: 'Duration',
    className: 'w-24',
    render: (e) => <span className="text-xs text-zinc-400 font-mono">{formatDuration(e.duration_ms)}</span>,
  },
  {
    key: 'when',
    label: 'When',
    className: 'w-28 text-right',
    render: (e) => <span className="text-xs text-zinc-500">{timeAgo(e.created_at)}</span>,
  },
];

export function Executions() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', '50');
    if (statusFilter) params.set('status', statusFilter);

    api.getExecutions(params.toString())
      .then((r) => setExecutions(r.executions))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div>
      <PageHeader title="Executions" description="Webhook processing history">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-zinc-900/80 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="running">Running</option>
          <option value="pending">Pending</option>
        </select>
      </PageHeader>
      <DataTable
        columns={columns}
        data={executions}
        rowKey={(e) => e.id}
        loading={loading}
        emptyMessage="No executions found"
        expandable={(exec) => (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Payload</p>
              <pre className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-3 text-xs text-zinc-300 overflow-auto max-h-48">
                {JSON.stringify(tryParseJson(exec.payload), null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">
                {exec.error ? 'Error' : 'Output'}
              </p>
              <pre className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-3 text-xs overflow-auto max-h-48 text-zinc-300">
                {exec.error
                  ? <span className="text-red-400">{exec.error}</span>
                  : exec.agent_output ?? 'No output'}
              </pre>
              {exec.tools_called && (
                <div className="mt-2">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Tools called</p>
                  <p className="text-xs text-zinc-400">{exec.tools_called}</p>
                </div>
              )}
            </div>
          </div>
        )}
      />
    </div>
  );
}
