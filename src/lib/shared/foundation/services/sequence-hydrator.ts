import { deriveSteps } from "$lib/shared/foundation/services/step-deriver";
import {
  extractLeftSoloProp,
  extractRightSoloProp,
  extractStepPairings,
} from "./sequence-decomposer";
import type { SequenceData } from "../domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { calculateHandpathDirection } from "$lib/shared/pictograph/arrow/positioning/calculation/services/handpath-direction-calculator";
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";
import { startPlacementDeriver } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
import { ensureStepPlacement } from "$lib/shared/pictograph/shared/services/motion-placement";
import { normalizeLegacySequence } from "@tka/tka-types";

// Legacy sequences saved before SoloPropStepData carried prefloatMotionType
// will arrive here with derived float motions whose prefloat fields are
// undefined, even though the original sequence.steps Firestore blob still
// holds them. This walks the derived steps and copies prefloat metadata back
// in, deriving prefloatRotationDirection from start/end + prefloatMotionType.
function backfillPrefloatFromLegacySteps(
  derived: StepData[],
  original: readonly StepData[]
): StepData[] {
  if (!original || original.length === 0) return derived;

  return derived.map((step, i) => {
    const orig = original[i];
    if (!orig?.motions) return step;

    const left = step.motions?.left;
    const right = step.motions?.right;
    const origLeft = orig.motions.left;
    const origRight = orig.motions.right;

    const needsLeftBackfill =
      left?.motionType === MotionType.FLOAT &&
      !left.prefloatMotionType &&
      origLeft?.prefloatMotionType;
    const needsRightBackfill =
      right?.motionType === MotionType.FLOAT &&
      !right.prefloatMotionType &&
      origRight?.prefloatMotionType;

    if (!needsLeftBackfill && !needsRightBackfill) return step;

    const patched = { ...step, motions: { ...step.motions } };

    if (needsLeftBackfill && left && origLeft) {
      const handpath = calculateHandpathDirection(
        left.startLocation,
        left.endLocation
      );
      const prefRot =
        handpath === "cw"
          ? origLeft.prefloatMotionType === MotionType.PRO
            ? RotationDirection.CLOCKWISE
            : RotationDirection.COUNTER_CLOCKWISE
          : handpath === "ccw"
            ? origLeft.prefloatMotionType === MotionType.PRO
              ? RotationDirection.COUNTER_CLOCKWISE
              : RotationDirection.CLOCKWISE
            : undefined;

      patched.motions.left = {
        ...left,
        prefloatMotionType: origLeft.prefloatMotionType,
        ...(prefRot && { prefloatRotationDirection: prefRot }),
      };
    }

    if (needsRightBackfill && right && origRight) {
      const handpath = calculateHandpathDirection(
        right.startLocation,
        right.endLocation
      );
      const prefRot =
        handpath === "cw"
          ? origRight.prefloatMotionType === MotionType.PRO
            ? RotationDirection.CLOCKWISE
            : RotationDirection.COUNTER_CLOCKWISE
          : handpath === "ccw"
            ? origRight.prefloatMotionType === MotionType.PRO
              ? RotationDirection.COUNTER_CLOCKWISE
              : RotationDirection.CLOCKWISE
            : undefined;

      patched.motions.right = {
        ...right,
        prefloatMotionType: origRight.prefloatMotionType,
        ...(prefRot && { prefloatRotationDirection: prefRot }),
      };
    }

    return patched;
  });
}

/**
 * Reconstruct the start-placement pictograph from a sequence's first step.
 * Delegates to the canonical StartPlacementDeriver, which computes the actual
 * start POSITION (alpha/beta/gamma) from the first step's blue+red start
 * locations and places both props STATIC there. Shared by hydrate() (runtime)
 * and ensureComposition() (persist time) so a sequence always carries a
 * renderable start cell — labelled with the position glyph, NOT the first
 * step's letter (the bug that showed U/B/V… in the start cell). Returns
 * undefined when the first step lacks the blue/red motions to derive from.
 */
export function deriveStartPlacementFromSteps(
  steps: readonly StepData[]
): SequenceData["startPlacement"] | undefined {
  const first = steps[0];
  // Invisible placeholder = hand not really there (both-required Step shape);
  // deriving a start cell from a placeholder's default location would lie.
  if (
    !isVisibleMotion(first?.motions?.left) ||
    !isVisibleMotion(first?.motions?.right)
  )
    return undefined;
  try {
    return startPlacementDeriver.deriveFromFirstStep(
      first
    ) as SequenceData["startPlacement"];
  } catch {
    return undefined;
  }
}

/**
 * Re-derives StepData from compositional fields (SoloPropData + StepPairingData).
 * Ensures derived fields are up-to-date with current domain logic.
 */
