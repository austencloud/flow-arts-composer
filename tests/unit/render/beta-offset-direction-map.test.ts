import { describe, expect, it } from "vitest";
import {
  calculateBetaOffset as calculateBrowserBetaOffset,
  type BetaMotionInput,
  type BetaOffsetInput,
} from "#lib/shared/render/core/calculations/beta-offset.js";
import { getBetaOffsetSize } from "#lib/shared/render/core/constants/prop-classification.js";
import { calculateBetaOffset as calculatePackageBetaOffset } from "../../../packages/render-core/src/calculations/beta-offset";
import { propPlacer } from "#lib/shared/pictograph/prop/services/prop-placer.js";
import DefaultPropPositioner from "#lib/shared/pictograph/prop/services/default-prop-positioner.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

type Offset = { x: number; y: number };
type OffsetCalculator = (
  input: BetaOffsetInput,
  targetMotion: BetaMotionInput
) => Offset;
type DiagonalDirection = "upright" | "upleft" | "downright" | "downleft";

const STAFF_BOX_OFFSET = getBetaOffsetSize("staff", "box");

const calculators: ReadonlyArray<{
  name: string;
  calculate: OffsetCalculator;
}> = [
  { name: "browser render core", calculate: calculateBrowserBetaOffset },
  { name: "shared render-core package", calculate: calculatePackageBetaOffset },
];

const boxTransitions: ReadonlyArray<{
  start: string;
  partnerStart: string;
  end: string;
  expectedBlue: DiagonalDirection;
}> = [
  { start: "ne", partnerStart: "sw", end: "se", expectedBlue: "upleft" },
  { start: "ne", partnerStart: "sw", end: "nw", expectedBlue: "downright" },
  { start: "se", partnerStart: "nw", end: "ne", expectedBlue: "upright" },
  { start: "se", partnerStart: "nw", end: "sw", expectedBlue: "upright" },
  { start: "sw", partnerStart: "ne", end: "nw", expectedBlue: "upleft" },
  { start: "sw", partnerStart: "ne", end: "se", expectedBlue: "downright" },
  { start: "nw", partnerStart: "se", end: "ne", expectedBlue: "downleft" },
  { start: "nw", partnerStart: "se", end: "sw", expectedBlue: "downleft" },
];

const sequenceSteps: ReadonlyArray<{
  step: number;
  letter: string;
  left: Omit<BetaMotionInput, "color" | "propType">;
  right: Omit<BetaMotionInput, "color" | "propType">;
  expectedBlue: DiagonalDirection | null;
}> = [
  {
    step: 1,
    letter: "K",
    left: {
      startLocation: "sw",
      endLocation: "nw",
      endOrientation: "counter",
      motionType: "anti",
    },
    right: {
      startLocation: "ne",
      endLocation: "nw",
      endOrientation: "counter",
      motionType: "float",
    },
    expectedBlue: "upleft",
  },
  {
    step: 2,
    letter: "Φ",
    left: {
      startLocation: "nw",
      endLocation: "nw",
      endOrientation: "in",
      motionType: "static",
    },
    right: {
      startLocation: "nw",
      endLocation: "se",
      endOrientation: "in",
      motionType: "dash",
    },
    expectedBlue: null,
  },
  {
    step: 3,
    letter: "K",
    left: {
      startLocation: "nw",
      endLocation: "ne",
      endOrientation: "counter",
      motionType: "anti",
    },
    right: {
      startLocation: "se",
      endLocation: "ne",
      endOrientation: "counter",
      motionType: "float",
    },
    expectedBlue: "downleft",
  },
  {
    step: 4,
    letter: "Φ",
    left: {
      startLocation: "ne",
      endLocation: "ne",
      endOrientation: "in",
      motionType: "static",
    },
    right: {
      startLocation: "ne",
      endLocation: "sw",
      endOrientation: "in",
      motionType: "dash",
    },
    expectedBlue: null,
  },
  {
    step: 5,
    letter: "K",
    left: {
      startLocation: "ne",
      endLocation: "se",
      endOrientation: "counter",
      motionType: "anti",
    },
    right: {
      startLocation: "sw",
      endLocation: "se",
      endOrientation: "counter",
      motionType: "float",
    },
    expectedBlue: "upleft",
  },
  {
    step: 6,
    letter: "Φ",
    left: {
      startLocation: "se",
      endLocation: "se",
      endOrientation: "in",
      motionType: "static",
    },
    right: {
      startLocation: "se",
      endLocation: "nw",
      endOrientation: "in",
      motionType: "dash",
    },
    expectedBlue: null,
  },
  {
    step: 7,
    letter: "K",
    left: {
      startLocation: "se",
      endLocation: "sw",
      endOrientation: "counter",
      motionType: "anti",
    },
    right: {
      startLocation: "nw",
      endLocation: "sw",
      endOrientation: "counter",
      motionType: "float",
    },
    expectedBlue: "upright",
  },
  {
    step: 8,
    letter: "Φ",
    left: {
      startLocation: "sw",
      endLocation: "sw",
      endOrientation: "in",
      motionType: "static",
    },
    right: {
      startLocation: "sw",
      endLocation: "ne",
      endOrientation: "in",
      motionType: "dash",
    },
    expectedBlue: null,
  },
];

