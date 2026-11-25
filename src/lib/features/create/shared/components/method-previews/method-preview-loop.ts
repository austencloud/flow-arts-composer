/**
 * The Create front door's LOOP preview: the explainer's own example, two
 * steps that end a quarter turn from where they began, and the two steps its
 * Rotated LOOP adds. Baked into method-preview-loop-steps.json, so the front
 * door never loads the pictograph dataset.
 */
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import example from "./method-preview-loop-steps.json";

const LOOP_EXAMPLE = example as unknown as {
  start: PictographData;
  steps: readonly StepData[];
};

export const LOOP_PREVIEW_STEPS = LOOP_EXAMPLE.steps;

/** Where the hands and props are before the step at `index`. */
export function loopPoseBefore(index: number): PictographData {
  return LOOP_PREVIEW_STEPS[index - 1] ?? LOOP_EXAMPLE.start;
}

/** A turn: your steps play, then copies of them fly over and turn. */
export const LOOP_PREVIEW_TIMING = Object.freeze({
  clearMs: 140,
  restMs: 220,
  flyMs: 820,
  landMs: 180,
});

/** The LOOP's turn, the way the hands go: clockwise. */
export const LOOP_PREVIEW_TURN = "90deg";
