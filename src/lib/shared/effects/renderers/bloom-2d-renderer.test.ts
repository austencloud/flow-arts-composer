import { describe, it, expect, vi } from "vitest";
import { Bloom2DRenderer, type BloomTipInput } from "./bloom-2d-renderer";
import type { Bloom2DParams } from "../translators/canvas2d-types";
import { BLOOM_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/bloom-presets.js";

interface FakeGradient {
  kind: "radial" | "linear";
  args: number[];
  stops: Array<{ offset: number; color: string }>;
  addColorStop: (offset: number, color: string) => void;
}

/** Fake Canvas2D context that records every gradient and transform. */
function makeCtx() {
  const radial: FakeGradient[] = [];
  const linear: FakeGradient[] = [];
  const fillRects: Array<{ x: number; y: number; w: number; h: number }> = [];
  const calls = {
    save: 0,
    restore: 0,
    fill: 0,
    scale: 0,
    rotations: [] as number[],
  };
  const gradient = (kind: FakeGradient["kind"], args: number[]) => {
    const g: FakeGradient = {
      kind,
      args,
      stops: [],
      addColorStop(offset, color) {
        g.stops.push({ offset, color });
      },
    };
    (kind === "radial" ? radial : linear).push(g);
    return g;
  };

  const ctx: any = {
    canvas: { width: 500, height: 500 },
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    fillStyle: "",
    save: vi.fn(() => calls.save++),
    restore: vi.fn(() => calls.restore++),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn((angle: number) => calls.rotations.push(angle)),
    scale: vi.fn(() => calls.scale++),
    fill: vi.fn(() => calls.fill++),
    createRadialGradient: vi.fn((...args: number[]) =>
      gradient("radial", args)
    ),
    createLinearGradient: vi.fn((...args: number[]) =>
      gradient("linear", args)
    ),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      fillRects.push({ x, y, w, h });
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
    radius: 40,
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

const DT = 1 / 60;

/** Alpha of an `rgba(r, g, b, a)` stop. */
function alphaOf(color: string): number {
  const m = /,\s*([\d.e-]+)\)\s*$/.exec(color);
  return m ? parseFloat(m[1]!) : NaN;
}

/** Sweep one tip along a horizontal line at `speed` px/s for `frames` frames. */
function sweep(
  renderer: Bloom2DRenderer,
  params: Bloom2DParams,
  frames: number,
  speed = 600,
  tip: Partial<BloomTipInput> = {}
) {
  let last = makeCtx();
  for (let f = 0; f < frames; f++) {
    last = makeCtx();
    renderer.render(
      last.ctx,
      params,
      [makeTip({ x: 60 + f * speed * DT, ...tip })],
      DT
    );
  }
  return last;
}

describe("Bloom2DRenderer", () => {
  it("draws nothing for an empty frame", () => {
    const { ctx, fillRects, calls } = makeCtx();
    new Bloom2DRenderer().render(ctx, makeParams(), [], DT);
    expect(fillRects).toHaveLength(0);
    expect(calls.fill).toBe(0);
  });

  it("lights a still tip with a colored halo and a white-hot core", () => {
    const { ctx, radial, linear } = makeCtx();
    new Bloom2DRenderer().render(
      ctx,
      makeParams({ spikes: 0 }),
      [makeTip()],
      DT
    );
    expect(radial).toHaveLength(2);
    expect(linear).toHaveLength(0);
    // The core is the tip color pushed most of the way to white.
    const core = radial[1]!.stops[0]!.color;
    expect(core).toMatch(/rgba\(2[2-5]\d, 2[2-5]\d, 2[2-5]\d,/);
  });

  it("can remove the white core without removing the halo", () => {
    const { ctx, radial } = makeCtx();
    new Bloom2DRenderer().render(
      ctx,
      makeParams({ coreStrength: 0, spikes: 0 }),
      [makeTip()],
      DT
    );
    expect(radial).toHaveLength(1);
  });

  describe("light path", () => {
    it("leaves no history behind a tip that holds still", () => {
      const r = new Bloom2DRenderer();
      let frame = makeCtx();
      for (let i = 0; i < 30; i++) {
        frame = makeCtx();
        r.render(
          frame.ctx,
          makeParams({ afterglow: 1, spikes: 0 }),
          [makeTip()],
          DT
        );
      }
      expect(frame.linear).toHaveLength(0);
      expect(frame.calls.fill).toBe(0);
    });

    it("traces a moving tip with a ribbon that dims and narrows with age", () => {
      const frame = sweep(new Bloom2DRenderer(), makeParams({ spikes: 0 }), 20);
      expect(frame.linear.length).toBeGreaterThan(5);
      const width = (g: FakeGradient) =>
        Math.hypot(g.args[2]! - g.args[0]!, g.args[3]! - g.args[1]!);
      const center = (g: FakeGradient) =>
        alphaOf(g.stops.find((s) => s.offset === 0.5)!.color);
      const newest = frame.linear[0]!;
      const oldest = frame.linear[frame.linear.length - 1]!;
      expect(center(newest)).toBeGreaterThan(center(oldest));
      expect(width(newest)).toBeGreaterThan(width(oldest));
    });

    it("has no history when afterglow is off", () => {
      const frame = sweep(
        new Bloom2DRenderer(),
        makeParams({ afterglow: 0 }),
        20
      );
      expect(frame.linear).toHaveLength(0);
    });

    it("expires after the afterglow lifetime once the tip stops", () => {
      const r = new Bloom2DRenderer();
      const params = makeParams({ afterglow: 0.5, spikes: 0 });
      sweep(r, params, 20);
      // Lifetime at 0.5 is 0.555 s; hold still for longer than that.
      let frame = makeCtx();
      for (let i = 0; i < 40; i++) {
        frame = makeCtx();
        r.render(frame.ctx, params, [makeTip({ x: 60 + 19 * 600 * DT })], DT);
      }
      expect(frame.linear).toHaveLength(0);
    });

    it("lasts longer with more afterglow", () => {
      const count = (afterglow: number) =>
        sweep(
          new Bloom2DRenderer(),
          makeParams({ afterglow, spikes: 0 }),
          50,
          300
        ).linear.length;
      expect(count(0.9)).toBeGreaterThan(count(0.2));
    });

    it("keeps fading a lifted tip's path instead of cutting it off", () => {
      const r = new Bloom2DRenderer();
      const params = makeParams({ spikes: 0 });
      sweep(r, params, 20);
      const lifted = makeCtx();
      r.render(lifted.ctx, params, [], DT);
      expect(lifted.linear.length).toBeGreaterThan(0);
      expect(lifted.radial).toHaveLength(0);
    });

    it("never draws light across a teleport (seek or loop seam)", () => {
      const r = new Bloom2DRenderer();
      const params = makeParams({ spikes: 0 });
      sweep(r, params, 10);
      const jumped = makeCtx();
      r.render(jumped.ctx, params, [makeTip({ x: 480, y: 480 })], DT);
      expect(jumped.linear).toHaveLength(0);
    });

    it("never stores the white core in the path", () => {
      const frame = sweep(
        new Bloom2DRenderer(),
        makeParams({ color: "#ff0000", streak: 1, spikes: 0 }),
        20
      );
      for (const g of frame.linear) {
        for (const stop of g.stops)
          expect(stop.color).not.toMatch(/rgba\(255, 255, 255/);
      }
    });

    it("thins long tunnel paths to a fixed drawing budget", () => {
      const r = new Bloom2DRenderer();
      const params = makeParams({ afterglow: 1, spikes: 0 });
      let frame = makeCtx();
      for (let f = 0; f < 60; f++) {
        frame = makeCtx();
        const tips = Array.from({ length: 24 }, (_, i) =>
          makeTip({
            tipIndex: i,
            propIndex: i >> 1,
            x: 20 + f * 6,
            y: 10 + i * 20,
          })
        );
        r.render(frame.ctx, params, tips, DT);
      }
      expect(frame.linear.length).toBeLessThanOrEqual(400);
    });
  });

  describe("falloff", () => {
    const haloStops = (falloff: Bloom2DParams["falloff"]) => {
      const { ctx, radial } = makeCtx();
      new Bloom2DRenderer().render(
        ctx,
        makeParams({ falloff, spikes: 0 }),
        [makeTip()],
        DT
      );
      return radial[0]!.stops.map((s) => [s.offset, alphaOf(s.color)] as const);
    };

    it("sharp falls off faster than smooth", () => {
      const at = (
        stops: ReadonlyArray<readonly [number, number]>,
        offset: number
      ) => stops.filter((s) => s[0] <= offset).pop()![1];
      expect(at(haloStops("sharp"), 0.5)).toBeLessThan(
        at(haloStops("smooth"), 0.5)
      );
    });

    it("renders a legacy ring value as the smooth halo", () => {
      expect(haloStops("ring")).toEqual(haloStops("smooth"));
    });
  });

  describe("color modes (halo center stop)", () => {
    const haloColor = (radial: FakeGradient[], i: number) =>
      radial[i]!.stops[0]!.color;

    it("solid uses params.color", () => {
      const { ctx, radial } = makeCtx();
      new Bloom2DRenderer().render(
        ctx,
        makeParams({ color: "#ff0000", spikes: 0 }),
        [makeTip()],
        DT
      );
      expect(haloColor(radial, 0)).toContain("255, 0, 0");
    });

    it("prop-matched uses each tip's resolved color, incl. tunnel layers", () => {
      const { ctx, radial } = makeCtx();
      new Bloom2DRenderer().render(
        ctx,
        makeParams({ colorMode: "prop-matched", spikes: 0 }),
        [
          makeTip({ propIndex: 0, color: "#0000ff" }),
          makeTip({
            propIndex: 1,
            color: "rgb(255, 0, 0)",
            x: 50,
            tipIndex: 1,
          }),
          makeTip({
            propIndex: 2,
            color: "hsl(120, 100%, 50%)",
            x: 80,
            tipIndex: 2,
          }),
        ],
        DT
      );
      expect(haloColor(radial, 0)).toContain("0, 0, 255");
      expect(haloColor(radial, 2)).toContain("255, 0, 0");
      expect(haloColor(radial, 4)).toContain("0, 255, 0");
    });

    it("palette cycles by tipIndex", () => {
      const { ctx, radial } = makeCtx();
      const palette = ["#ff0000", "#00ff00", "#0000ff"];
      new Bloom2DRenderer().render(
        ctx,
        makeParams({ colorMode: "palette", palette, spikes: 0 }),
        [makeTip({ tipIndex: 0 }), makeTip({ tipIndex: 1, x: 50 })],
        DT
      );
      expect(haloColor(radial, 0)).toContain("255, 0, 0");
      expect(haloColor(radial, 2)).toContain("0, 255, 0");
    });

    it("rainbow gives every tip its own hue at the same moment", () => {
      const { ctx, radial } = makeCtx();
      new Bloom2DRenderer().render(
        ctx,
        makeParams({ colorMode: "rainbow", spikes: 0 }),
        [
          makeTip({ tipIndex: 0 }),
          makeTip({ tipIndex: 1, x: 50 }),
          makeTip({ tipIndex: 2, x: 80 }),
        ],
        DT
      );
      const hues = new Set(
        [0, 2, 4].map((i) => haloColor(radial, i).replace(/, [\d.]+\)$/, ""))
      );
      expect(hues.size).toBe(3);
    });
  });

  describe("lens rays", () => {
    it("draws four tinted rays when spikes are on", () => {
      const { ctx, radial, calls } = makeCtx();
      new Bloom2DRenderer().render(
        ctx,
        makeParams({ spikes: 0.8, coreStrength: 0 }),
        [makeTip()],
        DT
      );
      // halo + four rays
      expect(radial).toHaveLength(5);
      expect(calls.scale).toBe(4);
      expect(radial[1]!.stops[0]!.color).not.toMatch(/rgba\(255, 255, 255/);
    });

    it("draws no rays when spikes are off", () => {
      const { ctx, calls } = makeCtx();
      new Bloom2DRenderer().render(
        ctx,
        makeParams({ spikes: 0 }),
        [makeTip()],
        DT
      );
      expect(calls.scale).toBe(0);
    });

    it("turn with the direction of travel", () => {
      const r = new Bloom2DRenderer();
      const params = makeParams({ streak: 0, afterglow: 0 });
      r.render(makeCtx().ctx, params, [makeTip({ x: 100, y: 100 })], DT);
      const right = makeCtx();
      r.render(right.ctx, params, [makeTip({ x: 110, y: 100 })], DT);
      const down = makeCtx();
      r.render(down.ctx, params, [makeTip({ x: 110, y: 110 })], DT);
      expect(right.calls.rotations[0]).toBeCloseTo(0, 5);
      expect(down.calls.rotations[0]).toBeCloseTo(Math.PI / 2, 5);
    });
  });

  describe("motion blade", () => {
    const bladeLength = (frame: ReturnType<typeof makeCtx>) =>
      (frame.ctx.scale as ReturnType<typeof vi.fn>).mock.calls[0]![0] as number;

    it("appears only once the tip moves, and grows with speed", () => {
      const params = makeParams({ spikes: 0, afterglow: 0, streak: 0.8 });
      const still = makeCtx();
      new Bloom2DRenderer().render(still.ctx, params, [makeTip()], DT);
      expect(still.calls.scale).toBe(0);

      const slow = bladeLength(sweep(new Bloom2DRenderer(), params, 12, 300));
      const fast = bladeLength(sweep(new Bloom2DRenderer(), params, 12, 900));
      expect(slow).toBeGreaterThan(0);
      expect(fast).toBeGreaterThan(slow);
    });

    it("reads speed per second, so frame rate does not change it", () => {
      const params = makeParams({ spikes: 0, afterglow: 0, streak: 0.8 });
      const lengthAt = (fps: number) => {
        const r = new Bloom2DRenderer();
        let frame = makeCtx();
        for (let f = 0; f < fps; f++) {
          frame = makeCtx();
          r.render(
            frame.ctx,
            params,
            [makeTip({ x: 60 + (f * 300) / fps })],
            1 / fps
          );
        }
        return bladeLength(frame);
      };
      expect(lengthAt(30)).toBeCloseTo(lengthAt(120), 0);
    });
  });

  it("gives every shipped preset its own look", () => {
    const signatures = new Map<string, string>();
    for (const preset of BLOOM_PRESETS) {
      const frame = sweep(
        new Bloom2DRenderer(),
        makeParams(preset.patch ?? {}),
        20
      );
      signatures.set(
        preset.name,
        [frame.radial.length, frame.calls.scale, frame.linear.length > 0].join(
          ":"
        )
      );
    }
    expect(new Set(signatures.values()).size).toBe(BLOOM_PRESETS.length);
    // Supernova: halo, four rays and a core, no path. Comet: blade and a path.
    expect(signatures.get("Supernova")).toBe("6:4:false");
    expect(signatures.get("Comet")).toBe("3:1:true");
    expect(signatures.get("Halo")).toBe("2:0:false");
  });

  it("honors the canvas scale", () => {
    const { ctx, fillRects } = makeCtx();
    new Bloom2DRenderer().render(
      ctx,
      makeParams({ radius: 100, spikes: 0 }),
      [makeTip()],
      DT,
      0.5
    );
    expect(fillRects[0]!.w).toBe(100);
    expect(fillRects[0]!.h).toBe(100);
  });

  describe("intensity", () => {
    const haloCenter = (
      intensity: number,
      tips: BloomTipInput[] = [makeTip()]
    ) => {
      const { ctx, radial } = makeCtx();
      new Bloom2DRenderer().render(
        ctx,
        makeParams({ intensity, spikes: 0 }),
        tips,
        DT
      );
      return alphaOf(radial[0]!.stops[0]!.color);
    };

    it("is monotonic and still blows out at full", () => {
      expect(haloCenter(0.25)).toBeLessThan(haloCenter(0.5));
      expect(haloCenter(0.5)).toBeLessThan(haloCenter(1));
      expect(haloCenter(1)).toBeCloseTo(1, 5);
    });

    it("keeps the middle of the slider well below full", () => {
      expect(haloCenter(0.5)).toBeGreaterThan(0.3);
      expect(haloCenter(0.5)).toBeLessThan(0.6);
    });

    it("shares exposure across props so more props do not wash out", () => {
      const four = [0, 1, 2, 3].map((i) =>
        makeTip({ tipIndex: i * 2, propIndex: i })
      );
      expect(haloCenter(0.8, four)).toBeLessThan(haloCenter(0.8));
    });
  });

  it("is driven by dt, not the wall clock", () => {
    const run = () => {
      const r = new Bloom2DRenderer();
      const stops: string[] = [];
      for (let f = 0; f < 20; f++) {
        const frame = makeCtx();
        r.render(
          frame.ctx,
          makeParams({ colorMode: "rainbow", pulse: 0.8 }),
          [
            makeTip({ x: 60 + f * 10 }),
            makeTip({ tipIndex: 1, x: 300 - f * 10 }),
          ],
          DT
        );
        for (const g of [...frame.radial, ...frame.linear]) {
          stops.push(...g.stops.map((s) => s.color));
        }
      }
      return stops;
    };
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const first = run();
    now.mockReturnValue(123456);
    const second = run();
    now.mockRestore();
    expect(second).toEqual(first);
  });

  it("draws additively and balances save/restore", () => {
    const frame = sweep(new Bloom2DRenderer(), makeParams(), 10);
    expect(frame.ctx.globalCompositeOperation).toBe("lighter");
    expect(frame.calls.save).toBe(frame.calls.restore);
  });

  it("dispose clears tracked state", () => {
    const r = new Bloom2DRenderer();
    sweep(r, makeParams(), 10);
    r.dispose();
    const frame = makeCtx();
    r.render(frame.ctx, makeParams({ spikes: 0 }), [makeTip({ x: 400 })], DT);
    expect(frame.linear).toHaveLength(0);
  });
});
