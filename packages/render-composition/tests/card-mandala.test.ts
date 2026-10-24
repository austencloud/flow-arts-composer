import { describe, expect, it } from "vitest";
import {
  CARD_MANDALA_HAND_RADIUS,
  calculateCardMandalaPaths,
  renderCardMandala,
  type CardMandalaHandOffsets,
  type CardMandalaPlacement,
  type CardMandalaStep,
} from "../src/card-mandala.js";

const STEPS: CardMandalaStep[] = [
  {
    stepNumber: 0,
    leftMotion: {
      motionType: "static",
      rotationDirection: "no_rotation",
      startLocation: "n",
      endLocation: "n",
    },
    rightMotion: {
      motionType: "static",
      rotationDirection: "no_rotation",
      startLocation: "s",
      endLocation: "s",
    },
  },
  {
    stepNumber: 1,
    leftMotion: {
      motionType: "pro",
      rotationDirection: "cw",
      startLocation: "n",
      endLocation: "e",
      startOrientation: "in",
      endOrientation: "in",
    },
    rightMotion: {
      motionType: "anti",
      rotationDirection: "ccw",
      startLocation: "s",
      endLocation: "w",
      startOrientation: "out",
      endOrientation: "out",
    },
  },
];

const TURN_CLOCKWISE_45: Record<string, string> = {
  n: "ne",
  ne: "e",
  e: "se",
  se: "s",
  s: "sw",
  sw: "w",
  w: "nw",
  nw: "n",
};

/** The same steps on the box grid: every location one step clockwise. */
function onBoxGrid(steps: CardMandalaStep[]): CardMandalaStep[] {
  const turn = (motion: CardMandalaStep["leftMotion"]) => ({
    ...motion,
    startLocation: TURN_CLOCKWISE_45[motion.startLocation]!,
    endLocation: TURN_CLOCKWISE_45[motion.endLocation]!,
  });
  return steps.map((step) => ({
    ...step,
    leftMotion: turn(step.leftMotion),
    rightMotion: turn(step.rightMotion),
  }));
}

function pathPoints(path: string): Array<[number, number]> {
  const numbers = path.match(/-?\d+\.\d+/g)!.map(Number);
  const points: Array<[number, number]> = [];
  for (let index = 0; index < numbers.length; index += 2)
    points.push([numbers[index]!, numbers[index + 1]!]);
  return points;
}

