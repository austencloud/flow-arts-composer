export type TunnelWorkspaceMode =
  | "stack"
  | "portrait"
  | "short-landscape"
  | "split";

export interface TunnelWorkspaceSize {
  width: number;
  height: number;
}

/**
 * The shortest slot that can hold the stage and the cast on one screen without
 * scrolling. A phone-width slot runs compact chrome (no stage heading, a
 * two-row cast heading, icon buttons), so it fits sooner than a tablet-width
 * slot, whose full headings and larger cards need the extra room. 375x667
 * with the shell's bottom bar leaves 622px, which fits; the same phone with a
 * browser toolbar open, or a 1440x900 desktop at 200% zoom, does not.
 */
export function fittedStackMinHeight(width: number): number {
  return width < 720 ? 560 : 700;
}

/**
 * Resolve the Tunnel workspace from the room the Create slot actually owns.
 *
 * The thresholds describe capabilities, not devices:
 * - a short landscape slot can sustain two lean columns but not desktop chrome;
 * - the ordinary split waits until both columns remain useful;
 * - a portrait slot, phone or tablet, keeps both jobs on one screen when it is
 *   tall enough for the stage and the cast at their compact sizes;
 * - everything else scrolls as one honest column.
 *
 * Keeping this decision in one owner prevents markup and CSS from landing on
 * opposite sides of a breakpoint, the same measured-layout discipline Fuse
 * uses for compact, portrait, landscape, and full-card workspaces.
 */
export function resolveTunnelWorkspaceMode({
  width,
  height,
}: TunnelWorkspaceSize): TunnelWorkspaceMode {
  // Two short-landscape tracks need enough room for the choreography controls
  // and the stage controls without either side enforcing its min-content width
  // on the other. Below this threshold an honest vertical stack also provides
  // the expected 200% browser-zoom reflow for a 1440px desktop viewport.
  if (width >= 840 && width > height && height <= 540) {
    return "short-landscape";
  }
  if (width >= 1000) return "split";
  if (height >= fittedStackMinHeight(width)) return "portrait";
  return "stack";
}

export function canInlineTunnelInspector(size: TunnelWorkspaceSize): boolean {
  return resolveTunnelWorkspaceMode(size) === "split" && size.height >= 700;
}
