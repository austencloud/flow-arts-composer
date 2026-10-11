import { describe, expect, it, vi } from "vitest";
import { createScanCellWarmState } from "#lib/features/choreo-card/state/scan-cell-warm-state.svelte.js";
import type {
  CellWarmDeps,
  CellWarmProgress,
} from "#lib/features/library/services/warm-all-scan-cells.js";

function progress(overrides: Partial<CellWarmProgress> = {}): CellWarmProgress {
  return {
    done: 0,
    total: 0,
    failed: 0,
    failedCodes: [],
    finished: false,
    cancelled: false,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("scan cell warm state", () => {
  it("scopes a selected-card run to that shortcode and publishes progress", async () => {
    const run = deferred<CellWarmProgress>();
    let publish: (next: CellWarmProgress) => void = () => {};
    let deps: CellWarmDeps | undefined;
    const start = vi.fn((onProgress, nextDeps) => {
      publish = onProgress;
      deps = nextDeps;
      return { cancel: vi.fn(), promise: run.promise };
    });
    const state = createScanCellWarmState(start);

    state.startCode(" 0017 ");

    expect(state.running).toBe(true);
    expect(state.scope).toEqual({ kind: "code", code: "0017" });
    await expect(deps?.listCodes?.()).resolves.toEqual(["0017"]);

    publish(progress({ done: 1, total: 1, current: "VΛY" }));
    expect(state.progress?.current).toBe("VΛY");

    const final = progress({ done: 1, total: 1, finished: true });
    run.resolve(final);
    await vi.waitFor(() => expect(state.running).toBe(false));
    expect(state.progress).toEqual(final);
  });

  it("requests cancellation once while workers finish their current cards", () => {
    const cancel = vi.fn();
    const state = createScanCellWarmState(() => ({
      cancel,
      promise: new Promise<CellWarmProgress>(() => {}),
    }));

    state.startAll();
    state.cancel();
    state.cancel();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(state.cancellationRequested).toBe(true);
  });

  it("retries only the shortcode ids that failed", async () => {
    const firstRun = deferred<CellWarmProgress>();
    const retryRun = deferred<CellWarmProgress>();
    const depsSeen: Array<CellWarmDeps | undefined> = [];
    const start = vi.fn((_onProgress, deps) => {
      depsSeen.push(deps);
      const run = depsSeen.length === 1 ? firstRun : retryRun;
      return { cancel: vi.fn(), promise: run.promise };
    });
    const state = createScanCellWarmState(start);

    state.startAll();
    firstRun.resolve(
      progress({
        done: 3,
        total: 3,
        failed: 2,
        failedCodes: ["BAD1", "BAD2"],
        finished: true,
      })
    );
    await vi.waitFor(() => expect(state.running).toBe(false));

    state.retryFailed();

    expect(state.scope).toEqual({ kind: "failed", count: 2 });
    await expect(depsSeen[1]?.listCodes?.()).resolves.toEqual(["BAD1", "BAD2"]);
  });

  it("surfaces a list or run failure and leaves the control usable", async () => {
    const run = deferred<CellWarmProgress>();
    const state = createScanCellWarmState(() => ({
      cancel: vi.fn(),
      promise: run.promise,
    }));

    state.startAll();
    run.reject(new Error("Firestore unavailable"));

    await vi.waitFor(() => expect(state.running).toBe(false));
    expect(state.error).toBe("Firestore unavailable");
  });
});
