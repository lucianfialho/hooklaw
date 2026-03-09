import { registerProvider } from '@hooklaw/core';
import { AnthropicProvider } from './anthropic.js';

registerProvider('anthropic', (config) => {
  if (!config.api_key) throw new Error("Provider 'anthropic' requires api_key");
  return new AnthropicProvider(config.api_key);
});

export { AnthropicProvider } from './anthropic.js';
