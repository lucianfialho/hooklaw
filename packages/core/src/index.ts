import { createLogger } from './logger.js';
import { loadConfig, updateRecipeInFile, addRecipeToFile, addMcpServerToFile, type RecipeUpdate, type NewRecipe, type NewMcpServer } from './config.js';
import { initDb, getExecutionsByHook, getExecutionsByRecipe, getAllExecutions, getExecutionStats, cleanOldExecutions, getTracesByExecution, getMemory, clearMemory, cleanOldMemory, getChildExecutions, getPendingApprovals, updateExecution } from './db.js';
import { HookQueue } from './queue.js';
import { createServer, startServer, getLocalIP } from './server.js';
import { processWebhook, getRecipesForSlug } from './router.js';
import { checkMcpHealth, installMcpPackage, extractPackageName } from './mcp.js';
import { startFeeds } from './feeds.js';
import type { AppConfig } from './types.js';

const logger = createLogger('hooklaw');

// MCP health cache — 5 min TTL avoids spawning processes on every request
const MCP_HEALTH_TTL = 5 * 60 * 1000;
const mcpHealthCache = new Map<string, { result: Awaited<ReturnType<typeof checkMcpHealth>>; ts: number }>();

export interface BootstrapOptions {
  configPath?: string;
  dashboardDir?: string;
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

  let feedManager: ReturnType<typeof startFeeds> | null = null;

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
        provider: r.agent.provider,
        model: r.agent.model,
        instructions: r.agent.instructions,
      }));
    },
    getMcpServers() {
      return Object.entries(config.mcp_servers).map(([name, s]) => ({
        name,
        transport: s.transport,
        command: s.command,
        args: s.args,
        packageName: extractPackageName(s),
      }));
    },
    async checkMcpHealth(name: string, force = false) {
      const serverConfig = config.mcp_servers[name];
      if (!serverConfig) throw new Error(`MCP server '${name}' not found`);
      if (!force) {
        const cached = mcpHealthCache.get(name);
        if (cached && Date.now() - cached.ts < MCP_HEALTH_TTL) return cached.result;
      }
      const result = await checkMcpHealth(name, serverConfig);
      mcpHealthCache.set(name, { result, ts: Date.now() });
      return result;
    },
    async checkAllMcpHealth() {
      const now = Date.now();
      const toCheck: [string, typeof config.mcp_servers[string]][] = [];
      const cached: Awaited<ReturnType<typeof checkMcpHealth>>[] = [];

      for (const [name, cfg] of Object.entries(config.mcp_servers)) {
        const entry = mcpHealthCache.get(name);
        if (entry && now - entry.ts < MCP_HEALTH_TTL) {
          cached.push(entry.result);
        } else {
          toCheck.push([name, cfg]);
        }
      }

      const fresh = await Promise.all(
        toCheck.map(async ([name, cfg]) => {
          const result = await checkMcpHealth(name, cfg);
          mcpHealthCache.set(name, { result, ts: now });
          return result;
        }),
      );
      return [...cached, ...fresh];
    },
    async installMcpPackage(name: string) {
      const serverConfig = config.mcp_servers[name];
      if (!serverConfig) throw new Error(`MCP server '${name}' not found`);
      const packageName = extractPackageName(serverConfig);
      if (!packageName) throw new Error(`Cannot determine package name for '${name}'`);
      return installMcpPackage(packageName);
    },
    updateRecipe(recipeId: string, update: RecipeUpdate) {
      const configPath = opts.configPath ?? 'hooklaw.config.yaml';
      updateRecipeInFile(configPath, recipeId, update);
      const fresh = loadConfig(configPath);
      const recipe = fresh.recipes[recipeId];
      if (recipe) {
        config.recipes[recipeId] = recipe;
      }
    },
    addRecipe(data: unknown) {
      const recipe = data as NewRecipe;
      const configPath = opts.configPath ?? 'hooklaw.config.yaml';
      addRecipeToFile(configPath, recipe);
      // Reload config to pick up new recipe + feed + mcp
      const fresh = loadConfig(configPath);
      config.recipes = fresh.recipes;
      config.mcp_servers = fresh.mcp_servers;
      config.feeds = fresh.feeds;
      // Update slug map
      const r = fresh.recipes[recipe.id];
      if (r?.enabled) {
        slugMap.set(r.slug, { enabled: true, mode: r.mode });
      }
      // Start feed poller if added
      if (recipe.feed && fresh.feeds[recipe.id]) {
        if (!feedManager) {
          feedManager = startFeeds({ [recipe.id]: fresh.feeds[recipe.id] }, {
            processWebhook(slug, payload) {
              return processWebhook(slug, payload, deps);
            },
          });
        }
        // Note: for hot-reload of individual feeds, a restart is needed
      }
    },
    addMcpServer(data: unknown) {
      const server = data as NewMcpServer;
      const configPath = opts.configPath ?? 'hooklaw.config.yaml';
      addMcpServerToFile(configPath, server);
      const fresh = loadConfig(configPath);
      config.mcp_servers = fresh.mcp_servers;
    },
    getExecutions(slug, limit, offset) {
      return getExecutionsByHook(db, slug, { limit, offset });
    },
    getRecipeExecutions(recipeId, limit, offset) {
      return getExecutionsByRecipe(db, recipeId, { limit, offset });
    },
    getAllExecutions(queryOpts) {
      return getAllExecutions(db, queryOpts);
    },
    getStats() {
      return getExecutionStats(db);
    },
    getConfig() {
      // Return config with API keys redacted
      const redacted = JSON.parse(JSON.stringify(config));
      if (redacted.providers) {
        for (const p of Object.values(redacted.providers) as Record<string, unknown>[]) {
          if (p.api_key && typeof p.api_key === 'string') {
            p.api_key = p.api_key.slice(0, 8) + '...' + p.api_key.slice(-4);
          }
        }
      }
      return redacted;
    },
    listFeeds() {
      return feedManager?.getStatus() ?? [];
    },
    // Observability
    getExecutionTraces(executionId: string) {
      return getTracesByExecution(db, executionId);
    },
    // Memory
    getRecipeMemory(recipeId: string, limit?: number) {
      return getMemory(db, recipeId, limit);
    },
    clearRecipeMemory(recipeId: string) {
      clearMemory(db, recipeId);
    },
    // Chains
    getChildExecutions(parentId: string) {
      return getChildExecutions(db, parentId);
    },
    // Approvals
    getPendingApprovals() {
      return getPendingApprovals(db);
    },
    approveExecution(id: string, approved: boolean, _notes?: string) {
      updateExecution(db, id, {
        status: approved ? 'approved' : 'rejected',
        approval_status: approved ? 'approved' : 'rejected',
      });
    },
    dashboardDir: opts.dashboardDir,
  });

  const { port, host } = config.server;
  await startServer(server, port, host);

  // Start RSS/Atom/JSON Feed watchers
  if (Object.keys(config.feeds).length > 0) {
    feedManager = startFeeds(config.feeds, {
      processWebhook(slug, payload) {
        return processWebhook(slug, payload, deps);
      },
    });
  }

  const recipeCount = Object.keys(config.recipes).length;
  const mcpCount = Object.keys(config.mcp_servers).length;
  const feedCount = Object.keys(config.feeds).length;
  const localIP = getLocalIP();
  const localUrl = `http://localhost:${port}`;
  const networkUrl = localIP ? `http://${localIP}:${port}` : undefined;

  if (feedCount > 0) {
    logger.info({ feeds: feedCount }, `${feedCount} feed source(s) active`);
  }
  logger.info({ recipes: recipeCount, mcpServers: mcpCount, feeds: feedCount, slugs: slugMap.size }, 'HookLaw ready');
  logger.info({ url: localUrl }, `Local:   ${localUrl}`);
  if (networkUrl) {
    logger.info({ url: networkUrl }, `Network: ${networkUrl}`);
  }
  if (opts.dashboardDir) {
    logger.info(`Dashboard: ${networkUrl ?? localUrl}/dashboard/`);
  }

  // Schedule log retention cleanup every 6 hours
  const retentionInterval = setInterval(() => {
    const deleted = cleanOldExecutions(db, config.logs.retention_days);
    if (deleted > 0) {
      logger.info({ deleted, retentionDays: config.logs.retention_days }, 'Cleaned old executions');
    }
    // Clean old agent memory (default 168h = 7 days)
    const memDeleted = cleanOldMemory(db, 168);
    if (memDeleted > 0) {
      logger.info({ deleted: memDeleted }, 'Cleaned old agent memory');
    }
  }, 6 * 60 * 60 * 1000);
  retentionInterval.unref();

  return { server, config };
}

