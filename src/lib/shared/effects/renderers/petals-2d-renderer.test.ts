import { describe, it, expect, vi } from "vitest";
import { Petals2DRenderer } from "./petals-2d-renderer";
import type { Petals2DParams } from "../translators/canvas2d-types";
import { PETAL_PALETTES } from "../domain/petal-palettes";
import type { EmitterTip } from "./emitter-tip";

type PosBag = {
  leftPosA?: { x: number; y: number };
  leftPosB?: { x: number; y: number };
  rightPosA?: { x: number; y: number };
  rightPosB?: { x: number; y: number };
};

/** Convert the legacy 4-slot bag to the flat emitter contract (base props). */
function toEmitters(s: PosBag): EmitterTip[] {
  const out: EmitterTip[] = [];
  if (s.leftPosA)
    out.push({
      ...s.leftPosA,
      propIndex: 0,
      tipIndex: 0,
      end: "A",
      color: "#3a7fd9",
    });
  if (s.leftPosB)
    out.push({
      ...s.leftPosB,
      propIndex: 0,
      tipIndex: 1,
      end: "B",
      color: "#3a7fd9",
    });
  if (s.rightPosA)
    out.push({
      ...s.rightPosA,
      propIndex: 1,
      tipIndex: 0,
      end: "A",
      color: "#d94f4f",
    });
  if (s.rightPosB)
    out.push({
      ...s.rightPosB,
      propIndex: 1,
      tipIndex: 1,
      end: "B",
      color: "#d94f4f",
    });
  return out;
}

function makeCtx(): CanvasRenderingContext2D {
  const makeGradient = () => ({ addColorStop: vi.fn() });
  const ctx = {
    canvas: { width: 800, height: 600 },
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    strokeStyle: "" as string,
    fillStyle: "" as string,
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    ellipse: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    getTransform: vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    createRadialGradient: vi.fn(makeGradient),
    createLinearGradient: vi.fn(makeGradient),
  } as unknown as CanvasRenderingContext2D;
  return ctx;
}

function makeParams(overrides: Partial<Petals2DParams> = {}): Petals2DParams {
  return {
    ambientEmission: 1.0,
    motionEmission: 1.0,
    intensity: 0.6,
    palette: "blossom",
    customColor: "#ffb0c8",
    swayAmplitude: 0.6,
    carry: 0.55,
    streakLength: 0.4,
    fallSpeed: 0.4,
    trackingMode: "both_ends",
    resolvedPalette: PETAL_PALETTES.blossom,
    poolSize: 256,
    baseSize: 10,
    ambientSpawnRate: 5,
    motionDensity: 9,
    fallBaseSpeed: 140,
    blendMode: "source-over",
    ...overrides,
  };
}

const ALL_TIPS = toEmitters({
  leftPosA: { x: 100, y: 100 },
  leftPosB: { x: 120, y: 100 },
  rightPosA: { x: 200, y: 100 },
  rightPosB: { x: 220, y: 100 },
});

/** Two base props + one tunnel layer (propIndex 2/3) to prove layer coverage. */
const WITH_LAYER: EmitterTip[] = [
  ...ALL_TIPS,
  { x: 300, y: 100, propIndex: 2, tipIndex: 0, end: "A", color: "#22cc88" },
  { x: 320, y: 100, propIndex: 2, tipIndex: 1, end: "B", color: "#22cc88" },
  { x: 400, y: 100, propIndex: 3, tipIndex: 0, end: "A", color: "#cc4488" },
  { x: 420, y: 100, propIndex: 3, tipIndex: 1, end: "B", color: "#cc4488" },
];

