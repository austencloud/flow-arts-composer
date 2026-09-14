/**
 * ThumbnailRenderQueue
 *
 * Concurrency limiter for thumbnail rendering.
 * Prevents the "thundering herd" problem where many thumbnails try to render
 * simultaneously, exhaust resources, and create cascading delays.
 *
 * Features:
 * - Limits concurrent renders (default: 3)
 * - Queues excess requests
 * - Deduplicates identical requests
 * - Supports cancellation
 */

export interface QueueStats {
  /** Number of tasks waiting in queue */
  queued: number;

  /** Number of tasks currently executing */
  active: number;

  /** IDs of currently executing tasks */
  activeIds: string[];
}

export interface ThumbnailQueueOptions {
  priority?: number;
  consumerSignal?: AbortSignal;
  /** Run only after active thumbnails drain, and block later work until done. */
  exclusive?: boolean;
}

interface QueuedTask<T> {
  id: string;
  /**
   * Per-task identity. IDs deduplicate concurrent requests for one thumbnail,
   * but they cannot own bookkeeping: a cancelled task keeps running until its
   * work observes the abort, and a returning card may already have started a
   * fresh task under the same ID by then. Slot, controller and consumer
   * accounting are therefore keyed by token so the older task's cleanup can
   * only ever remove its own state.
   */
  token: number;
  execute: (signal: AbortSignal, reportActivity: () => void) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  priority: number;
  exclusive: boolean;
}

interface ActiveTask {
  id: string;
  controller: AbortController;
}

interface PendingTask {
  token: number;
  promise: Promise<unknown>;
}

// A QR-bearing thumbnail also warms its canonical scan cells before composing.
// Three active jobs keep that network and raster work below the timeout's
// contention cliff while queued cards remain priority ordered.
const DEFAULT_MAX_CONCURRENT = 3;

// If a render stops making progress (stalled fetch, wedged worker), reclaim the
// slot after this much inactivity. A phone may need longer overall for a real
// render, so productive work refreshes the deadline instead of being aborted.
const RENDER_TIMEOUT_MS = 15_000;

export class ThumbnailRenderTimeoutError extends Error {
  readonly code = "THUMBNAIL_RENDER_TIMEOUT";

  constructor(readonly timeoutMs: number) {
    super(`Thumbnail render exceeded ${timeoutMs}ms`);
    this.name = "ThumbnailRenderTimeoutError";
  }
}

function normalizeQueueError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "object" && error !== null) {
    const errorLike = error as { message?: unknown; name?: unknown };
    const normalized = new Error(
      typeof errorLike.message === "string" ? errorLike.message : String(error)
    );
    if (typeof errorLike.name === "string") normalized.name = errorLike.name;
    return normalized;
  }
  return new Error(String(error));
}

function cancellationError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason;
  return new DOMException(
    typeof signal?.reason === "string" ? signal.reason : "Cancelled",
    "AbortError"
  );
}

export class ThumbnailRenderQueue {
  private queue: QueuedTask<unknown>[] = [];
  private activeTasks = new Map<number, ActiveTask>();
  private pendingTasks = new Map<string, PendingTask>();
  private consumerCounts = new Map<number, number>();
  private nextToken = 0;
  private maxConcurrent = DEFAULT_MAX_CONCURRENT;
  private activeExclusive = false;

  enqueue<T>(
    id: string,
    execute: (signal: AbortSignal, reportActivity: () => void) => Promise<T>,
    options: ThumbnailQueueOptions = {}
  ): Promise<T> {
    const { priority = Infinity, consumerSignal, exclusive = false } = options;
    if (consumerSignal?.aborted) {
      return Promise.reject(cancellationError(consumerSignal));
    }

    const pending = this.pendingTasks.get(id);
    let corePromise = pending?.promise as Promise<T> | undefined;
    let token = pending?.token ?? 0;
    if (!corePromise) {
      token = ++this.nextToken;
      const taskToken = token;
      corePromise = new Promise<T>((resolve, reject) => {
        const task: QueuedTask<T> = {
          id,
          token: taskToken,
          execute,
          resolve,
          reject,
          priority,
          exclusive,
        };

        // Insert in priority order (lower priority value = higher priority = front of queue)
        const insertIndex = this.queue.findIndex((t) => t.priority > priority);
        if (insertIndex === -1) {
          this.queue.push(task as QueuedTask<unknown>);
        } else {
          this.queue.splice(insertIndex, 0, task as QueuedTask<unknown>);
        }

        this.processQueue();
      });

      this.pendingTasks.set(id, { token: taskToken, promise: corePromise });

      // Clean up on either outcome without creating an ignored rejected promise.
      // finally() returns a child promise that preserves the original rejection;
      // callers handled `corePromise`, but that unobserved child surfaced globally.
      const forgetPending = () => this.forgetPendingTask(id, taskToken);
      void corePromise.then(forgetPending, forgetPending);
    }

    return this.attachConsumer(token, corePromise, consumerSignal);
  }

  cancel(id: string): void {
    // Cancel every task still registered under this ID: the queued one, plus an
    // active task that was already released but has not observed its abort yet.
    for (const token of this.tokensFor(id)) {
      this.consumerCounts.delete(token);
      this.cancelTask(token);
    }
  }