describe("card mandala geometry", () => {
  it("draws a box sequence as its diamond mandala turned 45° clockwise", () => {
    // Every perimeter point, including northwest, appears as a start or end.
    const steps: CardMandalaStep[] = [
      STEPS[0]!,
      STEPS[1]!,
      {
        stepNumber: 2,
        leftMotion: {
          motionType: "anti",
          rotationDirection: "cw",
          startLocation: "e",
          endLocation: "s",
          startOrientation: "in",
          endOrientation: "out",
        },
        rightMotion: {
          motionType: "pro",
          rotationDirection: "ccw",
          startLocation: "w",
          endLocation: "n",
          startOrientation: "out",
          endOrientation: "in",
        },
      },
      {
        stepNumber: 3,
        leftMotion: {
          motionType: "dash",
          rotationDirection: "no_rotation",
          startLocation: "s",
          endLocation: "n",
          startOrientation: "out",
          endOrientation: "out",
        },
        rightMotion: {
          motionType: "static",
          rotationDirection: "no_rotation",
          startLocation: "n",
          endLocation: "n",
          startOrientation: "in",
          endOrientation: "in",
        },
      },
    ];
    const diamond = calculateCardMandalaPaths(steps);
    const box = calculateCardMandalaPaths(onBoxGrid(steps));
    const cos = Math.SQRT1_2;

    for (const hand of ["left", "right"] as const) {
      expect(box[hand]).toHaveLength(diamond[hand].length);
      diamond[hand].forEach((path, index) => {
        const expected = pathPoints(path).map(([x, y]) => [
          x * cos - y * cos,
          x * cos + y * cos,
        ]);
        const actual = pathPoints(box[hand][index]!);
        expect(actual).toHaveLength(expected.length);
        actual.forEach(([x, y], point) => {
          expect(x).toBeCloseTo(expected[point]![0]!, 1);
          expect(y).toBeCloseTo(expected[point]![1]!, 1);
        });
      });
    }
  });


  it("traces both staff tips for both hands", () => {
    const paths = calculateCardMandalaPaths(STEPS, {
      left: [1],
      right: [1],
    });

    expect(paths.left).toHaveLength(2);
    expect(paths.right).toHaveLength(2);
    for (const path of [...paths.left, ...paths.right]) {
      expect(path).toMatch(/^M -?\d+\.\d{2} -?\d+\.\d{2} C /);
    }
  });

  it("uses the allocated turns that produced the rendered pictographs", () => {
    const halfTurn = calculateCardMandalaPaths(STEPS, {
      left: [0.5],
      right: [0.5],
    });
    const fullTurn = calculateCardMandalaPaths(STEPS, {
      left: [1],
      right: [1],
    });

    expect(halfTurn).not.toEqual(fullTurn);
  });

  it("takes the short way when a later static step has turns but no rotation", () => {
    // The app's mandala chains a beat with turns but no rotation direction as
    // a shortest-path beat, so its turns must not spin the drawn path.
    const withStill = (turns: number): CardMandalaStep[] => [
      ...STEPS,
      {
        stepNumber: 2,
        leftMotion: {
          motionType: "static",
          rotationDirection: "no_rotation",
          startLocation: "e",
          endLocation: "e",
          startOrientation: "in",
          endOrientation: "in",
          turns,
        },
        rightMotion: {
          motionType: "static",
          rotationDirection: "noRotation",
          startLocation: "w",
          endLocation: "w",
          startOrientation: "out",
          endOrientation: "out",
          turns,
        },
      },
    ];

    expect(calculateCardMandalaPaths(withStill(1))).toEqual(
      calculateCardMandalaPaths(withStill(0))
    );
  });

  it("keeps its local stroke width so canvas scaling matches ImageComposer", () => {
    const widths: number[] = [];
    const context = {
      save: () => undefined,
      restore: () => undefined,
      translate: () => undefined,
      scale: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      bezierCurveTo: () => undefined,
      stroke: () => undefined,
      set lineWidth(value: number) {
        widths.push(value);
      },
      set lineCap(_value: CanvasLineCap) {},
      set globalAlpha(_value: number) {},
      set strokeStyle(_value: string | CanvasGradient | CanvasPattern) {},
    } as unknown as CanvasRenderingContext2D;

    renderCardMandala(
      context,
      calculateCardMandalaPaths(STEPS, { left: [1], right: [1] }),
      { col: 1, row: 1, x: 0, y: 0, cellSize: 120, variant: "full" },
      false
    );

    expect(widths).toContain(3);
    expect(widths).not.toContain(3 / 0.5);
  });
});

/** Records the transform calls and which color each stroke used. */
function recordingContext() {
  const calls: string[] = [];
  let strokeStyle = "";
  const context = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    translate: (x: number, y: number) =>
      calls.push(`translate ${x.toFixed(3)} ${y.toFixed(3)}`),
    scale: (x: number) => calls.push(`scale ${x.toFixed(5)}`),
    beginPath: () => undefined,
    moveTo: () => undefined,
    bezierCurveTo: () => undefined,
    stroke: () => calls.push(`stroke ${strokeStyle}`),
    set lineWidth(_value: number) {},
    set lineCap(_value: CanvasLineCap) {},
    set globalAlpha(_value: number) {},
    set strokeStyle(value: string) {
      strokeStyle = value;
    },
  } as unknown as CanvasRenderingContext2D;
  return { context, calls };
}

const COLORS = { left: "blue", right: "red" };
const FULL: CardMandalaPlacement = {
  col: 1,
  row: 1,
  x: 0,
  y: 0,
  cellSize: 120,
  variant: "full",
};
/** East, one step: the grids sit half a hand radius either side of center. */
const EAST_ONE: CardMandalaHandOffsets = {
  left: { x: -CARD_MANDALA_HAND_RADIUS / 2, y: 0 },
  right: { x: CARD_MANDALA_HAND_RADIUS / 2, y: 0 },
};

