import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type http from 'node:http';
import { createLogger } from './logger.js';

const logger = createLogger('hooklaw:server');

export interface ServerDeps {
  getSlugConfig: (slug: string) => { enabled: boolean; mode: string } | undefined;
  processWebhook: (slug: string, payload: unknown) => Promise<string | void>;
  listRecipes?: () => Array<{ id: string; slug: string; description: string; enabled: boolean; mode: string; tools: string[] }>;
  getExecutions?: (slug: string, limit: number, offset: number) => unknown[];
  getRecipeExecutions?: (recipeId: string, limit: number, offset: number) => unknown[];
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
      // GET /health
      if (method === 'GET' && segments[0] === 'health') {
        return sendJson(res, 200, { status: 'ok' });
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

export function startServer(server: http.Server, port: number, host: string): Promise<void> {
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      logger.info({ port, host }, 'HookLaw server started');
      resolve();
    });
  });
}
