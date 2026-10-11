import { afterEach, describe, expect, it } from "vitest";
import { MuseumPerformanceRecorder } from "#lib/features/museum/services/implementations/MuseumPerformanceRecorder.js";

const context = {
  roomId: "lobby",
  cameraMode: "first-person" as const,
  position: { x: 14.5, y: 0.85, z: 120 },
  activeRooms: 3,
  pendingMounts: 2,
};

let recorder: MuseumPerformanceRecorder | null = null;

afterEach(() => {
  recorder?.stop();
  recorder = null;
});

describe("MuseumPerformanceRecorder", () => {
  it("summarizes frame and phase percentiles", () => {
    recorder = new MuseumPerformanceRecorder();
    recorder.start({ observeBrowser: false });

    for (let durationMs = 1; durationMs <= 100; durationMs++) {
      recorder.recordPhaseDuration("render.main", durationMs);
      recorder.recordFrame(durationMs, context);
    }

    const snapshot = recorder.getSnapshot();
    expect(snapshot.frames).toMatchObject({
      count: 100,
      p50Ms: 50,
      p95Ms: 95,
      p99Ms: 99,
      maxMs: 100,
      over50Ms: 51,
      over100Ms: 1,
    });
    expect(snapshot.phases[0]).toMatchObject({
      name: "render.main",
      count: 100,
      p95Ms: 95,
      maxMs: 100,
    });
  });

  it("keeps the slowest measured phase with a hitch", () => {
    recorder = new MuseumPerformanceRecorder();
    recorder.start({ observeBrowser: false });
    recorder.recordRendererSample({
      fps: 42,
      drawCalls: 67,
      triangles: 79_000,
      geometries: 54,
      textures: 31,
      programs: 18,
    });
    recorder.recordPhaseDuration("frame.movement", 4);
    recorder.recordPhaseDuration("render.main", 72);

    recorder.recordFrame(88, context);

    expect(recorder.getSnapshot().hitches.at(-1)).toMatchObject({
      frameMs: 88,
      source: "frame",
      worstPhase: { name: "render.main", durationMs: 72 },
      context,
      renderer: {
        fps: 42,
        drawCalls: 67,
        triangles: 79_000,
        geometries: 54,
        textures: 31,
        programs: 18,
      },
    });
    expect(recorder.getOverlaySnapshot()).toMatchObject({
      latestHitch: {
        frameMs: 88,
        source: "frame",
        worstPhase: { name: "render.main", durationMs: 72 },
      },
      renderer: { drawCalls: 67, triangles: 79_000 },
    });
  });

  it("retains a bounded rolling frame window and ignores samples while stopped", () => {
    recorder = new MuseumPerformanceRecorder();
    recorder.start({ observeBrowser: false });
    for (let index = 0; index < 1_900; index++) {
      recorder.recordFrame(16, context);
    }
    recorder.stop();
    recorder.recordFrame(500, context);

    const snapshot = recorder.getSnapshot();
    expect(snapshot.frames.count).toBe(1_800);
    expect(snapshot.frames.maxMs).toBe(16);
  });
});
