import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/** Absolute floor: a sequence needs at least this many motion steps to be saved at all. */
export const MIN_SAVE_STEPS = 1;

/** Minimum motion steps required to post a sequence to the community gallery. */
export const MIN_COMMUNITY_STEPS = 4;

/**
 * Number of motion steps from the persisted source of truth.
 *
 * `steps` is derived at load and never persisted; `stepPairings` is the persisted
 * per-step list (one entry per motion step). Prefer it, then the derived `steps`
 * array, then the optional stored `sequenceLength`. Returns 0 when none are present.
 */
export function getPersistedStepCount(sequence: SequenceData): number {
  // stepPairings is the persisted source of truth — use its length when present
  // (including when it's an empty array, which legitimately means zero steps).
  if (sequence.stepPairings !== undefined) {
    return sequence.stepPairings.length;
  }
  // steps is derived at load; a non-empty array is reliable for counting.
  if (sequence.steps?.length) {
    return sequence.steps.length;
  }
  // Fall back to the optional stored length (legacy / pre-hydration).
  return sequence.sequenceLength ?? 0;
}

/**
 * Stamp the derived step count onto fields that leave the browser.
 *
 * `metadata.length` is a legacy creation-time value. Construct starts at zero
 * and grows one step at a time, so that value becomes stale unless save fixes
 * it. Keep the key accurate when it is present, and always populate the
 * dedicated `sequenceLength` field used by current readers.
 */
export function withCanonicalStepCount<T extends SequenceData>(sequence: T): T {
  const sequenceLength = getPersistedStepCount(sequence);
  const currentMetadata = sequence.metadata ?? {};
  const metadata =
    "length" in currentMetadata
      ? { ...currentMetadata, length: sequenceLength }
      : currentMetadata;

  return {
    ...sequence,
    metadata,
    sequenceLength,
  };
}

/** True when a sequence has no motion steps — there is nothing to save. */
export function isEmptySequence(sequence: SequenceData): boolean {
  return getPersistedStepCount(sequence) < MIN_SAVE_STEPS;
}

/**
 * True when a sequence has enough steps to post to the community gallery.
 *
 * Personal libraries have no upper or lower length policy beyond not being empty
 * (see {@link isEmptySequence}); the community gallery requires {@link MIN_COMMUNITY_STEPS}.
 */
export function meetsCommunityMinimum(sequence: SequenceData): boolean {
  return getPersistedStepCount(sequence) >= MIN_COMMUNITY_STEPS;
}
