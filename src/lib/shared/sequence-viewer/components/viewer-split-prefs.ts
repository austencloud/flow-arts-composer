/**
 * The user's Side by Side split, remembered per device. One animation-pane
 * share per split axis, because a share that reads well beside the card does
 * not necessarily read well above it.
 */

import type { ViewerPanelDirection } from "./viewer-panel-layout";

export const VIEWER_SPLIT_STORAGE_KEY = "tka-viewer-split";
/** Neither pane may shrink below this share of the split axis. */
export const VIEWER_SPLIT_MIN_SHARE = 0.25;
export const VIEWER_SPLIT_DEFAULT_SHARE = 0.5;

export type ViewerSplitShares = Record<ViewerPanelDirection, number>;

export function clampViewerSplitShare(share: number): number {
  if (!Number.isFinite(share)) return VIEWER_SPLIT_DEFAULT_SHARE;
  return Math.min(
    1 - VIEWER_SPLIT_MIN_SHARE,
    Math.max(VIEWER_SPLIT_MIN_SHARE, share)
  );
}

/** The animation pane's share from a PanelGroup sizes pair. */
export function viewerSplitShareFromSizes(sizes: readonly number[]): number {
  const [animation = 1, preview = 1] = sizes;
  const total = animation + preview;
  return total > 0
    ? clampViewerSplitShare(animation / total)
    : VIEWER_SPLIT_DEFAULT_SHARE;
}

export function parseViewerSplitShares(raw: string | null): ViewerSplitShares {
  const fallback: ViewerSplitShares = {
    horizontal: VIEWER_SPLIT_DEFAULT_SHARE,
    vertical: VIEWER_SPLIT_DEFAULT_SHARE,
  };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const read = (key: ViewerPanelDirection) =>
      typeof parsed[key] === "number"
        ? clampViewerSplitShare(parsed[key])
        : fallback[key];
    return { horizontal: read("horizontal"), vertical: read("vertical") };
  } catch {
    return fallback;
  }
}

export function loadViewerSplitShares(): ViewerSplitShares {
  try {
    return parseViewerSplitShares(
      localStorage.getItem(VIEWER_SPLIT_STORAGE_KEY)
    );
  } catch {
    return parseViewerSplitShares(null);
  }
}

export function saveViewerSplitShares(shares: ViewerSplitShares): void {
  try {
    localStorage.setItem(VIEWER_SPLIT_STORAGE_KEY, JSON.stringify(shares));
  } catch {
    // Private mode or a full quota: the split still works for this session.
  }
}
