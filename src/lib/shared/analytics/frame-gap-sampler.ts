/**
 * Frame gap sampler for profiled interactions.
 *
 * Records the time between consecutive animation frames while it runs, so a
 * span can report the longest freeze a visitor saw during a transition. The
 * budget comes from the display itself: the shortest gaps in the window are
 * the panel's own refresh interval, snapped to a real refresh rate so
 * scheduling noise cannot invent an impossible one. A 120 Hz phone is held to
 * 8.3 ms frames and a 60 Hz monitor to 16.7 ms without either being named.
 *
 * Profiling only. It runs one rAF loop for the length of the window, so call
 * it behind `isBootProfileVerbose()` or for a single bounded interaction.
 */

export interface FrameGap {
  /** performance.now() of the frame that ended the gap. */
  at: number;
  gapMs: number;
}

export interface FrameGapSummary {
  displayIntervalMs: number;
  worstFrameGapMs: number;
  /** Gaps that lost more than one frame. */
  framesOverBudget: number;
}

const KNOWN_REFRESH_RATES = [240, 165, 144, 120, 90, 60, 50, 30];

export function snapToRefreshInterval(measuredMs: number): number {
  let best = 1000 / 60;
  let bestError = Infinity;
  for (const hz of KNOWN_REFRESH_RATES) {
    const interval = 1000 / hz;
    const error = Math.abs(measuredMs - interval);
    if (error < bestError) {
      bestError = error;
      best = interval;
    }
  }
  return best;
}

/** Starts recording; the returned function stops it and hands back the gaps. */
export function startFrameGapSampler(): () => FrameGap[] {
  const gaps: FrameGap[] = [];
  if (typeof requestAnimationFrame !== "function") return () => gaps;
  let last = performance.now();
  let stopped = false;
  let handle = requestAnimationFrame(function tick() {
    const now = performance.now();
    gaps.push({ at: now, gapMs: now - last });
    last = now;
    if (!stopped) handle = requestAnimationFrame(tick);
  });
  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
    return gaps;
  };
}

/**
 * Summarizes the gaps that ended inside [fromMs, toMs]. Frame gaps are
 * quantized to whole display intervals, so one dropped frame reads as two
 * intervals and two dropped frames as three. The over-budget line sits
 * halfway between those, which is "more than two display intervals" without
 * failing a clean single drop on timer jitter.
 */
export function summarizeFrameGaps(
  gaps: readonly FrameGap[],
  fromMs = -Infinity,
  toMs = Infinity
): FrameGapSummary {
  const all = gaps.map((gap) => gap.gapMs).sort((a, b) => a - b);
  // The tenth percentile of the whole recording, so a janky window still finds
  // the panel's real interval among its healthy frames.
  const sample = all[Math.floor(all.length * 0.1)] ?? 1000 / 60;
  const displayIntervalMs = snapToRefreshInterval(sample);
  const overBudget = displayIntervalMs * 2.5;
  let worstFrameGapMs = 0;
  let framesOverBudget = 0;
  for (const gap of gaps) {
    if (gap.at < fromMs || gap.at > toMs) continue;
    worstFrameGapMs = Math.max(worstFrameGapMs, gap.gapMs);
    if (gap.gapMs > overBudget) framesOverBudget += 1;
  }
  return {
    displayIntervalMs: Math.round(displayIntervalMs * 10) / 10,
    worstFrameGapMs: Math.round(worstFrameGapMs),
    framesOverBudget,
  };
}
