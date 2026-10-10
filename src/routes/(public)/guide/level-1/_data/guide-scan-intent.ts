// One-shot handoff for "when the guide reader mounts, animate this content."
// Set by the sequence viewer's "See it in the Guide" action before navigating
// to /learn/guide/<slug>; consumed once by GuideReader.onMount. One-shot so a
// refresh doesn't re-fire the animation. Mirrors pending-scan-intent.
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export interface GuideScanIntent {
  /** Guide page slug to land on (from guide-content-index). */
  slug: string;
  /** Codex cell id to auto-animate, for single-letter content. */
  cellKey?: string;
  /** Full sequence to play in the companion, for multi-letter words. */
  sequence?: SequenceData;
}

let pendingIntent: GuideScanIntent | null = null;

/** Stash a request to auto-animate content when the guide reader mounts. */
export function setGuideScanIntent(intent: GuideScanIntent): void {
  pendingIntent = intent;
}

/** Read and clear the pending guide-scan intent (one-shot). */
export function consumeGuideScanIntent(): GuideScanIntent | null {
  const intent = pendingIntent;
  pendingIntent = null;
  return intent;
}

let codexCellTrigger: ((id: string) => void) | null = null;

/** The Codex page registers how to animate a cell by id while it's mounted. */
export function registerCodexCellTrigger(fn: ((id: string) => void) | null): void {
  codexCellTrigger = fn;
}

/** Fire a codex cell by id if the Codex page is mounted. Returns false if not. */
export function fireCodexCell(id: string): boolean {
  if (!codexCellTrigger) return false;
  codexCellTrigger(id);
  return true;
}
