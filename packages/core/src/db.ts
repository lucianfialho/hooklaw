import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Execution, ExecutionStatus } from './types.js';

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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_executions_hook_id ON executions(hook_id);
    CREATE INDEX IF NOT EXISTS idx_executions_recipe_id ON executions(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at);
  `);

  return db;
}

// ── Executions CRUD ──────────────────────────────────────────

export function createExecution(
  db: Database.Database,
  data: { hook_id: string; recipe_id?: string; payload: string; status?: ExecutionStatus }
): Execution {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO executions (id, hook_id, recipe_id, status, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, data.hook_id, data.recipe_id ?? null, data.status ?? 'pending', data.payload, now);

  return db.prepare('SELECT * FROM executions WHERE id = ?').get(id) as Execution;
}

export function updateExecution(
  db: Database.Database,
  id: string,
  data: Partial<{ status: ExecutionStatus; agent_output: string; tools_called: string; duration_ms: number; error: string }>
): boolean {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.agent_output !== undefined) { fields.push('agent_output = ?'); values.push(data.agent_output); }
  if (data.tools_called !== undefined) { fields.push('tools_called = ?'); values.push(data.tools_called); }
  if (data.duration_ms !== undefined) { fields.push('duration_ms = ?'); values.push(data.duration_ms); }
  if (data.error !== undefined) { fields.push('error = ?'); values.push(data.error); }

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

export function cleanOldExecutions(db: Database.Database, retentionDays: number): number {
  const result = db.prepare(
    `DELETE FROM executions WHERE created_at < datetime('now', '-' || ? || ' days')`
  ).run(retentionDays);
  return result.changes;
}
