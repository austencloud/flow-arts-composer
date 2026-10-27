import { describe, expect, it } from "vitest";
import {
  composeFrame,
  createFrameState,
  cumulativeLengths,
  overtureLayout,
  pointAt,
  preparePath,
  prepareScene,
  type FrameView,
  type OvertureContext,
  type OverturePoint,
  type OvertureScene,
} from "./overture-trace";

/** A canvas stand-in that records strokes, fills and text. */
function recordingContext() {
  const strokes: { width: number; style: unknown; points: number }[] = [];
  const texts: string[] = [];
  let points = 0;
  const ctx = {
    globalAlpha: 1,
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
  return { ctx, strokes, texts };
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
