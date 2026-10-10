import { describe, it, expect, vi } from "vitest";
import { Bubbles2DRenderer } from "#lib/shared/effects/renderers/bubbles-2d-renderer.js";
import type { Bubbles2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import {
  BUBBLE_PALETTES,
  oilIridescentRim,
} from "#lib/shared/effects/domain/bubble-palettes.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";

type PosBag = {
  leftPosA?: { x: number; y: number } | null;
  leftPosB?: { x: number; y: number } | null;
  rightPosA?: { x: number; y: number } | null;
  rightPosB?: { x: number; y: number } | null;
};

/** Map the legacy 4-slot bag to the flat EmitterTip[] contract. */
function toEmitters(bag: PosBag): EmitterTip[] {
  const out: EmitterTip[] = [];
  if (bag.leftPosA)
    out.push({
      ...bag.leftPosA,
      propIndex: 0,
      tipIndex: 0,
      end: "A",
      color: "#4ea3ff",
    });
  if (bag.leftPosB)
    out.push({
      ...bag.leftPosB,
      propIndex: 0,
      tipIndex: 1,
      end: "B",
      color: "#4ea3ff",
    });
  if (bag.rightPosA)
    out.push({
      ...bag.rightPosA,
      propIndex: 1,
      tipIndex: 0,
      end: "A",
      color: "#ff5a5a",
    });
  if (bag.rightPosB)
    out.push({
      ...bag.rightPosB,
      propIndex: 1,
      tipIndex: 1,
      end: "B",
      color: "#ff5a5a",
    });
  return out;
}

function makeCtx(): CanvasRenderingContext2D {
  let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const transformStack: (typeof transform)[] = [];
  const ctx = {
    canvas: { width: 800, height: 600 },
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    strokeStyle: "" as string | CanvasGradient,
    fillStyle: "" as string | CanvasGradient,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(() => transformStack.push({ ...transform })),
    restore: vi.fn(() => {
      transform = transformStack.pop() ?? transform;
    }),
    translate: vi.fn((x: number, y: number) => {
      transform.e += transform.a * x + transform.c * y;
      transform.f += transform.b * x + transform.d * y;
    }),
    rotate: vi.fn(),
    scale: vi.fn((x: number, y: number) => {
      transform.a *= x;
      transform.b *= x;
      transform.c *= y;
      transform.d *= y;
    }),
    getTransform: vi.fn(() => ({ ...transform })),
    setTransform: vi.fn(
      (a: number, b: number, c: number, d: number, e: number, f: number) => {
        transform = { a, b, c, d, e, f };
      }
    ),
    clearRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  } as unknown as CanvasRenderingContext2D;
  return ctx;
}

function makeParams(overrides: Partial<Bubbles2DParams> = {}): Bubbles2DParams {
  return {
    ambientEmission: 1.0,
    motionEmission: 1.0,
    intensity: 0.6,
    palette: "soap",
    customColor: "#c8e0ff",
    sizeJitter: 0.4,
    buoyancy: 0.5,
    trackingMode: "both_ends",
    resolvedPalette: BUBBLE_PALETTES.soap,
    poolSize: 256,
    baseRadius: 6,
    ambientSpawnRate: 6,
    motionSpawnRate: 30,
    motionReferenceSpeed: 3.0,
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

// Base tips plus one tunnel kaleidoscope layer (propIndex 2/3).
const WITH_LAYER: EmitterTip[] = [
  ...ALL_TIPS,
  { x: 300, y: 100, propIndex: 2, tipIndex: 0, end: "A", color: "#4ea3ff" },
  { x: 320, y: 100, propIndex: 2, tipIndex: 1, end: "B", color: "#4ea3ff" },
  { x: 400, y: 100, propIndex: 3, tipIndex: 0, end: "A", color: "#ff5a5a" },
  { x: 420, y: 100, propIndex: 3, tipIndex: 1, end: "B", color: "#ff5a5a" },
];

describe("Bubbles2DRenderer", () => {
  it("spawns bubbles at rest under ambient emission", () => {
    const r = new Bubbles2DRenderer();
    const ctx = makeCtx();
    const params = makeParams({
      ambientEmission: 1,
      motionEmission: 0,
      ambientSpawnRate: 60,
    });
    // One second of frames at 60fps - should reliably spawn many bubbles.
    for (let i = 0; i < 60; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    // Each live bubble draws at least a fill (interior) + stroke (rim).
    expect(
      (ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBeGreaterThan(0);
    expect(
      (ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBeGreaterThan(0);
  });

  it("motion emission outpaces ambient emission", () => {
    const ctxA = makeCtx();
    const ctxB = makeCtx();
    const rA = new Bubbles2DRenderer();
    const rB = new Bubbles2DRenderer();
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

  it("respects trackingMode left_end (no crash, still draws)", () => {
    const r = new Bubbles2DRenderer();
    const ctx = makeCtx();
    const params = makeParams({
      ambientEmission: 1,
      ambientSpawnRate: 80,
      motionEmission: 0,
      trackingMode: "left_end",
    });
    for (let i = 0; i < 60; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    expect(
      (ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBeGreaterThan(0);
  });

  it("caps pool size", () => {
    const r = new Bubbles2DRenderer();
    const ctx = makeCtx();
    const params = makeParams({
      ambientEmission: 1,
      ambientSpawnRate: 10000,
      poolSize: 50,
      // Zero buoyancy so bubbles don't exit screen before pop. Short life
      // via small intensity won't apply here because lifetime floors at 1s.
    });
    // Let the pool saturate.
    for (let i = 0; i < 120; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    // Can't directly read pool size externally - assert via draw-call rate.
    // With poolSize=50, each frame draws at most ~50 bubbles × (fill + stroke
    // + highlight) + pop fragments. Frame-over-frame call count should be
    // bounded. Absent pool cap, this would explode unboundedly.
    const framesBefore = (ctx.fill as ReturnType<typeof vi.fn>).mock.calls
      .length;
    for (let i = 0; i < 60; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    const framesAfter = (ctx.fill as ReturnType<typeof vi.fn>).mock.calls
      .length;
    const perFrame = (framesAfter - framesBefore) / 60;
    // Upper bound: ~3 fills per alive bubble (body/highlight + some bursts)
    // plus ~8 bursts per pop per frame. Generous cap of ~8× poolSize.
    expect(perFrame).toBeLessThanOrEqual(params.poolSize * 10);
  });

  it("preserves a caller-owned non-identity transform", () => {
    const r = new Bubbles2DRenderer();
    const ctx = makeCtx();
    ctx.setTransform(2, 0.2, -0.1, 1.5, 40, 25);
    const before = ctx.getTransform();
    const params = makeParams({ ambientSpawnRate: 120, motionEmission: 0 });

    for (let frame = 0; frame < 10; frame++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }

    expect(ctx.getTransform()).toEqual(before);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it("caches gradients per context, palette, and incoming transform", () => {
    const r = new Bubbles2DRenderer();
    const ctxA = makeCtx();
    const ctxB = makeCtx();
    const params = makeParams({ ambientSpawnRate: 120, motionEmission: 0 });

    r.render(ctxA, params, ALL_TIPS, 1 / 60);
    r.render(ctxA, params, ALL_TIPS, 1 / 60);
    expect(ctxA.createRadialGradient).toHaveBeenCalledTimes(3);
    expect(ctxB.createRadialGradient).not.toHaveBeenCalled();

    r.render(ctxB, params, ALL_TIPS, 1 / 60);
    expect(ctxB.createRadialGradient).toHaveBeenCalledTimes(3);
    ctxA.setTransform(2, 0, 0, 2, 0, 0);
    r.render(ctxA, params, ALL_TIPS, 1 / 60);
    expect(ctxA.createRadialGradient).toHaveBeenCalledTimes(6);
  });

  it("bounds changing-transform gradients and deterministically evicts the oldest", () => {
    const r = new Bubbles2DRenderer();
    const ctx = makeCtx();
    const params = makeParams({ ambientSpawnRate: 120, motionEmission: 0 });

    for (let transformIndex = 0; transformIndex < 9; transformIndex++) {
      ctx.setTransform(1, 0, 0, 1, transformIndex, 0);
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(27);

    // The newest transform remains reusable after saturation.
    ctx.setTransform(1, 0, 0, 1, 8, 0);
    r.render(ctx, params, ALL_TIPS, 1 / 60);
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(27);

    // The first transform was evicted when the ninth entry arrived.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    r.render(ctx, params, ALL_TIPS, 1 / 60);
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(30);
  });

  it("bounds a synchronized pop burst to the configured pool", () => {
    const r = new Bubbles2DRenderer();
    const ctx = makeCtx();
    const params = makeParams({ poolSize: 8, ambientEmission: 0 });
    const internal = r as unknown as {
      bubbles: Array<Record<string, number>>;
      bursts: unknown[];
    };
    internal.bubbles = Array.from({ length: 20 }, () => ({
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
      age: 1,
      maxAge: 1,
      baseR: 6,
      wobbleAmp: 0,
      wobbleFreq: 1,
      wobblePhase: 0,
      filmPhase: 0,
      popping: 0,
      popAge: 0,
      popR: 6,
    }));

    r.render(ctx, params, [], 1 / 60);
    expect(internal.bursts).toHaveLength(8);
  });

  it("damps bursts by elapsed time rather than frame count", () => {
    const makeRenderer = () => {
      const renderer = new Bubbles2DRenderer();
      const internal = renderer as unknown as {
        bursts: Array<Record<string, number | string>>;
        integrateBursts(dt: number): void;
      };
      internal.bursts = [
        {
          x: 0,
          y: 0,
          vx: 100,
          vy: 50,
          age: 0,
          maxAge: 10,
          r: 1,
          angle: 0,
          spin: 0,
          color: "#fff",
        },
      ];
      return internal;
    };
    const sixtyFps = makeRenderer();
    const thirtyFps = makeRenderer();
    for (let frame = 0; frame < 60; frame++) sixtyFps.integrateBursts(1 / 60);
    for (let frame = 0; frame < 30; frame++) thirtyFps.integrateBursts(1 / 30);

    expect(sixtyFps.bursts[0]!.vx).toBeCloseTo(
      thirtyFps.bursts[0]!.vx as number,
      8
    );
    expect(sixtyFps.bursts[0]!.vy).toBeCloseTo(
      thirtyFps.bursts[0]!.vy as number,
      8
    );
  });

  it("bubbles rise upward (negative vy after steady state)", () => {
    const r = new Bubbles2DRenderer();
    const ctx = makeCtx();
    const params = makeParams({
      ambientEmission: 1,
      ambientSpawnRate: 30,
      motionEmission: 0,
      buoyancy: 1.0,
    });
    // Track translate y-values for bubbles. Bubbles2DRenderer draws via
    // ctx.arc(x, y, r) (no translate), so we read from arc's 2nd arg.
    for (let i = 0; i < 20; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls;
    expect(arcCalls.length).toBeGreaterThan(0);
    const ys = arcCalls.map((c) => c[1] as number);
    const minY = Math.min(...ys);
    // Tip y is 100; with buoyancy=1, some bubbles should be at least a
    // few pixels above spawn after 20 frames (333ms).
    expect(minY).toBeLessThan(95);
  });

  it("breaks a popping film into collapsed ellipses instead of expanding circles", () => {
    const r = new Bubbles2DRenderer();
    const ctx = makeCtx();
    const params = makeParams({
      ambientEmission: 1,
      ambientSpawnRate: 60,
      motionEmission: 0,
      intensity: 0,
      poolSize: 16,
    });

    for (let i = 0; i < 100; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }

    const ellipseCalls = (ctx.ellipse as ReturnType<typeof vi.fn>).mock.calls;
    expect(ellipseCalls.length).toBeGreaterThan(0);
    expect(
      ellipseCalls.some((call) => {
        const radiusX = call[2] as number;
        const radiusY = call[3] as number;
        return radiusY < radiusX * 0.6;
      })
    ).toBe(true);
  });

  it("dispose resets state", () => {
    const r = new Bubbles2DRenderer();
    const ctx = makeCtx();
    const params = makeParams();
    for (let i = 0; i < 20; i++) {
      r.render(ctx, params, ALL_TIPS, 1 / 60);
    }
    r.dispose();
    // Call render again after dispose - should not crash.
    r.render(ctx, params, ALL_TIPS, 1 / 60);
    expect(true).toBe(true);
  });

  it("spawns from tunnel layer emitters (propIndex >= 2)", () => {
    const ctxBase = makeCtx();
    const ctxLayer = makeCtx();
    const rBase = new Bubbles2DRenderer();
    const rLayer = new Bubbles2DRenderer();
    const params = makeParams({
      ambientEmission: 1,
      ambientSpawnRate: 60,
      motionEmission: 0,
    });
    for (let i = 0; i < 30; i++) {
      rBase.render(ctxBase, params, ALL_TIPS, 1 / 60);
      rLayer.render(ctxLayer, params, WITH_LAYER, 1 / 60);
    }
    const baseFills = (ctxBase.fill as ReturnType<typeof vi.fn>).mock.calls
      .length;
    const layerFills = (ctxLayer.fill as ReturnType<typeof vi.fn>).mock.calls
      .length;
    // The layered run emits from 4 extra tips (propIndex 2/3), so it must
    // draw strictly more bubble fills than the base-only run.
    expect(layerFills).toBeGreaterThan(baseFills);
  });
});

describe("oilIridescentRim", () => {
  it("returns distinct colors at t=0, 0.5, 1.0", () => {
    const at0 = oilIridescentRim(0);
    const at5 = oilIridescentRim(0.5);
    const at1 = oilIridescentRim(1);
    expect(at0).not.toEqual(at5);
    expect(at5).not.toEqual(at1);
    expect(at0).not.toEqual(at1);
    // All valid hex strings.
    expect(at0).toMatch(/^#[0-9a-f]{6}$/i);
    expect(at5).toMatch(/^#[0-9a-f]{6}$/i);
    expect(at1).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("clamps t outside [0,1]", () => {
    const at0 = oilIridescentRim(0);
    const atNeg = oilIridescentRim(-0.5);
    const atHigh = oilIridescentRim(1.5);
    const at1 = oilIridescentRim(1);
    expect(atNeg).toBe(at0);
    expect(atHigh).toBe(at1);
  });
});
