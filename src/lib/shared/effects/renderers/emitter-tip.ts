/**
 * Shared emitter contract for the per-tip overlay effects (water, bubbles,
 * petals, smoke, ink, frost, sparkles, silk, echo, zap).
 *
 * Replaces the fixed 4-slot `{bluePosA, bluePosB, redPosA, redPosB}` input that
 * only ever carried the two base props (propIndex 0/1). A flat emitter list
 * carries every visible tip including tunnel kaleidoscope layer props
 * (propIndex >= 2), so the effects render on the layers the way bloom + pulse
 * already do.
 *
 * Identity is `${propIndex}:${tipIndex}` — stable across frames, so renderers
 * key per-emitter velocity/trail state on it.
 */
export interface EmitterTip {
  x: number;
  y: number;
  /** base blue=0, red=1; layer li blue=2+2*li, red=3+2*li. */
  propIndex: number;
  /** 0 = end A, 1 = end B. */
  tipIndex: number;
  /** Derived from tipIndex (0→"A", else "B"). Drives tracking-mode filtering. */
  end: "A" | "B";
  /**
   * Per-prop resolved color (hex). Consumed by prop-colored effects and mixed
   * into materials that need to preserve prop identity, including Silk.
   * Mirrors the trail-overlay spectrum gating: base props use the trail colors,
   * layers use the spectrum fan when rainbow is on, base colors when off.
   */
  color: string;
  /**
   * True when this tip is the only tracked tip its prop has (poi, club, sword,
   * torch...). Choosing an end means nothing there, so tracking-mode filtering
   * lets it through. Absent means unknown, treated as a prop with several tips.
   */
  onlyTip?: boolean;
}

export type EmitterTrackingMode =
  | "left_end"
  | "right_end"
  | "both_ends"
  | "hand";

/**
 * Does this tip wear the effect under this tracking mode? The one owner of the
 * rule: "both_ends" takes every tip, "left_end" takes end A, anything else
 * takes end B, and a prop's only tip always wears the effect whatever end the
 * look names. `end` is "A"/"B" or the numeric 0/1 that Pulse's input carries;
 * a tip with no end (a prop-centre fallback) always wears it.
 */
export function tipWearsEffect(
  tip: { end?: "A" | "B" | 0 | 1; onlyTip?: boolean },
  mode: EmitterTrackingMode
): boolean {
  if (mode === "both_ends" || tip.onlyTip || tip.end === undefined) return true;
  const isLeftEnd = tip.end === "A" || tip.end === 0;
  return mode === "left_end" ? isLeftEnd : !isLeftEnd;
}

/** Stable per-frame identity for an emitter's cross-frame state. */
export function emitterId(propIndex: number, tipIndex: number): string {
  return `${propIndex}:${tipIndex}`;
}
