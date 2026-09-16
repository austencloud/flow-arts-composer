/**
 * Converts SequenceData (library format with StepData[]) to SequenceEntry (LOOP detector format)
 *
 * The LOOP detector needs raw string-based data in a specific format.
 * This converter extracts the necessary data from the typed SequenceData model.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceEntry, RawStepData, RawMotionAttributes } from "$lib/shared/loop-labeler/domain/sequence-models";
import type { Step, Motion } from "@tka/tka-types";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

export function convert(sequence: SequenceData): SequenceEntry {
  const rawSequence = convertStepsToRaw(sequence);

  return {
    id: sequence.id,
    word: sequence.word,
    isCircular: sequence.isCircular,
    loopType: sequence.loopType ?? null,
    thumbnails: [...sequence.thumbnails],
    sequenceLength: sequence.sequenceLength ?? sequence.steps.length,
    gridMode: sequence.gridMode ?? GridMode.DIAMOND,
    fullMetadata: {
      sequence: rawSequence,
    },
  };
}

function convertStepsToRaw(sequence: SequenceData): RawStepData[] {
  const result: RawStepData[] = [];

  // Add metadata object as beat 0 (the LOOP detector expects this)
  const startPos = sequence.startPlacement ?? sequence.startingPlacement;
  const startPosName = startPos?.endPlacement ?? startPos?.gridPlacement;
  result.push({
    beat: 0,
    word: sequence.word,
    author: sequence.author,
    level: sequence.level,
    isCircular: sequence.isCircular,
    gridMode: sequence.gridMode ?? GridMode.DIAMOND,
    sequenceStartPlacement: startPosName ?? undefined,
    endPos: startPosName ?? undefined,
  });

  // Convert each step to raw format
  for (const step of sequence.steps) {
    result.push(convertStepToRaw(step));
  }

  return result;
}

function convertStepToRaw(step: Step): RawStepData {
  const leftMotion = step.motions[HandSide.LEFT];
  const rightMotion = step.motions[HandSide.RIGHT];

  return {
    beat: step.stepNumber,
    letter: step.letter ?? undefined,
    startPos: step.startPlacement ?? undefined,
    endPos: step.endPlacement ?? undefined,
    leftAttributes: leftMotion ? convertMotionToRaw(leftMotion) : undefined,
    rightAttributes: rightMotion ? convertMotionToRaw(rightMotion) : undefined,
  };
}

function convertMotionToRaw(motion: Motion): RawMotionAttributes {
  return {
    motionType: motion.motionType,
    startLoc: motion.startLocation,
    endLoc: motion.endLocation,
    startOri: motion.startOrientation,
    endOri: motion.endOrientation,
    propRotDir: motion.rotationDirection,
    turns: motion.turns,
  };
}