  cancelAll(): void {
    this.consumerCounts.clear();
    const queuedTasks = this.queue.splice(0);
    for (const task of queuedTasks) {
      this.forgetPendingTask(task.id, task.token);
      task.reject(new DOMException("Cancelled", "AbortError"));
    }

    // Abort all actively running renders so they bail out between beats
    for (const [token, active] of this.activeTasks) {
      this.forgetPendingTask(active.id, token);
      active.controller.abort();
    }
  }

  /** Tokens of every task currently registered under one thumbnail ID. */
  private tokensFor(id: string): number[] {
    const tokens = this.queue
      .filter((task) => task.id === id)
      .map((task) => task.token);
    for (const [token, active] of this.activeTasks) {
      if (active.id === id) tokens.push(token);
    }
    return tokens;
  }

  /** Drop the dedup entry only when it still belongs to this task. */
  private forgetPendingTask(id: string, token: number): void {
    if (this.pendingTasks.get(id)?.token === token) {
      this.pendingTasks.delete(id);
    }
  }

  private cancelTask(token: number): void {
    const index = this.queue.findIndex((task) => task.token === token);
    if (index !== -1) {
      const [task] = this.queue.splice(index, 1);
      if (task) {
        this.forgetPendingTask(task.id, task.token);
        task.reject(new DOMException("Cancelled", "AbortError"));
      }
      return;
    }

    const active = this.activeTasks.get(token);
    if (!active) return;

    // Release the ID before aborting. An active render cannot always observe the
    // abort immediately (the renderer awaits its document read first), and while
    // it lingers a card that scrolls back would otherwise deduplicate onto this
    // dying task and inherit its AbortError — or its inactivity deadline. The
    // task keeps its slot and its own bookkeeping until it settles; it simply
    // stops being the task a new request for this thumbnail joins.
    this.forgetPendingTask(active.id, token);
    active.controller.abort();
  }

  private attachConsumer<T>(
    token: number,
    corePromise: Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    this.consumerCounts.set(token, (this.consumerCounts.get(token) ?? 0) + 1);

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (cancelCoreIfLast: boolean): boolean => {
        if (settled) return false;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        this.releaseConsumer(token, cancelCoreIfLast);
        return true;
      };
      const onAbort = () => {
        if (finish(true)) reject(cancellationError(signal));
      };

      signal?.addEventListener("abort", onAbort, { once: true });
      corePromise.then(
        (value) => {
          if (finish(false)) resolve(value);
        },
        (error) => {
          if (finish(false)) reject(error);
        }
      );
    });
  }

  private releaseConsumer(token: number, cancelCoreIfLast: boolean): void {
    const count = this.consumerCounts.get(token);
    if (count === undefined) return;
    if (count > 1) {
      this.consumerCounts.set(token, count - 1);
      return;
    }

    this.consumerCounts.delete(token);
    if (cancelCoreIfLast) this.cancelTask(token);
  }

  getStats(): QueueStats {
    const activeIds = new Set<string>();
    for (const active of this.activeTasks.values()) {
      activeIds.add(active.id);
    }
    return {
      queued: this.queue.length,
      active: this.activeTasks.size,
      activeIds: Array.from(activeIds),
    };
  }

  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, max);
    // Process queue in case we increased capacity
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    // Don't exceed max concurrent
    if (this.activeTasks.size >= this.maxConcurrent || this.activeExclusive) {
      return;
    }

    // An exclusive task is a fairness barrier: let existing work drain, then
    // run it alone. Later ordinary thumbnails cannot leapfrog it and recreate
    // the QR warm-up contention this queue is meant to prevent.
    const nextTask = this.queue[0];
    if (nextTask?.exclusive && this.activeTasks.size > 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) {
      return;
    }

    this.activeExclusive = task.exclusive;

    const controller = new AbortController();
    this.activeTasks.set(task.token, { id: task.id, controller });

    // Fill the remaining capacity synchronously. This matters after an
    // exclusive task releases a backed-up queue: one completion should restore
    // the configured parallelism instead of leaving the queue at one-at-a-time.
    void this.processQueue();

    // Hold the timer id so progress can refresh the inactivity deadline and a
    // completed render cannot leave an orphaned rejection behind.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let deadlineClosed = false;
    try {
      let rejectTimeout: ((error: ThumbnailRenderTimeoutError) => void) | null =
        null;
      const timeout = new Promise<never>((_, reject) => {
        rejectTimeout = reject;
      });
      const reportActivity = (): void => {
        if (deadlineClosed) return;
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          // Settle the race as a typed deadline before aborting the work.
          // Abort listeners run synchronously and may reject `execute` with
          // AbortError; aborting first would mask the timeout that caused it.
          rejectTimeout?.(new ThumbnailRenderTimeoutError(RENDER_TIMEOUT_MS));
          controller.abort();
        }, RENDER_TIMEOUT_MS);
      };
      reportActivity();

      // Race the render against an inactivity timeout to reclaim a wedged slot.
      const result = await Promise.race([
        task.execute(controller.signal, reportActivity),
        timeout,
      ]);
      task.resolve(result);
    } catch (error) {
      task.reject(normalizeQueueError(error));
    } finally {
      deadlineClosed = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (task.exclusive) this.activeExclusive = false;
      // Token-keyed: a cancelled task that settles late cannot remove the slot
      // or the controller of the retry now running under the same ID.
      this.activeTasks.delete(task.token);

      // Process next item in queue
      this.processQueue();
    }
  }
}
