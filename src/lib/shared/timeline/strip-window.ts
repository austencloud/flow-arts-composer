/**
 * Virtual-window math for the StepStrip carousel.
 *
 * The strip places cells absolutely at `vi * STRIDE` and slides one track, so
 * the window of rendered indices may run PAST both ends of the real cell list:
 * in loop mode those out-of-range indices map back circularly, which is what
 * makes the wrap seamless (the track keeps travelling forward into a repeated
 * copy instead of snapping back to zero).
 *
 * Extracted from the component so the index/continuity behavior — invisible in
 * a screenshot, and the source of the gallery preview's loop-boundary snap —
 * can be asserted directly.
 */

export interface StripWindowItem {
  /** Monotonic virtual index; the cell's position is `vi * stride`. */
  vi: number;
  /** Index into the real cell list. */
  ci: number;
  /** Distance from the focus, in cells (drives spotlight dim/scale). */
  dist: number;
  /**
   * True for the copy of this cell that belongs to the focus's own repeat.
   * A looping window can render the same cell more than once, and a document
   * may only carry one element per `view-transition-name` — the card morph
   * pairs against the primary copy.
   */
  primary: boolean;
}

export interface StripWindowOptions {
  /** Focus index including any accumulated loop offset. */
  activeVirtualIndex: number;
  cellCount: number;
  loop: boolean;
  anchor: "center" | "start";
  /** Viewport size along the travel axis, px. */
  primarySize: number;
  /** Where the focus sits along that axis, px. */
  focusOffset: number;
  /** Cell size + gap, px. */
  stride: number;
  /** Extra cells rendered beyond the visible band. */
  buffer: number;
}

export function buildStripWindow({
  activeVirtualIndex,
  cellCount,
  loop,
  anchor,
  primarySize,
  focusOffset,
  stride,
  buffer,
}: StripWindowOptions): StripWindowItem[] {
  if (cellCount <= 0) return [];

  const a = activeVirtualIndex;
  const safeStride = Math.max(1, stride);
  let start: number;
  let end: number;

  if (anchor === "start") {
    // Forward-biased: one finished cell (graceful exit) + as many upcoming as
    // the primary axis holds. No deep past — practice only needs what's next.
    const ahead = Math.ceil((primarySize - focusOffset) / safeStride) + buffer;
    start = a - 1;
    end = a + ahead + 1;
  } else {
    const half = Math.ceil(primarySize / safeStride / 2) + buffer;
    start = a - half;
    end = a + half + 1;
  }

  if (!loop) {
    start = Math.max(0, start);
    end = Math.min(cellCount, end);
  }

  const activeRepeat = loop ? Math.floor(a / cellCount) : 0;
  const out: StripWindowItem[] = [];
  for (let vi = start; vi < end; vi++) {
    const ci = loop ? ((vi % cellCount) + cellCount) % cellCount : vi;
    if (ci < 0 || ci >= cellCount) continue;
    out.push({
      vi,
      ci,
      dist: Math.abs(vi - a),
      primary: !loop || Math.floor(vi / cellCount) === activeRepeat,
    });
  }
  return out;
}

/**
 * Accumulated offset that keeps the focus index monotonic across a wrap.
 *
 * The raw step wraps (…N→0), so each wrap adds one full cell list: the track
 * slides forward into the repeated copy. Because the offset is always a
 * multiple of the cell count, the circular mapping in `buildStripWindow` still
 * resolves the focus to its own cell — the wrap costs no alignment.
 */
export function nextLoopOffset(
  offset: number,
  previousRawStep: number,
  rawStep: number,
  cellCount: number
): number {
  const wrapped = previousRawStep !== -1 && rawStep < previousRawStep;
  return wrapped ? offset + cellCount : offset;
}
