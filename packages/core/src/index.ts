import { createLogger } from './logger.js';
import { loadConfig } from './config.js';
import { initDb, getExecutionsByHook, getExecutionsByRecipe, cleanOldExecutions } from './db.js';
import { HookQueue } from './queue.js';
import { createServer, startServer } from './server.js';
import { processWebhook, getRecipesForSlug } from './router.js';
import type { AppConfig } from './types.js';

const logger = createLogger('hooklaw');

export interface BootstrapOptions {
  configPath?: string;
}

export async function bootstrap(opts: BootstrapOptions = {}): Promise<{ server: import('node:http').Server; config: AppConfig }> {
  const config = loadConfig(opts.configPath);
  const db = initDb();
  const queue = new HookQueue();

  const deps = { config, db, queue };

  // Build slug → config lookup from recipes
  const slugMap = new Map<string, { enabled: boolean; mode: string }>();
  for (const recipe of Object.values(config.recipes)) {
    if (!recipe.enabled) continue;
    const existing = slugMap.get(recipe.slug);
    // If any recipe for this slug is sync, the slug is sync
    if (!existing || recipe.mode === 'sync') {
      slugMap.set(recipe.slug, { enabled: true, mode: recipe.mode });
    }
  }

  const server = createServer({
    getSlugConfig(slug) {
      return slugMap.get(slug);
    },
    processWebhook(slug, payload) {
      return processWebhook(slug, payload, deps);
    },
    listRecipes() {
      return Object.entries(config.recipes).map(([id, r]) => ({
        id,
        slug: r.slug,
        description: r.description,
        enabled: r.enabled,
        mode: r.mode,
        tools: r.tools,
      }));
    },
    getExecutions(slug, limit, offset) {
      return getExecutionsByHook(db, slug, { limit, offset });
    },
    getRecipeExecutions(recipeId, limit, offset) {
      return getExecutionsByRecipe(db, recipeId, { limit, offset });
    },
  });

  const { port, host } = config.server;
  await startServer(server, port, host);

  const recipeCount = Object.keys(config.recipes).length;
  const mcpCount = Object.keys(config.mcp_servers).length;
  logger.info({ recipes: recipeCount, mcpServers: mcpCount, slugs: slugMap.size }, 'HookLaw ready');

  // Schedule log retention cleanup every 6 hours
  const retentionInterval = setInterval(() => {
    const deleted = cleanOldExecutions(db, config.logs.retention_days);
    if (deleted > 0) {
      logger.info({ deleted, retentionDays: config.logs.retention_days }, 'Cleaned old executions');
    }
  }, 6 * 60 * 60 * 1000);
  retentionInterval.unref();

  return { server, config };
}

// Core modules
export { loadConfig } from './config.js';
export { createServer, startServer } from './server.js';
export { processWebhook } from './router.js';
export { HookQueue } from './queue.js';
export { initDb } from './db.js';

// Provider registry
export { registerProvider, createProvider, clearProviderCache, clearProviderRegistry, getRegisteredProviders } from './providers/index.js';
export type { ProviderFactory } from './providers/index.js';
export type { LLMProvider, Message, ChatOptions, ChatResult, ToolDefinition, ToolCall } from './providers/base.js';

// Types
export type { AppConfig, ProviderConfig, RecipeConfig, McpServerConfig, AgentConfig, ServerConfig, LogsConfig, Execution, ExecutionStatus } from './types.js';
export { AppConfigSchema, RecipeConfigSchema, McpServerConfigSchema, ProviderConfigSchema, ServerConfigSchema, LogsConfigSchema, AgentConfigSchema } from './types.js';
