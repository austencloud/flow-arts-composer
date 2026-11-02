/**
 * Times one viewer open: from the tap to the drawer's first frame, and to the
 * viewer fading in behind it. A dead click in Explore (nothing changed for
 * 2.5 s after a tap) had no number of its own, so this is the bookkeeping for
 * the `viewer_open_timing` event. Pure: the clock, the measure hook and the
 * sender are passed in, so the pairing rules can be tested with a fake clock.
 *
 * Rules:
 * - No start, no event. Opens that never went through the navigator (a QR
 *   scan, a restored URL) carry no tap time and are not timed.
 * - A new start replaces any open still being timed.
 * - A drawer that took longer than the limit to show (or never showed before
 *   the viewer closed) sends nothing.
 * - One event per open: sent once both milestones are in, or at close with
 *   `viewerRevealedMs: null` when the drawer showed but the viewer never did.
 * - The viewer cannot be seen before its drawer, so a reveal recorded first
 *   (a viewer that was already drawn) is reported at the drawer's time.
 */

export const VIEWER_OPEN_TIMING_LIMIT_MS = 10_000;

export type ViewerOpenMilestone = "drawer-visible" | "viewer-revealed";

export interface ViewerOpenTimingSample<Context> {
  context: Context;
  drawerVisibleMs: number;
  viewerRevealedMs: number | null;
}

export interface ViewerOpenTimingDeps<Context> {
  now: () => number;
  send: (sample: ViewerOpenTimingSample<Context>) => void;
  /** Called as each milestone lands, with absolute start and end times. */
  measure?: (
    milestone: ViewerOpenMilestone,
    startMs: number,
    endMs: number
  ) => void;
  limitMs?: number;
}

export interface ViewerOpenTiming<Context> {
  start(startMs: number, context: Context): void;
  drawerVisible(): void;
  viewerRevealed(): void;
  /** The viewer closed. Sends what an open that showed its drawer had. */
  end(): void;
}

interface PendingOpen<Context> {
  startMs: number;
  context: Context;
  drawerAt: number | null;
  revealedAt: number | null;
}

export function createViewerOpenTiming<Context>(
  deps: ViewerOpenTimingDeps<Context>
): ViewerOpenTiming<Context> {
  const limitMs = deps.limitMs ?? VIEWER_OPEN_TIMING_LIMIT_MS;
  let pending: PendingOpen<Context> | null = null;

  function send(open: PendingOpen<Context>): void {
    pending = null;
    if (open.drawerAt === null) return;
    const drawerVisibleMs = Math.round(open.drawerAt - open.startMs);
    const viewerRevealedMs =
      open.revealedAt === null
        ? null
        : Math.round(Math.max(open.revealedAt, open.drawerAt) - open.startMs);
    deps.send({ context: open.context, drawerVisibleMs, viewerRevealedMs });
  }

  return {
    start(startMs, context) {
      pending = { startMs, context, drawerAt: null, revealedAt: null };
    },

    drawerVisible() {
      const open = pending;
      if (!open || open.drawerAt !== null) return;
      const at = deps.now();
      if (at - open.startMs > limitMs) {
        pending = null;
        return;
      }
      open.drawerAt = at;
      deps.measure?.("drawer-visible", open.startMs, at);
      if (open.revealedAt !== null) {
        deps.measure?.("viewer-revealed", open.startMs, at);
        send(open);
      }
    },

    viewerRevealed() {
      const open = pending;
      if (!open || open.revealedAt !== null) return;
      const at = deps.now();
      open.revealedAt = at;
      if (open.drawerAt === null) return;
      deps.measure?.("viewer-revealed", open.startMs, at);
      send(open);
    },

    end() {
      const open = pending;
      if (!open) return;
      send(open);
    },
  };
}
