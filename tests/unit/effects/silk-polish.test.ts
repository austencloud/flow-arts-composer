import { describe, expect, it, vi } from "vitest";
import {
  Silk2DRenderer,
  resolveSilk2DMaximumLength,
  resolveSilk2DSampleSpacing,
  smoothSilk2DPath,
} from "#lib/shared/effects/renderers/silk-2d-renderer.js";
import { resolveCentripetalBezierSegment } from "#lib/shared/effects/renderers/ribbon-trace.js";
import type { Silk2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";

const PARAMS: Silk2DParams = {
  intensity: 0.5,
  width: 0.5,
  duration: 0.5,
  flutter: 0.3,
  tautness: 0.5,
  palette: "satin",
  customColor: "#c0c0d0",
  trackingMode: "both_ends",
  resolvedPalette: { id: "satin", body: "#c0c0d0", edge: "#ffffff" },
  baseHalfWidth: 12,
  lifetimeSeconds: 2,
  motionReferenceSpeed: 3,
  blendMode: "source-over",
};

function makeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() };
  return {
    canvas: { width: 800, height: 600 },
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    filter: "none",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
  } as unknown as CanvasRenderingContext2D;
}

function tip(x: number, y: number): EmitterTip {
  return {
    x,
    y,
    propIndex: 0,
    tipIndex: 0,
    end: "A",
    color: "#3a7fd9",
  };
}

describe("2D Silk path polish", () => {
  it("softens a one-frame corner without moving either ribbon endpoint", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 30 },
      { x: 30, y: 0 },
      { x: 40, y: 0 },
    ];

    const smoothed = smoothSilk2DPath(points);

    expect({ x: smoothed.x[0], y: smoothed.y[0] }).toEqual(points[0]);
    expect({ x: smoothed.x[4], y: smoothed.y[4] }).toEqual(points[4]);
    expect(smoothed.y[2]).toBeGreaterThan(0);
    expect(smoothed.y[2]).toBeLessThan(points[2]!.y);
    expect(smoothed.y[1]).toBeGreaterThan(0);
    expect(smoothed.y[3]).toBeGreaterThan(0);
  });

  it("shortens the handle beside a distant sample instead of hooking backward", () => {
    const segment = resolveCentripetalBezierSegment(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0.1 },
      { x: 100, y: 100 }
    );

    expect(segment.control2.x).toBeGreaterThan(0);
    expect(segment.control2.x).toBeLessThan(3);
    expect(segment.end).toEqual({ x: 2, y: 0.1 });
  });

  it("keeps every Bezier control finite when motion samples repeat", () => {
    const segment = resolveCentripetalBezierSegment(
      { x: 4, y: 7 },
      { x: 4, y: 7 },
      { x: 4, y: 7 },
      { x: 9, y: 11 }
    );

    for (const point of [segment.control1, segment.control2, segment.end]) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it("keeps every rendered edge handle finite through a tight turn", () => {
    const renderer = new Silk2DRenderer();
    const ctx = makeContext();

    for (let frame = 0; frame < 36; frame++) {
      const angle = frame * 0.18;
      renderer.render(
        ctx,
        PARAMS,
        [tip(220 + Math.cos(angle) * 90, 220 + Math.sin(angle) * 55)],
        1 / 60
      );
    }

    expect(vi.mocked(ctx.fill).mock.calls.length).toBeGreaterThan(0);
    for (const call of vi.mocked(ctx.bezierCurveTo).mock.calls) {
      for (const coordinate of call)
        expect(Number.isFinite(coordinate)).toBe(true);
    }
  });

  it("maps duration to a bounded physical strip length", () => {
    expect(resolveSilk2DMaximumLength(0, 1)).toBe(120);
    expect(resolveSilk2DMaximumLength(0.5, 1)).toBe(240);
    expect(resolveSilk2DMaximumLength(1, 1)).toBe(360);
    expect(resolveSilk2DMaximumLength(2, 1)).toBe(360);
  });

  it("keeps sample density stable across render scales", () => {
    expect(resolveSilk2DSampleSpacing(0.5)).toBe(2);
    expect(resolveSilk2DSampleSpacing(1)).toBe(4);
    expect(resolveSilk2DSampleSpacing(2)).toBe(8);
  });

  it("clips the broad satin reflection to the ribbon body", () => {
    const renderer = new Silk2DRenderer();
    const ctx = makeContext();

    for (let frame = 0; frame < 36; frame++) {
      renderer.render(ctx, PARAMS, [tip(120 + frame * 4, 180)], 1 / 60);
    }

    vi.mocked(ctx.stroke).mockClear();
    vi.mocked(ctx.clip).mockClear();
    renderer.render(ctx, PARAMS, [tip(264, 180)], 1 / 60);

    // Underpaint, two clipped surface folds, and the two true hems.
    expect(ctx.stroke).toHaveBeenCalledTimes(5);
    expect(ctx.clip).toHaveBeenCalledTimes(1);
    expect(ctx.createLinearGradient).not.toHaveBeenCalled();
    expect(ctx.filter).toBe("none");
  });

  it("lets a missing prop fade away instead of leaving a permanent ribbon", () => {
    const renderer = new Silk2DRenderer();
    const ctx = makeContext();

    for (let frame = 0; frame < 24; frame++) {
      renderer.render(ctx, PARAMS, [tip(100 + frame * 4, 180)], 1 / 60);
    }

    vi.mocked(ctx.fill).mockClear();
    renderer.render(ctx, PARAMS, [], 0.1);
    expect(vi.mocked(ctx.fill).mock.calls.length).toBeGreaterThan(0);

    for (let frame = 0; frame < 24; frame++)
      renderer.render(ctx, PARAMS, [], 0.1);
    vi.mocked(ctx.fill).mockClear();
    renderer.render(ctx, PARAMS, [], 0.1);
    expect(vi.mocked(ctx.fill)).not.toHaveBeenCalled();
  });

  it("moves retained cloth with a returning prop instead of stitching a teleport", () => {
    const renderer = new Silk2DRenderer();
    const ctx = makeContext();

    for (let frame = 0; frame < 24; frame++) {
      renderer.render(ctx, PARAMS, [tip(100 + frame * 4, 180)], 1 / 60);
    }
    renderer.render(ctx, PARAMS, [], 0.05);
    vi.mocked(ctx.bezierCurveTo).mockClear();
    renderer.render(ctx, PARAMS, [tip(900, 180)], 1 / 60);

    const xCoordinates = vi
      .mocked(ctx.bezierCurveTo)
      .mock.calls.flatMap((call) => [call[0], call[2], call[4]]);
    expect(xCoordinates.length).toBeGreaterThan(0);
    expect(Math.min(...xCoordinates)).toBeGreaterThan(700);
  });
});
