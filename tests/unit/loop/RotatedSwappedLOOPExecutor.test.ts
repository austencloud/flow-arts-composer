/**
 * RotatedSwappedLOOPExecutor Tests
 *
 * Locks the validation-set fix: rotated-swapped LOOPs must validate against the
 * composed ROTATED_SWAPPED_{HALVED,QUARTERED}_VALIDATION_SET (end ===
 * SWAPPED(ROTATED(start))), NOT the pure-rotation HALVED_LOOPS/QUARTERED_LOOPS.
 * This matches the canonical LOOPValidator (packages/sequence-engine), the UI's
 * loop-validator, and MCP validate_loop_options.
 *
 * Real domain data: Φ- is alpha1→alpha5 (blue s→n dash, red n→s dash) and its
 * reverse alpha5→alpha1. For halved, swap(half(alpha1)) === swap(alpha5) ===
 * alpha1, so alpha1→alpha1 is rotated-swapped-valid while alpha1→alpha5 (the
 * pure-180° end) is NOT.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { StepData } from "../../../src/lib/shared/foundation/domain/models/step-data";
import { Letter } from "../../../src/lib/shared/foundation/domain/models/letter";
import {
  GridLocation,
  GridPlacement,
} from "../../../src/lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "../../../src/lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { RotatedSwappedLOOPExecutor } from "$lib/features/create/generate/circular/services/rotated-swapped-loop-executor";
import { Period } from "../../../src/lib/shared/foundation/domain/models/generation/circular-models";

const staticMotion = (color: HandSide, loc: GridLocation) => ({
  motionType: MotionType.STATIC,
  rotationDirection: RotationDirection.NO_ROTATION,
  startLocation: loc,
  endLocation: loc,
  turns: 0,
  startOrientation: Orientation.IN,
  endOrientation: Orientation.IN,
  color,
});

const dashMotion = (
  color: HandSide,
  from: GridLocation,
  to: GridLocation
) => ({
  motionType: MotionType.DASH,
  rotationDirection: RotationDirection.NO_ROTATION,
  startLocation: from,
  endLocation: to,
  turns: 0,
  startOrientation: Orientation.IN,
  endOrientation: Orientation.IN,
  color,
});

// alpha1 = (blue=S, red=N); alpha5 = (blue=N, red=S)
const alpha1StartBeat: StepData = {
  id: "beat-0",
  stepNumber: 0,
  duration: 1.0,
  letter: Letter.ALPHA,
  startPlacement: GridPlacement.ALPHA1,
  endPlacement: GridPlacement.ALPHA1,
  motions: {
    [HandSide.LEFT]: staticMotion(HandSide.LEFT, GridLocation.SOUTH),
    [HandSide.RIGHT]: staticMotion(HandSide.RIGHT, GridLocation.NORTH),
  },
  leftReversal: false,
  rightReversal: false,
  isBlank: false,
};

// Φ-: alpha1 → alpha5 (blue s→n dash, red n→s dash)
const phiDashForward: StepData = {
  id: "beat-1",
  stepNumber: 1,
  duration: 1.0,
  letter: Letter.PHI_DASH,
  startPlacement: GridPlacement.ALPHA1,
  endPlacement: GridPlacement.ALPHA5,
  motions: {
    [HandSide.LEFT]: dashMotion(
      HandSide.LEFT,
      GridLocation.SOUTH,
      GridLocation.NORTH
    ),
    [HandSide.RIGHT]: dashMotion(
      HandSide.RIGHT,
      GridLocation.NORTH,
      GridLocation.SOUTH
    ),
  },
  leftReversal: false,
  rightReversal: false,
  isBlank: false,
};

// Φ-: alpha5 → alpha1 (blue n→s dash, red s→n dash)
const phiDashReverse: StepData = {
  id: "beat-2",
  stepNumber: 2,
  duration: 1.0,
  letter: Letter.PHI_DASH,
  startPlacement: GridPlacement.ALPHA5,
  endPlacement: GridPlacement.ALPHA1,
  motions: {
    [HandSide.LEFT]: dashMotion(
      HandSide.LEFT,
      GridLocation.NORTH,
      GridLocation.SOUTH
    ),
    [HandSide.RIGHT]: dashMotion(
      HandSide.RIGHT,
      GridLocation.SOUTH,
      GridLocation.NORTH
    ),
  },
  leftReversal: false,
  rightReversal: false,
  isBlank: false,
};

describe("RotatedSwappedLOOPExecutor", () => {
  let executor: RotatedSwappedLOOPExecutor;

  beforeEach(() => {
    executor = new RotatedSwappedLOOPExecutor();
  });

  it("accepts a rotated-swapped-valid partial (end === swap(rotate(start)))", () => {
    // alpha1 → alpha5 → alpha1: end === alpha1 === swap(half(alpha1)).
    // Invalid under the OLD pure-rotation HALVED_LOOPS gate; valid now.
    const partial: StepData[] = [
      alpha1StartBeat,
      phiDashForward,
      phiDashReverse,
    ];

    const result = executor.executeLOOP([...partial], Period.HALVED);
    // start + 2 original + 2 generated
    expect(result.length).toBe(5);
    // The completed halved LOOP closes back to the start position
    expect(result[result.length - 1]!.endPlacement).toBe(GridPlacement.ALPHA1);
  });

  it("rejects the pure-180° end (alpha1 → alpha5) that only HALVED_LOOPS allowed", () => {
    // half(alpha1) === alpha5, so alpha1→alpha5 passed the OLD gate. The correct
    // rotated-swapped end is swap(half(alpha1)) === alpha1, so this must throw.
    const partial: StepData[] = [alpha1StartBeat, phiDashForward];

    expect(() =>
      executor.executeLOOP([...partial], Period.HALVED)
    ).toThrow(/Invalid placement pair for rotated-swapped/);
  });
});
