import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from './server.js';
import type http from 'node:http';

let server: http.Server;

function startTestServer(deps: Parameters<typeof createServer>[0]): Promise<number> {
  server = createServer(deps);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
    });
  });
}

afterEach(() => {
  if (server) server.close();
});

async function request(port: number, method: string, path: string, body?: unknown) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

describe('HTTP Server', () => {
  it('GET /health returns 200', async () => {
    const port = await startTestServer({
      getSlugConfig: () => undefined,
      processWebhook: async () => {},
    });

    const { status, data } = await request(port, 'GET', '/health');
    expect(status).toBe(200);
    expect(data.status).toBe('ok');
  });

  it('POST /h/<valid-slug> returns 200 for async recipe', async () => {
    let receivedPayload: unknown;

    const port = await startTestServer({
      getSlugConfig: (slug) => slug === 'stripe-payment' ? { enabled: true, mode: 'async' } : undefined,
      processWebhook: async (_slug, payload) => { receivedPayload = payload; },
    });

    const { status, data } = await request(port, 'POST', '/h/stripe-payment', { event: 'payment.succeeded' });
    expect(status).toBe(200);
    expect(data.status).toBe('accepted');

    await new Promise((r) => setTimeout(r, 50));
    expect(receivedPayload).toEqual({ event: 'payment.succeeded' });
  });

  it('POST /h/<valid-slug> returns output for sync recipe', async () => {
    const port = await startTestServer({
      getSlugConfig: (slug) => slug === 'sync-hook' ? { enabled: true, mode: 'sync' } : undefined,
      processWebhook: async () => 'Invoice created',
    });

    const { status, data } = await request(port, 'POST', '/h/sync-hook', { data: 'test' });
    expect(status).toBe(200);
    expect(data.output).toBe('Invoice created');
  });

  it('POST /h/<unknown> returns 404', async () => {
    const port = await startTestServer({
      getSlugConfig: () => undefined,
      processWebhook: async () => {},
    });

    const { status } = await request(port, 'POST', '/h/nonexistent', {});
    expect(status).toBe(404);
  });

  it('POST /h/<disabled> returns 404', async () => {
    const port = await startTestServer({
      getSlugConfig: () => ({ enabled: false, mode: 'async' }),
      processWebhook: async () => {},
    });

    const { status } = await request(port, 'POST', '/h/disabled', {});
    expect(status).toBe(404);
  });

  it('GET /api/recipes returns configured recipes', async () => {
    const port = await startTestServer({
      getSlugConfig: () => undefined,
      processWebhook: async () => {},
      listRecipes: () => [
        { id: 'stripe-to-invoice', slug: 'stripe-payment', description: 'Auto invoice', enabled: true, mode: 'async', tools: ['stripe', 'contaazul'] },
      ],
    });

    const { status, data } = await request(port, 'GET', '/api/recipes');
    expect(status).toBe(200);
    expect(data.recipes).toHaveLength(1);
    expect(data.recipes[0].id).toBe('stripe-to-invoice');
    expect(data.recipes[0].tools).toEqual(['stripe', 'contaazul']);
  });

  it('GET /api/recipes/:id/executions returns recipe executions', async () => {
    const fakeExecs = [{ id: '1', status: 'success', recipe_id: 'stripe-to-invoice' }];

    const port = await startTestServer({
      getSlugConfig: () => undefined,
      processWebhook: async () => {},
      getRecipeExecutions: () => fakeExecs,
    });

    const { status, data } = await request(port, 'GET', '/api/recipes/stripe-to-invoice/executions');
    expect(status).toBe(200);
    expect(data.executions).toEqual(fakeExecs);
  });

  it('GET /api/webhooks/:slug/executions returns webhook executions', async () => {
    const fakeExecs = [{ id: '1', status: 'success' }, { id: '2', status: 'error' }];

    const port = await startTestServer({
      getSlugConfig: () => undefined,
      processWebhook: async () => {},
      getExecutions: () => fakeExecs,
    });

    const { status, data } = await request(port, 'GET', '/api/webhooks/stripe-payment/executions');
    expect(status).toBe(200);
    expect(data.executions).toEqual(fakeExecs);
  });

  it('returns 404 for unknown routes', async () => {
    const port = await startTestServer({
      getSlugConfig: () => undefined,
      processWebhook: async () => {},
    });

    const { status } = await request(port, 'GET', '/unknown');
    expect(status).toBe(404);
  });
});
