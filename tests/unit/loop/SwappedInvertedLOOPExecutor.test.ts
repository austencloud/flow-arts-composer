/**
 * SwappedInvertedLOOPExecutor Tests
 *
 * Tests the swapped-inverted LOOP pattern generation.
 * HIGH VALUE: This algorithm transforms sequences and errors would silently
 * produce incorrect choreography that users wouldn't immediately notice.
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
import { SwappedInvertedLOOPExecutor } from "$lib/features/create/generate/circular/services/swapped-inverted-loop-executor";
import type { IOrientationCalculator } from "../../../src/lib/shared/pictograph/prop/services/contracts/IOrientationCalculator";
import { Period } from "../../../src/lib/shared/foundation/domain/models/generation/circular-models";

// Mock OrientationCalculator that passes through unchanged
const mockOrientationCalculator: IOrientationCalculator = {
  updateStartOrientations: (beat: StepData, _previousBeat: StepData) => beat,
  updateEndOrientations: (beat: StepData) => beat,
  calculateEndOrientation: () => Orientation.IN,
  calculateStartOrientation: () => Orientation.IN,
};

describe("SwappedInvertedLOOPExecutor", () => {
  let executor: SwappedInvertedLOOPExecutor;

  beforeEach(() => {
    executor = new SwappedInvertedLOOPExecutor(mockOrientationCalculator);
  });

  describe("executeLOOP", () => {
    it("should correctly generate swapped-inverted completion with proper grid positions", () => {
      // Input sequence: β (beta5) → D (alpha3) → J (beta5)
      // This is an "already complete" sequence (ends at start position)
      const inputSequence: StepData[] = [
        // Start position (beat 0): β at beta5
        {
          id: "beat-0",
          stepNumber: 0,
          duration: 1.0,
          letter: Letter.β,
          startPlacement: GridPlacement.BETA5,
          endPlacement: GridPlacement.BETA5,
          motions: {
            [HandSide.LEFT]: {
              motionType: MotionType.STATIC,
              rotationDirection: RotationDirection.NO_ROTATION,
              startLocation: GridLocation.SOUTH,
              endLocation: GridLocation.SOUTH,
              turns: 0,
              startOrientation: Orientation.IN,
              endOrientation: Orientation.IN,
              color: HandSide.LEFT,
            },
            [HandSide.RIGHT]: {
              motionType: MotionType.STATIC,
              rotationDirection: RotationDirection.NO_ROTATION,
              startLocation: GridLocation.SOUTH,
              endLocation: GridLocation.SOUTH,
              turns: 0,
              startOrientation: Orientation.IN,
              endOrientation: Orientation.IN,
              color: HandSide.RIGHT,
            },
          },
          leftReversal: false,
          rightReversal: false,
          isBlank: false,
        },
        // Beat 1: D - beta5 → alpha3
        {
          id: "beat-1",
          stepNumber: 1,
          duration: 1.0,
          letter: Letter.D,
          startPlacement: GridPlacement.BETA5,
          endPlacement: GridPlacement.ALPHA3,
          motions: {
            [HandSide.LEFT]: {
              motionType: MotionType.PRO,
              rotationDirection: RotationDirection.CLOCKWISE,
              startLocation: GridLocation.SOUTH,
              endLocation: GridLocation.WEST,
              turns: 0,
              startOrientation: Orientation.IN,
              endOrientation: Orientation.IN,
              color: HandSide.LEFT,
            },
            [HandSide.RIGHT]: {
              motionType: MotionType.PRO,
              rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
              startLocation: GridLocation.SOUTH,
              endLocation: GridLocation.EAST,
              turns: 0,
              startOrientation: Orientation.IN,
              endOrientation: Orientation.IN,
              color: HandSide.RIGHT,
            },
          },
          leftReversal: false,
          rightReversal: false,
          isBlank: false,
        },
        // Beat 2: J - alpha3 → beta5
        {
          id: "beat-2",
          stepNumber: 2,
          duration: 1.0,
          letter: Letter.J,
          startPlacement: GridPlacement.ALPHA3,
          endPlacement: GridPlacement.BETA5,
          motions: {
            [HandSide.LEFT]: {
              motionType: MotionType.PRO,
              rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
              startLocation: GridLocation.WEST,
              endLocation: GridLocation.SOUTH,
              turns: 0,
              startOrientation: Orientation.IN,
              endOrientation: Orientation.IN,
              color: HandSide.LEFT,
            },
            [HandSide.RIGHT]: {
              motionType: MotionType.PRO,
              rotationDirection: RotationDirection.CLOCKWISE,
              startLocation: GridLocation.EAST,
              endLocation: GridLocation.SOUTH,
              turns: 0,
              startOrientation: Orientation.IN,
              endOrientation: Orientation.IN,
              color: HandSide.RIGHT,
            },
          },
          leftReversal: false,
          rightReversal: false,
          isBlank: false,
        },
      ];

      // Execute the LOOP
      const result = executor.executeLOOP([...inputSequence], Period.HALVED);

      // Should have 5 beats total: start + 2 original + 2 generated
      expect(result.length).toBe(5);

      // Beat 3 checks
      const beat3 = result[3];
      expect(beat3).toBeDefined();

      // Grid position should be SWAPPED: alpha3 → alpha7
      // (alpha3 = blue:west, red:east → alpha7 = blue:east, red:west)
      expect(beat3!.endPlacement).toBe(GridPlacement.ALPHA7);

      // Motion locations should be swapped pattern with inversion:
      // Blue does what Red did (s→e), Red does what Blue did (s→w)
      expect(beat3!.motions[HandSide.LEFT]?.startLocation).toBe(
        GridLocation.SOUTH
      );
      expect(beat3!.motions[HandSide.LEFT]?.endLocation).toBe(
        GridLocation.EAST
      );
      expect(beat3!.motions[HandSide.RIGHT]?.startLocation).toBe(
        GridLocation.SOUTH
      );
      expect(beat3!.motions[HandSide.RIGHT]?.endLocation).toBe(
        GridLocation.WEST
      );

      // Motion types should be inverted: PRO → ANTI
      expect(beat3!.motions[HandSide.LEFT]?.motionType).toBe(
        MotionType.ANTI
      );
      expect(beat3!.motions[HandSide.RIGHT]?.motionType).toBe(MotionType.ANTI);

      // Beat 4 checks
      const beat4 = result[4];
      expect(beat4).toBeDefined();

      // Should return to start position beta5
      expect(beat4!.endPlacement).toBe(GridPlacement.BETA5);

      // Blue should continue from where Blue ended (east → south)
      // Red should continue from where Red ended (west → south)
      expect(beat4!.motions[HandSide.LEFT]?.startLocation).toBe(
        GridLocation.EAST
      );
      expect(beat4!.motions[HandSide.LEFT]?.endLocation).toBe(
        GridLocation.SOUTH
      );
      expect(beat4!.motions[HandSide.RIGHT]?.startLocation).toBe(
        GridLocation.WEST
      );
      expect(beat4!.motions[HandSide.RIGHT]?.endLocation).toBe(
        GridLocation.SOUTH
      );

      // Motion types should be inverted: PRO → ANTI
      expect(beat4!.motions[HandSide.LEFT]?.motionType).toBe(
        MotionType.ANTI
      );
      expect(beat4!.motions[HandSide.RIGHT]?.motionType).toBe(MotionType.ANTI);
    });

    it("should reject sequences that don't return to start position", () => {
      // Sequence that ends at different position than start
      const invalidSequence: StepData[] = [
        {
          id: "beat-0",
          stepNumber: 0,
          duration: 1.0,
          letter: Letter.β,
          startPlacement: GridPlacement.BETA5,
          endPlacement: GridPlacement.BETA5,
          motions: {
            [HandSide.LEFT]: {
              motionType: MotionType.STATIC,
              rotationDirection: RotationDirection.NO_ROTATION,
              startLocation: GridLocation.SOUTH,
              endLocation: GridLocation.SOUTH,
              turns: 0,
              startOrientation: Orientation.IN,
              endOrientation: Orientation.IN,
              color: HandSide.LEFT,
            },
            [HandSide.RIGHT]: {
              motionType: MotionType.STATIC,
              rotationDirection: RotationDirection.NO_ROTATION,
              startLocation: GridLocation.SOUTH,
              endLocation: GridLocation.SOUTH,
              turns: 0,
              startOrientation: Orientation.IN,
              endOrientation: Orientation.IN,
              color: HandSide.RIGHT,
            },
          },
          leftReversal: false,
          rightReversal: false,
          isBlank: false,
        },
        {
          id: "beat-1",
          stepNumber: 1,
          duration: 1.0,
          letter: Letter.D,
          startPlacement: GridPlacement.BETA5,
          endPlacement: GridPlacement.ALPHA3, // Ends at alpha3, not beta5
          motions: {
            [HandSide.LEFT]: {
              motionType: MotionType.PRO,
              rotationDirection: RotationDirection.CLOCKWISE,
              startLocation: GridLocation.SOUTH,
              endLocation: GridLocation.WEST,
              turns: 0,
              startOrientation: Orientation.IN,
              endOrientation: Orientation.IN,
              color: HandSide.LEFT,
            },
            [HandSide.RIGHT]: {
              motionType: MotionType.PRO,
              rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
              startLocation: GridLocation.SOUTH,
              endLocation: GridLocation.EAST,
              turns: 0,
              startOrientation: Orientation.IN,
              endOrientation: Orientation.IN,
              color: HandSide.RIGHT,
            },
          },
          leftReversal: false,
          rightReversal: false,
          isBlank: false,
        },
      ];

      expect(() => {
        executor.executeLOOP([...invalidSequence], Period.HALVED);
      }).toThrow(/Invalid placement pair for swapped-inverted LOOP/);
    });

    // --- Regression guard: validation set is SWAPPED, not INVERTED ---
    // The canonical LOOPValidator (packages/sequence-engine) and MCP
    // validate_loop_options both gate SWAPPED_INVERTED on
    // SWAPPED_LOOP_VALIDATION_SET (end === swap(start)), NOT
    // INVERTED_LOOP_VALIDATION_SET (end === start). Real domain data:
    // Φ- is alpha1→alpha5 (blue s→n dash, red n→s dash) and
    // swap(alpha1) === alpha5.
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

    it("accepts a swap-valid partial whose end is swap(start) ≠ start", () => {
      // alpha1 (blue=S, red=N) → alpha5 (blue=N, red=S) via Φ- (self-inverted).
      // Under the OLD INVERTED gate this threw; under SWAPPED it is accepted and
      // the generated half closes back to the start position (alpha1).
      const partial: StepData[] = [
        alpha1StartBeat,
        {
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
        },
      ];

      const result = executor.executeLOOP([...partial], Period.HALVED);
      expect(result.length).toBe(3);
      // Generated second half swaps positions, returning to the start (alpha1)
      expect(result[result.length - 1]!.endPlacement).toBe(GridPlacement.ALPHA1);
    });

    it("rejects a start===end partial when swap(start) ≠ start (no longer INVERTED)", () => {
      // alpha1 → alpha1 satisfies the OLD INVERTED gate but NOT the correct
      // SWAPPED gate (swap(alpha1) === alpha5), so it must now be rejected.
      const partial: StepData[] = [
        alpha1StartBeat,
        {
          ...alpha1StartBeat,
          id: "beat-1",
          stepNumber: 1,
          letter: Letter.ALPHA,
        },
      ];

      expect(() =>
        executor.executeLOOP([...partial], Period.HALVED)
      ).toThrow(/Invalid placement pair for swapped-inverted LOOP/);
    });
  });
});
