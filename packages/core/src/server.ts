import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { networkInterfaces } from 'node:os';
import { createLogger } from './logger.js';

const logger = createLogger('hooklaw:server');

export interface ServerDeps {
  getSlugConfig: (slug: string) => { enabled: boolean; mode: string } | undefined;
  processWebhook: (slug: string, payload: unknown) => Promise<string | void>;
  listRecipes?: () => Array<{ id: string; slug: string; description: string; enabled: boolean; mode: string; tools: string[]; provider?: string; model?: string; instructions?: string }>;
  getMcpServers?: () => Array<{ name: string; transport: string; command?: string; args?: string[]; packageName?: string }>;
  updateRecipe?: (recipeId: string, update: Record<string, unknown>) => void;
  addRecipe?: (recipe: unknown) => void;
  getExecutions?: (slug: string, limit: number, offset: number) => unknown[];
  getRecipeExecutions?: (recipeId: string, limit: number, offset: number) => unknown[];
  getAllExecutions?: (opts: { limit?: number; offset?: number; status?: string; slug?: string; recipeId?: string }) => { executions: unknown[]; total: number };
  getStats?: () => { total: number; success: number; error: number; running: number; pending: number };
  getConfig?: () => unknown;
  checkMcpHealth?: (name: string, force?: boolean) => Promise<{ name: string; status: string; tools?: Array<{ name: string; description: string }>; error?: string; packageName?: string }>;
  checkAllMcpHealth?: () => Promise<Array<{ name: string; status: string; tools?: Array<{ name: string; description: string }>; error?: string; packageName?: string }>>;
  installMcpPackage?: (name: string) => Promise<{ success: boolean; output: string }>;
  addMcpServer?: (data: unknown) => void;
  listFeeds?: () => Array<{ id: string; url: string; slug: string; refresh: number; enabled: boolean }>;
  // Observability
  getExecutionTraces?: (executionId: string) => unknown[];
  // Memory
  getRecipeMemory?: (recipeId: string, limit?: number) => unknown[];
  clearRecipeMemory?: (recipeId: string) => void;
  // Chains
  getChildExecutions?: (parentId: string) => unknown[];
  // Approvals
  getPendingApprovals?: () => unknown[];
  approveExecution?: (id: string, approved: boolean, notes?: string) => void;
  dashboardDir?: string;
  setupMode?: boolean;
  onSetup?: (data: unknown) => Promise<void>;
  authToken?: string;
}

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(json);
}

