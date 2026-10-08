import { describe, expect, it, vi } from "vitest";
import {
  createMandalaCanvasSizeTracker,
  unrotatedSquareSide,
} from "$lib/shared/mandala/services/mandala-canvas-size";

describe("mandala canvas size", () => {
  it("takes a spinning container's rotation back out of its box", () => {
    expect(unrotatedSquareSide(300, 0)).toBeCloseTo(300);
    expect(unrotatedSquareSide(300 * Math.SQRT2, 45)).toBeCloseTo(300);
    expect(unrotatedSquareSide(300, 90)).toBeCloseTo(300);
  });

  it("measures once, then reuses the size between rechecks", () => {
    const tracker = createMandalaCanvasSizeTracker({ recheckDraws: 30 });
    const measure = vi.fn(() => 300);

    for (let draw = 0; draw < 30; draw++) tracker.resolve(measure, 240);

    expect(measure).toHaveBeenCalledTimes(1);
    tracker.resolve(measure, 240);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it("keeps its size through a brief scale animation", () => {
    const tracker = createMandalaCanvasSizeTracker({ recheckDraws: 1 });
    let box = 300;
    const measure = () => box;

    expect(tracker.resolve(measure, 240)).toBe(300);
    box = 300 * 0.92;
    expect(tracker.resolve(measure, 240)).toBe(300);
    box = 150;
    expect(tracker.resolve(measure, 240)).toBe(150);
  });

  it("re-measures exactly after a layout resize", () => {
    const tracker = createMandalaCanvasSizeTracker();
    expect(tracker.resolve(() => 300, 240)).toBe(300);

    tracker.invalidate();

    expect(tracker.resolve(() => 310, 240)).toBe(310);
  });

  it("falls back to the prop while the canvas has no box", () => {
    const tracker = createMandalaCanvasSizeTracker();
    expect(tracker.resolve(() => 0, 240)).toBe(240);
    expect(tracker.measured).toBeNull();
  });
});
