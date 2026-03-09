import { describe, it, expect, beforeEach } from 'vitest';
import { processWebhook, getRecipesForSlug } from './router.js';
import { initDb, getExecutionsByHook, getExecutionsByRecipe } from './db.js';
import { HookQueue } from './queue.js';
import { registerProvider, clearProviderCache, clearProviderRegistry } from './providers/index.js';
import type { AppConfig } from './types.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let queue: HookQueue;

const baseConfig: AppConfig = {
  server: { port: 3000, host: '0.0.0.0' },
  providers: {
    mock: { api_key: 'test' },
  },
  mcp_servers: {},
  recipes: {
    'stripe-to-invoice': {
      description: 'Auto invoice',
      enabled: true,
      slug: 'stripe-payment',
      mode: 'sync',
      agent: {
        provider: 'mock',
        model: 'test-model',
        temperature: 0.7,
        instructions: 'You create invoices from payments.',
      },
      tools: [],
    },
    'stripe-notify': {
      description: 'Notify on payment',
      enabled: true,
      slug: 'stripe-payment-async',
      mode: 'async',
      agent: {
        provider: 'mock',
        model: 'test-model',
        temperature: 0.7,
        instructions: 'Send notification.',
      },
      tools: [],
    },
    'disabled-recipe': {
      description: 'Disabled',
      enabled: false,
      slug: 'disabled-slug',
      mode: 'sync',
      agent: {
        provider: 'mock',
        model: 'test-model',
        temperature: 0.7,
        instructions: 'Disabled.',
      },
      tools: [],
    },
  },
  logs: { retention_days: 30 },
};

beforeEach(() => {
  db = initDb(':memory:');
  queue = new HookQueue();
  clearProviderRegistry();

  registerProvider('mock', () => ({
    async chat() {
      return { content: 'Mock agent response' };
    },
  }));
});

describe('getRecipesForSlug', () => {
  it('finds enabled recipes matching a slug', () => {
    const recipes = getRecipesForSlug(baseConfig, 'stripe-payment');
    expect(recipes).toHaveLength(1);
    expect(recipes[0].id).toBe('stripe-to-invoice');
  });

  it('excludes disabled recipes', () => {
    const recipes = getRecipesForSlug(baseConfig, 'disabled-slug');
    expect(recipes).toHaveLength(0);
  });

  it('returns empty for unknown slug', () => {
    const recipes = getRecipesForSlug(baseConfig, 'nonexistent');
    expect(recipes).toHaveLength(0);
  });
});

describe('processWebhook', () => {
  it('processes sync recipe and returns output', async () => {
    const result = await processWebhook('stripe-payment', { event: 'payment.succeeded' }, { config: baseConfig, db, queue });
    expect(result).toBe('Mock agent response');

    const execs = getExecutionsByHook(db, 'stripe-payment');
    expect(execs).toHaveLength(1);
    expect(execs[0].status).toBe('success');
    expect(execs[0].recipe_id).toBe('stripe-to-invoice');
    expect(execs[0].agent_output).toBe('Mock agent response');
  });

  it('processes async recipe via queue', async () => {
    const result = await processWebhook('stripe-payment-async', { data: 'test' }, { config: baseConfig, db, queue });
    expect(result).toBeUndefined(); // async returns void

    await queue.drain();

    const execs = getExecutionsByHook(db, 'stripe-payment-async');
    expect(execs).toHaveLength(1);
    expect(execs[0].status).toBe('success');
    expect(execs[0].recipe_id).toBe('stripe-notify');
  });

  it('records error when provider fails', async () => {
    clearProviderRegistry();
    registerProvider('mock', () => ({
      async chat() { throw new Error('API rate limit'); },
    }));

    const result = await processWebhook('stripe-payment', {}, { config: baseConfig, db, queue });
    expect(result).toContain('Error: API rate limit');

    const execs = getExecutionsByHook(db, 'stripe-payment');
    expect(execs[0].status).toBe('error');
    expect(execs[0].error).toBe('API rate limit');
  });

  it('returns undefined for unknown slug', async () => {
    const result = await processWebhook('nonexistent', {}, { config: baseConfig, db, queue });
    expect(result).toBeUndefined();
  });

  it('queries executions by recipe_id', async () => {
    await processWebhook('stripe-payment', { amount: 100 }, { config: baseConfig, db, queue });
    await processWebhook('stripe-payment', { amount: 200 }, { config: baseConfig, db, queue });

    const execs = getExecutionsByRecipe(db, 'stripe-to-invoice');
    expect(execs).toHaveLength(2);
  });
});
