import { describe, it, expect, vi } from "vitest";
import { Zap2DRenderer } from "./zap-2d-renderer";
import type { Zap2DParams } from "../translators/canvas2d-types";
import type { EmitterTip } from "./emitter-tip";
import { resolveZap2D } from "../translators/canvas2d-translator";
import { DEFAULT_EFFECTS_CONFIG } from "../domain/defaults";

type Pt = { x: number; y: number };

/** A recording 2D context: every stroked path, its style, and gradient stops. */
function makeCtx() {
  const paths: {
    points: Pt[];
    style: unknown;
    width: number;
    alpha: number;
  }[] = [];
  const colorStops: string[] = [];
  const shadowBlurs: number[] = [];
  let current: Pt[] = [];
  const state = { strokeStyle: "" as unknown, lineWidth: 1, globalAlpha: 1 };
  const grad = () => ({
    addColorStop: vi.fn((_: number, c: string) => colorStops.push(c)),
  });
  const ctx: any = {
    globalCompositeOperation: "source-over",
    fillStyle: "",
    lineCap: "butt",
    lineJoin: "miter",
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(() => {
      current = [];
    }),
    moveTo: vi.fn((x: number, y: number) => current.push({ x, y })),
    lineTo: vi.fn((x: number, y: number) => current.push({ x, y })),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(() =>
      paths.push({
        points: [...current],
        style: state.strokeStyle,
        width: state.lineWidth,
        alpha: state.globalAlpha,
      })
    ),
    createLinearGradient: vi.fn(grad),
    createRadialGradient: vi.fn(grad),
  };
  for (const key of ["strokeStyle", "lineWidth", "globalAlpha"] as const) {
    Object.defineProperty(ctx, key, {
      get: () => state[key],
      set: (v) => {
        (state as Record<string, unknown>)[key] = v;
      },
    });
  }
  Object.defineProperty(ctx, "shadowBlur", {
    get: () => 0,
    set: (v: number) => shadowBlurs.push(v),
  });
  return {
    ctx: ctx as CanvasRenderingContext2D,
    paths,
    colorStops,
    shadowBlurs,
  };
}

function makeParams(overrides: Partial<Zap2DParams> = {}): Zap2DParams {
  return resolveZap2D({ ...DEFAULT_EFFECTS_CONFIG.zap, ...overrides });
}

function emit(
  p: Pt,
  propIndex: number,
  tipIndex: number,
  color: string
): EmitterTip {
  return { ...p, propIndex, tipIndex, end: tipIndex === 0 ? "A" : "B", color };
}

const BLUE = "#2563eb";
const RED = "#dc2626";

/** One base circuit: blue end A to red end A. */
const pair = (dx = 0): EmitterTip[] => [
  emit({ x: 100 + dx, y: 100 }, 0, 0, BLUE),
  emit({ x: 300 + dx, y: 100 }, 1, 0, RED),
];

/** White-hot main channels (33 points): not forks, twigs or tip crackle. */
const cores = (paths: ReturnType<typeof makeCtx>["paths"]) =>
  paths.filter((p) => p.style === "#ffffff" && p.points.length > 30);

