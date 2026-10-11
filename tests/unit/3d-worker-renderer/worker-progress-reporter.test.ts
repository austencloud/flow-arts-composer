import { describe, expect, it, vi } from "vitest";
import {
  WORKER_PROGRESS_MIN_INTERVAL_MS,
  createWorkerProgressReporter,
} from "#lib/shared/3d/worker-renderer/services/worker-progress-reporter.js";

describe("worker progress reporter", () => {
  it("always emits phase boundaries and clamps their fractions", () => {
    let now = 0;
    const emit = vi.fn();
    const report = createWorkerProgressReporter(emit, () => now);

    report("assets", -1);
    report("assets", 0.2);
    report("assets", 2);
    report("compile", 0.1);

    expect(emit.mock.calls.map(([sample]) => sample)).toEqual([
      { phase: "assets", fraction: 0 },
      { phase: "assets", fraction: 1 },
      { phase: "compile", fraction: 0.1 },
    ]);
  });

  it("limits intermediate samples to twenty updates per second", () => {
    let now = 0;
    const emit = vi.fn();
    const scheduled: Array<() => void> = [];
    const report = createWorkerProgressReporter(
      emit,
      () => now,
      (callback) => {
        scheduled.push(callback);
        return callback;
      },
      (callback) => {
        const index = scheduled.indexOf(callback as () => void);
        if (index >= 0) scheduled.splice(index, 1);
      }
    );

    report("prime", 0);
    for (let index = 1; index <= 49; index += 1) {
      now = index;
      report("prime", index / 100);
    }
    expect(emit).toHaveBeenCalledTimes(1);

    now = WORKER_PROGRESS_MIN_INTERVAL_MS;
    report("prime", 0.5);
    now += 1;
    report("prime", 1);

    expect(emit.mock.calls.map(([sample]) => sample)).toEqual([
      { phase: "prime", fraction: 0 },
      { phase: "prime", fraction: 0.5 },
      { phase: "prime", fraction: 1 },
    ]);
  });

  it("delivers the newest burst sample even when progress then goes quiet", () => {
    let now = 0;
    const emit = vi.fn();
    const scheduled: Array<() => void> = [];
    const report = createWorkerProgressReporter(
      emit,
      () => now,
      (callback) => {
        scheduled.push(callback);
        return callback;
      },
      (callback) => {
        const index = scheduled.indexOf(callback as () => void);
        if (index >= 0) scheduled.splice(index, 1);
      }
    );

    report("compile", 0);
    now = 10;
    report("compile", 0.4);
    now = 20;
    report("compile", 0.8);

    expect(emit).toHaveBeenCalledOnce();
    expect(scheduled).toHaveLength(1);
    now = WORKER_PROGRESS_MIN_INTERVAL_MS;
    scheduled.shift()?.();

    expect(emit).toHaveBeenLastCalledWith({
      phase: "compile",
      fraction: 0.8,
    });
  });
});
