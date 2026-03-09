import { createLogger } from './logger.js';

const logger = createLogger('hooklaw:queue');

type Task = () => Promise<void>;

interface QueueState {
  tasks: Task[];
  processing: boolean;
}

export class HookQueue {
  private queues = new Map<string, QueueState>();
  private drainResolvers: Array<() => void> = [];

  enqueue(slug: string, task: Task): void {
    let state = this.queues.get(slug);
    if (!state) {
      state = { tasks: [], processing: false };
      this.queues.set(slug, state);
    }
    state.tasks.push(task);
    this.process(slug, state);
  }

  getQueueSize(slug: string): number {
    const state = this.queues.get(slug);
    return state ? state.tasks.length + (state.processing ? 1 : 0) : 0;
  }

  async drain(): Promise<void> {
    if (this.isIdle()) return;
    return new Promise<void>((resolve) => {
      this.drainResolvers.push(resolve);
    });
  }

  private isIdle(): boolean {
    for (const state of this.queues.values()) {
      if (state.processing || state.tasks.length > 0) return false;
    }
    return true;
  }

  private async process(slug: string, state: QueueState): Promise<void> {
    if (state.processing) return;
    state.processing = true;

    while (state.tasks.length > 0) {
      const task = state.tasks.shift()!;
      try {
        await task();
      } catch (err) {
        logger.error({ slug, err }, 'Queue task failed');
      }
    }

    state.processing = false;
    this.checkDrain();
  }

  private checkDrain(): void {
    if (this.isIdle() && this.drainResolvers.length > 0) {
      for (const resolve of this.drainResolvers) resolve();
      this.drainResolvers = [];
    }
  }
}
