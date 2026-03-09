import { useEffect, useState } from 'react';
import { api, type Recipe } from '../api/client.ts';
import { DataTable, PageHeader, Badge, type Column } from '../components/DataTable.tsx';

const PROVIDER_FAVICONS: Record<string, string> = {
  anthropic: 'https://anthropic.com/favicon.ico',
  openai: 'https://openai.com/favicon.ico',
  openrouter: 'https://openrouter.ai/favicon.ico',
  ollama: 'https://ollama.com/public/ollama.png',
};

const columns: Column<Recipe>[] = [
  {
    key: 'status',
    label: '',
    className: 'w-8',
    render: (r) => (
      <div className={`w-2 h-2 rounded-full ${r.enabled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
    ),
  },
  {
    key: 'name',
    label: 'Recipe',
    render: (r) => (
      <div className="min-w-0">
        <div className="text-sm text-zinc-100 font-medium">{r.description || r.id}</div>
        <div className="text-[11px] text-zinc-500 font-mono mt-0.5">{r.id}</div>
      </div>
    ),
  },
  {
    key: 'slug',
    label: 'Webhook',
    render: (r) => (
      <span className="text-xs text-zinc-400 font-mono">/h/{r.slug}</span>
    ),
  },
  {
    key: 'agent',
    label: 'Agent',
    render: (r) => {
      const fav = PROVIDER_FAVICONS[r.provider ?? ''];
      return (
        <div className="flex items-center gap-2">
          {fav && <img src={fav} alt={r.provider} className={`w-3.5 h-3.5 rounded-sm ${r.provider === 'ollama' ? 'bg-white p-px' : ''}`} />}
          <div>
            <div className="text-xs text-zinc-300 font-mono">{r.model ?? 'default'}</div>
            <div className="text-[10px] text-zinc-600">{r.provider ?? 'unknown'}</div>
          </div>
        </div>
      );
    },
  },
  {
    key: 'mode',
    label: 'Mode',
    className: 'w-20',
    render: (r) => (
      <Badge color={r.mode === 'sync' ? 'blue' : 'amber'}>{r.mode}</Badge>
    ),
  },
  {
    key: 'tools',
    label: 'Tools',
    render: (r) => (
      <div className="flex flex-wrap gap-1">
        {r.tools.length === 0 ? (
          <span className="text-[10px] text-zinc-600">none</span>
        ) : (
          r.tools.map((t) => (
            <Badge key={t} color="purple">{t}</Badge>
          ))
        )}
      </div>
    ),
  },
];

export function Recipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRecipes()
      .then((r) => setRecipes(r.recipes))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Recipes" description="Webhook → AI agent → MCP tool pipelines" />
      <DataTable
        columns={columns}
        data={recipes}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="No recipes configured yet"
        emptySubMessage="Add recipes in hooklaw.config.yaml"
        expandable={(r) => (
          <div className="space-y-3">
            {r.instructions && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Instructions</p>
                <pre className="text-xs text-zinc-400 bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {r.instructions}
                </pre>
              </div>
            )}
          </div>
        )}
      />
    </div>
  );
}
