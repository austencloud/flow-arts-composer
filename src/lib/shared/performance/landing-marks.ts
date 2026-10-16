/**
 * Landing-path timing marks.
 *
 * The landing page's headline metrics all read "fast" while the page still
 * looks like a placeholder: measured 2026-08-09 on production, LCP 667ms,
 * DCL 456ms, load 862ms, CLS 0.00 — and a hero that had not drawn a frame.
 * LCP was timing the headline text. Nothing in the app measured the thing a
 * visitor actually waits for, so every diagnosis had to be reconstructed from
 * the outside with traces, which is slow and easy to get wrong.
 *
 * These marks name the moments that matter on the way to a live hero. They are
 * real `performance.mark` entries, so they show up in a DevTools trace's
 * Timings track next to the network and main-thread rows without any extra
 * tooling.
 *
 * Read them from the console with `__tkaMarks()`.
 */

/** The moments on the critical path to a hero that is actually animating. */
export type LandingMark =
  /** Hydration ran: the page is interactive, whatever it looks like. */
  | "hydrated"
  /** The hero decided to load its player. The gap from navigation start to
      here is scheduling cost, not download cost. */
  | "hero:activate"
  /** The player chunk finished importing and reported itself loaded. */
  | "hero:player-loaded"
  | "hero:canvas-ready"
  /** The background's first frame reached the canvas. */
  | "background:first-frame";

const PREFIX = "tka:";

function supported(): boolean {
  return (
    typeof performance !== "undefined" && typeof performance.mark === "function"
  );
}

/**
 * Record a landing mark. Safe to call during SSR and safe to call twice — the
 * first call for a given mark wins, so a component that re-runs an effect does
 * not overwrite the timing of the first, real occurrence.
 */
export function markLanding(mark: LandingMark): void {
  if (!supported()) return;
  const name = `${PREFIX}${mark}`;
  if (performance.getEntriesByName(name, "mark").length > 0) return;
  try {
    performance.mark(name);
  } catch {
    // Marking is diagnostics. It must never be able to break the page.
  }
}

/** Every landing mark recorded so far, in ms since navigation start. */
export function readLandingMarks(): Record<string, number> {
  if (!supported()) return {};
  const marks: Record<string, number> = {};
  for (const entry of performance.getEntriesByType("mark")) {
    if (entry.name.startsWith(PREFIX)) {
      marks[entry.name.slice(PREFIX.length)] = Math.round(entry.startTime);
    }
  }
  return marks;
}

/**
 * Expose `__tkaMarks()` on window so the timings can be read from any browser
 * without a trace, a build flag, or a rebuild.
 */
export function installLandingMarkReader(): void {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>).__tkaMarks = readLandingMarks;
}
