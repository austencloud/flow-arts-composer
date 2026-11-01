import { describe, expect, it } from "vitest";
import {
  composeFrame,
  createFrameState,
  cumulativeLengths,
  headAt,
  overtureColors,
  overtureLayout,
  pointAt,
  preparePath,
  prepareScene,
  type FrameView,
  type OvertureContext,
  type OvertureOverlapLayers,
  type OverturePoint,
  type OvertureScene,
} from "./overture-trace";

/** A canvas stand-in that records strokes, fills, rect fills, images and text. */
function recordingContext() {
  const strokes: { width: number; style: unknown; points: number }[] = [];
  const texts: string[] = [];
  const rects: { style: unknown; op: string }[] = [];
  const images: { image: unknown; op: string; alpha: number }[] = [];
  let points = 0;
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    lineCap: "",
    lineJoin: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    shadowColor: "",
    shadowBlur: 0,
    save() {},
    restore() {},
    setTransform() {},
    clearRect() {},
    fillRect() {
      rects.push({ style: ctx.fillStyle, op: ctx.globalCompositeOperation });
    },
    drawImage(image: unknown) {
      images.push({
        image,
        op: ctx.globalCompositeOperation,
        alpha: ctx.globalAlpha,
      });
    },
    translate() {},
    rotate() {},
    scale() {},
    beginPath() {
      points = 0;
    },
    moveTo() {
      points = 1;
    },
    lineTo() {
      points++;
    },
    arc() {},
    stroke() {
      strokes.push({ width: ctx.lineWidth, style: ctx.strokeStyle, points });
    },
    fill() {},
    fillText(text: string) {
      texts.push(text);
    },
    measureText: (text: string) => ({ width: 10 * text.length }),
    createRadialGradient: () => ({ addColorStop() {} }),
  } satisfies OvertureContext;
  return { ctx, strokes, texts, rects, images };
}

/** Two recording masks standing in for the worker's OffscreenCanvases. */
function overlapLayers() {
  const left = recordingContext();
  const right = recordingContext();
  const layers: OvertureOverlapLayers = {
    left: { canvas: "left-canvas", ctx: left.ctx },
    right: { canvas: "right-canvas", ctx: right.ctx },
    width: 800,
    height: 600,
  };
  return { layers, left, right };
}

/** A two-hand scene whose right line runs parallel to the left, 5 units down. */
function twoHandScene(): OvertureScene {
  const scene = lineScene(["A", "B"], 2);
  scene.right = [scene.left[0]!.map(([x, y]) => [x, y + 5] as OverturePoint)];
  return scene;
}

/** A straight-line scene: each beat is `spb` segments of one unit. */
function lineScene(letters: string[], unit: number, spb = 4): OvertureScene {
  const n = letters.length * spb + 1;
  const path: OverturePoint[] = Array.from({ length: n }, (_, i) => [
    i - 40,
    0,
  ]);
  return {
    v: 1,
    word: letters.join(""),
    letters,
    unit,
    beats: letters.length,
    left: [path],
    right: [],
  };
}

function view(overrides: Partial<FrameView> = {}): FrameView {
  return {
    width: 800,
    height: 600,
    dpr: 1,
    surface: "dark",
    layout: overtureLayout(800, 600),
    alpha: 1,
    zoom: 1,
    rotation: 0,
    flare: 0,
    sparks: false,
    fontFamily: "TKA",
    ...overrides,
  };
}