describe("card mandala on joined grids", () => {
  const paths = calculateCardMandalaPaths(STEPS, { left: [1], right: [1] });

  function draw(
    placement: CardMandalaPlacement,
    offsets?: CardMandalaHandOffsets | null
  ) {
    const { context, calls } = recordingContext();
    renderCardMandala(context, paths, placement, false, COLORS, offsets);
    return calls;
  }

  it("draws one grid exactly as before when no offsets are given", () => {
    expect(draw(FULL, null)).toEqual(draw(FULL));
    expect(draw(FULL).filter((call) => call.startsWith("translate"))).toEqual([
      "translate 60.000 60.000",
    ]);
  });

  it("moves each hand's figure onto its own grid and fits the pair", () => {
    const calls = draw(FULL, EAST_ONE);
    const firstBlue = calls.indexOf("stroke blue");
    const firstRed = calls.indexOf("stroke red");
    expect(calls.slice(0, firstBlue)).toContain("translate -40.000 0.000");
    expect(calls.slice(firstBlue, firstRed)).toContain(
      "translate 40.000 0.000"
    );

    // One figure reaches 144 units; the joined pair 40 more.
    const scaleOf = (list: string[]) =>
      Number(list.find((call) => call.startsWith("scale"))!.split(" ")[1]);
    expect(scaleOf(calls) / scaleOf(draw(FULL))).toBeCloseTo(144 / 184, 4);
  });

  it("keeps a one-hand cell centered at the one-grid size", () => {
    const left = { ...FULL, variant: "left" as const };
    expect(draw(left, EAST_ONE)).toEqual(draw(left));
  });
});

// Center is radius 0 at the grid origin (spec 2026-10-22, gap 10). Before,
// center's angle 0 was read as a rim angle, so a hand "at center" traced the
// rim at East. The hand radius is 80 card mandala units.
describe("card mandala at center", () => {
  /** The sampled points of a path: the move-to, then each curve's end point. */
  function samples(d: string): Array<[number, number]> {
    const n = d.match(/-?\d+\.\d+/g)!.map(Number);
    const out: Array<[number, number]> = [[n[0]!, n[1]!]];
    for (let i = 2; i < n.length; i += 6) out.push([n[i + 4]!, n[i + 5]!]);
    return out;
  }

  /** The hand's own point: midway between the staff's two tip traces. */
  function handPoints(motionType: string, start: string, end: string) {
    const motion = {
      motionType,
      rotationDirection: "cw",
      startLocation: start,
      endLocation: end,
      startOrientation: "in",
      endOrientation: "in",
    };
    const paths = calculateCardMandalaPaths([
      { stepNumber: 1, leftMotion: motion, rightMotion: motion },
    ]);
    const [a, b] = paths.left.map(samples);
    return a!.map(([ax, ay], i) => {
      const [bx, by] = b![i]!;
      return { x: (ax + bx) / 2, y: (ay + by) / 2 };
    });
  }

  it("keeps a hand that stays at center on the origin", () => {
    for (const center of ["c", "center"]) {
      for (const point of handPoints("static", center, center)) {
        expect(Math.hypot(point.x, point.y)).toBeLessThan(0.01);
      }
    }
  });

  it("traces a hash in as the straight segment from the rim to the origin", () => {
    for (const type of ["dash", "pro"]) {
      const points = handPoints(type, "n", "c");
      for (const point of points) {
        expect(Math.abs(point.x)).toBeLessThan(0.01);
        expect(point.y).toBeGreaterThanOrEqual(-80.01);
        expect(point.y).toBeLessThanOrEqual(0.01);
      }
      expect(points[points.length >> 1]!.y).toBeCloseTo(-40, 1);
      expect(Math.hypot(points.at(-1)!.x, points.at(-1)!.y)).toBeLessThan(0.01);
    }
  });

  it("leaves perimeter paths exactly where the code put them before", () => {
    // Pinned from the card mandala before the center change.
    const points = handPoints("pro", "n", "e");
    expect(points).toHaveLength(65);
    expect(points[0]).toEqual({ x: -0, y: -80 });
    expect(points[32]).toEqual({ x: 56.565, y: -56.565 });
    expect(points[64]).toEqual({ x: 80, y: 0 });
  });
});
