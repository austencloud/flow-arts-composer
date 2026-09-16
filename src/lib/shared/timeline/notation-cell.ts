import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import { createStartPlacementFromBeatStart } from "$lib/shared/create/services/sequence-transforms";

/** One pictograph slot in a beat strip: the start position (index 0) or a beat. */
export interface NotationCell {
  key: string;
  data: StepData | StartPlacementData;
  label: string;
  isStart: boolean;
  /** 0 = start position, 1..N = beat number. */
  stepNumber: number;
}

/**
 * Build the ordered cells for a beat strip: a Start cell (real start position, or
 * derived from beat 1 when absent) followed by one cell per beat with 1-based labels.
 * Pure — no playback, no DOM. Mirrors the landing Infinite Spinner derivation so the
 * landing and practice surfaces produce identical strips.
 */
export function buildNotationCells(seq: SequenceData | null | undefined): NotationCell[] {
  if (!seq?.steps?.length) return [];
  const cells: NotationCell[] = [];

  const startPos =
    seq.startPlacement ?? (seq.steps[0] ? createStartPlacementFromBeatStart(seq.steps[0]) : null);
  if (startPos) {
    cells.push({
      key: `start-${seq.id ?? seq.word}`,
      data: startPos,
      label: "Start",
      isStart: true,
      stepNumber: 0,
    });
  }

  for (let i = 0; i < seq.steps.length; i++) {
    const step = seq.steps[i]!;
    cells.push({
      key: `beat-${i}-${step.letter ?? i}`,
      data: step,
      label: `${i + 1}`,
      isStart: false,
      stepNumber: i + 1,
    });
  }

  return cells;
}
