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

// ── App Config (root) ────────────────────────────────────────

export const AppConfigSchema = z.object({
  server: ServerConfigSchema.default({}),
  providers: z.record(ProviderConfigSchema).default({}),
  mcp_servers: z.record(McpServerConfigSchema).default({}),
  recipes: z.record(RecipeConfigSchema).default({}),
  logs: LogsConfigSchema.default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

// ── Execution (DB record) ────────────────────────────────────

export type ExecutionStatus = 'pending' | 'running' | 'success' | 'error';

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
}
