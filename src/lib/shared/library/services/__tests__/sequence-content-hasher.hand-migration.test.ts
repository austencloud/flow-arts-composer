import { describe, expect, it } from "vitest";

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  computeHash,
  HASH_VERSION_V1,
  HASH_VERSION_V2,
} from "../sequence-content-hasher";

function motion(
  hand: HandSide,
  motionType: MotionType,
  rotationDirection: RotationDirection,
  startLocation: "n" | "s",
  endLocation: "e" | "w"
) {
  return {
    hand,
    motionType,
    rotationDirection,
    startLocation,
    endLocation,
    turns: 1,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
    handPath: null,
    gridMode: GridMode.DIAMOND,
    skewSteps: null,
    skewDir: null,
  };
}

const CANONICAL_SEQUENCE = {
  gridMode: GridMode.DIAMOND,
  steps: [
    {
      letter: "A",
      leftReversal: true,
      rightReversal: false,
      isBlank: false,
      duration: 1,
      motions: {
        left: motion(
          HandSide.LEFT,
          MotionType.PRO,
          RotationDirection.CLOCKWISE,
          "n",
          "e"
        ),
        right: motion(
          HandSide.RIGHT,
          MotionType.ANTI,
          RotationDirection.COUNTER_CLOCKWISE,
          "s",
          "w"
        ),
      },
    },
  ],
} as unknown as SequenceData;

describe("sequence content hashes across the hand-identity migration", () => {
  it("keeps the historical V1 preimage byte-for-byte stable", async () => {
    expect(await computeHash(CANONICAL_SEQUENCE, HASH_VERSION_V1)).toBe(
      "bb719e6e2e1608d6c2adeb7093acce24840edf7806f85af11e304b83f5d77714"
    );
  });

  it("keeps the active V2 preimage byte-for-byte stable", async () => {
    expect(await computeHash(CANONICAL_SEQUENCE, HASH_VERSION_V2)).toBe(
      "3b16f2700123d55a0679afd2663fda3b2abb66e4fd1c12e318eda4e19f2185f0"
    );
  });
});