describe("path math", () => {
  const square: OverturePoint[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];

  it("running lengths only grow", () => {
    const cum = cumulativeLengths(square);
    expect(cum).toEqual([0, 10, 20, 30, 40]);
  });

  it("pointAt finds both ends and the middle by arc length", () => {
    const path = preparePath(square);
    expect(pointAt(path, 0)).toMatchObject({ x: 0, y: 0 });
    expect(pointAt(path, 1)).toMatchObject({ x: 0, y: 0, i: 4 });
    expect(pointAt(path, 0.5)).toMatchObject({ x: 10, y: 10 });
    expect(pointAt(path, 0.125)).toMatchObject({ x: 5, y: 0, tx: 1, ty: 0 });
  });

  it("with beats, each beat ends exactly at its fraction even when lengths differ", () => {
    // Beat 1 is 2 units long, beat 2 is 20: plain arc length would put the
    // beat boundary at t = 1/11, beat timing puts it at 1/2.
    const uneven: OverturePoint[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [12, 0],
      [22, 0],
    ];
    const path = preparePath(uneven, 2);
    expect(pointAt(path, 0.5).x).toBeCloseTo(2);
    expect(pointAt(path, 0.75).x).toBeCloseTo(12);
  });

  it("headAt keeps the head moving past 1 with no jump: laps a closed line", () => {
    const path = preparePath(square);
    expect(path.closed).toBe(true);
    let prev = headAt(path, 0.9).point;
    for (let p = 0.904; p <= 3.2; p += 0.004) {
      const { point } = headAt(path, p);
      // 0.004 of a 40-unit square is 0.16 units: every step moves, none jumps.
      const step = Math.hypot(point.x - prev.x, point.y - prev.y);
      expect(step).toBeGreaterThan(0.05);
      expect(step).toBeLessThan(0.3);
      prev = point;
    }
    expect(headAt(path, 1.5).point).toMatchObject({ x: 10, y: 10 });
  });

  it("headAt runs an open line back and forth instead of jumping to its start", () => {
    const open: OverturePoint[] = [
      [0, 0],
      [10, 0],
      [20, 0],
    ];
    const path = preparePath(open);
    expect(path.closed).toBe(false);
    expect(headAt(path, 1.25)).toMatchObject({ t: 0.75, back: true });
    expect(headAt(path, 1.25).point.tx).toBe(-1);
    expect(headAt(path, 2.25)).toMatchObject({ t: 0.25, back: false });
    let prev = headAt(path, 0.95).point.x;
    for (let p = 0.954; p <= 4; p += 0.004) {
      const x = headAt(path, p).point.x;
      expect(Math.abs(x - prev)).toBeLessThan(0.1);
      prev = x;
    }
  });
});

describe("composeFrame", () => {
  it("strokes every glow pass before any crisp pass, traced to p", () => {
    const scene = lineScene(["A", "B"], 2);
    scene.right = [scene.left[0]!.map(([x, y]) => [x, y + 5] as OverturePoint)];
    const { ctx, strokes } = recordingContext();
    composeFrame(
      ctx,
      prepareScene(scene, "dark"),
      0.4,
      0,
      view(),
      createFrameState()
    );
    // Two tips: two glow strokes (thick), then two crisp (thin), then trails.
    const [g1, g2, c1, c2] = strokes;
    expect(g1!.width).toBeGreaterThan(c1!.width);
    expect(g2!.width).toBe(g1!.width);
    expect(c2!.width).toBe(c1!.width);
    // 8 segments, 3.2 traced: moveTo + 3 whole points + the end point.
    expect(c1!.points).toBe(5);
  });

  it("drops the glow pass when the frame state turns it off", () => {
    const prepared = prepareScene(lineScene(["A", "B"], 2), "dark");
    const on = recordingContext();
    composeFrame(on.ctx, prepared, 0.5, 0, view(), createFrameState());
    const state = createFrameState();
    state.glow = false;
    const off = recordingContext();
    composeFrame(off.ctx, prepared, 0.5, 0, view(), state);
    // Glow, crisp and trail with it; crisp and trail without.
    expect(on.strokes).toHaveLength(3);
    expect(off.strokes).toHaveLength(2);
    expect(off.strokes[0]!.width).toBe(on.strokes[1]!.width);
  });

  it("lights slot k exactly when beat k has finished tracing", () => {
    const scene = lineScene(["A", "B", "C", "D"], 4);
    const prepared = prepareScene(scene, "dark");
    const state = createFrameState();
    const lit = (p: number) => {
      const { ctx, texts } = recordingContext();
      composeFrame(ctx, prepared, p, 1000, view(), state);
      return texts;
    };
    expect(lit(0.24)).toEqual([]);
    expect(lit(0.25)).toEqual(["A"]);
    expect(lit(0.49)).toEqual(["A"]);
    expect(lit(0.5)).toEqual(["A", "B"]);
    expect(lit(1)).toEqual(["A", "B", "C", "D"]);
  });

  it("draws only the unit's letters for a repeating word, and counts repeats from beat unit + 1", () => {
    const scene = lineScene(
      ["K", "E", "C", "K", "E", "C", "K", "E", "C", "K", "E", "C"],
      3
    );
    const prepared = prepareScene(scene, "dark");
    const state = createFrameState();
    const frame = (p: number) => {
      const { ctx, texts } = recordingContext();
      composeFrame(ctx, prepared, p, 1000, view(), state);
      return texts;
    };
    // During the first repetition: no count yet.
    expect(frame(2 / 12)).toEqual(["K", "E"]);
    // Tracing beat 4 (the second K): all three slots, and ×2.
    expect(frame(3 / 12 + 0.01)).toEqual(["K", "E", "C", "×2"]);
    expect(frame(7 / 12)).toEqual(["K", "E", "C", "×3"]);
    // Never more glyphs than the unit, whatever p.
    for (let p = 0; p <= 1; p += 0.05) {
      expect(
        frame(p).filter((t) => !t.startsWith("×")).length
      ).toBeLessThanOrEqual(3);
    }
  });

  it("draws no letters without the font", () => {
    const { ctx, texts } = recordingContext();
    composeFrame(
      ctx,
      prepareScene(lineScene(["A", "B"], 2), "dark"),
      1,
      0,
      view({ fontFamily: null }),
      createFrameState()
    );
    expect(texts).toEqual([]);
  });

  it("caps sparks at the frame state's budget", () => {
    const state = createFrameState({ random: () => 0 });
    state.maxSparks = 5;
    const prepared = prepareScene(lineScene(["A", "B"], 2), "dark");
    for (let i = 0; i < 40; i++) {
      const { ctx } = recordingContext();
      composeFrame(
        ctx,
        prepared,
        0.3 + i * 0.005,
        i * 16,
        view({ sparks: true }),
        state
      );
    }
    expect(state.sparks.length).toBeLessThanOrEqual(5);
  });
});

