// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  createRendererInfoFrameSampler,
  createRendererPerformanceWindow,
} from "./renderer-performance-window";

describe("renderer performance window", () => {
  it("reports frame-time percentiles and long-frame rate over a bounded window", () => {
    const window = createRendererPerformanceWindow(10);
    [8, 9, 10, 11, 12, 13, 14, 15, 34, 50, 80].forEach((frameMs) =>
      window.record(frameMs)
    );

    expect(window.snapshot()).toEqual({
      sampleCount: 10,
      frameP50Ms: 13,
      frameP95Ms: 50,
      frameP99Ms: 50,
      longFrameRate: 0.3,
      thermalDrift: 0,
    });
  });

  it("resets without retaining an old thermal baseline", () => {
    const window = createRendererPerformanceWindow(120);
    window.record(30);
    window.record(40);
    window.reset();
    window.record(10);

    expect(window.snapshot()).toEqual({
      sampleCount: 1,
      frameP50Ms: 10,
      frameP95Ms: 10,
      frameP99Ms: 10,
      longFrameRate: 0,
      thermalDrift: 0,
    });
  });

  it("compares exact opening and closing 30-second thermal windows", () => {
    const window = createRendererPerformanceWindow(80);
    Array.from({ length: 30 }, () => 1_000).forEach(window.record);
    Array.from({ length: 30 }, () => 1_100).forEach(window.record);

    expect(window.snapshot().thermalDrift).toBeCloseTo(0.1, 5);
  });
});

describe("renderer info frame sampler", () => {
  it("aggregates composer passes until the next frame boundary", () => {
    const info = {
      autoReset: true,
      render: { calls: 252, triangles: 3_955_000 },
      memory: { geometries: 119, textures: 56 },
      programs: [{}, {}],
      reset() {
        this.render.calls = 0;
        this.render.triangles = 0;
      },
    };

    const sampler = createRendererInfoFrameSampler(info);
    expect(info.autoReset).toBe(false);
    expect(sampler.sampleAndReset()).toEqual({
      drawCalls: 252,
      triangles: 3_955_000,
      geometries: 119,
      textures: 56,
      programs: 2,
    });
    expect(info.render).toEqual({ calls: 0, triangles: 0 });

    sampler.dispose();
    expect(info.autoReset).toBe(true);
  });
});
