import { describe, it, expect, beforeEach } from 'vitest';
import {
  initDb, createExecution, updateExecution, getExecutionsByHook,
  getExecutionsByRecipe, cleanOldExecutions,
} from './db.js';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = initDb(':memory:');
});

describe('executions CRUD', () => {
  it('creates and retrieves execution', () => {
    const exec = createExecution(db, { hook_id: 'stripe-payment', payload: '{"event":"push"}' });
    expect(exec.hook_id).toBe('stripe-payment');
    expect(exec.status).toBe('pending');
    expect(exec.payload).toBe('{"event":"push"}');
    expect(exec.recipe_id).toBeNull();
  });

  it('creates execution with recipe_id', () => {
    const exec = createExecution(db, {
      hook_id: 'stripe-payment',
      recipe_id: 'stripe-to-invoice',
      payload: '{}',
    });
    expect(exec.recipe_id).toBe('stripe-to-invoice');
  });

  it('updates execution status and output', () => {
    const exec = createExecution(db, { hook_id: 'hook-a', payload: '{}' });
    updateExecution(db, exec.id, {
      status: 'success',
      agent_output: 'Done!',
      tools_called: '["stripe.create_invoice"]',
      duration_ms: 1500,
    });

    const execs = getExecutionsByHook(db, 'hook-a');
    expect(execs).toHaveLength(1);
    expect(execs[0].status).toBe('success');
    expect(execs[0].agent_output).toBe('Done!');
    expect(execs[0].duration_ms).toBe(1500);
  });

  it('updates execution with error', () => {
    const exec = createExecution(db, { hook_id: 'hook-a', payload: '{}' });
    updateExecution(db, exec.id, { status: 'error', error: 'LLM timeout' });

    const execs = getExecutionsByHook(db, 'hook-a');
    expect(execs[0].status).toBe('error');
    expect(execs[0].error).toBe('LLM timeout');
  });

  it('respects limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      createExecution(db, { hook_id: 'hook-a', payload: `{"i":${i}}` });
    }
    const page1 = getExecutionsByHook(db, 'hook-a', { limit: 2, offset: 0 });
    expect(page1).toHaveLength(2);

    const page2 = getExecutionsByHook(db, 'hook-a', { limit: 2, offset: 2 });
    expect(page2).toHaveLength(2);
  });

  it('queries executions by recipe_id', () => {
    createExecution(db, { hook_id: 'stripe', recipe_id: 'recipe-a', payload: '{}' });
    createExecution(db, { hook_id: 'stripe', recipe_id: 'recipe-b', payload: '{}' });
    createExecution(db, { hook_id: 'stripe', recipe_id: 'recipe-a', payload: '{}' });

    const recipeA = getExecutionsByRecipe(db, 'recipe-a');
    expect(recipeA).toHaveLength(2);

    const recipeB = getExecutionsByRecipe(db, 'recipe-b');
    expect(recipeB).toHaveLength(1);
  });

  it('cleans old executions', () => {
    db.prepare(
      `INSERT INTO executions (id, hook_id, status, payload, created_at)
       VALUES (?, ?, 'success', '{}', datetime('now', '-60 days'))`
    ).run('old-exec', 'hook-a');

    createExecution(db, { hook_id: 'hook-a', payload: '{}' }); // recent

    const deleted = cleanOldExecutions(db, 30);
    expect(deleted).toBe(1);

    const remaining = getExecutionsByHook(db, 'hook-a');
    expect(remaining).toHaveLength(1);
  });

  it('handles executions with slug as hook_id', () => {
    createExecution(db, { hook_id: 'config-slug', payload: '{}' });
    createExecution(db, { hook_id: 'config-slug', payload: '{}' });
    const execs = getExecutionsByHook(db, 'config-slug');
    expect(execs).toHaveLength(2);
  });
});
