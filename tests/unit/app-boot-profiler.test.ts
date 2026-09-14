import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootProfiler } from "../../src/lib/shared/analytics/boot-profiler";

describe("application boot evidence", () => {
  let now = 0;
  let marks: { name: string; startTime: number }[];
  let profiler: BootProfiler;

  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    marks = [];
    localStorage.setItem("bootProfile", "1");
    vi.stubGlobal("PerformanceObserver", undefined);
    vi.stubGlobal("performance", {
      now: () => now,
      mark: (name: string) => marks.push({ name, startTime: now }),
      measure: vi.fn(),
      clearMarks: vi.fn(),
      setResourceTimingBufferSize: vi.fn(),
      getEntriesByType: (type: string) => (type === "mark" ? marks : []),
    });
    vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    vi.spyOn(console, "table").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    profiler = new BootProfiler();
  });

  afterEach(() => {
    profiler.reset();
    localStorage.removeItem("bootProfile");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retains real readiness after the fallback summary has already printed", () => {
    profiler.scheduleSummary(3000);
    now = 3000;
    vi.advanceTimersByTime(3000);
    now = 9000;
    profiler.signalReady("construct");
    now = 10000;
    profiler.signalReady("construct");
    expect(profiler.getReport().phases).toContainEqual({
      label: "route:construct",
      startTime: 0,
      endTime: 9000,
      duration: 9000,
    });
    expect(
      marks.filter((entry) => entry.name === "boot:route:construct:ready")
    ).toHaveLength(1);
  });

  it("keeps concurrent attempts with the same label separate and closes once", () => {
    const first = profiler.startSpan("construct:prepare", { count: 3 });
    now = 10;
    const second = profiler.startSpan("construct:prepare", { count: 4 });
    now = 30;
    second("error");
    now = 70;
    first("ok", { cacheHit: true });
    first("cancelled");
    const spans = profiler.getReport().spans;
    expect(
      spans.map(({ duration, outcome }) => ({ duration, outcome }))
    ).toEqual([
      { duration: 70, outcome: "ok" },
      { duration: 20, outcome: "error" },
    ]);
    expect(spans[0]?.id).not.toBe(spans[1]?.id);
    expect(spans[0]?.detail).toEqual({ count: 3, cacheHit: true });
  });

  it("preserves the caller's result or exact rejection while recording outcomes", async () => {
    const failure = new Error("private payload must not enter the report");
    await expect(
      profiler.measureAsync("create:restore", async () => {
        throw failure;
      })
    ).rejects.toBe(failure);
    await expect(
      profiler.measureAsync("create:retry", async () => 42)
    ).resolves.toBe(42);
    await expect(
      profiler.measureAsync("create:sync", () => undefined)
    ).resolves.toBeUndefined();
    expect(profiler.getReport().spans.map((span) => span.outcome)).toEqual([
      "error",
      "ok",
      "ok",
    ]);
    expect(JSON.stringify(profiler.getReport())).not.toContain(failure.message);
  });

  it("leaves unfinished work visible and ignores completions from a reset run", () => {
    const finish = profiler.startSpan("create:old");
    expect(profiler.getReport().spans[0]?.outcome).toBeUndefined();
    profiler.reset();
    finish();
    expect(profiler.getReport().spans).toEqual([]);
  });

  it("bounds detailed collection and reports discarded samples", () => {
    for (let i = 0; i < 1005; i++) profiler.startSpan("construct:prepare")();
    expect(profiler.getReport().spans).toHaveLength(1000);
    expect(profiler.getReport().droppedSpans).toBe(5);
  });

  it("keeps first milestones and returns detached snapshots", () => {
    const detail = { count: 3 };
    now = 5;
    profiler.milestone("construct:first-options-prepared", detail);
    detail.count = 99;
    now = 20;
    profiler.milestone("construct:first-options-prepared", { count: 10 });
    const report = profiler.getReport();
    report.milestones[0]!.detail.count = 100;
    expect(profiler.getReport().milestones[0]).toEqual({
      label: "construct:first-options-prepared",
      startTime: 5,
      detail: { count: 3 },
    });
  });

  it("keeps detailed spans off unless explicitly requested", () => {
    localStorage.removeItem("bootProfile");
    profiler.startSpan("construct:prepare")();
    expect(profiler.getReport().spans).toEqual([]);
    expect(profiler.getReport().detailedProfiling).toBe(false);
  });
});
