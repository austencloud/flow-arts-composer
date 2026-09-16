/**
 * Strict Mirrored LOOP Executor
 *
 * Supports both halved (period 2) and quartered (period 4) mirrored LOOPs.
 *
 * Period 2 (halved):
 *   Q1 (steps 1..N)       - partial (from input)
 *   Q2 (steps N+1..2N)    - vertical mirror of Q1
 *   Closes in placement + orientationally in 2N steps.
 *
 * Period 4 (quartered):
 *   Q1 (steps 1..N)       - partial
 *   Q2 (steps N+1..2N)    - vertical mirror of Q1 (returns to start placement)
 *   Q3 (steps 2N+1..3N)   - same placements/motions as Q1, new start orientation
 *   Q4 (steps 3N+1..4N)   - vertical mirror of Q3
 *   Closes in 4N steps when the partial's per-hand turn total is ≡ 1 or 3 (mod 4).
 *   L1/L2 partials have whole-turn totals (≡ 0 or 2) and close at period 2;
 *   L3+ partials with half turns can reach the period-4 parity.
 *
 * The period-4 mechanism works because the orientation wheel has 4-cycle
 * structure. Mirror is an order-2 reflection on the classification axis
 * (mirror twice = identity), but orientation evolves via turn accumulation
 * each pass. With the right turn parity, two mirror cycles advance the
 * wheel by 180° per cycle (or 90° per quarter), closing at pass 4.
 */

import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  RotationDirection,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type {
  GridPlacement,
  GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  updateStartOrientations,
  updateEndOrientations,
} from "$lib/shared/pictograph/prop/services/orientation-calculator";
import {
  VERTICAL_MIRROR_PLACEMENT_MAP,
  VERTICAL_MIRROR_LOCATION_MAP,
  MIRRORED_LOOP_VALIDATION_SET,
} from "../domain/constants/strict-loop-placement-maps";
import { Period } from "../domain/models/circular-models";
import { buildStrictQuarters } from "./loop-quarter-guard";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

export class StrictMirroredLOOPExecutor {
  constructor() {}

  /**
   * Execute the strict mirrored LOOP.
   *
   * @param sequence - Partial sequence including start placement at index 0.
   * @param period - HALVED → period 2 (default). QUARTERED → period 4.
   */
  executeLOOP(sequence: StepData[], period: Period): StepData[] {
    this._validateSequence(sequence);

    const startPlacement = sequence.shift();
    if (!startPlacement) {
      throw new Error("Sequence must have a start placement");
    }

    const partialLength = sequence.length;
    const requestedPeriod = period === Period.QUARTERED ? 4 : 2;

    // Odd quarters mirror, even quarters copy. The builder stops at period 2
    // when the seed already closes in orientation, so a zero-turn quartered
    // request never pads into a literal repeat (the YΦΔ×4 defect, 2026-07-10).
    buildStrictQuarters(
      sequence,
      partialLength,
      requestedPeriod,
      (s, p, n) => this._createMirroredEntry(s, p, n),
      (s, p, n) => this._createCopiedEntry(s, p, n)
    );

    sequence.unshift(startPlacement);
    return sequence;
  }

  /**
   * Validate that the partial sequence can perform a mirrored LOOP.
   * Requirement: vertical_mirror(start_placement) === end_placement.
   */
  private _validateSequence(sequence: StepData[]): void {
    if (sequence.length < 2) {
      throw new Error(
        "Sequence must have at least 2 steps (start placement + 1 step)"
      );
    }

    const startPos = sequence[0]!.startPlacement;
    const endPos = sequence[sequence.length - 1]!.endPlacement;

    if (!startPos || !endPos) {
      throw new Error("Sequence steps must have valid start and end placements");
    }

    const key = `${startPos},${endPos}`;

    if (!MIRRORED_LOOP_VALIDATION_SET.has(key)) {
      const expectedEnd =
        VERTICAL_MIRROR_PLACEMENT_MAP[startPos as GridPlacement];
      throw new Error(
        `Invalid placement pair for mirrored LOOP: ${startPos} → ${endPos}. ` +
          `For a mirrored LOOP from ${startPos}, the sequence must end at ${expectedEnd}.`
      );
    }
  }

