import { describe, it, expect, vi } from "vitest";
import {
  Silk2DRenderer,
  resolveSilk2DEnergyScale,
  resolveSilk2DOpacity,
} from "./silk-2d-renderer";
import type { Silk2DParams } from "../translators/canvas2d-types";
import type { SilkPalette } from "../domain/silk-palettes";
import type { EmitterTip } from "./emitter-tip";

// No WebGL2 here, so these drive the flat Canvas2D fallback: the same cloth,
// filled patch by patch onto the mock context.

const SATIN: SilkPalette = {
  id: "satin",
  body: "#c0c0d0",
  edge: "#ffffff",
};
const STEP = 1 / 60;

function makeCtx(): CanvasRenderingContext2D {
  return {
    canvas: { width: 800, height: 600 },
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
    globalAlpha: 1,
    strokeStyle: "" as string | CanvasGradient,
    fillStyle: "" as string | CanvasGradient,
    lineWidth: 1,
    lineJoin: "miter" as CanvasLineJoin,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    getTransform: vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function makeParams(overrides: Partial<Silk2DParams> = {}): Silk2DParams {
  return {
    intensity: 0.8,
    width: 0.5,
    duration: 0.5,
    flutter: 0.3,
    tautness: 0.4,
    palette: "satin",
    customColor: "#c0c0d0",
    trackingMode: "both_ends",
    resolvedPalette: SATIN,
    baseHalfWidth: 12,
    lifetimeSeconds: 2.0,
    motionReferenceSpeed: 3.0,
    blendMode: "source-over",
    ...overrides,
  };
}

function tip(x: number, y: number, propIndex = 0, tipIndex = 0): EmitterTip {
  return {
    x,
    y,
    propIndex,
    tipIndex,
    end: tipIndex === 0 ? "A" : "B",
    color: propIndex % 2 ? "#d94f4f" : "#3a7fd9",
  };
}

/** Both ends of `props` staffs, moving right together. */
function staffs(frame: number, props = 2): EmitterTip[] {
  const out: EmitterTip[] = [];
  for (let p = 0; p < props; p++) {
    out.push(tip(100 + p * 100 + frame * 4, 100, p, 0));
    out.push(tip(120 + p * 100 + frame * 4, 140, p, 1));
  }
  return out;
}

/** Every point the cloth was drawn through on `ctx`. */
function drawnPoints(ctx: CanvasRenderingContext2D): { x: number; y: number }[] {
  return [...vi.mocked(ctx.moveTo).mock.calls, ...vi.mocked(ctx.lineTo).mock.calls].map(
    ([x, y]) => ({ x, y })
  );
}

describe("Silk2DRenderer", () => {
  it("normalizes overlapping ribbon energy without erasing dense tunnels", () => {
    expect(resolveSilk2DEnergyScale(2)).toBe(1);
    expect(resolveSilk2DEnergyScale(4)).toBe(1);
    expect(resolveSilk2DEnergyScale(16)).toBeLessThan(resolveSilk2DEnergyScale(8));
    expect(resolveSilk2DEnergyScale(100)).toBe(0.32);
  });

  it("makes the fabric more opaque with intensity, never fully solid", () => {
    expect(resolveSilk2DOpacity(0.8, 2)).toBeGreaterThan(resolveSilk2DOpacity(0.2, 2));
    expect(resolveSilk2DOpacity(1, 2)).toBeLessThan(1);
    expect(resolveSilk2DOpacity(0.8, 16)).toBeLessThan(resolveSilk2DOpacity(0.8, 2));
  });

  it("draws one streamer per tracked end, through finite points", () => {
    const r = new Silk2DRenderer();
    const ctx = makeCtx();
    for (let i = 0; i < 30; i++) r.render(ctx, makeParams(), staffs(i), STEP);
    expect(r.streamerCount).toBe(4);
    expect(vi.mocked(ctx.fill).mock.calls.length).toBeGreaterThan(0);
    for (const point of drawnPoints(ctx)) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
    expect(vi.mocked(ctx.save).mock.calls.length).toBe(vi.mocked(ctx.restore).mock.calls.length);
  });

  it("gives tunnel layer emitters (propIndex >= 2) their own streamers", () => {
    const r = new Silk2DRenderer();
    const ctx = makeCtx();
    for (let i = 0; i < 10; i++) r.render(ctx, makeParams(), staffs(i, 4), STEP);
    expect(r.streamerCount).toBe(8);
  });

  it("only ties silk to the ends tracking asks for", () => {
    const r = new Silk2DRenderer();
    const ctx = makeCtx();
    for (let i = 0; i < 10; i++) {
      r.render(ctx, makeParams({ trackingMode: "left_end" }), staffs(i), STEP);
    }
    expect(r.streamerCount).toBe(2);
  });

  it("hangs down the screen from a still tip", () => {
    const r = new Silk2DRenderer();
    let ctx = makeCtx();
    for (let i = 0; i < 120; i++) {
      ctx = makeCtx();
      r.render(ctx, makeParams(), [tip(400, 100)], STEP);
    }
    const ys = drawnPoints(ctx).map((p) => p.y);
    expect(Math.max(...ys)).toBeGreaterThan(160);
    expect(Math.min(...ys)).toBeGreaterThan(95);
  });

  it("stays finite whipped through a tight turn", () => {
    const r = new Silk2DRenderer();
    const ctx = makeCtx();
    for (let frame = 0; frame < 120; frame++) {
      const angle = frame * 0.5;
      r.render(
        ctx,
        makeParams(),
        [tip(220 + Math.cos(angle) * 90, 220 + Math.sin(angle) * 55)],
        STEP
      );
    }
    for (const point of drawnPoints(ctx)) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it("lets a missing prop's silk fall and fade away", () => {
    const r = new Silk2DRenderer();
    const ctx = makeCtx();
    for (let i = 0; i < 24; i++) r.render(ctx, makeParams(), [tip(100 + i * 4, 180)], STEP);

    vi.mocked(ctx.fill).mockClear();
    r.render(ctx, makeParams(), [], 0.05);
    expect(r.streamerCount).toBe(1);
    expect(vi.mocked(ctx.fill).mock.calls.length).toBeGreaterThan(0);

    for (let i = 0; i < 30; i++) r.render(ctx, makeParams(), [], 0.05);
    expect(r.streamerCount).toBe(0);
    vi.mocked(ctx.fill).mockClear();
    r.render(ctx, makeParams(), [], 0.05);
    expect(vi.mocked(ctx.fill)).not.toHaveBeenCalled();
  });

  it("carries the cloth with a prop across a loop seam instead of dragging it", () => {
    const r = new Silk2DRenderer();
    for (let i = 0; i < 24; i++) r.render(makeCtx(), makeParams(), [tip(100 + i * 4, 180)], STEP);
    const ctx = makeCtx();
    r.render(ctx, makeParams(), [tip(700, 180)], STEP, 1, true);
    const xs = drawnPoints(ctx).map((p) => p.x);
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeGreaterThan(500);
  });

  it("starts fresh silk at a tip that jumps across the stage", () => {
    const r = new Silk2DRenderer();
    for (let i = 0; i < 24; i++) r.render(makeCtx(), makeParams(), [tip(100 + i * 4, 180)], STEP);
    const ctx = makeCtx();
    r.render(ctx, makeParams(), [tip(700, 180)], STEP);
    const xs = drawnPoints(ctx).map((p) => p.x);
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeGreaterThan(500);
  });

  it("dispose clears every streamer", () => {
    const r = new Silk2DRenderer();
    const ctx = makeCtx();
    for (let i = 0; i < 20; i++) r.render(ctx, makeParams(), staffs(i), STEP);
    r.dispose();
    expect(r.streamerCount).toBe(0);
    expect(() => r.render(ctx, makeParams(), staffs(0), STEP)).not.toThrow();
  });
});
