import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureException,
}));

import {
  CompositionDispatcher,
  type CompositionWorkerOutMessage,
  type WorkerInitReport,
} from "../composition-dispatcher";

/**
 * Pool start, driven through a fake Worker.
 *
 * Production 2026-10-20/21: every worker on /shop reported `Worker N init
 * timeout` within ~100 ms, as six or seven separate exceptions with no
 * timings. A worker that failed init posted an error the dispatcher ignored,
 * so a fast failure looked exactly like a 15 s hang. These tests pin the
 * replacement: failures settle at once, the pool opens on the first ready
 * worker, a silent pool still falls back after the timeout, and one report
 * per pool carries each worker's timings.
 */

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<CompositionWorkerOutMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(data: CompositionWorkerOutMessage): void {
    this.onmessage?.({ data } as MessageEvent<CompositionWorkerOutMessage>);
  }
  get gotInit(): boolean {
    return this.posted.some((m) => (m as { type?: string }).type === "init");
  }
}

const textRenderer = {
  preloadGlyphImages: async () => {},
  getGlyphCache: () => new Map(),
};

function makeDispatcher(): CompositionDispatcher {
  return new CompositionDispatcher({} as never, textRenderer as never);
}

/** Let the pool's async prep run so every worker has its init message. */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

function lastReports(): WorkerInitReport[] {
  const props = captureException.mock.calls.at(-1)?.[1] as {
    worker_init_reports: WorkerInitReport[];
  };
  return props.worker_init_reports;
}

describe("composition worker pool start", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.instances = [];
    captureException.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens the pool on the first ready worker instead of waiting for all", async () => {
    const d = makeDispatcher();
    let done = false;
    void d.ensureInitialized().then(() => (done = true));
    await flush();

    const [first] = FakeWorker.instances;
    expect(FakeWorker.instances.length).toBeGreaterThanOrEqual(2);
    expect(FakeWorker.instances.every((w) => w.gotInit)).toBe(true);
    first!.emit({ type: "booted" });
    first!.emit({ type: "init-done" });
    await flush();

    expect(done).toBe(true);
    expect((d as any).pickWorker()?.worker).toBe(first);
  });

  it("settles an init error at once and reports its stage and message", async () => {
    const d = makeDispatcher();
    void d.ensureInitialized();
    await flush();

    const [broken, ...rest] = FakeWorker.instances;
    broken!.emit({ type: "booted" });
    broken!.emit({ type: "init-stage", stage: "imports", ms: 40 });
    broken!.emit({ type: "init-error", stage: "renderer", message: "chunk 404" });
    for (const w of rest) w.emit({ type: "init-done" });
    await flush();

    expect(broken!.terminated).toBe(true);
    expect(captureException).toHaveBeenCalledTimes(1);
    const props = captureException.mock.calls[0]![1] as Record<string, unknown>;
    expect(props.worker_errors).toBe(1);
    expect(props.worker_timeouts).toBe(0);
    expect(props.worker_first_error).toBe("chunk 404");
    const report = lastReports().find((r) => r.worker === 0)!;
    expect(report).toMatchObject({
      outcome: "error",
      stage: "renderer",
      stages: { imports: 40 },
    });
    expect(report.waitMs).toBeLessThan(1000);
  });

  it("treats a worker script error before init-done as a failed start", async () => {
    const d = makeDispatcher();
    void d.ensureInitialized();
    await flush();

    const [broken, ...rest] = FakeWorker.instances;
    broken!.onerror?.({ message: "" } as ErrorEvent);
    for (const w of rest) w.emit({ type: "init-done" });
    await flush();

    expect(lastReports()[0]).toMatchObject({
      outcome: "error",
      stage: null,
      bootMs: null,
      error: "worker script failed to load",
    });
  });

  it("falls back after the timeout when no worker answers, with ONE report", async () => {
    const d = makeDispatcher();
    let done = false;
    void d.ensureInitialized().then(() => (done = true));
    await flush();

    const [slow, silent] = FakeWorker.instances;
    slow!.emit({ type: "booted" });
    slow!.emit({ type: "init-stage", stage: "imports", ms: 9000 });
    await vi.advanceTimersByTimeAsync(14_000);
    expect(done).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(done).toBe(true);
    expect(captureException).toHaveBeenCalledTimes(1);
    const reports = lastReports();
    expect(reports.every((r) => r.outcome === "timeout")).toBe(true);
    expect(reports[0]).toMatchObject({ stage: "renderer", waitMs: 15_000 });
    expect(reports[1]).toMatchObject({ stage: null, bootMs: null });
    expect(silent).toBeDefined();

    await expect(
      d.composeFrontBitmap({ steps: [] } as never, {} as never)
    ).rejects.toThrow(/no composition worker is ready/i);
  });

  it("lets a worker that finishes after its timeout join the pool", async () => {
    const d = makeDispatcher();
    void d.ensureInitialized();
    await flush();
    await vi.advanceTimersByTimeAsync(15_000);
    expect((d as any).pickWorker()).toBeNull();

    const [late] = FakeWorker.instances;
    late!.emit({ type: "init-done" });
    expect((d as any).pickWorker()?.worker).toBe(late);
  });

  it("does not report timeouts for a pool terminated while it was starting", async () => {
    const d = makeDispatcher();
    void d.ensureInitialized();
    await flush();
    d.terminate();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(captureException).not.toHaveBeenCalled();
    expect((d as any).initialized).toBe(false);
    expect(FakeWorker.instances.every((w) => w.terminated)).toBe(true);
  });

  it("re-seeding with another deck tears down a pool that is still starting", async () => {
    const d = makeDispatcher();
    d.setPendingSignature("shop-covers");
    void d.ensureInitialized();
    await flush();
    const firstPool = [...FakeWorker.instances];

    // /shop/starter-pack asks for its own cover set before /shop's pool is up.
    const finish = d.beginSeed("starter-pack-covers");
    finish();
    expect(firstPool.every((w) => w.terminated)).toBe(true);

    // A late answer from the old pool must not mark anything seeded.
    firstPool[0]!.emit({ type: "init-done" });
    await flush();
    expect(d.getSeededSignature()).toBeNull();

    void d.ensureInitialized();
    await flush();
    const secondPool = FakeWorker.instances.slice(firstPool.length);
    secondPool[0]!.emit({ type: "init-done" });
    await flush();
    expect(d.getSeededSignature()).toBe("starter-pack-covers");
  });
});
