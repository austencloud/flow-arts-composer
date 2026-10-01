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
