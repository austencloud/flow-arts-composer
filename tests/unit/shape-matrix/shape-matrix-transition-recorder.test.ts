import { describe, expect, it, vi } from "vitest";
import {
  MISSED_VSYNC_THRESHOLD_MS,
  ShapeMatrixTransitionRecorder,
  summarizeShapeMatrixTransition,
} from "#lib/shared/shape-matrix/debug/shape-matrix-transition-recorder.js";

describe("shape matrix transition instrumentation", () => {
  it("separates startup, fade, and missed-frame timing", () => {
    const summary = summarizeShapeMatrixTransition({
      id: 7,
      key: "TS|blue|red",
      status: "settled",
      requestedAt: 100,
      buildStartedAt: 104,
      buildReadyAt: 120,
      canvasReadyAt: 125,
      motionReadyAt: 133,
      fadeStartedAt: 134,
      settledAt: 334,
      frameGaps: [16.6, 16.7, 34, 16.6],
    });

    expect(summary).toMatchObject({
      requestToCanvasMs: 25,
      requestToBuildMs: 4,
      requestToBuildReadyMs: 20,
      buildMs: 16,
      requestToMotionMs: 33,
      requestToFadeMs: 34,
      fadeMs: 200,
      totalMs: 234,
      frames: 4,
      missedFrames: 1,
      missedFramePct: 25,
      worstFrameMs: 34,
    });
    expect(summary.effectiveFps).toBeCloseTo(47.68, 1);
  });

  it("ignores hidden-tab gaps so one background interval cannot poison a run", () => {
    const summary = summarizeShapeMatrixTransition({
      id: 8,
      key: "SO|blue|red",
      status: "settled",
      requestedAt: 0,
      canvasReadyAt: 10,
      motionReadyAt: 20,
      fadeStartedAt: 20,
      settledAt: 220,
      frameGaps: [16.7, 16.7, 2500],
    });

    expect(summary.frames).toBe(2);
    expect(summary.worstFrameMs).toBe(16.7);
    expect(summary.missedFrames).toBe(0);
  });

  it("uses the 60 Hz frame budget while tolerating timer rounding", () => {
    const summary = summarizeShapeMatrixTransition({
      id: 9,
      key: "QO|blue|red",
      status: "settled",
      requestedAt: 0,
      canvasReadyAt: 5,
      motionReadyAt: 8,
      fadeStartedAt: 9,
      settledAt: 20,
      frameGaps: [16.67, 16.8, MISSED_VSYNC_THRESHOLD_MS + 0.1],
    });

    expect(MISSED_VSYNC_THRESHOLD_MS).toBeGreaterThan(1000 / 60);
    expect(MISSED_VSYNC_THRESHOLD_MS).toBeLessThan(17.2);
    expect(summary.missedFrames).toBe(1);
  });

  it("supersedes every older request and lets the pipeline claim the latest", () => {
    const recorder = new ShapeMatrixTransitionRecorder(true);
    const first = recorder.requested("turn:blue:0.25:0");
    const second = recorder.requested("turn:red:0.25:0.75");

    expect(recorder.claimLatest("TS|latest-blue|latest-red")).toBe(second);
    recorder.buildStarted(second);
    recorder.buildReady(second);
    recorder.motionReady(second);
    recorder.fadeStarted(second);
    recorder.settled(second);

    const summary = recorder.summary();
    expect(summary.find((record) => record.id === first)?.status).toBe(
      "superseded"
    );
    expect(summary.find((record) => record.id === second)).toMatchObject({
      key: "TS|latest-blue|latest-red",
      status: "settled",
      requestToBuildMs: expect.any(Number),
      requestToMotionMs: expect.any(Number),
    });
    expect(summary.some((record) => record.status === "running")).toBe(false);

    recorder.destroy();
  });

  it("reads summaries repeatedly without logging or mutating records", () => {
    const table = vi.spyOn(console, "table").mockImplementation(() => {});
    const recorder = new ShapeMatrixTransitionRecorder(true);
    const id = recorder.requested("turn:blue:1.25:0");
    recorder.buildStarted(id);
    recorder.buildReady(id);
    recorder.superseded(id);

    const first = recorder.summary();
    const second = recorder.summary();

    expect(second).toEqual(first);
    expect(table).not.toHaveBeenCalled();

    recorder.logSummary();
    expect(table).toHaveBeenCalledOnce();

    recorder.destroy();
    table.mockRestore();
  });
});
