/**
 * Build one continuous "act" sequence from the sheet's rows.
 *
 * A choreo sheet reads as a single performance, so the whole thing can play as
 * ONE sequence: concatenate every row's steps into one stream, renumbered 1..N.
 *
 * Pure, literal concatenation — NO orientation/reversal recalculation. The rows
 * are already normalized (clean boundaries connect; break boundaries are the
 * intentional warnings the preview shows), and each source sequence's stored
 * orientations are already self-consistent. Re-propagating orientations across a
 * break would corrupt the downstream sequence's authored look, so we keep every
 * step exactly as authored. This also keeps the function free of heavy render
 * deps, so it unit-tests trivially.
 */
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { loopStatus } from "./sheet-continuity";

export function buildActSequence(
  rows: readonly SequenceData[],
  name: string
): SequenceData | null {
  if (rows.length === 0) return null;

  const steps: StepData[] = [];
  for (const seq of rows) {
    for (const step of seq.steps) {
      steps.push({ ...step, stepNumber: steps.length + 1 });
    }
  }
  if (steps.length === 0) return null;

  const word = steps.map((s) => s.letter ?? "").join("");

  return createSequenceData({
    name,
    word,
    steps,
    startPlacement: rows[0]!.startPlacement,
    isCircular: loopStatus(rows) === "loops",
  });
}
