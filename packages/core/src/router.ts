import { createLogger } from './logger.js';
import type Database from 'better-sqlite3';
import { createExecution, updateExecution, insertTrace, storeMemory, getMemory } from './db.js';
import { executeAgent } from './agent.js';
import { createProvider } from './providers/index.js';
import { McpPool } from './mcp.js';
import { HookQueue } from './queue.js';
import type { AppConfig, RecipeConfig } from './types.js';
import type { Message } from './providers/base.js';

const logger = createLogger('hooklaw:router');
const MAX_CHAIN_DEPTH = 5;

export interface RouterDeps {
  config: AppConfig;
  db: Database.Database;
  queue: HookQueue;
}

/**
 * Find all recipes that listen on a given webhook slug.
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

/**
 * Evaluate if a recipe's routing condition matches the payload.
 * Uses a lightweight LLM call with temperature 0.
 */
async function evaluateCondition(
  condition: string,
  payload: unknown,
  providerName: string,
  providerConfig: { api_key?: string; base_url?: string },
  model: string
): Promise<{ match: boolean; reason: string }> {
  try {
    const provider = createProvider(providerName, providerConfig);
    const result = await provider.chat(
      [
        {
          role: 'system',
          content: `You are a routing evaluator. Given a condition and a webhook payload, determine if the condition is met.
Respond with ONLY a JSON object: {"match": true/false, "reason": "brief explanation"}`,
        },
        {
          role: 'user',
          content: `Condition: ${condition}\n\nPayload:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
      { model, temperature: 0, max_tokens: 150 }
    );
    const parsed = JSON.parse(result.content);
    return { match: Boolean(parsed.match), reason: String(parsed.reason ?? '') };
  } catch (err) {
    logger.warn({ err, condition }, 'Routing condition evaluation failed, allowing recipe');
    return { match: true, reason: 'evaluation failed, defaulting to match' };
  }
}

export async function processWebhook(
  slug: string,
  payload: unknown,
  deps: RouterDeps
): Promise<string | void> {
  const allRecipes = getRecipesForSlug(deps.config, slug);
  if (allRecipes.length === 0) {
    logger.warn({ slug }, 'No recipes found for webhook slug');
    return;
  }

  // Conditional routing: filter recipes based on routing conditions
  const recipes: Array<{ id: string; recipe: RecipeConfig; routingReason?: string }> = [];
  for (const { id, recipe } of allRecipes) {
    if (recipe.routing?.condition) {
      const providerConfig = deps.config.providers[recipe.agent.provider] ?? {};
      const { match, reason } = await evaluateCondition(
        recipe.routing.condition, payload, recipe.agent.provider, providerConfig, recipe.agent.model
      );
      if (match) {
        recipes.push({ id, recipe, routingReason: reason });
        logger.info({ recipeId: id, reason }, 'Recipe matched routing condition');
      } else {
        logger.info({ recipeId: id, reason }, 'Recipe skipped by routing condition');
      }
    } else {
      recipes.push({ id, recipe });
    }
  }

  if (recipes.length === 0) {
    logger.info({ slug }, 'No recipes matched routing conditions');
    return;
  }

  // Sync mode: run the first sync recipe and return its output
  const syncRecipe = recipes.find((r) => r.recipe.mode === 'sync');
  if (syncRecipe) {
    return await executeRecipe(slug, syncRecipe.id, syncRecipe.recipe, payload, deps, {
      routingReason: syncRecipe.routingReason,
    });
  }

  // All async: enqueue each recipe
  for (const { id, recipe, routingReason } of recipes) {
    deps.queue.enqueue(`${slug}:${id}`, async () => {
      await executeRecipe(slug, id, recipe, payload, deps, { routingReason });
    });
  }
}

interface ExecuteOpts {
  parentExecutionId?: string;
  chainDepth?: number;
  routingReason?: string;
}

async function executeRecipe(
  slug: string,
  recipeId: string,
  recipe: RecipeConfig,
  payload: unknown,
  deps: RouterDeps,
  opts: ExecuteOpts = {}
): Promise<string> {
  const { db, config } = deps;
  const chainDepth = opts.chainDepth ?? 0;

  // Create execution record
  const exec = createExecution(db, {
    hook_id: slug,
    recipe_id: recipeId,
    payload: JSON.stringify(payload),
    status: 'pending',
    parent_execution_id: opts.parentExecutionId,
    chain_depth: chainDepth,
    routing_reason: opts.routingReason,
  });

  logger.info({ slug, recipeId, executionId: exec.id, chainDepth }, 'Processing recipe');

  updateExecution(db, exec.id, { status: 'running' });

  let mcpPool: McpPool | undefined;

  try {
    // Get provider
    const providerName = recipe.agent.provider;
    const providerConfig = config.providers[providerName] ?? {};
    const provider = createProvider(providerName, providerConfig);

    // Connect MCP servers
    if (recipe.tools.length > 0) {
      mcpPool = new McpPool();
      await mcpPool.connect(config.mcp_servers, recipe.tools);
    }

    const tools = mcpPool?.getAllTools();
    const onToolCall = mcpPool
      ? (name: string, args: Record<string, unknown>) => {
          logger.debug({ tool: name, args }, 'Calling MCP tool');
          return mcpPool!.callTool(name, args);
        }
      : undefined;

    // Load agent memory if enabled
    let priorMessages: Message[] | undefined;
    if (recipe.agent.memory?.enabled) {
      const memoryEntries = getMemory(db, recipeId, recipe.agent.memory.window_size);
      if (memoryEntries.length > 0) {
        priorMessages = memoryEntries.map(m => ({ role: m.role as Message['role'], content: m.content }));
        logger.debug({ recipeId, memorySize: memoryEntries.length }, 'Loaded agent memory');
      }
    }

    // Execute agent with tracing
    const result = await executeAgent({
      provider,
      model: recipe.agent.model,
      temperature: recipe.agent.temperature,
      system_prompt: recipe.agent.instructions,
      payload,
      max_tokens: recipe.agent.max_tokens,
      tools,
      onToolCall,
      executionId: exec.id,
      priorMessages,
    });

    // Store traces
    for (const trace of result.traces) {
      insertTrace(db, trace);
    }

    // Store memory if enabled
    if (recipe.agent.memory?.enabled) {
      storeMemory(db, { recipe_id: recipeId, execution_id: exec.id, role: 'user', content: JSON.stringify(payload) });
      storeMemory(db, { recipe_id: recipeId, execution_id: exec.id, role: 'assistant', content: result.output });
    }

    // Human-in-the-loop: if approval required, pause here
    if (recipe.approval?.enabled) {
      updateExecution(db, exec.id, {
        status: 'pending_approval',
        approval_status: 'pending',
        agent_output: result.output,
        tools_called: JSON.stringify(result.tools_called),
        duration_ms: result.duration_ms,
      });
      logger.info({ slug, recipeId, executionId: exec.id }, 'Execution pending approval');
      return result.output;
    }

    // Update execution with success
    updateExecution(db, exec.id, {
      status: 'success',
      agent_output: result.output,
      tools_called: JSON.stringify(result.tools_called),
      duration_ms: result.duration_ms,
    });

    logger.info({ slug, recipeId, executionId: exec.id, duration: result.duration_ms }, 'Recipe processed');

    // Multi-agent chains: trigger on_success recipes
    if (recipe.chain?.on_success?.length && chainDepth < (recipe.chain.max_depth ?? MAX_CHAIN_DEPTH)) {
      for (const chainedId of recipe.chain.on_success) {
        const chainedRecipe = config.recipes[chainedId];
        if (chainedRecipe?.enabled) {
          logger.info({ from: recipeId, to: chainedId, depth: chainDepth + 1 }, 'Triggering chained recipe');
          deps.queue.enqueue(`chain:${exec.id}:${chainedId}`, async () => {
            await executeRecipe(
              chainedRecipe.slug, chainedId, chainedRecipe,
              { _chain: true, parent_output: result.output, original_payload: payload },
              deps,
              { parentExecutionId: exec.id, chainDepth: chainDepth + 1 }
            );
          });
        }
      }
    }

    return result.output;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    updateExecution(db, exec.id, {
      status: 'error',
      error: errorMsg,
    });

    logger.error({ slug, recipeId, executionId: exec.id, err }, 'Recipe processing failed');

    // Multi-agent chains: trigger on_error recipes
    if (recipe.chain?.on_error?.length && chainDepth < (recipe.chain.max_depth ?? MAX_CHAIN_DEPTH)) {
      for (const chainedId of recipe.chain.on_error) {
        const chainedRecipe = config.recipes[chainedId];
        if (chainedRecipe?.enabled) {
          logger.info({ from: recipeId, to: chainedId, depth: chainDepth + 1 }, 'Triggering error chain recipe');
          deps.queue.enqueue(`chain:${exec.id}:${chainedId}`, async () => {
            await executeRecipe(
              chainedRecipe.slug, chainedId, chainedRecipe,
              { _chain: true, error: errorMsg, original_payload: payload },
              deps,
              { parentExecutionId: exec.id, chainDepth: chainDepth + 1 }
            );
          });
        }
      }
    }

    return `Error: ${errorMsg}`;
  } finally {
    if (mcpPool) {
      await mcpPool.closeAll();
    }
  }
}
