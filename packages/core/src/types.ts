import { z } from 'zod';

// ── MCP Server Config (shared, top-level) ───────────────────

export const McpServerConfigSchema = z.object({
  transport: z.enum(['stdio', 'sse']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().optional(),
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

// ── Agent Config ─────────────────────────────────────────────

export const AgentConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  instructions: z.string(),
  max_tokens: z.number().positive().optional(),
  memory: z.object({
    enabled: z.boolean().default(false),
    window_size: z.number().int().positive().default(20),
    ttl_hours: z.number().positive().default(168), // 7 days
  }).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ── Recipe Config ────────────────────────────────────────────

export const RecipeConfigSchema = z.object({
  description: z.string().default(''),
  enabled: z.boolean().default(true),
  slug: z.string(),
  mode: z.enum(['async', 'sync']).default('async'),
  agent: AgentConfigSchema,
  tools: z.array(z.string()).default([]),
  // Multi-agent chains
  chain: z.object({
    on_success: z.array(z.string()).default([]),
    on_error: z.array(z.string()).default([]),
    max_depth: z.number().int().min(1).max(10).default(3),
  }).optional(),
  // Human-in-the-loop approval
  approval: z.object({
    enabled: z.boolean().default(false),
    timeout_minutes: z.number().positive().default(60),
  }).optional(),
  // Conditional routing
  routing: z.object({
    condition: z.string().optional(), // e.g. "Only handle payment_intent.succeeded events"
  }).optional(),
});

export type RecipeConfig = z.infer<typeof RecipeConfigSchema>;

// ── Provider Config ──────────────────────────────────────────

export const ProviderConfigSchema = z.object({
  api_key: z.string().optional(),
  base_url: z.string().optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// ── Server Config ────────────────────────────────────────────

export const ServerConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  auth_token: z.string().optional(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

// ── Logs Config ──────────────────────────────────────────────

export const LogsConfigSchema = z.object({
  retention_days: z.number().int().positive().default(30),
});

export type LogsConfig = z.infer<typeof LogsConfigSchema>;

// ── Feed Config (RSS/Atom/JSON Feed source) ─────────────────

export const FeedSourceConfigSchema = z.object({
  url: z.string(),
  slug: z.string(),
  refresh: z.number().int().positive().default(300_000), // 5 min default
  skip_initial: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export type FeedSourceConfig = z.infer<typeof FeedSourceConfigSchema>;

// ── App Config (root) ────────────────────────────────────────

export const AppConfigSchema = z.object({
  server: ServerConfigSchema.default({}),
  providers: z.record(ProviderConfigSchema).default({}),
  mcp_servers: z.record(McpServerConfigSchema).default({}),
  recipes: z.record(RecipeConfigSchema).default({}),
  feeds: z.record(FeedSourceConfigSchema).default({}),
  logs: LogsConfigSchema.default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

// ── Execution (DB record) ────────────────────────────────────

export type ExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'pending_approval' | 'approved' | 'rejected';

export interface Execution {
  id: string;
  hook_id: string;
  recipe_id: string | null;
  status: ExecutionStatus;
  payload: string;
  agent_output: string | null;
  tools_called: string | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
  // Chain fields
  parent_execution_id: string | null;
  chain_depth: number;
  // Approval fields
  approval_status: string | null;
  // Routing fields
  routing_reason: string | null;
}

// ── Agent Trace (observability) ──────────────────────────────

export interface AgentTrace {
  id: string;
  execution_id: string;
  event_type: 'llm_call' | 'tool_call' | 'tool_result' | 'error';
  step_number: number;
  model_response?: string;
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  error?: string;
  tokens_used?: number;
  timestamp: string;
}

// ── Agent Memory ─────────────────────────────────────────────

export interface AgentMemoryEntry {
  id: string;
  recipe_id: string;
  execution_id: string;
  role: string;
  content: string;
  created_at: string;
}
