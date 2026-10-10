import type { PhraseInterpolationResult } from "./types";
import type { EffortPhrase } from "#lib/shared/effort/domain/effort-timeline-types.js";
import { applyEffort } from "#lib/shared/effort/domain/effort-easing-unified.js";

export function interpolatePhrase(
  phrase: EffortPhrase,
  currentStep: number,
  totalSteps: number,
): PhraseInterpolationResult {
  const phraseDuration = phrase.endStep - phrase.startStep + 1;
  const beatsIntoPhrase = currentStep - phrase.startStep;

  // Clamp to [0, phraseDuration)
  const clampedBeats = Math.max(0, Math.min(beatsIntoPhrase, phraseDuration - 0.001));
  const phraseProgress = clampedBeats / phraseDuration;

  const easedProgress = applyEffort(phrase.effortId, phraseProgress, phrase.params);

  // Map eased progress back to a beat offset within the phrase
  const easedBeats = easedProgress * phraseDuration;

  // Convert to step index (0-based) and local progress
  const phraseStartIndex = phrase.startStep - 1; // convert 1-based beat to 0-based index
  const absoluteBeatOffset = phraseStartIndex + easedBeats;

  const stepIndex = Math.min(
    Math.floor(absoluteBeatOffset),
    totalSteps - 1,
  );
  const localProgress = absoluteBeatOffset - Math.floor(absoluteBeatOffset);

  return {
    stepIndex: Math.max(0, stepIndex),
    localProgress: Math.min(localProgress, 0.999),
  };
}
