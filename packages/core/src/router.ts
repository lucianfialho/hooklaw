import { createLogger } from './logger.js';
import type Database from 'better-sqlite3';
import { createExecution, updateExecution } from './db.js';
import { executeAgent } from './agent.js';
import { createProvider } from './providers/index.js';
import { McpPool } from './mcp.js';
import { HookQueue } from './queue.js';
import type { AppConfig, RecipeConfig } from './types.js';

const logger = createLogger('hooklaw:router');

export interface RouterDeps {
  config: AppConfig;
  db: Database.Database;
  queue: HookQueue;
}

/**
 * Find all recipes that listen on a given webhook slug.
 * Multiple recipes can share the same slug.
 */
export function getRecipesForSlug(config: AppConfig, slug: string): Array<{ id: string; recipe: RecipeConfig }> {
  const matches: Array<{ id: string; recipe: RecipeConfig }> = [];
  for (const [id, recipe] of Object.entries(config.recipes)) {
    if (recipe.slug === slug && recipe.enabled) {
      matches.push({ id, recipe });
    }
  }
  return matches;
}

export async function processWebhook(
  slug: string,
  payload: unknown,
  deps: RouterDeps
): Promise<string | void> {
  const recipes = getRecipesForSlug(deps.config, slug);
  if (recipes.length === 0) {
    logger.warn({ slug }, 'No recipes found for webhook slug');
    return;
  }

  // For sync mode: run the first sync recipe and return its output
  // For async: enqueue all recipes
  const syncRecipe = recipes.find((r) => r.recipe.mode === 'sync');

  if (syncRecipe) {
    return await executeRecipe(slug, syncRecipe.id, syncRecipe.recipe, payload, deps);
  }

  // All async: enqueue each recipe
  for (const { id, recipe } of recipes) {
    deps.queue.enqueue(`${slug}:${id}`, async () => {
      await executeRecipe(slug, id, recipe, payload, deps);
    });
  }
}

async function executeRecipe(
  slug: string,
  recipeId: string,
  recipe: RecipeConfig,
  payload: unknown,
  deps: RouterDeps
): Promise<string> {
  const { db, config } = deps;

  // Create execution record
  const exec = createExecution(db, {
    hook_id: slug,
    recipe_id: recipeId,
    payload: JSON.stringify(payload),
    status: 'pending',
  });

  logger.info({ slug, recipeId, executionId: exec.id }, 'Processing recipe');
  logger.debug({ recipe: { provider: recipe.agent.provider, model: recipe.agent.model, temperature: recipe.agent.temperature, tools: recipe.tools } }, 'Recipe config');

  // Update to running
  updateExecution(db, exec.id, { status: 'running' });

  let mcpPool: McpPool | undefined;

  try {
    // Get provider
    const providerName = recipe.agent.provider;
    const providerConfig = config.providers[providerName] ?? {};
    const provider = createProvider(providerName, providerConfig);
    logger.debug({ provider: providerName }, 'Provider created');

    // Connect MCP servers referenced by recipe tools
    if (recipe.tools.length > 0) {
      logger.debug({ tools: recipe.tools }, 'Connecting MCP servers');
      mcpPool = new McpPool();
      await mcpPool.connect(config.mcp_servers, recipe.tools);
      logger.debug('MCP servers connected');
    }

    const tools = mcpPool?.getAllTools();
    const onToolCall = mcpPool
      ? (name: string, args: Record<string, unknown>) => {
          logger.debug({ tool: name, args }, 'Calling MCP tool');
          return mcpPool!.callTool(name, args);
        }
      : undefined;

    logger.debug({ toolCount: tools?.length ?? 0, model: recipe.agent.model }, 'Executing agent');
    logger.debug({ instructions: recipe.agent.instructions.slice(0, 200), payload }, 'Agent input');

    // Execute agent
    const result = await executeAgent({
      provider,
      model: recipe.agent.model,
      temperature: recipe.agent.temperature,
      system_prompt: recipe.agent.instructions,
      payload,
      max_tokens: recipe.agent.max_tokens,
      tools,
      onToolCall,
    });

    logger.debug({ output: result.output, toolsCalled: result.tools_called, duration: result.duration_ms }, 'Agent result');

    // Update execution with success
    updateExecution(db, exec.id, {
      status: 'success',
      agent_output: result.output,
      tools_called: JSON.stringify(result.tools_called),
      duration_ms: result.duration_ms,
    });

    logger.info({ slug, recipeId, executionId: exec.id, duration: result.duration_ms }, 'Recipe processed');
    return result.output;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    updateExecution(db, exec.id, {
      status: 'error',
      error: errorMsg,
    });

    logger.error({ slug, recipeId, executionId: exec.id, err }, 'Recipe processing failed');
    return `Error: ${errorMsg}`;
  } finally {
    if (mcpPool) {
      await mcpPool.closeAll();
    }
  }
}
