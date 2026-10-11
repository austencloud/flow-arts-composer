import { describe, expect, it } from "vitest";
import { fuseSequences } from "#lib/features/fuse/services/sequence-fuser.js";
import { createCircularFuseSoloSequence } from "#lib/features/fuse/services/fuse-solo-sequence.js";
import { processReversals } from "#lib/shared/create/services/reversal-detector.js";
import type { SoloPropData } from "#lib/shared/foundation/domain/models/solo-prop-data.js";
import type { SoloPropStepData } from "#lib/shared/foundation/domain/models/solo-prop-step-data.js";
import { soloPropToSequence } from "#lib/shared/foundation/services/solo-prop-sequence-adapter.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

function makeSoloProp(
  id: string,
  directions: readonly RotationDirection[]
): SoloPropData {
  const route = [
    GridLocation.NORTH,
    GridLocation.EAST,
    GridLocation.SOUTH,
    GridLocation.WEST,
  ];
  const locations = Array.from(
    { length: directions.length + 1 },
    (_, index) => route[index % route.length]!
  );
  locations[locations.length - 1] = locations[0]!;

  const steps: SoloPropStepData[] = directions.map((direction, index) => ({
    startLocation: locations[index]!,
    endLocation: locations[index + 1]!,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    motionType: MotionType.PRO,
    rotationDirection: direction,
    turns: 0,
    duration: 1,
  }));

  return {
    id,
    steps,
    startLocation: locations[0]!,
    startOrientation: Orientation.IN,
    contentHash: `${id}-content`,
    handPath: {
      id: `${id}-path`,
      locations,
      contentHash: `${id}-path-content`,
      startLocation: locations[0]!,
      endLocation: locations[locations.length - 1]!,
      length: directions.length,
      bigrams: [],
      uniqueLocations: [...new Set(locations)],
      impliedGridMode: GridMode.DIAMOND,
      isClosed: true,
    },
    length: directions.length,
    bigrams: [],
    impliedGridMode: GridMode.DIAMOND,
  };
}

const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;

describe("Fuse reversal contract", () => {
  it("restores reversal flags when a transformed follower solo is rebuilt for its card", () => {
    const rebuilt = createCircularFuseSoloSequence(
      "red",
      makeSoloProp("rebuilt-follower", [CW, CCW, CCW, CW])
    );

    expect(rebuilt.isCircular).toBe(true);
    expect(rebuilt.steps.map((step) => step.leftReversal)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(rebuilt.steps.map((step) => step.rightReversal)).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it("uses isCircular for a one-hand LOOP that has no two-hand LOOP label", () => {
    const raw = soloPropToSequence(makeSoloProp("solo", [CW, CCW]), "left");

    const linear = processReversals({ ...raw, isCircular: false });
    const circular = processReversals({ ...raw, isCircular: true });

    expect(linear.steps.map((step) => step.leftReversal)).toEqual([
      false,
      true,
    ]);
    expect(circular.steps.map((step) => step.leftReversal)).toEqual([
      true,
      true,
    ]);
  });

  it("keeps fused steps and pairings aligned across internal and seam reversals", () => {
    const fused = fuseSequences(
      makeSoloProp("blue", [CW, CCW, CCW, CW]),
      makeSoloProp("red", [CW, CW, CW, CCW])
    );

    expect(fused.isCircular).toBe(true);
    expect(fused.steps.map((step) => step.leftReversal)).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(fused.steps.map((step) => step.rightReversal)).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(fused.stepPairings?.map((pairing) => pairing.leftReversal)).toEqual(
      fused.steps.map((step) => step.leftReversal)
    );
    expect(fused.stepPairings?.map((pairing) => pairing.rightReversal)).toEqual(
      fused.steps.map((step) => step.rightReversal)
    );
  });
});