// Core modules
export { loadConfig, updateRecipeInFile, addRecipeToFile, addMcpServerToFile } from './config.js';
export type { RecipeUpdate, NewRecipe, NewMcpServer } from './config.js';
export { createServer, startServer, getLocalIP } from './server.js';
export { startSetupServer } from './setup.js';
export { processWebhook } from './router.js';
export { HookQueue } from './queue.js';
export { initDb } from './db.js';

// MCP
export { checkMcpHealth, installMcpPackage, extractPackageName, McpPool } from './mcp.js';
export type { McpHealthResult, McpHealthStatus, McpToolInfo, McpConnection } from './mcp.js';

// Provider registry
export { registerProvider, createProvider, clearProviderCache, clearProviderRegistry, getRegisteredProviders } from './providers/index.js';
export type { ProviderFactory } from './providers/index.js';
export type { LLMProvider, Message, ChatOptions, ChatResult, ToolDefinition, ToolCall } from './providers/base.js';

// Feeds
export { startFeeds } from './feeds.js';
export type { FeedManager, FeedStatus, FeedsDeps } from './feeds.js';

// Types
export type { AppConfig, ProviderConfig, RecipeConfig, McpServerConfig, AgentConfig, ServerConfig, LogsConfig, FeedSourceConfig, Execution, ExecutionStatus, AgentTrace, AgentMemoryEntry } from './types.js';
export { AppConfigSchema, RecipeConfigSchema, McpServerConfigSchema, ProviderConfigSchema, ServerConfigSchema, LogsConfigSchema, AgentConfigSchema, FeedSourceConfigSchema } from './types.js';
