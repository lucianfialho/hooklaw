const BASE = '/api';

export async function fetchApi<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface Recipe {
  id: string;
  slug: string;
  description: string;
  enabled: boolean;
  mode: string;
  tools: string[];
  provider?: string;
  model?: string;
  instructions?: string;
}

export interface McpServer {
  name: string;
  transport: string;
  command?: string;
  args?: string[];
  packageName?: string;
}

export interface McpToolInfo {
  name: string;
  description: string;
}

export interface McpHealthResult {
  name: string;
  status: 'connected' | 'error' | 'not_installed' | 'checking';
  tools?: McpToolInfo[];
  error?: string;
  packageName?: string;
}

export interface Execution {
  id: string;
  hook_id: string;
  recipe_id: string | null;
  status: 'pending' | 'running' | 'success' | 'error';
  payload: string;
  agent_output: string | null;
  tools_called: string | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

export interface Stats {
  totalExecutions: number;
  successCount: number;
  errorCount: number;
  activeRecipes: number;
  uniqueSlugs: number;
}

export const api = {
  getStats: () => fetchApi<Stats>('/stats'),
  getRecipes: () => fetchApi<{ recipes: Recipe[] }>('/recipes'),
  getMcpServers: () => fetchApi<{ servers: McpServer[] }>('/mcp-servers'),
  getExecutions: (params?: string) => fetchApi<{ executions: Execution[]; total: number }>(`/executions${params ? `?${params}` : ''}`),
  getRecipeExecutions: (id: string, limit = 20) => fetchApi<{ executions: Execution[] }>(`/recipes/${id}/executions?limit=${limit}`),
  getWebhookExecutions: (slug: string, limit = 20) => fetchApi<{ executions: Execution[] }>(`/webhooks/${slug}/executions?limit=${limit}`),
  updateRecipe: (id: string, update: Partial<Pick<Recipe, 'description' | 'slug' | 'mode' | 'tools' | 'provider' | 'model' | 'instructions'>>) =>
    fetchApi<{ status: string }>(`/recipes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) }),
  getConfig: () => fetchApi<unknown>('/config'),
  checkAllMcpHealth: () => fetchApi<{ servers: McpHealthResult[] }>('/mcp-servers/health'),
  checkMcpHealth: (name: string) => fetchApi<McpHealthResult>(`/mcp-servers/${name}/check`, { method: 'POST' }),
  installMcpPackage: (name: string) => fetchApi<{ success: boolean; output: string }>(`/mcp-servers/${name}/install`, { method: 'POST' }),
  getHealth: () => fetch('/health').then(r => { if (!r.ok) throw new Error('offline'); return r.json(); }) as Promise<{ status: string }>,
  sendWebhook: (slug: string, payload: unknown) =>
    fetch(`/h/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json()),
};
