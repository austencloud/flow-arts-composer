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
