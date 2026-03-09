import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  type ReactFlowInstance,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api, type Recipe, type McpServer, type McpHealthResult, type McpToolInfo } from '../api/client.ts';

// ── Helpers ───────────────────────────────────────────

function CopyIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);
  return { copied, copy };
}

function PencilIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

// ── Custom Nodes ──────────────────────────────────────

function WebhookNode({ data }: NodeProps) {
  const d = data as { label: string; slug: string; url: string; onTest: () => void };
  const { copied, copy } = useCopy();

  return (
    <div className="bg-zinc-900/90 backdrop-blur border border-blue-500/40 rounded-xl px-4 py-3 min-w-[170px] shadow-lg shadow-blue-500/10">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold">Webhook</span>
        </div>
        <span className="text-[10px] text-blue-400/60 bg-blue-500/10 px-1.5 py-0.5 rounded font-bold">POST</span>
      </div>
      <div className="text-sm text-zinc-100 font-mono mb-2">{d.label}</div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => copy(d.url)}
          className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md border transition-all ${
            copied
              ? 'border-blue-500 text-blue-400 bg-blue-500/10'
              : 'border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
          }`}
        >
          <CopyIcon size={10} />
          {copied ? 'Copied!' : 'Copy URL'}
        </button>
        <button
          onClick={d.onTest}
          className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md border border-zinc-700/50 text-zinc-500 hover:text-blue-400 hover:border-blue-500/50 transition-all"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Test
        </button>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-2.5 !h-2.5 !border-0" />
    </div>
  );
}

function WebhookTestPanelNode({ data }: NodeProps) {
  const d = data as {
    slug: string;
    onClose: () => void;
  };

  const [payload, setPayload] = useState('{\n  "event": "test",\n  "message": "Hello from HookLaw!"\n}');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ status: string; output?: string; error?: string } | null>(null);

  async function handleSend() {
    setSending(true);
    setResult(null);
    try {
      const parsed = JSON.parse(payload);
      const res = await api.sendWebhook(d.slug, parsed);
      setResult({ status: 'ok', output: JSON.stringify(res, null, 2) });
    } catch (err) {
      setResult({ status: 'error', error: err instanceof Error ? err.message : 'Failed' });
    }
    setSending(false);
  }

  return (
    <div className="bg-zinc-900/95 backdrop-blur-xl border border-blue-500/30 rounded-xl p-4 w-[320px] shadow-2xl shadow-blue-500/5">
      <Handle type="target" position={Position.Left} className="!bg-blue-500 !w-2.5 !h-2.5 !border-0" />

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-blue-400 font-semibold uppercase tracking-wider">Test: /h/{d.slug}</span>
        <button onClick={d.onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">&times;</button>
      </div>

      <div className="space-y-3">
        <Field label="JSON Payload">
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={6}
            spellCheck={false}
            className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs font-mono rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </Field>

        <button
          onClick={handleSend}
          disabled={sending}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium py-2 rounded-md transition-colors flex items-center justify-center gap-1.5"
        >
          {sending ? (
            <>
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
              Sending...
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Send Webhook
            </>
          )}
        </button>

        {result && (
          <div className={`rounded-md border p-2 ${result.status === 'ok' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <div className={`w-1.5 h-1.5 rounded-full ${result.status === 'ok' ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className={`text-[10px] font-semibold uppercase ${result.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.status === 'ok' ? 'Response' : 'Error'}
              </span>
            </div>
            <pre className="text-[10px] text-zinc-400 font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
              {result.output ?? result.error}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function RecipeNode({ data }: NodeProps) {
  const d = data as { label: string; mode: string; description: string; instructions: string; onEdit: () => void };

  return (
    <div className="bg-zinc-900/90 backdrop-blur border border-emerald-500/40 rounded-xl px-4 py-3 min-w-[180px] max-w-[220px] shadow-lg shadow-emerald-500/10">
      <Handle type="target" position={Position.Left} className="!bg-emerald-500 !w-2.5 !h-2.5 !border-0" />
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">Recipe</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-emerald-400/60 bg-emerald-500/10 px-1.5 py-0.5 rounded">{d.mode}</span>
          <button
            onClick={d.onEdit}
            className="text-zinc-500 hover:text-emerald-400 transition-colors p-0.5"
            title="Edit recipe"
          >
            <PencilIcon size={11} />
          </button>
        </div>
      </div>
      {d.description && <div className="text-sm text-zinc-100 font-semibold truncate">{d.description}</div>}
      <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">{d.label}</div>
      <Handle type="source" position={Position.Right} className="!bg-emerald-500 !w-2.5 !h-2.5 !border-0" />
    </div>
  );
}

const PROVIDER_FAVICONS: Record<string, string> = {
  anthropic: 'https://anthropic.com/favicon.ico',
  openai: 'https://openai.com/favicon.ico',
  openrouter: 'https://openrouter.ai/favicon.ico',
  ollama: 'https://ollama.com/public/ollama.png',
};

function AgentNode({ data }: NodeProps) {
  const d = data as { model: string; provider: string; recipeId: string; onEdit: () => void };
  const favicon = PROVIDER_FAVICONS[d.provider];

  return (
    <div className="bg-zinc-900/90 backdrop-blur border border-amber-500/40 rounded-xl px-4 py-3 min-w-[160px] shadow-lg shadow-amber-500/10">
      <Handle type="target" position={Position.Left} className="!bg-amber-500 !w-2.5 !h-2.5 !border-0" />
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold">Agent</span>
        <button
          onClick={d.onEdit}
          className="text-zinc-500 hover:text-amber-400 transition-colors p-0.5"
          title="Edit agent"
        >
          <PencilIcon size={11} />
        </button>
      </div>
      <div className="text-sm text-zinc-100 font-mono">{d.model}</div>
      <div className="flex items-center gap-1.5 mt-1">
        {favicon && <img src={favicon} alt={d.provider} className={`w-3.5 h-3.5 rounded-sm ${d.provider === 'ollama' ? 'bg-white p-px' : ''}`} />}
        <span className="text-[10px] text-zinc-500">{d.provider}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-amber-500 !w-2.5 !h-2.5 !border-0" />
    </div>
  );
}

function AgentEditPanelNode({ data }: NodeProps) {
  const d = data as {
    recipeId: string;
    model: string;
    provider: string;
    instructions: string;
    onSave: (recipeId: string, update: Record<string, unknown>) => void;
    onClose: () => void;
  };

  const [model, setModel] = useState(d.model);
  const [provider, setProvider] = useState(d.provider);
  const [instructions, setInstructions] = useState(d.instructions);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    d.onSave(d.recipeId, { model, provider, instructions });
    setSaving(false);
  }

  const providers = ['anthropic', 'openai', 'openrouter', 'ollama'];

  return (
    <div className="bg-zinc-900/95 backdrop-blur-xl border border-amber-500/30 rounded-xl p-4 w-[300px] shadow-2xl shadow-amber-500/5">
      <Handle type="target" position={Position.Left} className="!bg-amber-500 !w-2.5 !h-2.5 !border-0" />

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-amber-400 font-semibold uppercase tracking-wider">Edit Agent</span>
        <button onClick={d.onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">&times;</button>
      </div>

      <div className="space-y-3">
        <Field label="Provider">
          <div className="flex gap-1.5 flex-wrap">
            {providers.map((p) => {
              const fav = PROVIDER_FAVICONS[p];
              return (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`flex items-center gap-1.5 text-[10px] font-mono px-2 py-1.5 rounded-md border transition-all ${
                    provider === p
                      ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                      : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'
                  }`}
                >
                  {fav && <img src={fav} alt={p} className={`w-3 h-3 rounded-sm ${p === 'ollama' ? 'bg-white p-px' : ''}`} />}
                  {p}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Model">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs font-mono rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
            placeholder="e.g. claude-sonnet-4-20250514"
          />
        </Field>

        <Field label="Instructions">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
            placeholder="What should the agent do?"
          />
        </Field>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium py-2 rounded-md transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

const TOOL_FAVICONS: Record<string, { url: string; invert?: boolean }> = {
  stripe: { url: 'https://stripe.com/favicon.ico' },
  github: { url: 'https://github.com/favicon.ico', invert: true },
  slack: { url: 'https://slack.com/favicon.ico' },
  linear: { url: 'https://linear.app/favicon.ico' },
  notion: { url: 'https://www.notion.so/images/favicon.ico' },
  postgres: { url: 'https://www.postgresql.org/favicon.ico' },
};

function ToolNode({ data }: NodeProps) {
  const d = data as {
    label: string;
    serverInfo?: string;
    healthStatus?: McpHealthResult['status'];
    healthError?: string;
    healthTools?: McpToolInfo[];
    packageName?: string;
    onCheck?: () => void;
    onInstall?: () => void;
    onViewTools?: () => void;
    installing?: boolean;
  };
  const fav = TOOL_FAVICONS[d.label];

  const statusColor = d.healthStatus === 'connected'
    ? 'bg-emerald-400'
    : d.healthStatus === 'error'
      ? 'bg-red-400'
      : d.healthStatus === 'not_installed'
        ? 'bg-amber-400'
        : d.healthStatus === 'checking'
          ? 'bg-blue-400 animate-pulse'
          : 'bg-zinc-600';

  const borderColor = d.healthStatus === 'connected'
    ? 'border-emerald-500/40'
    : d.healthStatus === 'error' || d.healthStatus === 'not_installed'
      ? 'border-red-500/40'
      : 'border-purple-500/40';

  const toolCount = d.healthTools?.length;

  return (
    <div className={`bg-zinc-900/90 backdrop-blur border ${borderColor} rounded-xl px-4 py-3 min-w-[130px] shadow-lg shadow-purple-500/10`}>
      <Handle type="target" position={Position.Left} className="!bg-purple-500 !w-2.5 !h-2.5 !border-0" />
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
          <span className="text-[10px] text-purple-400 uppercase tracking-wider font-semibold">MCP Tool</span>
        </div>
        {d.onCheck && (
          <button
            onClick={d.onCheck}
            className="text-zinc-600 hover:text-purple-400 transition-colors"
            title="Check connection"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {fav
          ? <img src={fav.url} alt={d.label} className={`w-4 h-4 rounded-sm ${fav.invert ? 'invert' : ''}`} />
          : <div className="w-2 h-2 rounded-full bg-purple-500" />
        }
        <span className="text-sm text-zinc-100 font-mono">{d.label}</span>
      </div>
      {d.serverInfo && (
        <div className="text-[10px] text-zinc-500 mt-1 font-mono truncate max-w-[180px]">{d.serverInfo}</div>
      )}
      {d.healthStatus === 'connected' && toolCount != null && (
        <button
          onClick={d.onViewTools}
          className="mt-2 flex items-center gap-1.5 text-[10px] text-purple-400/70 hover:text-purple-400 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
          </svg>
          {toolCount} tools available
        </button>
      )}
      {d.healthStatus === 'not_installed' && d.onInstall && (
        <button
          onClick={d.onInstall}
          disabled={d.installing}
          className="mt-2 w-full flex items-center justify-center gap-1.5 text-[10px] px-2 py-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
        >
          {d.installing ? (
            <>
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
              Installing...
            </>
          ) : (
            <>Install {d.packageName ?? d.label}</>
          )}
        </button>
      )}
      {d.healthStatus === 'error' && d.healthError && (
        <div className="mt-1.5 text-[9px] text-red-400/80 truncate max-w-[200px]" title={d.healthError}>{d.healthError}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-purple-500 !w-2.5 !h-2.5 !border-0" />
    </div>
  );
}

function ToolDetailPanelNode({ data }: NodeProps) {
  const d = data as {
    serverName: string;
    tools: McpToolInfo[];
    onClose: () => void;
  };

  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 8;
  const fav = TOOL_FAVICONS[d.serverName];
  const tools = Array.isArray(d.tools) ? d.tools : [];

  // Extract prefix tags from tool names (e.g. create_issue → "create")
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tools) {
      const name = typeof t === 'string' ? t : t?.name ?? '';
      const prefix = name.split('_')[0];
      if (prefix) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    // Only show tags that have 2+ tools
    return [...counts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1]);
  }, [tools]);

  const filtered = tools.filter((t) => {
    const name = typeof t === 'string' ? t : t?.name ?? '';
    const desc = typeof t === 'string' ? '' : t?.description ?? '';
    if (activeTag && !name.startsWith(activeTag + '_')) return false;
    if (search) {
      const q = search.toLowerCase();
      return name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
    }
    return true;
  });
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="bg-zinc-900/95 backdrop-blur-xl border border-purple-500/30 rounded-xl p-4 w-[340px] shadow-2xl shadow-purple-500/5">
      <Handle type="target" position={Position.Left} className="!bg-purple-500 !w-2.5 !h-2.5 !border-0" />

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {fav
            ? <img src={fav.url} alt={d.serverName} className={`w-4 h-4 rounded-sm ${fav.invert ? 'invert' : ''}`} />
            : <div className="w-2 h-2 rounded-full bg-purple-500" />
          }
          <span className="text-xs text-purple-400 font-semibold uppercase tracking-wider">{d.serverName}</span>
          <span className="text-[10px] text-zinc-600">{filtered.length} tools</span>
        </div>
        <button onClick={d.onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">&times;</button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        placeholder="Filter tools..."
        className="w-full bg-zinc-950/60 border border-zinc-800/50 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 mb-2"
      />

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map(([tag, count]) => (
            <button
              key={tag}
              onClick={() => { setActiveTag(activeTag === tag ? '' : tag); setPage(0); }}
              className={`text-[10px] px-1.5 py-0.5 rounded-md border transition-colors ${
                activeTag === tag
                  ? 'border-purple-500/50 bg-purple-500/15 text-purple-300'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              {tag} <span className="text-zinc-600">{count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {paged.length === 0 ? (
          <p className="text-xs text-zinc-600 py-2">{tools.length === 0 ? 'No tools data available' : 'No matches'}</p>
        ) : (
          paged.map((tool, i) => {
            const name = typeof tool === 'string' ? tool : tool?.name ?? `tool-${i}`;
            const desc = typeof tool === 'string' ? '' : tool?.description ?? '';
            return (
              <div key={name} className="bg-zinc-950/60 border border-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[11px] text-zinc-100 font-mono">{name}</div>
                {desc && (
                  <div className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">{desc}</div>
                )}
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800/50">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-[10px] px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Prev
          </button>
          <span className="text-[10px] text-zinc-500">{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="text-[10px] px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function EditPanelNode({ data }: NodeProps) {
  const d = data as {
    recipeId: string;
    description: string;
    mode: string;
    instructions: string;
    model: string;
    provider: string;
    tools: string[];
    availableTools: string[];
    onSave: (recipeId: string, update: Record<string, unknown>) => void;
    onClose: () => void;
  };

  const [desc, setDesc] = useState(d.description);
  const [mode, setMode] = useState(d.mode);
  const [instructions, setInstructions] = useState(d.instructions);
  const [model, setModel] = useState(d.model);
  const [tools, setTools] = useState<string[]>(d.tools);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    d.onSave(d.recipeId, { description: desc, mode, instructions, model, tools });
    setSaving(false);
  }

  function toggleTool(name: string) {
    setTools((prev) => prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]);
  }

  return (
    <div className="bg-zinc-900/95 backdrop-blur-xl border border-emerald-500/30 rounded-xl p-4 w-[300px] shadow-2xl shadow-emerald-500/5">
      <Handle type="target" position={Position.Left} className="!bg-emerald-500 !w-2.5 !h-2.5 !border-0" />

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Edit: {d.recipeId}</span>
        <button onClick={d.onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">&times;</button>
      </div>

      <div className="space-y-3">
        <Field label="Title">
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </Field>

        <Field label="Model">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs font-mono rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </Field>

        <Field label="Mode">
          <div className="flex gap-2">
            {(['sync', 'async'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 text-xs py-1.5 rounded-md border transition-all ${
                  mode === m
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                    : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Instructions">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
          />
        </Field>

        {d.availableTools.length > 0 && (
          <Field label="Tools">
            <div className="flex flex-wrap gap-1.5">
              {d.availableTools.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTool(t)}
                  className={`text-[10px] font-mono px-2 py-1 rounded-md border transition-all ${
                    tools.includes(t)
                      ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                      : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'
                  }`}
                >
                  {tools.includes(t) ? '✓ ' : ''}{t}
                </button>
              ))}
            </div>
          </Field>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium py-2 rounded-md transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">{label}</label>
      {children}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  webhook: WebhookNode,
  webhookTestPanel: WebhookTestPanelNode,
  recipe: RecipeNode,
  agent: AgentNode,
  tool: ToolNode,
  toolDetailPanel: ToolDetailPanelNode,
  editPanel: EditPanelNode,
  agentEditPanel: AgentEditPanelNode,
};

// ── Build flow from recipes ───────────────────────────

function buildFlow(
  recipes: Recipe[],
  mcpServers: McpServer[],
  onEdit: (recipeId: string) => void,
  onEditAgent: (recipeId: string) => void,
  onTestWebhook: (slug: string) => void,
  onViewTools: (toolNodeId: string) => void,
  mcpHealth: Map<string, McpHealthResult>,
  onCheckMcp: (name: string) => void,
  onInstallMcp: (name: string) => void,
  installingMcps: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (recipes.length === 0) return { nodes, edges };

  const serverMap = new Map(mcpServers.map((s) => [s.name, s]));

  const slugMap = new Map<string, Recipe[]>();
  for (const r of recipes) {
    const list = slugMap.get(r.slug) ?? [];
    list.push(r);
    slugMap.set(r.slug, list);
  }

  const COL_WEBHOOK = 0;
  const COL_RECIPE = 250;
  const COL_AGENT = 540;
  const COL_TOOL = 780;
  const ROW_GAP = 160;

  let rowIndex = 0;

  for (const [slug, slugRecipes] of slugMap) {
    const webhookId = `webhook-${slug}`;
    const webhookY = rowIndex * ROW_GAP;
    const webhookUrl = `${window.location.origin}/h/${slug}`;

    nodes.push({
      id: webhookId,
      type: 'webhook',
      position: { x: COL_WEBHOOK, y: webhookY },
      data: { label: `/h/${slug}`, slug, url: webhookUrl, onTest: () => onTestWebhook(slug) },
    });

    for (const recipe of slugRecipes) {
      const recipeId = `recipe-${recipe.id}`;
      const recipeY = rowIndex * ROW_GAP;

      nodes.push({
        id: recipeId,
        type: 'recipe',
        position: { x: COL_RECIPE, y: recipeY },
        data: {
          label: recipe.id,
          mode: recipe.mode,
          description: recipe.description || '',
          instructions: recipe.instructions || '',
          onEdit: () => onEdit(recipe.id),
        },
      });

      edges.push({
        id: `e-${webhookId}-${recipeId}`,
        source: webhookId,
        target: recipeId,
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      });

      const agentId = `agent-${recipe.id}`;
      nodes.push({
        id: agentId,
        type: 'agent',
        position: { x: COL_AGENT, y: recipeY },
        data: {
          model: recipe.model ?? 'default',
          provider: recipe.provider ?? 'unknown',
          recipeId: recipe.id,
          onEdit: () => onEditAgent(recipe.id),
        },
      });

      edges.push({
        id: `e-${recipeId}-${agentId}`,
        source: recipeId,
        target: agentId,
        animated: true,
        style: { stroke: '#10b981', strokeWidth: 2 },
      });

      if (recipe.tools.length > 0) {
        recipe.tools.forEach((tool, ti) => {
          const toolId = `tool-${recipe.id}-${ti}`;
          const toolY = recipeY + (ti - (recipe.tools.length - 1) / 2) * 80;
          const server = serverMap.get(tool);
          const serverInfo = server
            ? `${server.command ?? ''} ${(server.args ?? []).slice(0, 2).join(' ')}`
            : undefined;
          const health = mcpHealth.get(tool);

          nodes.push({
            id: toolId,
            type: 'tool',
            position: { x: COL_TOOL, y: toolY },
            data: {
              label: tool,
              serverInfo,
              healthStatus: health?.status,
              healthError: health?.error,
              healthTools: health?.tools,
              packageName: health?.packageName ?? server?.packageName,
              onCheck: () => onCheckMcp(tool),
              onInstall: () => onInstallMcp(tool),
              onViewTools: () => onViewTools(toolId),
              installing: installingMcps.has(tool),
            },
          });

          edges.push({
            id: `e-${agentId}-${toolId}`,
            source: agentId,
            target: toolId,
            animated: true,
            style: { stroke: '#f59e0b', strokeWidth: 2 },
          });
        });
      }

      rowIndex++;
    }
  }

  return { nodes, edges };
}

// ── Component ─────────────────────────────────────────

interface RecipeFlowProps {
  recipes: Recipe[];
  mcpServers?: McpServer[];
  onRecipesChange?: () => void;
}

export function RecipeFlow({ recipes, mcpServers = [], onRecipesChange }: RecipeFlowProps) {
  const [editingRecipe, setEditingRecipe] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);
  const [viewingTool, setViewingTool] = useState<string | null>(null);
  const [mcpHealth, setMcpHealth] = useState<Map<string, McpHealthResult>>(new Map());
  const [installingMcps, setInstallingMcps] = useState<Set<string>>(new Set());
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  const availableTools = useMemo(() => mcpServers.map((s) => s.name), [mcpServers]);

  // Auto-check MCP health once when servers arrive
  const healthCheckedRef = useRef(false);
  useEffect(() => {
    if (mcpServers.length === 0 || healthCheckedRef.current) return;
    healthCheckedRef.current = true;
    // Set all to checking
    setMcpHealth(new Map(mcpServers.map((s) => [s.name, { name: s.name, status: 'checking' as const }])));
    api.checkAllMcpHealth()
      .then((r) => {
        setMcpHealth(new Map(r.servers.map((s) => [s.name, s])));
      })
      .catch((err) => {
        console.error('MCP health check failed:', err);
        // If endpoint not available, clear checking state
        setMcpHealth(new Map());
      });
  }, [mcpServers]);

  const handleCheckMcp = useCallback((name: string) => {
    setMcpHealth((prev) => {
      const next = new Map(prev);
      next.set(name, { name, status: 'checking' });
      return next;
    });
    api.checkMcpHealth(name)
      .then((result) => {
        setMcpHealth((prev) => {
          const next = new Map(prev);
          next.set(name, result);
          return next;
        });
      })
      .catch(() => {
        setMcpHealth((prev) => {
          const next = new Map(prev);
          next.set(name, { name, status: 'error', error: 'Check failed' });
          return next;
        });
      });
  }, []);

  const handleInstallMcp = useCallback((name: string) => {
    setInstallingMcps((prev) => new Set(prev).add(name));
    api.installMcpPackage(name)
      .then((result) => {
        setInstallingMcps((prev) => { const s = new Set(prev); s.delete(name); return s; });
        if (result.success) {
          // Re-check health after install
          handleCheckMcp(name);
        } else {
          setMcpHealth((prev) => {
            const next = new Map(prev);
            next.set(name, { name, status: 'error', error: 'Install failed' });
            return next;
          });
        }
      })
      .catch(() => {
        setInstallingMcps((prev) => { const s = new Set(prev); s.delete(name); return s; });
      });
  }, [handleCheckMcp]);

  const handleEdit = useCallback((recipeId: string) => {
    setEditingRecipe((prev) => (prev === recipeId ? null : recipeId));
    setEditingAgent(null);
    setTestingWebhook(null);
    setViewingTool(null);
  }, []);

  const handleEditAgent = useCallback((recipeId: string) => {
    setEditingAgent((prev) => (prev === recipeId ? null : recipeId));
    setEditingRecipe(null);
    setTestingWebhook(null);
    setViewingTool(null);
  }, []);

  const handleTestWebhook = useCallback((slug: string) => {
    setTestingWebhook((prev) => (prev === slug ? null : slug));
    setEditingRecipe(null);
    setEditingAgent(null);
    setViewingTool(null);
  }, []);

  const handleViewTools = useCallback((toolNodeId: string) => {
    setViewingTool((prev) => (prev === toolNodeId ? null : toolNodeId));
    setEditingRecipe(null);
    setEditingAgent(null);
    setTestingWebhook(null);
  }, []);

  const handleSave = useCallback(async (recipeId: string, update: Record<string, unknown>) => {
    try {
      await api.updateRecipe(recipeId, update as Parameters<typeof api.updateRecipe>[1]);
      setEditingRecipe(null);
      onRecipesChange?.();
    } catch (err) {
      console.error('Failed to save recipe:', err);
    }
  }, [onRecipesChange]);

  const handleClose = useCallback(() => {
    setEditingRecipe(null);
    setEditingAgent(null);
    setTestingWebhook(null);
    setViewingTool(null);
  }, []);

  const { baseNodes, baseEdges } = useMemo(() => {
    const { nodes, edges } = buildFlow(recipes, mcpServers, handleEdit, handleEditAgent, handleTestWebhook, handleViewTools, mcpHealth, handleCheckMcp, handleInstallMcp, installingMcps);
    return { baseNodes: nodes, baseEdges: edges };
  }, [recipes, mcpServers, handleEdit, handleEditAgent, handleTestWebhook, handleViewTools, mcpHealth, handleCheckMcp, handleInstallMcp, installingMcps]);

  // Add edit panel node + edge when editing
  const finalNodes = useMemo(() => {
    let result = baseNodes;

    if (editingRecipe) {
      const recipe = recipes.find((r) => r.id === editingRecipe);
      const recipeNode = baseNodes.find((n) => n.id === `recipe-${editingRecipe}`);
      if (recipe && recipeNode) {
        const editNode: Node = {
          id: `edit-${editingRecipe}`,
          type: 'editPanel',
          position: { x: recipeNode.position.x - 40, y: recipeNode.position.y - 420 },
          data: {
            recipeId: recipe.id,
            description: recipe.description || '',
            mode: recipe.mode,
            instructions: recipe.instructions || '',
            model: recipe.model || '',
            provider: recipe.provider || '',
            tools: recipe.tools,
            availableTools,
            onSave: handleSave,
            onClose: handleClose,
          },
        };
        result = [...result, editNode];
      }
    }

    if (editingAgent) {
      const recipe = recipes.find((r) => r.id === editingAgent);
      const agentNode = baseNodes.find((n) => n.id === `agent-${editingAgent}`);
      if (recipe && agentNode) {
        const editNode: Node = {
          id: `agent-edit-${editingAgent}`,
          type: 'agentEditPanel',
          position: { x: agentNode.position.x - 40, y: agentNode.position.y - 350 },
          data: {
            recipeId: recipe.id,
            model: recipe.model || '',
            provider: recipe.provider || '',
            instructions: recipe.instructions || '',
            onSave: handleSave,
            onClose: handleClose,
          },
        };
        result = [...result, editNode];
      }
    }

    if (testingWebhook) {
      const webhookNode = baseNodes.find((n) => n.id === `webhook-${testingWebhook}`);
      if (webhookNode) {
        const testNode: Node = {
          id: `test-${testingWebhook}`,
          type: 'webhookTestPanel',
          position: { x: webhookNode.position.x - 60, y: webhookNode.position.y - 380 },
          data: {
            slug: testingWebhook,
            onClose: handleClose,
          },
        };
        result = [...result, testNode];
      }
    }

    if (viewingTool) {
      const toolNode = baseNodes.find((n) => n.id === viewingTool);
      if (toolNode) {
        const toolData = toolNode.data as { label: string; healthTools?: McpToolInfo[] };
        const tools = toolData.healthTools ?? [];
        if (tools.length > 0) {
          const detailNode: Node = {
            id: `tool-detail-${viewingTool}`,
            type: 'toolDetailPanel',
            position: { x: toolNode.position.x + 250, y: toolNode.position.y - 100 },
            data: {
              serverName: toolData.label,
              tools,
              onClose: handleClose,
            },
          };
          result = [...result, detailNode];
        }
      }
    }

    return result;
  }, [baseNodes, editingRecipe, editingAgent, testingWebhook, viewingTool, recipes, availableTools, handleSave, handleClose]);

  const finalEdges = useMemo(() => {
    let result = baseEdges;

    if (editingRecipe) {
      result = [...result, {
        id: `e-recipe-${editingRecipe}-edit`,
        source: `recipe-${editingRecipe}`,
        target: `edit-${editingRecipe}`,
        style: { stroke: '#10b981', strokeWidth: 1.5, strokeDasharray: '5 5' },
      }];
    }

    if (editingAgent) {
      result = [...result, {
        id: `e-agent-${editingAgent}-edit`,
        source: `agent-${editingAgent}`,
        target: `agent-edit-${editingAgent}`,
        style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '5 5' },
      }];
    }

    if (testingWebhook) {
      result = [...result, {
        id: `e-webhook-${testingWebhook}-test`,
        source: `webhook-${testingWebhook}`,
        target: `test-${testingWebhook}`,
        style: { stroke: '#3b82f6', strokeWidth: 1.5, strokeDasharray: '5 5' },
      }];
    }

    if (viewingTool) {
      result = [...result, {
        id: `e-${viewingTool}-detail`,
        source: viewingTool,
        target: `tool-detail-${viewingTool}`,
        style: { stroke: '#a855f7', strokeWidth: 1.5, strokeDasharray: '5 5' },
      }];
    }

    return result;
  }, [baseEdges, editingRecipe, editingAgent, testingWebhook, viewingTool]);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // Sync nodes/edges when data changes
  useEffect(() => {
    setNodes(finalNodes);
  }, [finalNodes]);

  useEffect(() => {
    setEdges(finalEdges);
  }, [finalEdges]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  // Center on edit panel when it opens
  useEffect(() => {
    const editNodeId = editingRecipe
      ? `edit-${editingRecipe}`
      : editingAgent
        ? `agent-edit-${editingAgent}`
        : testingWebhook
          ? `test-${testingWebhook}`
          : viewingTool
            ? `tool-detail-${viewingTool}`
            : null;

    if (editNodeId && rfInstance.current) {
      setTimeout(() => {
        const node = rfInstance.current?.getNode(editNodeId);
        if (node) {
          rfInstance.current?.setCenter(
            node.position.x + 150,
            node.position.y + 200,
            { zoom: 1, duration: 300 },
          );
        }
      }, 50);
    }
  }, [editingRecipe, editingAgent, testingWebhook, viewingTool, nodes]);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfInstance.current = instance;
    setTimeout(() => instance.fitView(), 100);
  }, []);

  return (
    <div className="w-full h-full" style={{ minHeight: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        panOnDrag
        zoomOnScroll
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable
        nodesConnectable={false}
        onPaneClick={() => {
          setEditingRecipe(null);
          setEditingAgent(null);
          setTestingWebhook(null);
          setViewingTool(null);
        }}
      >
        <Background color="#1a1a1e" gap={24} size={1.5} />
      </ReactFlow>
    </div>
  );
}
