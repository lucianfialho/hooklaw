import type { LLMProvider } from './base.js';
import type { ProviderConfig } from '../types.js';

export type ProviderFactory = (config: ProviderConfig) => LLMProvider;

const registry = new Map<string, ProviderFactory>();
const cache = new Map<string, LLMProvider>();

export function registerProvider(name: string, factory: ProviderFactory): void {
  registry.set(name, factory);
}

export function createProvider(name: string, config: ProviderConfig): LLMProvider {
  const cached = cache.get(name);
  if (cached) return cached;

  const factory = registry.get(name);
  if (!factory) {
    const registered = Array.from(registry.keys());
    const hint = registered.length > 0
      ? `Registered: ${registered.join(', ')}`
      : 'No providers registered. Did you forget to import @hooklaw/provider-openai or @hooklaw/provider-anthropic?';
    throw new Error(`Unknown provider: '${name}'. ${hint}`);
  }

  const provider = factory(config);
  cache.set(name, provider);
  return provider;
}

export function clearProviderCache(): void {
  cache.clear();
}

export function clearProviderRegistry(): void {
  registry.clear();
  cache.clear();
}

export function getRegisteredProviders(): string[] {
  return Array.from(registry.keys());
}

export type { LLMProvider, Message, ChatOptions, ChatResult, ToolDefinition, ToolCall } from './base.js';