describe("overtureLayout", () => {
  it("keeps the letters clear of the low capsule on short screens", () => {
    for (const [w, h] of [
      [360, 740],
      [960, 412],
      [1280, 800],
      [3840, 2160],
    ] as const) {
      const layout = overtureLayout(w, h);
      expect(layout.size).toBeLessThanOrEqual(560);
      expect(layout.lettersY).toBeLessThanOrEqual(h * 0.91 - 48 - 14);
    }
  });
});

describe("lapping a long boot", () => {
  /** A context that throws on any non-finite number, as a real canvas does. */
  function strictContext(): OvertureContext {
    const guard =
      (name: string, result: unknown = undefined) =>
      (...args: unknown[]) => {
        for (const v of args)
          if (typeof v === "number" && !Number.isFinite(v))
            throw new Error(`${name}(${args.join(", ")})`);
        return result;
      };
    const gradient = { addColorStop: guard("addColorStop") };
    const target: Record<string, unknown> = {
      createRadialGradient: guard("createRadialGradient", gradient),
      measureText: () => ({ width: 10 }),
    };
    return new Proxy(target, {
      get: (t, k: string) => (k in t ? t[k] : guard(k)),
      set: (t, k: string, v) => {
        t[k] = v;
        return true;
      },
    }) as unknown as OvertureContext;
  }

  it("draws every pool scene with finite geometry from the start through two laps", async () => {
    const { readFileSync } = await import("node:fs");
    const pool = JSON.parse(
      readFileSync("static/boot/overture-pool.json", "utf8")
    ) as { scenes: OvertureScene[] };
    const ctx = strictContext();
    const layout = overtureLayout(1600, 900);
    for (const scene of pool.scenes) {
      const prepared = prepareScene(scene, "dark");
      const state = createFrameState({ phone: false });
      for (let p = 0; p < 3; p += 0.0037) {
        const view: FrameView = {
          width: 1600,
          height: 900,
          dpr: 1,
          surface: "dark",
          layout,
          alpha: 1,
          zoom: 1,
          rotation: 0,
          flare: 0,
          sparks: true,
          fontFamily: null,
          lettersStill: false,
        };
        expect(() =>
          composeFrame(ctx, prepared, p, p * 5000, view, state)
        ).not.toThrow();
      }
    }
  });

  it("skips a frame on a canvas with no size instead of throwing", () => {
    const scene = lineScene(["A", "B"], 2);
    const prepared = prepareScene(scene, "dark");
    const state = createFrameState({ phone: false });
    const view: FrameView = {
      width: 0,
      height: 0,
      dpr: 1,
      surface: "dark",
      layout: overtureLayout(0, 0),
      alpha: 1,
      zoom: 1,
      rotation: 0,
      flare: 0,
      sparks: true,
      fontFamily: null,
      lettersStill: false,
    };
    expect(() =>
      composeFrame(strictContext(), prepared, 0.5, 100, view, state)
    ).not.toThrow();
  });
});