function diagonalOffset(direction: DiagonalDirection): Offset {
  switch (direction) {
    case "upright":
      return { x: STAFF_BOX_OFFSET, y: -STAFF_BOX_OFFSET };
    case "upleft":
      return { x: -STAFF_BOX_OFFSET, y: -STAFF_BOX_OFFSET };
    case "downright":
      return { x: STAFF_BOX_OFFSET, y: STAFF_BOX_OFFSET };
    case "downleft":
      return { x: -STAFF_BOX_OFFSET, y: STAFF_BOX_OFFSET };
  }
}

function opposite(offset: Offset): Offset {
  return { x: -offset.x, y: -offset.y };
}

function withRenderFields(
  motion: Omit<BetaMotionInput, "hand" | "propType">,
  hand: "left" | "right"
): BetaMotionInput {
  return { ...motion, hand, propType: "staff" };
}

function createInput(
  letter: string,
  leftMotion: BetaMotionInput,
  rightMotion: BetaMotionInput
): BetaOffsetInput {
  return {
    leftMotion,
    rightMotion,
    letter,
    gridMode: "box",
    leftPropType: "staff",
    rightPropType: "staff",
  };
}

describe.each(calculators)("$name beta-offset directions", ({ calculate }) => {
  it.each(boxTransitions)(
    "maps the $start → $end box shift to $expectedBlue for blue",
    ({ start, partnerStart, end, expectedBlue }) => {
      const leftMotion = withRenderFields(
        {
          startLocation: start,
          endLocation: end,
          endOrientation: "counter",
          motionType: "anti",
        },
        "left"
      );
      const rightMotion = withRenderFields(
        {
          startLocation: partnerStart,
          endLocation: end,
          endOrientation: "counter",
          motionType: "float",
        },
        "right"
      );
      const input = createInput("K", leftMotion, rightMotion);
      const expected = diagonalOffset(expectedBlue);

      expect(calculate(input, leftMotion)).toEqual(expected);
      expect(calculate(input, rightMotion)).toEqual(opposite(expected));
    }
  );

  it.each(sequenceSteps)(
    "places both props correctly in supplied sequence step $step ($letter)",
    ({ letter, left, right, expectedBlue }) => {
      const leftMotion = withRenderFields(left, "left");
      const rightMotion = withRenderFields(right, "right");
      const input = createInput(letter, leftMotion, rightMotion);
      const expected = expectedBlue
        ? diagonalOffset(expectedBlue)
        : { x: 0, y: 0 };

      expect(calculate(input, leftMotion)).toEqual(expected);
      expect(calculate(input, rightMotion)).toEqual(
        expectedBlue ? opposite(expected) : expected
      );
    }
  );
});

describe("PropPlacer final coordinates for the supplied sequence", () => {
  it.each([
    {
      step: 1,
      leftStart: GridLocation.SOUTHWEST,
      rightStart: GridLocation.NORTHEAST,
      end: GridLocation.NORTHWEST,
      blueOffset: { x: -STAFF_BOX_OFFSET, y: -STAFF_BOX_OFFSET },
    },
    {
      step: 3,
      leftStart: GridLocation.NORTHWEST,
      rightStart: GridLocation.SOUTHEAST,
      end: GridLocation.NORTHEAST,
      blueOffset: { x: -STAFF_BOX_OFFSET, y: STAFF_BOX_OFFSET },
    },
  ])(
    "places step $step props on opposite sides of the shared hand point",
    async ({ leftStart, rightStart, end, blueOffset }) => {
      const left = createMotionData({
        motionType: MotionType.ANTI,
        startLocation: leftStart,
        endLocation: end,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.COUNTER,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        turns: 0.5,
        hand: HandSide.LEFT,
        gridMode: GridMode.BOX,
        propType: PropType.STAFF,
      });
      const right = createMotionData({
        motionType: MotionType.FLOAT,
        startLocation: rightStart,
        endLocation: end,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.COUNTER,
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: 0,
        hand: HandSide.RIGHT,
        gridMode: GridMode.BOX,
        propType: PropType.STAFF,
      });
      const pictograph: PictographData = {
        id: `k-beta-${leftStart}-${end}`,
        letter: Letter.K,
        gridMode: GridMode.BOX,
        motions: { left, right },
      };
      const base = DefaultPropPositioner.calculatePosition(end, GridMode.BOX);

      const [leftPlacement, rightPlacement] = await Promise.all([
        propPlacer.calculatePlacement(pictograph, left, undefined, {
          leftPropType: PropType.STAFF,
          rightPropType: PropType.STAFF,
        }),
        propPlacer.calculatePlacement(pictograph, right, undefined, {
          leftPropType: PropType.STAFF,
          rightPropType: PropType.STAFF,
        }),
      ]);

      expect(leftPlacement.positionX).toBeCloseTo(base.x + blueOffset.x, 2);
      expect(leftPlacement.positionY).toBeCloseTo(base.y + blueOffset.y, 2);
      expect(rightPlacement.positionX).toBeCloseTo(base.x - blueOffset.x, 2);
      expect(rightPlacement.positionY).toBeCloseTo(base.y - blueOffset.y, 2);
    }
  );
});
