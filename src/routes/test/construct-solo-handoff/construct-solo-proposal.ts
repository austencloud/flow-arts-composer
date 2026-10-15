import type { AuthoredHand } from "#lib/shared/foundation/domain/models/authored-hand.js";
import {
  createSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createStartPlacementData } from "#lib/shared/create/factories/create-start-placement-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  createMotionData,
  isVisibleMotion,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
  type Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type {
  GridMode,
  GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { calculateEndOrientation } from "#lib/shared/pictograph/prop/services/orientation-calculator.js";
import { applyTurnToMotion } from "#lib/shared/create/services/apply-turns-to-motion.js";
import type { TurnValue } from "#lib/shared/create/services/level-turn-values.js";
import {
  extractLeftSoloProp,
  extractRightSoloProp,
} from "#lib/shared/foundation/services/sequence-decomposer.js";
import { soloPropToSequence } from "#lib/shared/foundation/services/solo-prop-sequence-adapter.js";
import { fuseSequences } from "#lib/features/fuse/services/sequence-fuser.js";

export const handName = (hand: AuthoredHand) =>
  hand === "left" ? "Blue" : "Red";
export const otherHand = (hand: AuthoredHand): AuthoredHand =>
  hand === "left" ? "right" : "left";

export function createSoloStart(
  hand: AuthoredHand,
  gridMode: GridMode,
  location: GridLocation,
  orientation: Orientation
): SequenceData {
  const startPlacement = createStartPlacementData({
    gridMode,
    motions: {
      [hand]: createMotionData({
        hand,
        gridMode,
        motionType: MotionType.STATIC,
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: 0,
        startLocation: location,
        endLocation: location,
        startOrientation: orientation,
        endOrientation: orientation,
      }),
    },
  });
  return createSequenceData({
    name: handName(hand) + " path",
    gridMode,
    steps: [],
    sequenceLength: 0,
    startPlacement,
    startingPlacement: startPlacement,
    metadata: { artifactKind: "solo-prop", authoredHand: hand },
  });
}

export function soloEndpoint(sequence: SequenceData, hand: AuthoredHand) {
  return (
    sequence.steps.at(-1)?.motions[hand] ??
    sequence.startPlacement?.motions[hand]
  );
}

/** Project the production catalog onto one hand, then use Construct's turn rules. */
export function createSoloContinuationOptions(
  catalog: readonly PictographData[],
  sequence: SequenceData,
  authoredHand: AuthoredHand,
  settings: { turns?: TurnValue; direction?: RotationDirection } | number = 8
): StepData[] {
  const endpoint = soloEndpoint(sequence, authoredHand);
  if (!isVisibleMotion(endpoint)) return [];
  const hand = authoredHand === "left" ? HandSide.LEFT : HandSide.RIGHT;
  const limit = typeof settings === "number" ? settings : Infinity;
  const turnSettings = typeof settings === "number" ? {} : settings;
  const turns = turnSettings.turns ?? 0;
  const seen = new Set<string>();
  const options: StepData[] = [];
  for (const candidate of catalog) {
    if (options.length >= limit) break;
    const source = candidate.motions[hand];
    if (
      !isVisibleMotion(source) ||
      source.startLocation !== endpoint.endLocation
    )
      continue;
    const isShift =
      source.motionType === MotionType.PRO ||
      source.motionType === MotionType.ANTI;
    // A float is a shift with no prop rotation, not a zero-turn dash/static.
    if (turns === "fl" && !isShift) continue;
    const seed = createMotionData({
      ...source,
      hand,
      gridMode: sequence.gridMode,
      startOrientation: endpoint.endOrientation,
      rotationDirection:
        !isShift && typeof turns === "number" && turns > 0
          ? (turnSettings.direction ?? RotationDirection.CLOCKWISE)
          : source.rotationDirection,
    });
    const base = createMotionData({
      ...seed,
      endOrientation: calculateEndOrientation(seed, hand),
    });
    const motion = applyTurnToMotion(
      turns,
      base,
      hand,
      sequence.steps,
      sequence.steps.length
    ).motion;
    if (!motion) continue;
    const signature = [
      motion.motionType,
      motion.endLocation,
      motion.rotationDirection,
      motion.turns,
      motion.endOrientation,
    ].join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);
    options.push(
      createStepData({
        id: "solo-option-" + hand + "-" + signature,
        stepNumber: sequence.steps.length + 1,
        gridMode: sequence.gridMode,
        duration: 1,
        motions: { [hand]: motion },
      })
    );
  }
  return options;
}

/** Rebuild the canonical solo composition too; never leave an imported hash stale. */
export function appendSoloContinuation(
  sequence: SequenceData,
  option: StepData
): SequenceData {
  const hand = isVisibleMotion(option.motions.left)
    ? HandSide.LEFT
    : HandSide.RIGHT;
  const endpoint = soloEndpoint(sequence, hand);
  const motion = option.motions[hand];
  if (
    !isVisibleMotion(endpoint) ||
    !isVisibleMotion(motion) ||
    isVisibleMotion(option.motions[otherHand(hand)]) ||
    endpoint.endLocation !== motion.startLocation ||
    endpoint.endOrientation !== motion.startOrientation
  ) {
    throw new Error("This motion does not continue the active solo path.");
  }
  const steps = [
    ...sequence.steps,
    createStepData({
      ...option,
      id: crypto.randomUUID(),
      stepNumber: sequence.steps.length + 1,
    }),
  ];
  const draft = { ...sequence, steps };
  const solo =
    hand === HandSide.LEFT
      ? extractLeftSoloProp(draft)
      : extractRightSoloProp(draft);
  const rebuilt = soloPropToSequence(
    { ...solo, name: sequence.name, authoredHand: hand },
    hand
  );
  // Keep presentation identities stable while the canonical composition changes.
  return {
    ...rebuilt,
    id: sequence.id,
    steps,
    startPlacement: sequence.startPlacement,
    startingPlacement: sequence.startingPlacement,
  };
}

/** This authoring flow aligns one step at a time. Never tile or truncate a draft. */
export function pairSoloReviewSequences(
  blue: SequenceData,
  red: SequenceData
): SequenceData {
  if (
    !blue.steps.length ||
    blue.steps.length !== red.steps.length ||
    blue.steps.some((step, i) => step.duration !== red.steps[i]?.duration)
  ) {
    throw new Error(
      "Both paths need the same number and duration of steps before combining."
    );
  }
  const fused = fuseSequences(
    extractLeftSoloProp(blue),
    extractRightSoloProp(red),
    { maxSteps: blue.steps.length }
  );
  const startPlacement = createStartPlacementData({
    gridMode: fused.gridMode,
    motions: {
      left: blue.startPlacement?.motions.left,
      right: red.startPlacement?.motions.right,
    },
  });
  return {
    ...fused,
    startPlacement,
    startingPlacement: startPlacement,
    metadata: { ...fused.metadata, artifactKind: "sequence" },
  };
}
