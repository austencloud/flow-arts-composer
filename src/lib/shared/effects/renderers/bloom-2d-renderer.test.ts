import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Bloom2DRenderer, type BloomTipInput } from "./bloom-2d-renderer";
import type { Bloom2DParams } from "../translators/canvas2d-types";
import { BLOOM_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/bloom-presets.js";

interface GradientStop {
  offset: number;
  color: string;
}

interface FakeGradient {
  kind: "radial" | "linear";
  stops: GradientStop[];
  addColorStop: (offset: number, color: string) => void;
}

function makeGradient(kind: "radial" | "linear"): FakeGradient {
  const stops: GradientStop[] = [];
  return {
    kind,
    stops,
    addColorStop(offset: number, color: string) {
      stops.push({ offset, color });
    },
  };
}

/**
 * Fake Canvas2D context with no `canvas` property, so the renderer can't
 * allocate an offscreen accumulation buffer and takes its direct-draw fallback
 * - the same lens-bloom layers minus the persistent afterglow. That's also the
 * path jsdom exercises in CI (no 2D backend for an offscreen canvas).
 */
function makeCtx() {
  const radial: FakeGradient[] = [];
  const linear: FakeGradient[] = [];
  const fillRects: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    fill: unknown;
  }> = [];
  const calls = {
    translate: 0,
    rotate: 0,
    rotations: [] as number[],
    scale: 0,
    stroke: 0,
    fill: 0,
    drawImage: 0,
  };

  const ctx: any = {
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    translate: vi.fn(() => {
      calls.translate++;
    }),
    rotate: vi.fn((angle: number) => {
      calls.rotate++;
      calls.rotations.push(angle);
    }),
    scale: vi.fn(() => {
      calls.scale++;
    }),
    stroke: vi.fn(() => {
      calls.stroke++;
    }),
    fill: vi.fn(() => {
      calls.fill++;
    }),
    drawImage: vi.fn(() => {
      calls.drawImage++;
    }),
    createRadialGradient: vi.fn(() => {
      const g = makeGradient("radial");
      radial.push(g);
      return g;
    }),
    createLinearGradient: vi.fn(() => {
      const g = makeGradient("linear");
      linear.push(g);
      return g;
    }),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      fillRects.push({ x, y, w, h, fill: ctx.fillStyle });
    }),
  };
  return {
    ctx: ctx as CanvasRenderingContext2D,
    radial,
    linear,
    fillRects,
    calls,
  };
}

function makeParams(overrides: Partial<Bloom2DParams> = {}): Bloom2DParams {
  return {
    intensity: 0.8,
    coreStrength: 0.45,
    radius: 90,
    color: "#f472b6",
    palette: ["#f472b6", "#fbbf24", "#22d3ee"],
    colorMode: "solid",
    falloff: "smooth",
    pulse: 0,
    pulseRate: 1,
    streak: 0.55,
    spikes: 0.6,
    afterglow: 0.5,
    blendMode: "lighter",
    ...overrides,
  };
}

function makeTip(overrides: Partial<BloomTipInput> = {}): BloomTipInput {
  return {
    x: 100,
    y: 150,
    propIndex: 0,
    tipIndex: 0,
    color: "#3b82f6",
    ...overrides,
  };
}

