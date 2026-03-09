import { describe, it, expect, beforeEach } from 'vitest';
import { registerProvider, createProvider, clearProviderRegistry, getRegisteredProviders } from './index.js';
import type { LLMProvider } from './base.js';

beforeEach(() => {
  clearProviderRegistry();
});

function mockProvider(): LLMProvider {
  return {
    async chat() {
      return { content: 'mock' };
    },
  };
}

describe('provider registry', () => {
  it('registers and creates a provider', () => {
    registerProvider('test', () => mockProvider());
    const p = createProvider('test', {});
    expect(p).toBeDefined();
  });

  it('throws for unregistered provider with helpful message', () => {
    expect(() => createProvider('unknown', {})).toThrow('No providers registered');
  });

  it('throws for unregistered provider listing registered ones', () => {
    registerProvider('openai', () => mockProvider());
    expect(() => createProvider('unknown', {})).toThrow('Registered: openai');
  });

  it('caches provider instances', () => {
    registerProvider('test', () => mockProvider());
    const p1 = createProvider('test', {});
    const p2 = createProvider('test', {});
    expect(p1).toBe(p2);
  });

  it('passes config to factory', () => {
    let receivedKey: string | undefined;
    registerProvider('test', (config) => {
      receivedKey = config.api_key;
      return mockProvider();
    });
    createProvider('test', { api_key: 'sk-test' });
    expect(receivedKey).toBe('sk-test');
  });

  it('lists registered providers', () => {
    registerProvider('openai', () => mockProvider());
    registerProvider('anthropic', () => mockProvider());
    expect(getRegisteredProviders()).toEqual(['openai', 'anthropic']);
  });

  it('clearProviderRegistry clears everything', () => {
    registerProvider('test', () => mockProvider());
    createProvider('test', {});
    clearProviderRegistry();
    expect(getRegisteredProviders()).toEqual([]);
    expect(() => createProvider('test', {})).toThrow();
  });
});
