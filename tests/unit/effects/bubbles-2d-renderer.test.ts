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
    clip: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
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

interface BubbleView {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  baseR: number;
  popping: 0 | 1;
}

function internals(r: Bubbles2DRenderer) {
  return r as unknown as { bubbles: BubbleView[]; flecks: unknown[] };
}

/** Deterministic rand so counts and positions are stable. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shiftTips(tips: EmitterTip[], dx: number): EmitterTip[] {
  return tips.map((t) => ({ ...t, x: t.x + dx }));
}

describe("Bubbles2DRenderer", () => {
  it("spawns bubbles at rest under ambient emission and draws them", () => {
    const r = new Bubbles2DRenderer(seeded());
    const ctx = makeCtx();
    const params = makeParams({ motionEmission: 0, ambientSpawnRate: 60 });
    for (let i = 0; i < 60; i++) r.render(ctx, params, ALL_TIPS, 1 / 60);
    expect(r.count).toBeGreaterThan(0);
    // No canvas under jsdom: the plain vector bubble is drawn instead.
    expect(vi.mocked(ctx.arc).mock.calls.length).toBeGreaterThan(0);
  });

  it("motion emission outpaces ambient emission", () => {
    const rest = new Bubbles2DRenderer(seeded());
    const moving = new Bubbles2DRenderer(seeded());
    const restParams = makeParams({ ambientEmission: 1, motionEmission: 0 });
    const moveParams = makeParams({ ambientEmission: 0, motionEmission: 1 });
    for (let i = 0; i < 40; i++) {
      rest.render(makeCtx(), restParams, ALL_TIPS, 0.02);
      moving.render(makeCtx(), moveParams, shiftTips(ALL_TIPS, i * 6), 0.02);
    }
    expect(moving.count).toBeGreaterThan(rest.count);
  });

  it("left_end tracking emits from the A ends only", () => {
    const r = new Bubbles2DRenderer(seeded());
    const params = makeParams({
      ambientSpawnRate: 80,
      motionEmission: 0,
      trackingMode: "left_end",
    });
    for (let i = 0; i < 30; i++) r.render(makeCtx(), params, ALL_TIPS, 1 / 60);
    const xs = internals(r).bubbles.map((b) => b.x);
    expect(xs.length).toBeGreaterThan(0);
    // A ends sit at x 100 and 200; B ends at 120 and 220.
    for (const x of xs) {
      expect(Math.min(Math.abs(x - 100), Math.abs(x - 200))).toBeLessThan(8);
    }
  });

  it("caps the live pool at poolSize", () => {
    const r = new Bubbles2DRenderer(seeded());
    const params = makeParams({ ambientSpawnRate: 10000, poolSize: 50 });
    for (let i = 0; i < 120; i++) r.render(makeCtx(), params, ALL_TIPS, 1 / 60);
    expect(r.count).toBeLessThanOrEqual(50);
    expect(r.count).toBeGreaterThan(40);
  });

  it("preserves a caller-owned non-identity transform", () => {
    const r = new Bubbles2DRenderer(seeded());
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

  it("bubbles from a still tip rise up the screen", () => {
    const r = new Bubbles2DRenderer(seeded());
    const params = makeParams({
      ambientSpawnRate: 30,
      motionEmission: 0,
      buoyancy: 1,
    });
    for (let i = 0; i < 30; i++) r.render(makeCtx(), params, ALL_TIPS, 1 / 60);
    const live = internals(r).bubbles.filter((b) => b.popping === 0);
    expect(live.length).toBeGreaterThan(0);
    for (const b of live) expect(b.vy).toBeLessThan(0);
    expect(Math.min(...live.map((b) => b.y))).toBeLessThan(95);
  });

  it("new bubbles carry part of a moving tip's swing, capped", () => {
    const r = new Bubbles2DRenderer(seeded());
    const params = makeParams({ ambientEmission: 0, motionEmission: 1 });
    // 10 px a frame at 60 fps: 600 px/s to the right.
    for (let i = 0; i < 12; i++) {
      r.render(makeCtx(), params, shiftTips(ALL_TIPS, i * 10), 1 / 60);
    }
    const vx = internals(r).bubbles.map((b) => b.vx);
    expect(vx.length).toBeGreaterThan(0);
    expect(vx.filter((v) => v > 5).length).toBeGreaterThan(vx.length / 2);
    // Capped at 0.8 world units/s, plus a little jitter.
    for (const v of vx) expect(v).toBeLessThan(0.8 * 60 + 3);
  });

  it("a tip that jumps across the stage does not fling bubbles", () => {
    const r = new Bubbles2DRenderer(seeded());
    const params = makeParams({ ambientEmission: 0, motionEmission: 1 });
    r.render(makeCtx(), params, ALL_TIPS, 1 / 60);
    r.render(makeCtx(), params, shiftTips(ALL_TIPS, 600), 1 / 60);
    r.render(makeCtx(), params, shiftTips(ALL_TIPS, 600), 1 / 60);
    for (const b of internals(r).bubbles) {
      expect(Math.abs(b.vx)).toBeLessThan(3);
    }
  });

  it("a mature film bursts, sheds droplets, and is gone a fifth of a second later", () => {
    const r = new Bubbles2DRenderer(seeded());
    const params = makeParams({ ambientEmission: 0, motionEmission: 0 });
    r.render(makeCtx(), makeParams({ ambientSpawnRate: 60 }), ALL_TIPS, 1 / 60);
    const view = internals(r);
    expect(view.bubbles.length).toBeGreaterThan(0);
    for (const b of view.bubbles) b.age = b.maxAge - 0.001;

    r.render(makeCtx(), params, [], 1 / 60);
    expect(view.bubbles.every((b) => b.popping === 1)).toBe(true);
    expect(view.flecks.length).toBeGreaterThan(0);

    for (let i = 0; i < 12; i++) r.render(makeCtx(), params, [], 1 / 60);
    expect(r.count).toBe(0);
  });

  it("a stalled frame resumes calmly instead of jumping", () => {
    const r = new Bubbles2DRenderer(seeded());
    r.render(makeCtx(), makeParams({ ambientSpawnRate: 60 }), ALL_TIPS, 1 / 60);
    const b = internals(r).bubbles[0]!;
    const y0 = b.y;
    r.render(makeCtx(), makeParams({ ambientEmission: 0 }), [], 2);
    // Two seconds at full rise would be far more; a stall steps 1/15 s.
    expect(Math.abs(b.y - y0)).toBeLessThan(Math.abs(b.vy) / 15 + 10);
  });

  it("draws big bubbles in front of small ones", () => {
    const r = new Bubbles2DRenderer(seeded());
    const params = makeParams({ ambientSpawnRate: 200, sizeJitter: 1 });
    for (let i = 0; i < 20; i++) r.render(makeCtx(), params, ALL_TIPS, 1 / 60);
    const sizes = internals(r).bubbles.map((b) => b.baseR);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]!);
    }
  });

  it("dispose resets state", () => {
    const r = new Bubbles2DRenderer(seeded());
    const params = makeParams();
    for (let i = 0; i < 20; i++) r.render(makeCtx(), params, ALL_TIPS, 1 / 60);
    expect(r.count).toBeGreaterThan(0);
    r.dispose();
    expect(r.count).toBe(0);
    expect(internals(r).flecks).toHaveLength(0);
    r.render(makeCtx(), params, ALL_TIPS, 1 / 60);
  });

  it("spawns from tunnel layer emitters (propIndex >= 2)", () => {
    const base = new Bubbles2DRenderer(seeded());
    const layered = new Bubbles2DRenderer(seeded());
    const params = makeParams({ ambientSpawnRate: 60, motionEmission: 0 });
    for (let i = 0; i < 30; i++) {
      base.render(makeCtx(), params, ALL_TIPS, 1 / 60);
      layered.render(makeCtx(), params, WITH_LAYER, 1 / 60);
    }
    expect(layered.count).toBeGreaterThan(base.count);
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
