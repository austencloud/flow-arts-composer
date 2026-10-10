import type { EffortPhrase } from "#lib/shared/effort/domain/effort-timeline-types.js";

export type { EffortPhrase };

export interface PhraseInterpolationResult {
  /** 0-based step index in the sequence */
  stepIndex: number;
  /** Progress within that step (0.0 to 1.0) */
  localProgress: number;
}
