import type { SequenceFrame } from "@austencloud/video-editor/core";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createStartPlacementFromBeatStart } from "#lib/shared/create/services/sequence-transforms.js";
import { withSequenceJoinApplied } from "#lib/shared/grid-join/sequence-grid-join.js";
import { sequenceArrowLayers } from "#lib/shared/media-composition/domain/sequence-frame.js";

/**
 * The arrows one performer is drawing at a frame: the move in flight fading
 * in over its start pose, and the move just landed fading out. A tunnel's back
 * performers get the same pictures as the front pair, on their own frames.
 */
export function performerArrows(
  sequence: SequenceData,
  frame: Pick<SequenceFrame, "phase" | "move" | "moveProgress" | "pass">
) {
  const steps = sequence.steps;
  const opening =
    sequence.startPlacement ??
    sequence.startingPlacement ??
    (steps[0] ? createStartPlacementFromBeatStart(steps[0]) : null);
  const move = frame.phase === "opening" ? 0 : frame.move;
  const step =
    move < 1 ? opening : (steps[Math.min(move - 1, steps.length - 1)] ?? null);
  const start = move <= 1 ? opening : (steps[move - 2] ?? opening);
  const layers = sequenceArrowLayers(frame, steps.length);
  const previous =
    layers.previousMove === null
      ? null
      : (steps[layers.previousMove - 1] ?? null);
  return {
    step: withSequenceJoinApplied(sequence, step),
    start: withSequenceJoinApplied(sequence, start),
    progress: move < 1 ? null : frame.moveProgress,
    opacity: layers.currentOpacity,
    previous: withSequenceJoinApplied(sequence, previous),
    previousOpacity: layers.previousOpacity,
  };
}