describe("Bloom2DRenderer (lens bloom)", () => {
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    nowSpy = vi.spyOn(performance, "now").mockReturnValue(0);
  });
  afterEach(() => {
    nowSpy.mockRestore();
  });

  it("does not draw when tips array is empty", () => {
    const r = new Bloom2DRenderer();
    const { ctx, fillRects } = makeCtx();
    r.render(ctx, makeParams(), []);
    expect(fillRects).toHaveLength(0);
  });

  it("draws a colored halo + white core per tip (2 radial gradients each)", () => {
    const r = new Bloom2DRenderer();
    const { ctx, radial } = makeCtx();
    // The two gradients are the colored halo and its white source.
    r.render(ctx, makeParams({ spikes: 0 }), [makeTip()]);
    expect(radial).toHaveLength(2);
  });

  it("can remove the white source without removing the colored halo", () => {
    const r = new Bloom2DRenderer();
    const { ctx, radial } = makeCtx();
    r.render(ctx, makeParams({ coreStrength: 0, spikes: 0 }), [makeTip()]);
    expect(radial).toHaveLength(1);
  });

  it("keeps stationary light and the white core out of afterglow history", () => {
    const r = new Bloom2DRenderer();
    const main = makeCtx();
    const accumulation = makeCtx();
    (
      main.ctx as unknown as {
        canvas: { width: number; height: number };
      }
    ).canvas = {
      width: 400,
      height: 300,
    };
    class FakeOffscreenCanvas {
      constructor(
        public width: number,
        public height: number
      ) {}
      getContext() {
        return accumulation.ctx;
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);

    try {
      const params = makeParams({
        afterglow: 0.9,
        streak: 0,
        spikes: 0,
      });
      r.render(main.ctx, params, [makeTip()]);
      r.render(main.ctx, params, [makeTip()]);

      expect(accumulation.radial).toHaveLength(0);
      expect(main.radial).toHaveLength(4);
      expect(main.calls.drawImage).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stores one moving colored halo in history, never a white core", () => {
    const r = new Bloom2DRenderer();
    const main = makeCtx();
    const accumulation = makeCtx();
    (
      main.ctx as unknown as {
        canvas: { width: number; height: number };
      }
    ).canvas = {
      width: 400,
      height: 300,
    };
    class FakeOffscreenCanvas {
      constructor(
        public width: number,
        public height: number
      ) {}
      getContext() {
        return accumulation.ctx;
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);

    try {
      const params = makeParams({
        afterglow: 0.9,
        streak: 0,
        spikes: 0,
      });
      r.render(main.ctx, params, [makeTip({ x: 100 })]);
      r.render(main.ctx, params, [makeTip({ x: 140 })]);

      expect(accumulation.radial).toHaveLength(1);
      expect(main.radial).toHaveLength(4);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe("falloff strategies (halo is the first radial gradient)", () => {
    it("smooth halo has stops at 0, 0.4, 1", () => {
      const r = new Bloom2DRenderer();
      const { ctx, radial } = makeCtx();
      r.render(ctx, makeParams({ falloff: "smooth", spikes: 0 }), [makeTip()]);
      expect(radial[0]!.stops.map((s) => s.offset)).toEqual([0, 0.4, 1]);
    });

    it("sharp halo has stops at 0, 0.15, 0.6, 1", () => {
      const r = new Bloom2DRenderer();
      const { ctx, radial } = makeCtx();
      r.render(ctx, makeParams({ falloff: "sharp", spikes: 0 }), [makeTip()]);
      expect(radial[0]!.stops.map((s) => s.offset)).toEqual([0, 0.15, 0.6, 1]);
    });

    it("renders a legacy ring value as the smooth halo", () => {
      const r = new Bloom2DRenderer();
      const { ctx, radial } = makeCtx();
      r.render(ctx, makeParams({ falloff: "ring", spikes: 0 }), [makeTip()]);
      expect(radial[0]!.stops.map((s) => s.offset)).toEqual([0, 0.4, 1]);
    });
  });

  describe("color modes (halo center stop)", () => {
    it("solid uses params.color", () => {
      const r = new Bloom2DRenderer();
      const { ctx, radial } = makeCtx();
      r.render(
        ctx,
        makeParams({ colorMode: "solid", color: "#ff0000", spikes: 0 }),
        [makeTip()]
      );
      expect(radial[0]!.stops[0]!.color.toLowerCase()).toContain("255, 0, 0");
    });

    it("prop-matched uses each tip's resolved color, incl. tunnel layers (propIndex >= 2)", () => {
      const r = new Bloom2DRenderer();
      const { ctx, radial } = makeCtx();
      r.render(ctx, makeParams({ colorMode: "prop-matched", spikes: 0 }), [
        makeTip({ propIndex: 0, color: "#0000ff" }),
        makeTip({ propIndex: 1, color: "#ff0000", x: 50, tipIndex: 1 }),
        // Tunnel copy: propIndex 2 used to collapse to red via `=== 0`; now its
        // own resolved color (green) must come through.
        makeTip({ propIndex: 2, color: "#00ff00", x: 80, tipIndex: 2 }),
      ]);
      // each tip → halo+core; halos land at radial[0], radial[2], radial[4].
      expect(radial[0]!.stops[0]!.color.toLowerCase()).toContain("0, 0, 255");
      expect(radial[2]!.stops[0]!.color.toLowerCase()).toContain("255, 0, 0");
      expect(radial[4]!.stops[0]!.color.toLowerCase()).toContain("0, 255, 0");
    });

    it("palette cycles by tipIndex", () => {
      const r = new Bloom2DRenderer();
      const { ctx, radial } = makeCtx();
      const palette = ["#ff0000", "#00ff00", "#0000ff"];
      r.render(ctx, makeParams({ colorMode: "palette", palette, spikes: 0 }), [
        makeTip({ tipIndex: 0 }),
        makeTip({ tipIndex: 1, x: 50 }),
      ]);
      expect(radial[0]!.stops[0]!.color.toLowerCase()).toContain("255, 0, 0");
      expect(radial[2]!.stops[0]!.color.toLowerCase()).toContain("0, 255, 0");
    });

    it("rainbow produces hsla output", () => {
      const r = new Bloom2DRenderer();
      const { ctx, radial } = makeCtx();
      r.render(ctx, makeParams({ colorMode: "rainbow", spikes: 0 }), [
        makeTip(),
      ]);
      expect(radial[0]!.stops[0]!.color.toLowerCase()).toContain("hsla");
    });
  });

  describe("diffraction spikes", () => {
    it("spikes>0 draws 8 stroked spike lines (linear gradients)", () => {
      const r = new Bloom2DRenderer();
      const { ctx, linear, calls } = makeCtx();
      r.render(ctx, makeParams({ spikes: 0.8 }), [makeTip()]);
      expect(linear).toHaveLength(8);
      expect(calls.stroke).toBe(8);
    });

    it("spikes=0 draws no spike lines", () => {
      const r = new Bloom2DRenderer();
      const { ctx, linear, calls } = makeCtx();
      r.render(ctx, makeParams({ spikes: 0 }), [makeTip()]);
      expect(linear).toHaveLength(0);
      expect(calls.stroke).toBe(0);
    });
  });

  describe("motion reactivity", () => {
    it("frame 1 (no velocity) draws no streak transform; frame 2 (moved) does", () => {
      const r = new Bloom2DRenderer();
      const params = makeParams({ spikes: 0, streak: 0.8 });

      // Frame 1 has no velocity streak.
      const f1 = makeCtx();
      r.render(f1.ctx, params, [makeTip({ x: 100, y: 150, tipIndex: 0 })]);
      expect(f1.calls.scale).toBe(0); // streak uses scale(); none on first frame
      expect(f1.linear).toHaveLength(0);

      // Frame 2: the same tip moved, so the anamorphic streak appears.
      const f2 = makeCtx();
      r.render(f2.ctx, params, [makeTip({ x: 180, y: 150, tipIndex: 0 })]);
      expect(f2.calls.scale).toBeGreaterThan(0); // anamorphic streak fired
      expect(f2.calls.translate).toBeGreaterThan(0);
      expect(f2.linear).toHaveLength(0);
    });
  });

  it("renders a different dominant layer structure for every shipped preset", () => {
    const signatures = new Map<string, string>();

    for (const preset of BLOOM_PRESETS) {
      const renderer = new Bloom2DRenderer();
      const params = makeParams(preset.patch ?? {});
      const initial = makeCtx();
      renderer.render(initial.ctx, params, [makeTip({ x: 100 })]);
      const moving = makeCtx();
      renderer.render(moving.ctx, params, [makeTip({ x: 200 })]);
      signatures.set(
        preset.name,
        [moving.radial.length, moving.linear.length, moving.calls.scale].join(
          ":"
        )
      );
    }

    expect(Object.fromEntries(signatures)).toEqual({
      Supernova: "2:8:0",
      Comet: "3:0:1",
      Halo: "2:0:0",
    });
  });

  describe("scale parameter", () => {
    it("halo fillRect side = radius*scale*2", () => {
      const r = new Bloom2DRenderer();
      const { ctx, fillRects } = makeCtx();
      r.render(ctx, makeParams({ radius: 100, spikes: 0 }), [makeTip()], 0.5);
      // coreR = 100 * 0.5 = 50; halo fillRect side = 100. Halo is the first rect.
      expect(fillRects[0]!.w).toBe(100);
      expect(fillRects[0]!.h).toBe(100);
    });
  });

  describe("intensity response curve (perceptual gamma, not linear alpha)", () => {
    // Halo center stop = withAlpha(color, baseAlpha). Parse the trailing alpha
    // out of `rgba(r, g, b, a)` to read the rendered brightness.
    const haloCenterAlpha = (radial: FakeGradient[]): number => {
      const m = /,\s*([\d.]+)\)\s*$/.exec(radial[0]!.stops[0]!.color);
      return m ? parseFloat(m[1]!) : NaN;
    };

    it("midpoint slider renders well below linear (medium ≈ 16%, not 50%)", () => {
      const r = new Bloom2DRenderer();
      const { ctx, radial } = makeCtx();
      r.render(ctx, makeParams({ intensity: 0.5, pulse: 0, spikes: 0 }), [
        makeTip(),
      ]);
      const a = haloCenterAlpha(radial);
      expect(a).toBeGreaterThan(0.1);
      expect(a).toBeLessThan(0.25); // the whole point: NOT 0.5
    });

    it("full slider still reaches full blowout (alpha 1.0)", () => {
      const r = new Bloom2DRenderer();
      const { ctx, radial } = makeCtx();
      r.render(ctx, makeParams({ intensity: 1, pulse: 0, spikes: 0 }), [
        makeTip(),
      ]);
      expect(haloCenterAlpha(radial)).toBeCloseTo(1, 2);
    });

    it("is monotonic: 25% < 50% < 100%", () => {
      const read = (intensity: number) => {
        const r = new Bloom2DRenderer();
        const { ctx, radial } = makeCtx();
        r.render(ctx, makeParams({ intensity, pulse: 0, spikes: 0 }), [
          makeTip(),
        ]);
        return haloCenterAlpha(radial);
      };
      const lo = read(0.25);
      const mid = read(0.5);
      const hi = read(1);
      expect(lo).toBeLessThan(mid);
      expect(mid).toBeLessThan(hi);
    });
  });

  it("uses additive blend and balances save/restore", () => {
    const r = new Bloom2DRenderer();
    const { ctx } = makeCtx();
    r.render(ctx, makeParams(), [makeTip()]);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it("dispose clears tracked state without throwing", () => {
    const r = new Bloom2DRenderer();
    const { ctx } = makeCtx();
    r.render(ctx, makeParams(), [makeTip()]);
    expect(() => r.dispose()).not.toThrow();
  });
});
