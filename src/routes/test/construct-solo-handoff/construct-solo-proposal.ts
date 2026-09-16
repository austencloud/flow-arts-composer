import type { AuthoredHand } from "$lib/shared/foundation/domain/models/authored-hand";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import {
  createMotionData,
  isVisibleMotion,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { calculateEndOrientation } from "$lib/shared/pictograph/prop/services/orientation-calculator";

function handSide(authoredHand: AuthoredHand): HandSide {
  return authoredHand === "left" ? HandSide.LEFT : HandSide.RIGHT;
}

function optionSignature(option: PictographData, hand: HandSide): string {
  const motion = option.motions[hand];
  if (!motion) return "";
  return [
    motion.motionType,
    motion.endLocation,
    motion.rotationDirection,
    motion.turns,
  ].join("|");
}

/**
 * Builds the review surface's solo continuation choices from the same motion
 * catalog Construct uses. The missing hand remains an invisible placeholder,
 * so every preview is rendered by the production pictograph stack without
 * pretending that a red motion already exists.
 */
export function createSoloContinuationOptions(
  catalog: PictographData[],
  sequence: SequenceData,
  authoredHand: AuthoredHand,
  limit = 8
) {
  const hand = handSide(authoredHand);
  const lastStep = sequence.steps.at(-1);
  const lastMotion = lastStep?.motions[hand];
  if (!lastMotion || !isVisibleMotion(lastMotion)) return [];

  const seen = new Set<string>();
  const options = [];

  for (const candidate of catalog) {
    const source = candidate.motions[hand];
    if (!source || !isVisibleMotion(source)) continue;
    if (source.startLocation !== lastMotion.endLocation) continue;

    const signature = optionSignature(candidate, hand);
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);

    const motionSeed = createMotionData({
      ...source,
      hand,
      gridMode: sequence.gridMode,
      startOrientation: lastMotion.endOrientation,
      isVisible: true,
    });
    const motion = createMotionData({
      ...motionSeed,
      endOrientation: calculateEndOrientation(motionSeed, hand),
    });

    options.push(
      createStepData({
        id: `solo-option-${authoredHand}-${signature}`,
        stepNumber: sequence.steps.length + 1,
        gridMode: sequence.gridMode,
        duration: 1,
        motions: { [hand]: motion },
      })
    );

    if (options.length >= limit) break;
  }

  return options;
}

export function appendSoloContinuation(
  sequence: SequenceData,
  option: SequenceData["steps"][number]
): SequenceData {
  const stepNumber = sequence.steps.length + 1;
  const step = createStepData({
    ...option,
    id: `solo-review-step-${stepNumber}`,
    stepNumber,
  });
  const steps = [...sequence.steps, step];
  return createSequenceData({
    ...sequence,
    steps,
    sequenceLength: steps.length,
  });
}

export function pairSoloReviewSequences(
  blue: SequenceData,
  red: SequenceData
): SequenceData {
  const length = Math.min(blue.steps.length, red.steps.length);
  const steps = Array.from({ length }, (_, index) =>
    createStepData({
      id: `solo-review-pair-${index + 1}`,
      stepNumber: index + 1,
      gridMode: blue.gridMode,
      duration: blue.steps[index]?.duration ?? 1,
      motions: {
        [HandSide.LEFT]: blue.steps[index]!.motions[HandSide.LEFT],
        [HandSide.RIGHT]: red.steps[index]!.motions[HandSide.RIGHT],
      },
    })
  );

  const blueStart = blue.startPlacement ?? blue.startingPlacement;
  const redStart = red.startPlacement ?? red.startingPlacement;
  const startPlacement = createStartPlacementData({
    id: "construct-solo-review-paired-start",
    motions: {
      [HandSide.LEFT]: blueStart?.motions[HandSide.LEFT],
      [HandSide.RIGHT]: redStart?.motions[HandSide.RIGHT],
    },
  });

  return createSequenceData({
    ...blue,
    id: "construct-solo-review-paired",
    name: "Smooth box pair",
    displayName: "Smooth box pair",
    steps,
    startPlacement,
    startingPlacement: startPlacement,
    sequenceLength: steps.length,
    metadata: {
      artifactKind: "sequence",
    },
  });
}
