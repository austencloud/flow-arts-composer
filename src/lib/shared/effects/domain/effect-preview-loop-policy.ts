import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { isSeamlesslyLoopable } from "#lib/shared/foundation/services/sequence-loopability-checker.js";

/**
 * A short clip can technically close and still be a miserable effect preview.
 * Eight counts is the floor that gives trails, echoes, particles, and other
 * persistence effects enough time to reveal their shape before the next pass.
 */
export const EFFECT_PREVIEW_MINIMUM_COUNTS = 8;

/** The Infinite Spinner's standard generated LOOP length. */
export const EFFECT_PREVIEW_TARGET_COUNTS = 16;

export function isEffectPreviewLoop(sequence: SequenceData): boolean {
  return (
    sequence.steps.length >= EFFECT_PREVIEW_MINIMUM_COUNTS &&
    sequence.steps.length % EFFECT_PREVIEW_MINIMUM_COUNTS === 0 &&
    isSeamlesslyLoopable(sequence)
  );
}
