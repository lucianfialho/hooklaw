import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Execution, ExecutionStatus, AgentTrace, AgentMemoryEntry } from './types.js';

export function initDb(dbPath: string = 'hooklaw.db'): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      hook_id TEXT NOT NULL,
      recipe_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT NOT NULL DEFAULT '{}',
      agent_output TEXT,
      tools_called TEXT,
      duration_ms INTEGER,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      parent_execution_id TEXT,
      chain_depth INTEGER DEFAULT 0,
      approval_status TEXT,
      routing_reason TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_executions_hook_id ON executions(hook_id);
    CREATE INDEX IF NOT EXISTS idx_executions_recipe_id ON executions(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at);
    CREATE INDEX IF NOT EXISTS idx_executions_parent ON executions(parent_execution_id);

    -- Agent observability traces
    CREATE TABLE IF NOT EXISTS agent_traces (
      id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      event_type TEXT NOT NULL,
      step_number INTEGER,
      model_response TEXT,
      tool_name TEXT,
      tool_input TEXT,
      tool_output TEXT,
      error TEXT,
      tokens_used INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_agent_traces_execution ON agent_traces(execution_id);

    -- Agent memory (conversation context across executions)
    CREATE TABLE IF NOT EXISTS agent_memory (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL,
      execution_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_memory_recipe ON agent_memory(recipe_id, created_at);
  `);

  // Migrate existing DBs: add new columns if missing
  const cols = db.prepare("PRAGMA table_info(executions)").all() as Array<{ name: string }>;
  const colNames = new Set(cols.map(c => c.name));
  if (!colNames.has('parent_execution_id')) {
    db.exec('ALTER TABLE executions ADD COLUMN parent_execution_id TEXT');
    db.exec('ALTER TABLE executions ADD COLUMN chain_depth INTEGER DEFAULT 0');
    db.exec('ALTER TABLE executions ADD COLUMN approval_status TEXT');
    db.exec('ALTER TABLE executions ADD COLUMN routing_reason TEXT');
  }

  return db;
}

// ── Executions CRUD ──────────────────────────────────────────

export function createExecution(
  db: Database.Database,
  data: {
    hook_id: string;
    recipe_id?: string;
    payload: string;
    status?: ExecutionStatus;
    parent_execution_id?: string;
    chain_depth?: number;
    routing_reason?: string;
  }
): Execution {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO executions (id, hook_id, recipe_id, status, payload, created_at, parent_execution_id, chain_depth, routing_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, data.hook_id, data.recipe_id ?? null, data.status ?? 'pending', data.payload, now,
    data.parent_execution_id ?? null, data.chain_depth ?? 0, data.routing_reason ?? null
  );

  return db.prepare('SELECT * FROM executions WHERE id = ?').get(id) as Execution;
}

export function updateExecution(
  db: Database.Database,
  id: string,
  data: Partial<{ status: ExecutionStatus; agent_output: string; tools_called: string; duration_ms: number; error: string; approval_status: string }>
): boolean {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.agent_output !== undefined) { fields.push('agent_output = ?'); values.push(data.agent_output); }
  if (data.tools_called !== undefined) { fields.push('tools_called = ?'); values.push(data.tools_called); }
  if (data.duration_ms !== undefined) { fields.push('duration_ms = ?'); values.push(data.duration_ms); }
  if (data.error !== undefined) { fields.push('error = ?'); values.push(data.error); }
  if (data.approval_status !== undefined) { fields.push('approval_status = ?'); values.push(data.approval_status); }

  if (fields.length === 0) return false;

  values.push(id);
  const result = db.prepare(`UPDATE executions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return result.changes > 0;
}

export function getExecutionsByHook(
  db: Database.Database,
  hookId: string,
  opts: { limit?: number; offset?: number } = {}
): Execution[] {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  return db.prepare(
    'SELECT * FROM executions WHERE hook_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(hookId, limit, offset) as Execution[];
}

export function getExecutionsByRecipe(
  db: Database.Database,
  recipeId: string,
  opts: { limit?: number; offset?: number } = {}
): Execution[] {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  return db.prepare(
    'SELECT * FROM executions WHERE recipe_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(recipeId, limit, offset) as Execution[];
}

export function getAllExecutions(
  db: Database.Database,
  opts: { limit?: number; offset?: number; status?: string; slug?: string; recipeId?: string } = {}
): { executions: Execution[]; total: number } {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (opts.status) { conditions.push('status = ?'); values.push(opts.status); }
  if (opts.slug) { conditions.push('hook_id = ?'); values.push(opts.slug); }
  if (opts.recipeId) { conditions.push('recipe_id = ?'); values.push(opts.recipeId); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) as count FROM executions ${where}`).get(...values) as { count: number }).count;
  const executions = db.prepare(
    `SELECT * FROM executions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...values, limit, offset) as Execution[];

  return { executions, total };
}

export function getExecutionStats(db: Database.Database): { total: number; success: number; error: number; running: number; pending: number } {
  const rows = db.prepare(
    `SELECT status, COUNT(*) as count FROM executions GROUP BY status`
  ).all() as Array<{ status: string; count: number }>;

  const stats = { total: 0, success: 0, error: 0, running: 0, pending: 0 };
  for (const row of rows) {
    stats.total += row.count;
    if (row.status in stats) {
      (stats as Record<string, number>)[row.status] = row.count;
    }
  }
  return stats;
}

export function cleanOldExecutions(db: Database.Database, retentionDays: number): number {
  const result = db.prepare(
    `DELETE FROM executions WHERE created_at < datetime('now', '-' || ? || ' days')`
  ).run(retentionDays);
  return result.changes;
}

// ── Agent Traces (observability) ─────────────────────────────

export function insertTrace(db: Database.Database, trace: AgentTrace): void {
  db.prepare(
    `INSERT INTO agent_traces (id, execution_id, timestamp, event_type, step_number, model_response, tool_name, tool_input, tool_output, error, tokens_used)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    trace.id, trace.execution_id, trace.timestamp, trace.event_type, trace.step_number,
    trace.model_response ?? null, trace.tool_name ?? null, trace.tool_input ?? null,
    trace.tool_output ?? null, trace.error ?? null, trace.tokens_used ?? null
  );
}

export function getTracesByExecution(db: Database.Database, executionId: string): AgentTrace[] {
  return db.prepare(
    'SELECT * FROM agent_traces WHERE execution_id = ? ORDER BY timestamp ASC, step_number ASC'
  ).all(executionId) as AgentTrace[];
}

// ── Agent Memory ─────────────────────────────────────────────

export function storeMemory(db: Database.Database, data: { recipe_id: string; execution_id: string; role: string; content: string }): void {
  db.prepare(
    `INSERT INTO agent_memory (id, recipe_id, execution_id, role, content) VALUES (?, ?, ?, ?, ?)`
  ).run(randomUUID(), data.recipe_id, data.execution_id, data.role, data.content);
}

export function getMemory(db: Database.Database, recipeId: string, limit = 20): AgentMemoryEntry[] {
  return db.prepare(
    'SELECT * FROM agent_memory WHERE recipe_id = ? ORDER BY created_at ASC LIMIT ?'
  ).all(recipeId, limit) as AgentMemoryEntry[];
}

export function clearMemory(db: Database.Database, recipeId: string): number {
  return db.prepare('DELETE FROM agent_memory WHERE recipe_id = ?').run(recipeId).changes;
}

export function cleanOldMemory(db: Database.Database, ttlHours: number): number {
  return db.prepare(
    `DELETE FROM agent_memory WHERE created_at < datetime('now', '-' || ? || ' hours')`
  ).run(ttlHours).changes;
}

// ── Chain queries ────────────────────────────────────────────

export function getChildExecutions(db: Database.Database, parentId: string): Execution[] {
  return db.prepare(
    'SELECT * FROM executions WHERE parent_execution_id = ? ORDER BY created_at ASC'
  ).all(parentId) as Execution[];
}

// ── Approval queries ─────────────────────────────────────────

export function getPendingApprovals(db: Database.Database): Execution[] {
  return db.prepare(
    "SELECT * FROM executions WHERE status = 'pending_approval' ORDER BY created_at DESC"
  ).all() as Execution[];
}