describe("Zap2DRenderer", () => {
  it("draws nothing when there are no emitters", () => {
    const { ctx, paths } = makeCtx();
    new Zap2DRenderer().render(ctx, makeParams(), [], 1 / 60);
    expect(paths).toHaveLength(0);
  });

  it("never pays for shadowBlur", () => {
    for (const style of ["branching", "plasma", "web"] as const) {
      const r = new Zap2DRenderer();
      const { ctx, shadowBlurs } = makeCtx();
      for (let i = 0; i < 10; i++)
        r.render(ctx, makeParams({ style }), pair(), 1 / 60);
      expect(
        shadowBlurs.filter((b) => b > 0),
        style
      ).toHaveLength(0);
    }
  });

  describe("Storm", () => {
    it("strikes a jagged white-hot bolt between a blue and red pair", () => {
      const { ctx, paths } = makeCtx();
      new Zap2DRenderer().render(ctx, makeParams(), pair(), 1 / 60);
      const bolt = cores(paths)[0];
      expect(bolt).toBeDefined();
      expect(bolt!.points[0]).toEqual({ x: 100, y: 100 });
      expect(bolt!.points.at(-1)).toEqual({ x: 300, y: 100 });
      expect(bolt!.points.some((p) => Math.abs(p.y - 100) > 4)).toBe(true);
    });

    it("draws a bolt per tunnel layer pair", () => {
      const { ctx, paths } = makeCtx();
      new Zap2DRenderer().render(
        ctx,
        makeParams({ branching: 0 }),
        [
          ...pair(),
          emit({ x: 120, y: 300 }, 2, 0, BLUE),
          emit({ x: 320, y: 300 }, 3, 0, RED),
        ],
        1 / 60
      );
      const starts = new Set(
        cores(paths).map((p) => `${p.points[0]!.x},${p.points[0]!.y}`)
      );
      expect(starts).toEqual(new Set(["100,100", "120,300"]));
    });

    it("keeps a strike's shape while the props carry it", () => {
      const r = new Zap2DRenderer();
      const params = makeParams({ frequency: 1 });
      const first = makeCtx();
      r.render(first.ctx, params, pair(), 1 / 60);
      // No time passes, so no new strike: the same bolt, carried 50px right.
      const moved = makeCtx();
      r.render(moved.ctx, params, pair(50), 0);
      const a = cores(first.paths)[0]!.points;
      const b = cores(moved.paths)[0]!.points;
      expect(b).toHaveLength(a.length);
      b.forEach((p, i) => {
        expect(p.x).toBeCloseTo(a[i]!.x + 50);
        expect(p.y).toBeCloseTo(a[i]!.y);
      });
    });

    it("blends from one prop's color to the other's by default", () => {
      const { ctx, colorStops } = makeCtx();
      new Zap2DRenderer().render(ctx, makeParams(), pair(), 1 / 60);
      expect(colorStops).toContain(BLUE);
      expect(colorStops).toContain(RED);
    });

    it("uses the chosen colors in Custom mode", () => {
      const { ctx, colorStops } = makeCtx();
      new Zap2DRenderer().render(
        ctx,
        makeParams({
          colorMode: "custom",
          leftColor: "#00ff00",
          rightColor: "#ff00ff",
        }),
        pair(),
        1 / 60
      );
      expect(colorStops).toContain("#00ff00");
      expect(colorStops).toContain("#ff00ff");
      expect(colorStops).not.toContain(BLUE);
    });

    it("strikes as often over three seconds at 30 fps as at 120 fps", () => {
      // Each strike keeps one shape for its whole life, so distinct shapes
      // count strikes however many frames sample them.
      const strikesIn = (fps: number) => {
        const r = new Zap2DRenderer();
        const params = makeParams({ frequency: 8 });
        const shapes = new Set<string>();
        for (let i = 0; i < fps * 3; i++) {
          const { ctx, paths } = makeCtx();
          r.render(ctx, params, pair(), 1 / fps);
          for (const bolt of cores(paths)) {
            const mid = bolt.points[16]!;
            shapes.add(`${mid.x.toFixed(2)},${mid.y.toFixed(2)}`);
          }
        }
        return shapes.size;
      };
      const slow = strikesIn(30);
      const fast = strikesIn(120);
      expect(slow).toBeGreaterThan(5);
      expect(Math.abs(slow - fast)).toBeLessThanOrEqual(
        Math.max(3, slow * 0.25)
      );
    });
  });

  describe("Plasma", () => {
    it("writhes smoothly, faster with Wobble Rate", () => {
      const travel = (wobbleRate: number) => {
        const r = new Zap2DRenderer();
        const params = makeParams({
          style: "plasma",
          wobbleRate,
          frequency: 1,
        });
        let previous: Pt[] | null = null;
        let total = 0;
        let worst = 0;
        for (let f = 0; f < 30; f++) {
          const { ctx, paths } = makeCtx();
          r.render(ctx, params, pair(), 1 / 60);
          // The first colored filament stroke of the frame.
          const filament = paths.find(
            (p) => p.style !== "#ffffff" && p.points.length > 20
          )!;
          const mid = filament.points[Math.floor(filament.points.length / 2)]!;
          if (previous) {
            const before = previous[Math.floor(previous.length / 2)]!;
            const step = Math.hypot(mid.x - before.x, mid.y - before.y);
            total += step;
            worst = Math.max(worst, step);
          }
          previous = filament.points;
        }
        return { total, worst };
      };
      const slow = travel(0.05);
      const fast = travel(1);
      expect(fast.total).toBeGreaterThan(slow.total * 2);
      expect(fast.worst).toBeLessThan(20);
    });

    it("throws sparks when a filament snaps", () => {
      const r = new Zap2DRenderer();
      let sparks = 0;
      for (let f = 0; f < 30; f++) {
        const { ctx, paths } = makeCtx();
        r.render(
          ctx,
          makeParams({ style: "plasma", frequency: 20 }),
          pair(),
          1 / 60
        );
        sparks += paths.filter((p) => p.points.length === 2).length;
      }
      expect(sparks).toBeGreaterThan(0);
    });
  });

  describe("Web", () => {
    it("threads every pair of a performer's tips", () => {
      const tips = [
        emit({ x: 100, y: 100 }, 0, 0, BLUE),
        emit({ x: 150, y: 200 }, 0, 1, BLUE),
        emit({ x: 300, y: 120 }, 1, 0, RED),
        emit({ x: 280, y: 220 }, 1, 1, RED),
      ];
      const { ctx, paths } = makeCtx();
      new Zap2DRenderer().render(
        ctx,
        makeParams({ style: "web" }),
        tips,
        1 / 60
      );
      const threads = new Set(
        paths
          .filter((p) => p.points.length === 2)
          .map((p) =>
            p.points
              .map((q) => `${q.x},${q.y}`)
              .sort()
              .join("|")
          )
      );
      expect(threads.size).toBe(6);
    });
  });

  it("a lone tip still crackles", () => {
    const { ctx, paths } = makeCtx();
    new Zap2DRenderer().render(
      ctx,
      makeParams(),
      [emit({ x: 50, y: 50 }, 0, 0, BLUE)],
      1 / 60
    );
    expect(paths.length).toBeGreaterThan(0);
    expect(cores(paths)).toHaveLength(0);
  });

  it("scale=2 doubles every stroke width", () => {
    const a = makeCtx();
    new Zap2DRenderer().render(a.ctx, makeParams(), pair(), 1 / 60, 1);
    const b = makeCtx();
    new Zap2DRenderer().render(b.ctx, makeParams(), pair(), 1 / 60, 2);
    expect(b.paths).toHaveLength(a.paths.length);
    a.paths.forEach((p, i) =>
      expect(b.paths[i]!.width).toBeCloseTo(p.width * 2)
    );
  });

  it("dispose resets state without throwing", () => {
    const r = new Zap2DRenderer();
    r.render(makeCtx().ctx, makeParams(), pair(), 1 / 60);
    expect(() => r.dispose()).not.toThrow();
  });
});