  /**
   * Create a step that is the vertical mirror of a source step.
   * Used for Q2 and Q4 in the period-4 structure (and Q2 in period-2).
   */
  private _createMirroredEntry(
    sourceStep: StepData,
    previousStep: StepData,
    stepNumber: number
  ): StepData {
    const newEndPlacement = this._getMirroredPlacement(sourceStep);

    const newStep: StepData = {
      ...sourceStep,
      id: `step-${stepNumber}`,
      stepNumber,
      startPlacement: previousStep.endPlacement ?? null,
      endPlacement: newEndPlacement,
      motions: {
        [HandSide.LEFT]: this._createMirroredMotion(
          HandSide.LEFT,
          previousStep,
          sourceStep
        ),
        [HandSide.RIGHT]: this._createMirroredMotion(
          HandSide.RIGHT,
          previousStep,
          sourceStep
        ),
      },
    };

    const stepWithStartOri = updateStartOrientations(newStep, previousStep);
    return updateEndOrientations(stepWithStartOri);
  }

  /**
   * Create a step that copies a source step's placements/motions verbatim,
   * with orientations propagated from the previous step.
   * Used for Q3 in the period-4 structure (same letters as Q1, new orientations).
   */
  private _createCopiedEntry(
    sourceStep: StepData,
    previousStep: StepData,
    stepNumber: number
  ): StepData {
    const sourceLeft = sourceStep.motions[HandSide.LEFT];
    const sourceRight = sourceStep.motions[HandSide.RIGHT];
    if (!sourceLeft || !sourceRight) {
      throw new Error(
        `Source step ${sourceStep.stepNumber} is missing motion data`
      );
    }

    const newStep: StepData = {
      ...sourceStep,
      id: `step-${stepNumber}`,
      stepNumber,
      startPlacement: previousStep.endPlacement ?? null,
      endPlacement: sourceStep.endPlacement,
      motions: {
        [HandSide.LEFT]: {
          ...sourceLeft,
          startLocation:
            previousStep.motions[HandSide.LEFT]?.endLocation ??
            sourceLeft.startLocation,
        },
        [HandSide.RIGHT]: {
          ...sourceRight,
          startLocation:
            previousStep.motions[HandSide.RIGHT]?.endLocation ??
            sourceRight.startLocation,
        },
      },
    };

    const stepWithStartOri = updateStartOrientations(newStep, previousStep);
    return updateEndOrientations(stepWithStartOri);
  }

  private _getMirroredPlacement(sourceStep: StepData): GridPlacement | null {
    const endPos = sourceStep.endPlacement;
    if (!endPos) {
      throw new Error("Source step must have an end placement");
    }
    return VERTICAL_MIRROR_PLACEMENT_MAP[endPos as GridPlacement];
  }

  private _createMirroredMotion(
    hand: HandSide,
    previousStep: StepData,
    sourceStep: StepData
  ): MotionData {
    const previousMotion = previousStep.motions[hand];
    const sourceMotion = sourceStep.motions[hand];

    if (!previousMotion || !sourceMotion) {
      throw new Error(`Missing motion data for ${hand}`);
    }

    const mirroredEndLocation = this._getMirroredLocation(
      sourceMotion.endLocation as GridLocation
    );
    const mirroredPropRotDir = this._getMirroredPropRotDir(
      sourceMotion.rotationDirection
    );

    return {
      ...sourceMotion,
      startLocation: previousMotion.endLocation,
      endLocation: mirroredEndLocation,
      rotationDirection: mirroredPropRotDir,
      prefloatRotationDirection: sourceMotion.prefloatRotationDirection
        ? this._getMirroredPropRotDir(sourceMotion.prefloatRotationDirection)
        : undefined,
    };
  }

  private _getMirroredLocation(location: GridLocation): GridLocation {
    return VERTICAL_MIRROR_LOCATION_MAP[location];
  }

  private _getMirroredPropRotDir(
    propRotDir: RotationDirection
  ): RotationDirection {
    if (propRotDir === RotationDirection.CLOCKWISE) {
      return RotationDirection.COUNTER_CLOCKWISE;
    } else if (propRotDir === RotationDirection.COUNTER_CLOCKWISE) {
      return RotationDirection.CLOCKWISE;
    }
    return propRotDir;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
export const strictMirroredLOOPExecutor = new StrictMirroredLOOPExecutor();