describe("prop colours", () => {
  it("accepts only a pair of six-digit hex colours", () => {
    expect(overtureColors({ left: "#A855F7", right: "#22c55e" })).toEqual({
      left: "#a855f7",
      right: "#22c55e",
    });
    expect(overtureColors(null)).toBeNull();
    expect(overtureColors({ left: "#a855f7" })).toBeNull();
    expect(overtureColors({ left: "purple", right: "#22c55e" })).toBeNull();
    expect(overtureColors({ left: "#abc", right: "#22c55e" })).toBeNull();
  });

  it("draws the hands in the user's colours on either surface, mixed where they cross", () => {
    const colors = { left: "#a855f7", right: "#22c55e" };
    for (const surface of ["dark", "light"] as const) {
      const prepared = prepareScene(twoHandScene(), surface, colors);
      expect(prepared.tips.map((tip) => tip.color)).toEqual([
        "#a855f7",
        "#22c55e",
      ]);
      expect(prepared.tips[0]!.rgb).toEqual([168, 85, 247]);
      // The channel-wise mean, as applyMandalaHandColors mixes them.
      expect(prepared.overlap).toBe("#658dab");
    }
  });

  it("keeps the surface's blue, red and purple without user colours", () => {
    const dark = prepareScene(twoHandScene(), "dark");
    expect(dark.tips.map((tip) => tip.color)).toEqual(["#818cf8", "#f87171"]);
    expect(dark.overlap).toBe("#a78bfa");
    const light = prepareScene(twoHandScene(), "light", null);
    expect(light.tips.map((tip) => tip.color)).toEqual(["#3D44B8", "#DC2626"]);
    expect(light.overlap).toBe("#6d28d9");
  });
});

describe("overlap pass", () => {
  it("masks each hand, intersects them and lays the mix over the strokes", () => {
    const prepared = prepareScene(twoHandScene(), "dark", {
      left: "#a855f7",
      right: "#22c55e",
    });
    const { layers, left, right } = overlapLayers();
    const state = createFrameState();
    state.overlap = layers;
    const main = recordingContext();
    composeFrame(main.ctx, prepared, 0.5, 0, view({ alpha: 0.8 }), state);
    // One crisp stroke per hand on its own mask, as wide as the main crisp pass.
    expect(left.strokes).toHaveLength(1);
    expect(right.strokes).toHaveLength(1);
    expect(left.strokes[0]!.width).toBe(main.strokes[2]!.width);
    // Left mask keeps only what the right mask also covers, then takes the mix.
    expect(left.images).toEqual([
      { image: "right-canvas", op: "destination-in", alpha: 1 },
    ]);
    expect(left.rects).toEqual([{ style: "#658dab", op: "source-in" }]);
    // The main canvas gets that mask once, at the layer's own opacity.
    expect(main.images).toEqual([
      { image: "left-canvas", op: "source-over", alpha: 0.8 },
    ]);
    // Nothing is drawn to the right mask but its stroke.
    expect(right.images).toEqual([]);
    expect(right.rects).toEqual([]);
  });

  it("skips the pass with one hand, without layers, or before the trace starts", () => {
    const { layers, left } = overlapLayers();
    const state = createFrameState();
    state.overlap = layers;
    const oneHand = recordingContext();
    composeFrame(
      oneHand.ctx,
      prepareScene(lineScene(["A", "B"], 2), "dark"),
      0.5,
      0,
      view(),
      state
    );
    expect(oneHand.images).toEqual([]);
    expect(left.strokes).toEqual([]);

    const untraced = recordingContext();
    composeFrame(
      untraced.ctx,
      prepareScene(twoHandScene(), "dark"),
      0,
      0,
      view(),
      state
    );
    expect(untraced.images).toEqual([]);

    const noLayers = recordingContext();
    composeFrame(
      noLayers.ctx,
      prepareScene(twoHandScene(), "dark"),
      0.5,
      0,
      view(),
      createFrameState()
    );
    expect(noLayers.images).toEqual([]);
    // The crisp strokes are still there.
    expect(noLayers.strokes.length).toBeGreaterThanOrEqual(4);
  });
});
