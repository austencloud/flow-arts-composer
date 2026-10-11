import { describe, it, expect } from "vitest";
import type { GridJoin, GridJoinDirection } from "@tka/tka-types";
import {
  gridJoinOffsets,
  getNormalHandPointCoordinates,
} from "@tka/render-core";
import {
  mirrorSequence,
  flipSequence,
  rotateSequence,
  handSwapSequence,
  rewindSequence,
} from "./sequence-transforms";
import { rotateSequenceGeometry } from "./sequence-derived-fields";
import {
  mirrorGridJoin,
  flipGridJoin,
  rotateGridJoin,
  swapGridJoin,
} from "./grid-join-transforms";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createStartPlacementData } from "#lib/shared/create/factories/create-start-placement-data.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { IMotionQueryHandler } from "#lib/shared/foundation/services/data/data-contracts.js";

// The join tests below draw every hand location where a joined picture puts
// it (its own grid's offset plus the hand point), then check that the
// transformed sequence lands each hand exactly where the transformed picture
// should. A join copied unchanged would put the grids the wrong way round.

const handler = {
  findLetterByMotionConfiguration: async () => null,
} as unknown as IMotionQueryHandler;

const SCENE_CENTER = 475;
const DIRECTIONS: GridJoinDirection[] = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
];

type Point = { x: number; y: number };
type Hand = "left" | "right";

function motion(hand: HandSide, start: GridLocation, end: GridLocation) {
  return createMotionData({
    hand,
    startLocation: start,
    endLocation: end,
    arrowLocation: end,
  });
}

function joinedSequence(conjoined?: GridJoin): SequenceData {
  const startMotions = {
    [HandSide.LEFT]: motion(HandSide.LEFT, GridLocation.SOUTH, GridLocation.SOUTH),
    [HandSide.RIGHT]: motion(HandSide.RIGHT, GridLocation.NORTH, GridLocation.NORTH),
  };
  return {
    id: "joined",
    name: "Joined",
    word: "",
    gridMode: GridMode.DIAMOND,
    difficulty: 1,
    metadata: {},
    startPlacement: createStartPlacementData({ motions: startMotions }),
    steps: [
      createStepData({
        stepNumber: 1,
        motions: {
          [HandSide.LEFT]: motion(HandSide.LEFT, GridLocation.SOUTH, GridLocation.WEST),
          [HandSide.RIGHT]: motion(HandSide.RIGHT, GridLocation.NORTH, GridLocation.EAST),
        },
      }),
      createStepData({
        stepNumber: 2,
        motions: {
          [HandSide.LEFT]: motion(HandSide.LEFT, GridLocation.WEST, GridLocation.NORTH),
          [HandSide.RIGHT]: motion(HandSide.RIGHT, GridLocation.EAST, GridLocation.SOUTH),
        },
      }),
    ],
    ...(conjoined && { conjoined }),
  } as unknown as SequenceData;
}

/** Where a hand location lands in the joined picture, from the scene center. */
function drawnPoint(join: GridJoin, hand: Hand, location: string): Point {
  const grid = gridJoinOffsets(join)[hand];
  // "skewed" reads both the diamond and the box hand points.
  const point = getNormalHandPointCoordinates(location, "skewed");
  return {
    x: grid.x + point.x - SCENE_CENTER,
    y: grid.y + point.y - SCENE_CENTER,
  };
}

/** Every drawn hand point of the start placement and each step, per hand. */
function drawnHands(seq: SequenceData): Record<Hand, Point[]> {
  const join = seq.conjoined!;
  const poses = [seq.startPlacement!, ...seq.steps];
  const handPoints = (hand: Hand, side: HandSide) =>
    poses.flatMap((pose) => {
      const m = pose.motions[side]!;
      return [
        drawnPoint(join, hand, m.startLocation),
        drawnPoint(join, hand, m.endLocation),
      ];
    });
  return {
    left: handPoints("left", HandSide.LEFT),
    right: handPoints("right", HandSide.RIGHT),
  };
}

/** Box hand points are stored to 0.1 units, so allow that much drift. */
function expectSamePoints(actual: Point[], expected: Point[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, i) => {
    expect(point.x).toBeCloseTo(expected[i]!.x, 1);
    expect(point.y).toBeCloseTo(expected[i]!.y, 1);
  });
}