export function hydrate(sequence: SequenceData): SequenceData {
  sequence = normalizeLegacySequence(sequence);
  // constructed creatorIntent from legacy fields
  if (!sequence.creatorIntent) {
    const legacyPropConfig = sequence.intendedProp;
    const legacyEffort = sequence.effortTimeline;

    if (legacyPropConfig || legacyEffort) {
      // No recorded prop intent means propConfig stays absent. A staff/staff
      // default here would persist as an indistinguishable fake recording.
      sequence = {
        ...sequence,
        creatorIntent: {
          ...(legacyPropConfig && {
            propConfig: {
              leftPropType: legacyPropConfig.leftPropType,
              rightPropType: legacyPropConfig.rightPropType,
              catDogMode: legacyPropConfig.catDogMode,
            },
          }),
          ...(legacyEffort && { effortTimeline: legacyEffort }),
        },
      };
    }
  }

  if (
    sequence.leftSoloProp &&
    sequence.rightSoloProp &&
    sequence.stepPairings &&
    sequence.stepPairings.length > 0
  ) {
    const derived = deriveSteps(
      sequence.leftSoloProp,
      sequence.rightSoloProp,
      sequence.stepPairings,
      {
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
        catDogMode: false,
      }
    );

    const steps = backfillPrefloatFromLegacySteps(derived, sequence.steps);

    // A stored startPlacement is kept as-is (the `??` only derives when it is
    // absent), so an older document's start cell arrives with motions that
    // predate arrow/propPlacementData — and the renderer drops props and
    // arrows SILENTLY for exactly that shape. Backfill before returning.
    const storedStart =
      sequence.startPlacement ?? deriveStartPlacementFromSteps(steps);
    const startPlacement = storedStart
      ? ensureStepPlacement(storedStart)
      : undefined;

    const hydrated = {
      ...sequence,
      steps,
      ...(startPlacement && { startPlacement }),
    };
    return hydrated.steps.length > 0
      ? reversalDetector.processReversals(hydrated)
      : hydrated;
  }

  // Compositional fields missing - steps won't be derived here.
  // The sequence predates ensureComposition() or was saved by a path that
  // skips it. No action needed: ensureComposition() runs on every save
  // (library-repository) and on publish (library-batch-operations), so the
  // doc self-heals the next time it's touched. Read-time consumers that need
  // the fields immediately derive them on the fly (see hand-path explorer).
  // There is no bulk migration script - that path is archived in favour of
  // lazy heal-on-save (content-hash V2).
  if (sequence.steps.length > 0 && !sequence.leftSoloProp) {
    console.debug(
      `[SequenceHydrator] Sequence "${sequence.word || sequence.id}" has steps but no ` +
        `compositional fields; will heal on next save/publish. Derive read-time if needed.`
    );
  }

  // This branch returns STORED steps untouched (they are only rebuilt when the
  // compositional fields are present, above), so they need the same guarantee
  // the derived ones get for free from createMotionData.
  const withPlacement = {
    ...sequence,
    steps: sequence.steps.map(ensureStepPlacement),
    ...(sequence.startPlacement && {
      startPlacement: ensureStepPlacement(sequence.startPlacement),
    }),
  };

  return withPlacement.steps.length > 0
    ? reversalDetector.processReversals(withPlacement)
    : withPlacement;
}

export function ensureComposition(sequence: SequenceData): SequenceData {
  sequence = normalizeLegacySequence(sequence);
  // Nothing to decompose from an empty sequence.
  if (sequence.steps.length === 0) return sequence;

  const leftSoloProp = extractLeftSoloProp(sequence);
  const rightSoloProp = extractRightSoloProp(sequence);
  const stepPairings = extractStepPairings(sequence);

  // Persist a start position alongside the compositional fields. It is NOT
  // derivable from left/rightSoloProp + stepPairings alone, so without this the
  // saved doc (and its public mirror) renders an empty start cell — exactly the
  // bug the 2026-06 backfill repaired. Deriving here keeps every save/publish
  // self-sufficient instead of relying on read-time hydrate().
  // Persist-time twin of the read-time backfill above: a doc saved from an
  // already-lean startPlacement would otherwise write the propless shape back.
  const derivedStart =
    sequence.startPlacement ?? deriveStartPlacementFromSteps(sequence.steps);
  const startPlacement = derivedStart
    ? ensureStepPlacement(derivedStart)
    : undefined;

  return {
    ...sequence,
    leftSoloProp,
    rightSoloProp,
    stepPairings,
    leftPathHash: leftSoloProp.handPath.contentHash,
    rightPathHash: rightSoloProp.handPath.contentHash,
    leftSoloHash: leftSoloProp.contentHash,
    rightSoloHash: rightSoloProp.contentHash,
    ...(startPlacement && { startPlacement }),
  };
}
