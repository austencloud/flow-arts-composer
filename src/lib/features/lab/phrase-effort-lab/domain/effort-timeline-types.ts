import type { EffortId, EffortParams } from "#lib/shared/effort/domain/effort-types.js";

export interface EffortPhrase {
  readonly id: string;
  readonly effortId: EffortId;
  readonly startStep: number;  // 1-based, inclusive
  readonly endStep: number;    // inclusive
  readonly params?: EffortParams;
}

export interface EffortTimeline {
  readonly phrases: readonly EffortPhrase[];  // sorted by startStep, no overlaps
  readonly transition: "hard" | "blend";
  readonly blendSteps?: number;  // crossfade duration in beats (only if blend)
}

export function createEffortPhrase(
  effortId: EffortId,
  startStep: number,
  endStep: number,
  params?: EffortParams,
): EffortPhrase {
  return {
    id: `phrase-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    effortId,
    startStep,
    endStep,
    params,
  };
}

export function createEffortTimeline(): EffortTimeline {
  return {
    phrases: [],
    transition: "hard",
  };
}

/**
 * Find the phrase covering a given beat, or null if the beat is in a gap.
 * Assumes phrases are sorted by startStep and non-overlapping.
 */
export function findPhraseAtBeat(
  timeline: EffortTimeline,
  beat: number,
): EffortPhrase | null {
  for (const phrase of timeline.phrases) {
    // A phrase covering beats 3-6 owns the range [3.0, 7.0) -
    // it includes all fractional time within beat 6 up to (but not including) beat 7.
    if (beat >= phrase.startStep && beat < phrase.endStep + 1) {
      return phrase;
    }
    if (phrase.startStep > beat) break;
  }
  return null;
}

/**
 * Insert a phrase into the timeline, removing/trimming any overlapping phrases.
 * Returns a new timeline (immutable).
 */
export function insertPhrase(
  timeline: EffortTimeline,
  newPhrase: EffortPhrase,
): EffortTimeline {
  const updated: EffortPhrase[] = [];

  for (const existing of timeline.phrases) {
    // Completely covered by new phrase - remove
    if (existing.startStep >= newPhrase.startStep && existing.endStep <= newPhrase.endStep) {
      continue;
    }
    // Split - existing phrase completely wraps new phrase (must check before partial overlaps)
    if (existing.startStep < newPhrase.startStep && existing.endStep > newPhrase.endStep) {
      updated.push({ ...existing, endStep: newPhrase.startStep - 1 });
      updated.push({
        ...existing,
        id: `phrase-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        startStep: newPhrase.endStep + 1,
      });
      continue;
    }
    // Overlaps left side - trim right
    if (existing.startStep < newPhrase.startStep && existing.endStep >= newPhrase.startStep) {
      updated.push({ ...existing, endStep: newPhrase.startStep - 1 });
      continue;
    }
    // Overlaps right side - trim left
    if (existing.startStep <= newPhrase.endStep && existing.endStep > newPhrase.endStep) {
      updated.push({ ...existing, startStep: newPhrase.endStep + 1 });
      continue;
    }
    // No overlap
    updated.push(existing);
  }

  updated.push(newPhrase);
  updated.sort((a, b) => a.startStep - b.startStep);

  return { ...timeline, phrases: updated };
}

/**
 * Remove a phrase by ID. Returns a new timeline.
 */
export function removePhrase(
  timeline: EffortTimeline,
  phraseId: string,
): EffortTimeline {
  return {
    ...timeline,
    phrases: timeline.phrases.filter((p) => p.id !== phraseId),
  };
}
