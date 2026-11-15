/**
 * Which way a visitor closed the sequence viewer: swiped it down, pressed its
 * close button, went Back, tapped outside it, pressed Escape, or left through
 * Remix or Compose. Asked for 2026-11-13, to learn whether people swipe the
 * viewer away or reach for the close button.
 *
 * Pure: the host passes the open's context in and the sender out. The first
 * method recorded for an open wins, because one close reaches the host more
 * than once (the close button flips the drawer shut, and the drawer then
 * reports its own programmatic close).
 */

import type { CloseReason } from "@austencloud/drawer";

export type ViewerCloseMethod =
  | "swipe_down"
  | "close_button"
  | "back"
  | "tap_outside"
  | "escape"
  | "navigate";

/**
 * The method behind a drawer close. `viaBack` marks an "escape" close fired
 * by Android's Back (the drawer's close watcher), not by the Escape key. A
 * programmatic close carries no method: the host recorded the cause first.
 */
export function closeMethodFromDrawer(
  reason: CloseReason | undefined,
  viaBack = false
): ViewerCloseMethod | null {
  switch (reason) {
    case "swipe":
    case "snap":
      return "swipe_down";
    case "backdrop":
      return "tap_outside";
    case "escape":
      return viaBack ? "back" : "escape";
    default:
      return null;
  }
}

export interface ViewerCloseRecorder<Context> {
  /** A viewer opened; the next close is recorded against this context. */
  opened(context: Context): void;
  /** The viewer closed this way. Ignored when no open is waiting. */
  closed(method: ViewerCloseMethod | null): void;
}

export function createViewerCloseRecorder<Context>(deps: {
  now: () => number;
  send: (context: Context, method: ViewerCloseMethod, openMs: number) => void;
}): ViewerCloseRecorder<Context> {
  let pending: { context: Context; openedAt: number } | null = null;

  return {
    opened(context) {
      pending = { context, openedAt: deps.now() };
    },
    closed(method) {
      if (!pending || method === null) return;
      const open = pending;
      pending = null;
      deps.send(
        open.context,
        method,
        Math.max(0, Math.round(deps.now() - open.openedAt))
      );
    },
  };
}