/** Clockwise on screen (y points down), by 45° steps. */
function rotatePoint(point: Point, steps: number): Point {
  const angle = (steps * Math.PI) / 4;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

describe("grid join direction under each transform", () => {
  it.each(DIRECTIONS)(
    "moves the red grid's center with the picture (toward %s)",
    (toward) => {
      const join: GridJoin = { toward, steps: 1 };
      const red = gridJoinOffsets(join).right;

      expectSamePoints(
        [gridJoinOffsets(mirrorGridJoin(join)).right],
        [{ x: -red.x, y: red.y }]
      );
      expectSamePoints(
        [gridJoinOffsets(flipGridJoin(join)).right],
        [{ x: red.x, y: -red.y }]
      );
      for (const steps of [1, 2, 3, -1, -3, 8]) {
        expectSamePoints(
          [gridJoinOffsets(rotateGridJoin(join, steps)).right],
          [rotatePoint(red, steps)]
        );
      }
      // After a swap the new blue grid stands where red stood.
      expectSamePoints([gridJoinOffsets(swapGridJoin(join)).left], [red]);
    }
  );
});

describe("joined sequence transforms draw each hand in the moved picture", () => {
  const join: GridJoin = { toward: GridLocation.EAST as GridJoinDirection, steps: 1 };

  it("mirror turns the join east to west and mirrors every drawn point", async () => {
    const seq = joinedSequence(join);
    const before = drawnHands(seq);
    const after = await mirrorSequence(seq, handler);

    expect(after.conjoined).toEqual({ toward: "w", steps: 1 });
    const mirror = (p: Point) => ({ x: -p.x, y: p.y });
    const drawn = drawnHands(after);
    expectSamePoints(drawn.left, before.left.map(mirror));
    expectSamePoints(drawn.right, before.right.map(mirror));
  });

  it("flip turns a north join south and flips every drawn point", async () => {
    const seq = joinedSequence({ toward: "n", steps: 2 });
    const before = drawnHands(seq);
    const after = await flipSequence(seq, handler);

    expect(after.conjoined).toEqual({ toward: "s", steps: 2 });
    const flip = (p: Point) => ({ x: p.x, y: -p.y });
    const drawn = drawnHands(after);
    expectSamePoints(drawn.left, before.left.map(flip));
    expectSamePoints(drawn.right, before.right.map(flip));
  });

  it.each([1, 2, -1, -3])(
    "rotate by %i turns the join with the hands",
    async (steps) => {
      const seq = joinedSequence(join);
      const before = drawnHands(seq);
      const after = await rotateSequence(seq, steps, handler);

      const turn = (p: Point) => rotatePoint(p, steps);
      const drawn = drawnHands(after);
      expectSamePoints(drawn.left, before.left.map(turn));
      expectSamePoints(drawn.right, before.right.map(turn));
    }
  );

  it("rotateSequenceGeometry turns the join with the hands", () => {
    const seq = joinedSequence(join);
    const before = drawnHands(seq);
    const after = rotateSequenceGeometry(seq, 1);

    expect(after.conjoined).toEqual({ toward: "se", steps: 1 });
    const turn = (p: Point) => rotatePoint(p, 1);
    const drawn = drawnHands(after);
    expectSamePoints(drawn.left, before.left.map(turn));
    expectSamePoints(drawn.right, before.right.map(turn));
  });

  it("hand swap keeps every path in place and trades the colors", () => {
    const seq = joinedSequence(join);
    const before = drawnHands(seq);
    const after = handSwapSequence(seq);

    expect(after.conjoined).toEqual({ toward: "w", steps: 1 });
    const drawn = drawnHands(after);
    expectSamePoints(drawn.left, before.right);
    expectSamePoints(drawn.right, before.left);
  });

  it("rewind keeps the join", async () => {
    const seq = joinedSequence(join);
    expect((await rewindSequence(seq, handler)).conjoined).toEqual(join);
    expect((await rewindSequence(seq, handler, "left")).conjoined).toEqual(join);
  });

  it("a one-hand transform leaves the grids where they are", async () => {
    const seq = joinedSequence(join);
    expect((await mirrorSequence(seq, handler, "left")).conjoined).toEqual(join);
    expect((await flipSequence(seq, handler, "right")).conjoined).toEqual(join);
    expect((await rotateSequence(seq, 2, handler, "left")).conjoined).toEqual(join);
  });

  it("a sequence on one grid gains no join", async () => {
    const seq = joinedSequence();
    const results = [
      await mirrorSequence(seq, handler),
      await flipSequence(seq, handler),
      await rotateSequence(seq, 1, handler),
      handSwapSequence(seq),
      rotateSequenceGeometry(seq, 1),
    ];
    for (const result of results) expect("conjoined" in result).toBe(false);
  });
});
