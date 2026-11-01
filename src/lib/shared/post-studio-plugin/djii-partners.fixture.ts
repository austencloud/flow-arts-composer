/** The DJII tunnel's two performers, step by step, for tests. */
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import {
  createMotionData,
  type MotionData,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

// start, end, motion type, rotation, start and end orientation; per hand.
export type Hand = [string, string, string, string, string, string];

function motion(hand: "left" | "right", row: Hand): MotionData {
  const [start, end, type, rotation, startOri, endOri] = row;
  return createMotionData({
    hand,
    startLocation: start,
    endLocation: end,
    arrowLocation: start,
    motionType: type,
    rotationDirection: rotation,
    startOrientation: startOri,
    endOrientation: endOri,
    turns: 0,
    gridMode: "diamond",
    propType: "staff",
    isVisible: true,
  } as unknown as Parameters<typeof createMotionData>[0]);
}

export function sequenceOf(rows: [Hand, Hand][]): SequenceData {
  return createSequenceData({
    gridMode: "diamond" as SequenceData["gridMode"],
    steps: rows.map(([left, right], index) =>
      createStepData({
        stepNumber: index + 1,
        motions: { left: motion("left", left), right: motion("right", right) },
      })
    ),
  });
}

export function rowsOf(sequence: SequenceData): [Hand, Hand][] {
  const hand = (m: MotionData): Hand => [
    m.startLocation,
    m.endLocation,
    m.motionType,
    m.rotationDirection,
    m.startOrientation,
    m.endOrientation,
  ];
  return sequence.steps.map((step) => [
    hand(step.motions.left),
    hand(step.motions.right),
  ]);
}

// The front performer's DJIIDJII (short code 4UMY), as Austen made it.
export const FRONT: [Hand, Hand][] = [
  [
    ["s", "w", "pro", "cw", "in", "in"],
    ["s", "e", "pro", "ccw", "in", "in"],
  ],
  [
    ["w", "n", "pro", "cw", "in", "in"],
    ["e", "n", "pro", "ccw", "in", "in"],
  ],
  [
    ["n", "e", "pro", "cw", "in", "in"],
    ["n", "e", "anti", "ccw", "in", "out"],
  ],
  [
    ["e", "s", "pro", "cw", "in", "in"],
    ["e", "s", "anti", "ccw", "out", "in"],
  ],
  [
    ["s", "w", "pro", "cw", "in", "in"],
    ["s", "e", "pro", "ccw", "in", "in"],
  ],
  [
    ["w", "n", "pro", "cw", "in", "in"],
    ["e", "n", "pro", "ccw", "in", "in"],
  ],
  [
    ["n", "w", "anti", "cw", "in", "out"],
    ["n", "w", "pro", "ccw", "in", "in"],
  ],
  [
    ["w", "s", "anti", "cw", "out", "in"],
    ["w", "s", "pro", "ccw", "in", "in"],
  ],
];

// The partner's (short code B7Y4).
export const PARTNER: [Hand, Hand][] = [
  [
    ["n", "w", "pro", "ccw", "in", "in"],
    ["n", "e", "pro", "cw", "in", "in"],
  ],
  [
    ["w", "s", "pro", "ccw", "in", "in"],
    ["e", "s", "pro", "cw", "in", "in"],
  ],
  [
    ["s", "w", "anti", "ccw", "in", "out"],
    ["s", "w", "pro", "cw", "in", "in"],
  ],
  [
    ["w", "n", "anti", "ccw", "out", "in"],
    ["w", "n", "pro", "cw", "in", "in"],
  ],
  [
    ["n", "w", "pro", "ccw", "in", "in"],
    ["n", "e", "pro", "cw", "in", "in"],
  ],
  [
    ["w", "s", "pro", "ccw", "in", "in"],
    ["e", "s", "pro", "cw", "in", "in"],
  ],
  [
    ["s", "e", "pro", "ccw", "in", "in"],
    ["s", "e", "anti", "cw", "in", "out"],
  ],
  [
    ["e", "n", "pro", "ccw", "in", "in"],
    ["e", "n", "anti", "cw", "out", "in"],
  ],
];
