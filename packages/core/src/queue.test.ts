import { describe, it, expect } from 'vitest';
import { HookQueue } from './queue.js';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('HookQueue', () => {
  it('executes tasks sequentially for same slug', async () => {
    const queue = new HookQueue();
    const order: number[] = [];

    queue.enqueue('hook-a', async () => { await delay(20); order.push(1); });
    queue.enqueue('hook-a', async () => { await delay(10); order.push(2); });
    queue.enqueue('hook-a', async () => { order.push(3); });

    await queue.drain();
    expect(order).toEqual([1, 2, 3]);
  });

  it('executes tasks in parallel across different slugs', async () => {
    const queue = new HookQueue();
    const order: string[] = [];

    queue.enqueue('slow', async () => { await delay(30); order.push('slow'); });
    queue.enqueue('fast', async () => { await delay(5); order.push('fast'); });

    await queue.drain();
    expect(order[0]).toBe('fast'); // fast finishes first
    expect(order).toContain('slow');
  });

  it('continues after a task error', async () => {
    const queue = new HookQueue();
    const results: string[] = [];

    queue.enqueue('hook', async () => { throw new Error('boom'); });
    queue.enqueue('hook', async () => { results.push('ok'); });

    await queue.drain();
    expect(results).toEqual(['ok']);
  });

  it('drain resolves immediately when idle', async () => {
    const queue = new HookQueue();
    await queue.drain(); // should not hang
  });

  it('reports queue size', async () => {
    const queue = new HookQueue();
    expect(queue.getQueueSize('x')).toBe(0);

    let resolve!: () => void;
    const blocker = new Promise<void>((r) => { resolve = r; });

    queue.enqueue('x', async () => { await blocker; });
    queue.enqueue('x', async () => {});

    // First task is processing, second is queued
    await delay(5);
    expect(queue.getQueueSize('x')).toBe(2);

    resolve();
    await queue.drain();
    expect(queue.getQueueSize('x')).toBe(0);
  });
});