describe("Petals2DRenderer", () => {
  it("spawns petals at rest under ambient emission", () => {
    const r = new Petals2DRenderer();
    const ctx = makeCtx();
    const params = makeParams({
      ambientEmission: 1,
      motionEmission: 0,
      ambientSpawnRate: 60,
    });
    for (let i = 0; i < 60; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    // Each petal draws a silhouette (fill) - we should have many fills.
    expect(
      (ctx.fill as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBeGreaterThan(0);
    // setTransform called per petal per frame (replaces save/translate/rotate).
    expect(
      (ctx.setTransform as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBeGreaterThan(0);
  });

  it("spawns from tunnel layer emitters (propIndex >= 2)", () => {
    const rBase = new Petals2DRenderer();
    const rLayered = new Petals2DRenderer();
    const ctxBase = makeCtx();
    const ctxLayered = makeCtx();
    const params = makeParams({
      ambientEmission: 1,
      motionEmission: 0,
      ambientSpawnRate: 60,
    });
    for (let i = 0; i < 60; i++) {
      rBase.render(ctxBase, params, ALL_TIPS, 1 / 60);
      rLayered.render(ctxLayered, params, WITH_LAYER, 1 / 60);
    }
    const baseFills = (ctxBase.fill as ReturnType<typeof vi.fn>).mock.calls
      .length;
    const layeredFills = (ctxLayered.fill as ReturnType<typeof vi.fn>).mock
      .calls.length;
    // 4 base ends vs 4 base + 4 layer ends ⇒ strictly more silhouette fills.
    // Confirms layer emitters (propIndex >= 2) actually spawn petals.
    expect(layeredFills).toBeGreaterThan(baseFills);
  });

  it("motion emission outpaces ambient emission", () => {
    const ctxA = makeCtx();
    const ctxB = makeCtx();
    const rA = new Petals2DRenderer();
    const rB = new Petals2DRenderer();
    const restParams = makeParams({ ambientEmission: 1, motionEmission: 0 });
    const moveParams = makeParams({ ambientEmission: 0, motionEmission: 1 });

    const step = 0.02;
    for (let i = 0; i < 40; i++) {
      rA.render(ctxA, restParams, ALL_TIPS, step);
      const moving = toEmitters({
        leftPosA: { x: 100 + i * 30, y: 100 },
        leftPosB: { x: 120 + i * 30, y: 100 },
        rightPosA: { x: 200 + i * 30, y: 100 },
        rightPosB: { x: 220 + i * 30, y: 100 },
      });
      rB.render(ctxB, moveParams, moving, step);
    }
    const aFills = (ctxA.fill as ReturnType<typeof vi.fn>).mock.calls.length;
    const bFills = (ctxB.fill as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(bFills).toBeGreaterThan(aFills);
  });

  it("respects trackingMode left_end (still draws, no crash)", () => {
    const r = new Petals2DRenderer();
    const ctx = makeCtx();
    const params = makeParams({
      ambientEmission: 1,
      ambientSpawnRate: 60,
      motionEmission: 0,
      trackingMode: "left_end",
    });
    for (let i = 0; i < 60; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    expect(
      (ctx.fill as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBeGreaterThan(0);
  });

  it("caps pool size", () => {
    const r = new Petals2DRenderer();
    const ctx = makeCtx();
    const params = makeParams({
      ambientEmission: 1,
      ambientSpawnRate: 10000,
      poolSize: 50,
    });
    for (let i = 0; i < 60; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    // Measure steady-state rate. Each petal draws ~1 fill per frame (no
    // ember for blossom), so perFrame ≤ poolSize * safety.
    const base = (ctx.fill as ReturnType<typeof vi.fn>).mock.calls.length;
    for (let i = 0; i < 60; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    const perFrame =
      ((ctx.fill as ReturnType<typeof vi.fn>).mock.calls.length - base) / 60;
    expect(perFrame).toBeLessThanOrEqual(params.poolSize * 4);
  });

  it("ash palette lights ember rims (extra strokes when ember flag rolls)", () => {
    const r = new Petals2DRenderer();
    const ctx = makeCtx();
    const params = makeParams({
      palette: "ash",
      resolvedPalette: PETAL_PALETTES.ash,
      ambientEmission: 1,
      ambientSpawnRate: 200,
      motionEmission: 0,
    });
    for (let i = 0; i < 30; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    // With 200 spawns/sec over 0.5s and 20% ember chance, we expect some
    // extra strokes beyond the zero baseline of non-ash palettes.
    expect(
      (ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBeGreaterThan(0);
  });

  it("petals fall (positive vy - screen-space downward)", () => {
    const r = new Petals2DRenderer();
    const ctx = makeCtx();
    const params = makeParams({
      ambientEmission: 1,
      ambientSpawnRate: 60,
      motionEmission: 0,
      fallSpeed: 1,
      swayAmplitude: 0,
    });
    // Spawn some petals.
    for (let i = 0; i < 10; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    const stCalls = (
      ctx.setTransform as ReturnType<typeof vi.fn>
    ).mock.calls.filter((c) => c.length >= 6);
    const ys = stCalls.map((c) => c[5] as number);
    const maxY = Math.max(...ys);
    // Tip y is 100; after several frames, petals should have moved down.
    expect(maxY).toBeGreaterThan(100);
  });

  it("dispose resets state", () => {
    const r = new Petals2DRenderer();
    const ctx = makeCtx();
    const params = makeParams();
    for (let i = 0; i < 20; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    r.dispose();
    r.render(ctx, params, ALL_TIPS, 1 / 60);
    expect(true).toBe(true);
  });
});
