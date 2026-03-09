import { registerProvider } from '@hooklaw/core';
import { OpenAIProvider } from './openai.js';

registerProvider('openai', (config) => {
  if (!config.api_key) throw new Error("Provider 'openai' requires api_key");
  return new OpenAIProvider(config.api_key, config.base_url);
});

registerProvider('openrouter', (config) => {
  if (!config.api_key) throw new Error("Provider 'openrouter' requires api_key");
  return new OpenAIProvider(config.api_key, config.base_url ?? 'https://openrouter.ai/api/v1');
});

registerProvider('ollama', (config) => {
  return new OpenAIProvider('ollama', config.base_url ?? 'http://localhost:11434/v1');
});

export { OpenAIProvider } from './openai.js';
