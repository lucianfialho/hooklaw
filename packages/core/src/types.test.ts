import { describe, it, expect } from 'vitest';
import { AppConfigSchema, RecipeConfigSchema, McpServerConfigSchema } from './types.js';

describe('AppConfigSchema', () => {
  it('validates a minimal config', () => {
    const result = AppConfigSchema.parse({});
    expect(result.server.port).toBe(3000);
    expect(result.server.host).toBe('0.0.0.0');
    expect(result.recipes).toEqual({});
    expect(result.mcp_servers).toEqual({});
    expect(result.providers).toEqual({});
    expect(result.logs.retention_days).toBe(30);
  });

  it('validates a full config with recipes and mcp_servers', () => {
    const config = {
      server: { port: 8080, host: '127.0.0.1', auth_token: 'secret' },
      providers: {
        anthropic: { api_key: 'sk-ant-xxx' },
        openai: { api_key: 'sk-xxx' },
      },
      mcp_servers: {
        stripe: {
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@stripe/agent-toolkit'],
        },
        contaazul: {
          transport: 'sse',
          url: 'http://localhost:9000/mcp',
        },
      },
      recipes: {
        'stripe-to-invoice': {
          description: 'Auto-create invoice on payment',
          slug: 'stripe-payment',
          mode: 'async',
          agent: {
            provider: 'anthropic',
            model: 'claude-sonnet-4',
            temperature: 0.2,
            instructions: 'Create invoice from Stripe payment.',
          },
          tools: ['stripe', 'contaazul'],
        },
      },
      logs: { retention_days: 90 },
    };

    const result = AppConfigSchema.parse(config);
    expect(result.server.port).toBe(8080);
    expect(result.mcp_servers.stripe.transport).toBe('stdio');
    expect(result.mcp_servers.contaazul.url).toBe('http://localhost:9000/mcp');
    expect(result.recipes['stripe-to-invoice'].tools).toEqual(['stripe', 'contaazul']);
    expect(result.recipes['stripe-to-invoice'].agent.instructions).toBe('Create invoice from Stripe payment.');
    expect(result.logs.retention_days).toBe(90);
  });

  it('rejects invalid recipe mode', () => {
    expect(() =>
      AppConfigSchema.parse({
        recipes: {
          test: {
            slug: 'test',
            mode: 'invalid',
            agent: {
              provider: 'anthropic',
              model: 'claude-sonnet-4',
              instructions: 'test',
            },
          },
        },
      })
    ).toThrow();
  });

  it('rejects recipe without agent', () => {
    expect(() =>
      AppConfigSchema.parse({
        recipes: {
          test: { slug: 'test', mode: 'async' },
        },
      })
    ).toThrow();
  });

  it('rejects recipe without slug', () => {
    expect(() =>
      RecipeConfigSchema.parse({
        agent: {
          provider: 'anthropic',
          model: 'test',
          instructions: 'test',
        },
      })
    ).toThrow();
  });

  it('rejects temperature out of range', () => {
    expect(() =>
      RecipeConfigSchema.parse({
        slug: 'test',
        agent: {
          provider: 'anthropic',
          model: 'test',
          temperature: 3.0,
          instructions: 'test',
        },
      })
    ).toThrow();
  });
});

describe('McpServerConfigSchema', () => {
  it('validates stdio config', () => {
    const result = McpServerConfigSchema.parse({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    });
    expect(result.transport).toBe('stdio');
  });

  it('validates sse config', () => {
    const result = McpServerConfigSchema.parse({
      transport: 'sse',
      url: 'http://localhost:3001/sse',
    });
    expect(result.transport).toBe('sse');
    expect(result.url).toBe('http://localhost:3001/sse');
  });

  it('rejects invalid transport', () => {
    expect(() =>
      McpServerConfigSchema.parse({
        transport: 'websocket',
      })
    ).toThrow();
  });
});
