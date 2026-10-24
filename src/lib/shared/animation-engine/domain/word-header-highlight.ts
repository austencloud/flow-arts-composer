import type { WordHeaderHighlight } from "../state/animation-visibility-state.svelte";

/** Sequence positions use 1 for the first move's travel and N + 1 for its end hold. */
export function activeWordHeaderStep(
  currentStep: number,
  stepCount: number,
  mode: WordHeaderHighlight
): number | null {
  if (stepCount < 1 || !Number.isFinite(currentStep)) return null;
  const step = Math.floor(currentStep + 1e-3) - (mode === "arrival" ? 1 : 0);
  return step < 1 ? null : Math.min(step, stepCount);
}

/**
 * Which column of a period-compressed pattern glyph belongs to the lit step.
 * The glyphs draw one period of columns, so the step number (1-based, the
 * clock the word also reads) wraps by that period. The word compresses by
 * repeated segments and the glyphs by their own period, so this deliberately
 * ignores how the word is drawn.
 */
export function activeGlyphColumn(
  activeStepNumber: number | null,
  period: number
): number | null {
  if (activeStepNumber === null || activeStepNumber < 1 || period < 1) {
    return null;
  }
  return (activeStepNumber - 1) % period;
}
