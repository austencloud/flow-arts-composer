/**
 * Where the viewer's Back button goes on the standalone /sequence page.
 *
 * A scan arrives from the phone camera, so the history entry behind it is
 * the camera or the same card. Going back there reloaded the card for a
 * scanner who pressed Back to leave it, so a scan goes to the gallery.
 */
export type SequenceCloseTarget =
  | { kind: "path"; path: string }
  | { kind: "history-back" };

export const SEQUENCE_CLOSE_FALLBACK = "/browse/gallery";

export function resolveSequenceCloseTarget(input: {
  returnPath?: string | null;
  scanOrigin: boolean;
  historyLength: number;
}): SequenceCloseTarget {
  if (input.returnPath) return { kind: "path", path: input.returnPath };
  if (!input.scanOrigin && input.historyLength > 1) {
    return { kind: "history-back" };
  }
  return { kind: "path", path: SEQUENCE_CLOSE_FALLBACK };
}
