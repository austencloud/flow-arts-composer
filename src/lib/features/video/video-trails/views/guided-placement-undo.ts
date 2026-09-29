import type { EndpointCorrection } from "../domain/types";

export interface GuidedPlacementUndoEntry {
  sourceUrl: string | null;
  frame: number;
  propIndex: 0 | 1;
  tipIndex: number;
  previousCorrection: EndpointCorrection | null;
  previousGuidedStepIdx: number;
  previousFrame: number;
}

interface CorrectionState {
  corrections: Record<number, EndpointCorrection[]>;
  correctEndpoint(frame: number, correction: EndpointCorrection): void;
  removeCorrection(frame: number, propIndex: 0 | 1, tipIndex: number): void;
}

const MAX_UNDO = 50;

export function recordGuidedPlacement(
  stack: GuidedPlacementUndoEntry[],
  state: CorrectionState,
  entry: Omit<GuidedPlacementUndoEntry, "previousCorrection">,
): GuidedPlacementUndoEntry[] {
  const previous = state.corrections[entry.frame]?.find(
    (correction) => correction.propIndex === entry.propIndex && correction.tipIndex === entry.tipIndex,
  );
  const previousCorrection = previous ? {
    ...previous,
    detected: previous.detected ? { ...previous.detected } : null,
    corrected: previous.corrected ? { ...previous.corrected } : null,
  } : null;
  return [...stack.slice(-(MAX_UNDO - 1)), { ...entry, previousCorrection }];
}

export function undoGuidedPlacement(
  stack: GuidedPlacementUndoEntry[],
  state: CorrectionState,
  sourceUrl: string | null,
): { stack: GuidedPlacementUndoEntry[]; entry: GuidedPlacementUndoEntry | null } {
  const entry = stack.at(-1);
  if (!entry) return { stack, entry: null };
  if (entry.sourceUrl !== sourceUrl) return { stack: [], entry: null };

  if (entry.previousCorrection) {
    state.correctEndpoint(entry.frame, entry.previousCorrection);
  } else {
    state.removeCorrection(entry.frame, entry.propIndex, entry.tipIndex);
  }
  return { stack: stack.slice(0, -1), entry };
}

export function historyForSource(
  stack: GuidedPlacementUndoEntry[],
  sourceUrl: string | null,
): GuidedPlacementUndoEntry[] {
  return stack.filter((entry) => entry.sourceUrl === sourceUrl);
}
