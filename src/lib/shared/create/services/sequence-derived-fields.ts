/**
 * Sequence Derived-Field Reconciliation
 *
 * gridMode, startPlacement and endPlacement are pure functions of the two hand
 * locations. They are also stored on steps/motions and historically mutated
 * independently of the motions, so single-hand edits leave them stale and
 * corrupt. These helpers recompute them from the motions so stored copies are
 * never trusted — only recomputed. Letter is async and handled separately
 * (deriveSequenceLetters / recalculateLetterForBeat).
 */
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { updateSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { deriveGridMode } from "$lib/shared/pictograph/grid/services/grid-mode-deriver";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { rotateMotion } from "./motion-transforms";

/**
 * Recompute gridMode + start/end placements from a step's motions.
 *
 * - Plain object spread (NOT createStepData — that factory drops gridMode).
 * - Placements are guarded: getGridPlacementFromLocations throws on a corrupt
 *   location pair, in which case the prior value is kept (an in-flight/invalid
 *   intermediate must not crash the editor).
 * - Blank / single-hand steps pass through unchanged.
 */
export function reconcileStepDerived<T extends StepData>(step: T): T {
  if (!step || step.isBlank) return step;

  const left = step.motions?.[HandSide.LEFT];
  const right = step.motions?.[HandSide.RIGHT];
  // A hand that is "not really there" is an invisible placeholder under the
  // both-required Step shape — same pass-through as the old absent-hand skip
  // (deriving placements from a placeholder's default location would corrupt).
  if (!isVisibleMotion(left) || !isVisibleMotion(right)) return step;

  const gridMode: GridMode = deriveGridMode(left, right);

  let startPlacement = step.startPlacement ?? null;
  let endPlacement = step.endPlacement ?? null;
  try {
    startPlacement = getGridPlacementFromLocations(
      left.startLocation,
      right.startLocation
    );
  } catch {
    /* keep prior — corrupt/intermediate location pair */
  }
  try {
    endPlacement = getGridPlacementFromLocations(
      left.endLocation,
      right.endLocation
    );
  } catch {
    /* keep prior */
  }

  return {
    ...step,
    gridMode,
    startPlacement,
    endPlacement,
    motions: {
      ...step.motions,
      [HandSide.LEFT]: { ...left, gridMode },
      [HandSide.RIGHT]: { ...right, gridMode },
    },
  };
}

/**
 * Reconcile every step's derived fields and recompute the sequence-level
 * gridMode summary from the reconciled steps (a sequence's steps are normally
 * uniform; the per-step/per-motion gridMode is the authoritative copy).
 */
export function normalizeSequenceDerived(seq: SequenceData): SequenceData {
  const steps = seq.steps.map((s) => reconcileStepDerived(s));

  const firstReal = steps.find(
    (s) =>
      !s.isBlank &&
      isVisibleMotion(s.motions?.[HandSide.LEFT]) &&
      isVisibleMotion(s.motions?.[HandSide.RIGHT])
  );
  const gridMode = firstReal?.gridMode ?? seq.gridMode;

  return updateSequenceData(seq, { steps, gridMode });
}

/** Minimal pose shape shared by StepData and StartPlacementData for rotation.
 *  Motions stay partial here: StartPlacementData is a pictograph-level pose. */
type RotatablePose = {
  motions?: Partial<Record<HandSide, MotionData | undefined>>;
  isBlank?: boolean;
};

/** Rotate one pose's hand locations by `steps` × 45°, then reconcile its derived
 *  fields (placements + gridMode) from the rotated motions. */
function rotatePose<T extends RotatablePose>(pose: T, steps: number): T {
  if (pose.isBlank) return pose;
  const left = pose.motions?.[HandSide.LEFT];
  const right = pose.motions?.[HandSide.RIGHT];
  if (!left && !right) return pose;
  const rotatedMotions = {
    ...pose.motions,
    ...(left ? { [HandSide.LEFT]: rotateMotion(left, steps) } : {}),
    ...(right ? { [HandSide.RIGHT]: rotateMotion(right, steps) } : {}),
  };
  return reconcileStepDerived({
    ...pose,
    motions: rotatedMotions,
  } as unknown as StepData) as unknown as T;
}

/**
 * Rotate an entire sequence's geometry by `steps` × 45° (sign = direction: +1 CW,
 * −1 CCW) and reconcile derived fields. This is the sync box-mode transform —
 * letters are rotation-invariant so NO dataset lookup is needed, and gridMode
 * flips (diamond↔box on odd steps) via the reconciler. Pure; never mutates `seq`.
 */
export function rotateSequenceGeometry(seq: SequenceData, steps: number): SequenceData {
  if (steps === 0) return seq;

  const rotatedSteps = seq.steps.map((s) => rotatePose(s, steps));
  const startPlacement = seq.startPlacement
    ? rotatePose(seq.startPlacement, steps)
    : seq.startPlacement;
  const startingPlacement = seq.startingPlacement
    ? rotatePose(seq.startingPlacement, steps)
    : seq.startingPlacement;

  const firstReal = rotatedSteps.find(
    (s) =>
      !s.isBlank &&
      isVisibleMotion(s.motions?.[HandSide.LEFT]) &&
      isVisibleMotion(s.motions?.[HandSide.RIGHT])
  );
  const gridMode = firstReal?.gridMode ?? startPlacement?.gridMode ?? seq.gridMode;

  return updateSequenceData(seq, {
    steps: rotatedSteps,
    startPlacement,
    startingPlacement,
    gridMode,
  });
}
