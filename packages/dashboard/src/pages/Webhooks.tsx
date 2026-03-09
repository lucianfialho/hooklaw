import { useEffect, useState, useCallback } from 'react';
import { api, type Recipe, type McpServer } from '../api/client.ts';
import { DataTable, PageHeader, Badge, type Column } from '../components/DataTable.tsx';

interface WebhookRow {
  slug: string;
  url: string;
  recipes: Recipe[];
  recipeCount: number;
  modes: string[];
  tools: string[];
}

export function Webhooks() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    Promise.all([
      api.getRecipes().then((r) => setRecipes(r.recipes)),
      api.getMcpServers().then((r) => setMcpServers(r.servers)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  }, []);

  // Group recipes by slug
  const rows: WebhookRow[] = [];
  const slugMap = new Map<string, Recipe[]>();
  for (const r of recipes.filter((r) => r.enabled)) {
    const list = slugMap.get(r.slug) ?? [];
    list.push(r);
    slugMap.set(r.slug, list);
  }
  for (const [slug, slugRecipes] of slugMap) {
    const allTools = [...new Set(slugRecipes.flatMap((r) => r.tools))];
    const modes = [...new Set(slugRecipes.map((r) => r.mode))];
    rows.push({
      slug,
      url: `${window.location.origin}/h/${slug}`,
      recipes: slugRecipes,
      recipeCount: slugRecipes.length,
      modes,
      tools: allTools,
    });
  }

  const columns: Column<WebhookRow>[] = [
    {
      key: 'method',
      label: '',
      className: 'w-14',
      render: () => <Badge color="emerald">POST</Badge>,
    },
    {
      key: 'endpoint',
      label: 'Endpoint',
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-100 font-mono">/h/{r.slug}</span>
          <button
            onClick={(e) => { e.stopPropagation(); copy(r.url, r.slug); }}
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-all ${
              copied === r.slug
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                : 'border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700'
            }`}
          >
            {copied === r.slug ? 'copied' : 'copy'}
          </button>
        </div>
      ),
    },
    {
      key: 'recipes',
      label: 'Recipes',
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-300">{r.recipeCount}</span>
          <span className="text-[10px] text-zinc-600">recipe{r.recipeCount !== 1 ? 's' : ''}</span>
        </div>
      ),
    },
    {
      key: 'mode',
      label: 'Mode',
      className: 'w-24',
      render: (r) => (
        <div className="flex gap-1">
          {r.modes.map((m) => (
            <Badge key={m} color={m === 'sync' ? 'blue' : 'amber'}>{m}</Badge>
          ))}
        </div>
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
            r.tools.map((t) => <Badge key={t} color="purple">{t}</Badge>)
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Webhooks" description="Endpoints and connected pipelines" />
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.slug}
        loading={loading}
        emptyMessage="No active webhook endpoints"
        emptySubMessage="Add recipes in hooklaw.config.yaml"
        expandable={(row) => (
          <div className="space-y-4">
            {/* Recipes */}
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Connected Recipes</p>
              <div className="space-y-2">
                {row.recipes.map((recipe) => (
                  <div key={recipe.id} className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800/40 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-200 font-medium">{recipe.description || recipe.id}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">{recipe.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-zinc-500 font-mono">{recipe.model}</span>
                      <Badge color={recipe.mode === 'sync' ? 'blue' : 'amber'}>{recipe.mode}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* MCP Servers used */}
            {row.tools.length > 0 && mcpServers.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">MCP Servers</p>
                <div className="flex flex-wrap gap-2">
                  {row.tools.map((tool) => {
                    const server = mcpServers.find((s) => s.name === tool);
                    return (
                      <div key={tool} className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800/40 rounded-lg px-3 py-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                        <span className="text-xs text-zinc-200 font-mono">{tool}</span>
                        {server && (
                          <span className="text-[10px] text-zinc-600 font-mono">
                            {server.command} {server.args?.slice(0, 2).join(' ')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      />
    </div>
  );
}
