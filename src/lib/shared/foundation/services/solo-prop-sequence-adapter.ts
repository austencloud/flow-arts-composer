import type { HandPathData } from "../domain/models/hand-path-data";
import type { SequenceData } from "../domain/models/sequence-data";
import type { SoloPropData } from "../domain/models/solo-prop-data";
import type { SoloPropStepData } from "../domain/models/solo-prop-step-data";
import { createSequenceData } from "../domain/models/sequence-data";
import { createStepData } from "../domain/factories/create-step-data";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { AuthoredHand } from "../domain/models/authored-hand";
import { motionHandForAuthoredHand } from "./sequence-motion-profile";
import { hashSoloProp } from "./content-hasher";

function buildMotion(
  step: SoloPropStepData,
  hand: HandSide,
  gridMode: SoloPropData["impliedGridMode"]
) {
  return createMotionData({
    motionType: step.motionType,
    rotationDirection: step.rotationDirection,
    startLocation: step.startLocation,
    endLocation: step.endLocation,
    turns: step.turns,
    startOrientation: step.startOrientation,
    endOrientation: step.endOrientation,
    handPath: step.handPath ?? null,
    skewSteps: step.skewSteps ?? null,
    skewDir: step.skewDir ?? null,
    ...(step.prefloatMotionType && {
      prefloatMotionType: step.prefloatMotionType,
    }),
    hand,
    gridMode,
    arrowLocation: step.startLocation,
    isVisible: true,
  });
}

function buildStartMotion(soloProp: SoloPropData, hand: HandSide) {
  return createMotionData({
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: soloProp.startLocation,
    endLocation: soloProp.startLocation,
    turns: 0,
    startOrientation: soloProp.startOrientation,
    endOrientation: soloProp.startOrientation,
    hand,
    gridMode: soloProp.impliedGridMode,
    arrowLocation: soloProp.startLocation,
    isVisible: true,
  });
}

export function soloPropToSequence(
  soloProp: SoloPropData,
  authoredHand: AuthoredHand = soloProp.authoredHand ?? "left",
  options?: { sourceSoloPropId?: string }
): SequenceData {
  const hand = motionHandForAuthoredHand(authoredHand);
  const steps = soloProp.steps.map((step, index) =>
    createStepData({
      stepNumber: index + 1,
      duration: step.duration,
      gridMode: soloProp.impliedGridMode,
      letter: null,
      motions: {
        [hand]: buildMotion(step, hand, soloProp.impliedGridMode),
      },
    })
  );
  const startPlacement = createStartPlacementData({
    gridPlacement: null,
    motions: {
      [hand]: buildStartMotion(soloProp, hand),
    },
  });
  const title =
    soloProp.name ??
    `${authoredHand === "left" ? "Left" : "Right"}-hand choreography`;

  return createSequenceData({
    id: soloProp.id,
    name: title,
    displayName: title,
    word: "",
    steps,
    startPlacement,
    startingPlacement: startPlacement,
    sequenceLength: steps.length,
    gridMode: soloProp.impliedGridMode,
    notes: soloProp.notes,
    author: soloProp.author,
    ownerId: soloProp.ownerId,
    ownerDisplayName: soloProp.ownerDisplayName,
    thumbnails: soloProp.thumbnails ?? [],
    metadata: {
      artifactKind: "solo-prop",
      authoredHand,
      soloPropContentHash: soloProp.contentHash,
      ...(options?.sourceSoloPropId && {
        sourceSoloPropId: options.sourceSoloPropId,
      }),
    },
    ...(hand === HandSide.LEFT
      ? {
          leftSoloProp: soloProp,
          leftSoloHash: soloProp.contentHash,
          leftPathHash: soloProp.handPath.contentHash,
        }
      : {
          rightSoloProp: soloProp,
          rightSoloHash: soloProp.contentHash,
          rightPathHash: soloProp.handPath.contentHash,
        }),
  });
}

export function handPathToSequence(
  handPath: HandPathData,
  authoredHand: AuthoredHand = "left"
): SequenceData {
  if (handPath.locations.length < 2) {
    throw new RangeError(
      "handPathToSequence: a visible path needs at least two locations"
    );
  }

  const steps: SoloPropStepData[] = [];
  for (let index = 0; index < handPath.locations.length - 1; index += 1) {
    steps.push({
      startLocation: handPath.locations[index]!,
      endLocation: handPath.locations[index + 1]!,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      motionType: MotionType.STATIC,
      rotationDirection: RotationDirection.NO_ROTATION,
      turns: 0,
      duration: 1,
    });
  }

  const contentHash = hashSoloProp({
    steps,
    startLocation: handPath.startLocation,
    startOrientation: Orientation.IN,
  });
  const soloProp: SoloPropData = {
    id: handPath.id,
    steps,
    startLocation: handPath.startLocation,
    startOrientation: Orientation.IN,
    contentHash,
    handPath,
    length: steps.length,
    bigrams: handPath.bigrams,
    impliedGridMode: handPath.impliedGridMode,
    name: handPath.name,
    author: handPath.author,
    notes: handPath.notes,
    thumbnails: handPath.thumbnails,
    dateCreated: handPath.dateCreated,
    ownerId: handPath.ownerId,
    ownerDisplayName: handPath.ownerDisplayName,
    authoredHand,
  };

  return {
    ...soloPropToSequence(soloProp, authoredHand),
    metadata: {
      artifactKind: "hand-path",
      authoredHand,
      handPathContentHash: handPath.contentHash,
      isHandPathVisualization: true,
    },
  };
}