function parsePath(url: string): string[] {
  return url.split('?')[0].split('/').filter(Boolean);
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function serveStatic(res: ServerResponse, filePath: string): Promise<boolean> {
  try {
    const data = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function parseQuery(url: string): Record<string, string> {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return {};
  const params: Record<string, string> = {};
  for (const pair of url.slice(qIndex + 1).split('&')) {
    const [k, v] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return params;
}

export function createServer(deps: ServerDeps): http.Server {
  const server = createHttpServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const rawUrl = req.url ?? '/';
    const segments = parsePath(rawUrl);
    const query = parseQuery(rawUrl);

    try {
      // Redirect root to dashboard
      if (method === 'GET' && segments.length === 0 && deps.dashboardDir) {
        res.writeHead(302, { Location: '/dashboard/' });
        res.end();
        return;
      }

      // GET /health
      if (method === 'GET' && segments[0] === 'health') {
        return sendJson(res, 200, { status: 'ok' });
      }

      // GET /api/mode — tells dashboard if we're in setup or ready mode
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'mode' && !segments[2]) {
        return sendJson(res, 200, { mode: deps.setupMode ? 'setup' : 'ready' });
      }

      // POST /api/setup — save initial config (setup mode only)
      if (method === 'POST' && segments[0] === 'api' && segments[1] === 'setup' && !segments[2]) {
        if (!deps.setupMode || !deps.onSetup) {
          return sendJson(res, 400, { error: 'Not in setup mode' });
        }
        const body = await parseBody(req);
        try {
          await deps.onSetup(body);
          return sendJson(res, 200, { status: 'ok' });
        } catch (err) {
          return sendJson(res, 500, { error: err instanceof Error ? err.message : 'Setup failed' });
        }
      }

      // POST /h/:slug — webhook receiver
      if (method === 'POST' && segments[0] === 'h' && segments[1]) {
        const slug = segments[1];
        const slugConfig = deps.getSlugConfig(slug);

        if (!slugConfig || !slugConfig.enabled) {
          return sendJson(res, 404, { error: 'Hook not found' });
        }

        const payload = await parseBody(req);

        if (slugConfig.mode === 'sync') {
          const output = await deps.processWebhook(slug, payload);
          return sendJson(res, 200, { status: 'ok', output });
        }

        // Async: respond immediately, process in background
        sendJson(res, 200, { status: 'accepted' });
        deps.processWebhook(slug, payload).catch((err) => {
          logger.error({ slug, err }, 'Async webhook processing failed');
        });
        return;
      }

      // GET /api/recipes — list all recipes
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'recipes' && !segments[2]) {
        if (deps.listRecipes) {
          return sendJson(res, 200, { recipes: deps.listRecipes() });
        }
        return sendJson(res, 200, { recipes: [] });
      }

      // POST /api/recipes — create a new recipe
      if (method === 'POST' && segments[0] === 'api' && segments[1] === 'recipes' && !segments[2]) {
        if (deps.addRecipe) {
          try {
            const body = await parseBody(req) as Record<string, unknown>;
            deps.addRecipe(body);
            return sendJson(res, 201, { status: 'ok' });
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Create failed';
            const status = msg.includes('already exists') ? 409 : 400;
            return sendJson(res, status, { error: msg });
          }
        }
        return sendJson(res, 501, { error: 'Recipe creation not supported' });
      }

      // PATCH /api/recipes/:id — update a recipe
      if (method === 'PATCH' && segments[0] === 'api' && segments[1] === 'recipes' && segments[2] && !segments[3]) {
        if (deps.updateRecipe) {
          try {
            const body = await parseBody(req) as Record<string, unknown>;
            deps.updateRecipe(segments[2], body);
            return sendJson(res, 200, { status: 'ok' });
          } catch (err) {
            return sendJson(res, 400, { error: err instanceof Error ? err.message : 'Update failed' });
          }
        }
        return sendJson(res, 501, { error: 'Recipe updates not supported' });
      }

      // GET /api/recipes/:id/executions — executions for a recipe
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'recipes' && segments[2] && segments[3] === 'executions') {
        if (deps.getRecipeExecutions) {
          const limit = Math.min(parseInt(query.limit ?? '20', 10) || 20, 100);
          const offset = parseInt(query.offset ?? '0', 10) || 0;
          const executions = deps.getRecipeExecutions(segments[2], limit, offset);
          return sendJson(res, 200, { executions });
        }
        return sendJson(res, 200, { executions: [] });
      }

      // GET /api/webhooks/:slug/executions — executions for a webhook slug
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'webhooks' && segments[2] && segments[3] === 'executions') {
        if (deps.getExecutions) {
          const limit = Math.min(parseInt(query.limit ?? '20', 10) || 20, 100);
          const offset = parseInt(query.offset ?? '0', 10) || 0;
          const executions = deps.getExecutions(segments[2], limit, offset);
          return sendJson(res, 200, { executions });
        }
        return sendJson(res, 200, { executions: [] });
      }

      // GET /api/stats — execution stats for dashboard
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'stats' && !segments[2]) {
        if (deps.getStats) {
          const dbStats = deps.getStats();
          const recipes = deps.listRecipes?.() ?? [];
          const activeRecipes = recipes.filter((r) => r.enabled).length;
          const uniqueSlugs = new Set(recipes.filter((r) => r.enabled).map((r) => r.slug)).size;
          return sendJson(res, 200, {
            totalExecutions: dbStats.total,
            successCount: dbStats.success,
            errorCount: dbStats.error,
            activeRecipes,
            uniqueSlugs,
          });
        }
        return sendJson(res, 200, { totalExecutions: 0, successCount: 0, errorCount: 0, activeRecipes: 0, uniqueSlugs: 0 });
      }

      // GET /api/executions — all executions with filters
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'executions' && !segments[2]) {
        if (deps.getAllExecutions) {
          const limit = Math.min(parseInt(query.limit ?? '20', 10) || 20, 100);
          const offset = parseInt(query.offset ?? '0', 10) || 0;
          const result = deps.getAllExecutions({
            limit,
            offset,
            status: query.status || undefined,
            slug: query.slug || undefined,
            recipeId: query.recipeId || undefined,
          });
          return sendJson(res, 200, result);
        }
        return sendJson(res, 200, { executions: [], total: 0 });
      }

      // GET /api/config — redacted config
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'config' && !segments[2]) {
        if (deps.getConfig) {
          return sendJson(res, 200, deps.getConfig());
        }
        return sendJson(res, 200, {});
      }

      // GET /api/feeds — list active feed sources
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'feeds' && !segments[2]) {
        if (deps.listFeeds) {
          return sendJson(res, 200, { feeds: deps.listFeeds() });
        }
        return sendJson(res, 200, { feeds: [] });
      }

      // GET /api/mcp-servers — list MCP servers
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'mcp-servers' && !segments[2]) {
        if (deps.getMcpServers) {
          return sendJson(res, 200, { servers: deps.getMcpServers() });
        }
        return sendJson(res, 200, { servers: [] });
      }

      // POST /api/mcp-servers — add a new MCP server
      if (method === 'POST' && segments[0] === 'api' && segments[1] === 'mcp-servers' && !segments[2]) {
        if (deps.addMcpServer) {
          try {
            const body = await parseBody(req);
            deps.addMcpServer(body);
            return sendJson(res, 201, { status: 'ok' });
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Create failed';
            const status = msg.includes('already exists') ? 409 : 400;
            return sendJson(res, status, { error: msg });
          }
        }
        return sendJson(res, 501, { error: 'MCP server creation not supported' });
      }

      // GET /api/mcp-servers/health — check all MCP servers health
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'mcp-servers' && segments[2] === 'health' && !segments[3]) {
        if (deps.checkAllMcpHealth) {
          const results = await deps.checkAllMcpHealth();
          return sendJson(res, 200, { servers: results });
        }
        return sendJson(res, 501, { error: 'Health check not available' });
      }

      // POST /api/mcp-servers/:name/check — check a single MCP server
      if (method === 'POST' && segments[0] === 'api' && segments[1] === 'mcp-servers' && segments[2] && segments[3] === 'check' && !segments[4]) {
        if (deps.checkMcpHealth) {
          try {
            const result = await deps.checkMcpHealth(segments[2], true);
            return sendJson(res, 200, result);
          } catch (err) {
            return sendJson(res, 400, { error: err instanceof Error ? err.message : 'Check failed' });
          }
        }
        return sendJson(res, 501, { error: 'Health check not available' });
      }

      // POST /api/mcp-servers/:name/install — install MCP package
      if (method === 'POST' && segments[0] === 'api' && segments[1] === 'mcp-servers' && segments[2] && segments[3] === 'install' && !segments[4]) {
        if (deps.installMcpPackage) {
          try {
            const result = await deps.installMcpPackage(segments[2]);
            return sendJson(res, result.success ? 200 : 500, result);
          } catch (err) {
            return sendJson(res, 400, { error: err instanceof Error ? err.message : 'Install failed' });
          }
        }
        return sendJson(res, 501, { error: 'Install not available' });
      }

      // GET /api/executions/:id/traces — agent reasoning traces
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'executions' && segments[2] && segments[3] === 'traces' && !segments[4]) {
        if (deps.getExecutionTraces) {
          return sendJson(res, 200, { traces: deps.getExecutionTraces(segments[2]) });
        }
        return sendJson(res, 200, { traces: [] });
      }

      // GET /api/executions/:id/chain — child executions in a chain
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'executions' && segments[2] && segments[3] === 'chain' && !segments[4]) {
        if (deps.getChildExecutions) {
          return sendJson(res, 200, { executions: deps.getChildExecutions(segments[2]) });
        }
        return sendJson(res, 200, { executions: [] });
      }

      // GET /api/recipes/:id/memory — agent memory for a recipe
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'recipes' && segments[2] && segments[3] === 'memory' && !segments[4]) {
        if (deps.getRecipeMemory) {
          const limit = parseInt(query.limit ?? '20', 10) || 20;
          return sendJson(res, 200, { memory: deps.getRecipeMemory(segments[2], limit) });
        }
        return sendJson(res, 200, { memory: [] });
      }

      // DELETE /api/recipes/:id/memory — clear agent memory for a recipe
      if (method === 'DELETE' && segments[0] === 'api' && segments[1] === 'recipes' && segments[2] && segments[3] === 'memory' && !segments[4]) {
        if (deps.clearRecipeMemory) {
          deps.clearRecipeMemory(segments[2]);
          return sendJson(res, 200, { status: 'ok' });
        }
        return sendJson(res, 501, { error: 'Memory clear not available' });
      }

      // GET /api/approvals — list pending approvals
      if (method === 'GET' && segments[0] === 'api' && segments[1] === 'approvals' && !segments[2]) {
        if (deps.getPendingApprovals) {
          return sendJson(res, 200, { approvals: deps.getPendingApprovals() });
        }
        return sendJson(res, 200, { approvals: [] });
      }

      // POST /api/executions/:id/approve — approve or reject an execution
      if (method === 'POST' && segments[0] === 'api' && segments[1] === 'executions' && segments[2] && segments[3] === 'approve' && !segments[4]) {
        if (deps.approveExecution) {
          try {
            const body = await parseBody(req) as { approved: boolean; notes?: string };
            deps.approveExecution(segments[2], body.approved, body.notes);
            return sendJson(res, 200, { status: 'ok' });
          } catch (err) {
            return sendJson(res, 400, { error: err instanceof Error ? err.message : 'Approval failed' });
          }
        }
        return sendJson(res, 501, { error: 'Approval not available' });
      }

      // Dashboard static files — /dashboard/*
      if (segments[0] === 'dashboard' && deps.dashboardDir) {
        const subPath = segments.slice(1).join('/') || 'index.html';
        const filePath = join(deps.dashboardDir, subPath);

        const served = await serveStatic(res, filePath);
        if (served) return;

        // SPA fallback: serve index.html for non-file routes
        const indexServed = await serveStatic(res, join(deps.dashboardDir, 'index.html'));
        if (indexServed) return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      logger.error({ err }, 'Request error');
      if (err instanceof Error && err.message === 'Invalid JSON') {
        sendJson(res, 400, { error: 'Invalid JSON body' });
      } else {
        sendJson(res, 500, { error: 'Internal server error' });
      }
    }
  });

  return server;
}

export function getLocalIP(): string | undefined {
  const nets = networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return undefined;
}

export function startServer(server: http.Server, port: number, host: string): Promise<void> {
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      logger.info({ port, host }, 'HookLaw server started');
      resolve();
    });
  });
}
