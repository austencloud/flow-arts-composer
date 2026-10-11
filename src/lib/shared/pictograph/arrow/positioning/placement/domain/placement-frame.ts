import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

export const PlacementFrame = {
  CANONICAL: "canonical",
  SKEWED: "skewed",
} as const;

export type PlacementFrame =
  (typeof PlacementFrame)[keyof typeof PlacementFrame];

/**
 * Display grids describe what the user sees. Placement frames describe which
 * authored data owns the result. Diamond and Box share one canonical owner;
 * Skewed stays separate because it is not a rigid presentation rotation.
 */
export function placementFrameForGridMode(
  gridMode: GridMode | string
): PlacementFrame {
  return normalizePlacementFrame(gridMode);
}

/** Normalize either a display-grid value or an already-authored frame. */
export function normalizePlacementFrame(value: string): PlacementFrame {
  if (value === PlacementFrame.SKEWED || value === GridMode.SKEWED) {
    return PlacementFrame.SKEWED;
  }
  if (
    value === PlacementFrame.CANONICAL ||
    value === GridMode.DIAMOND ||
    value === GridMode.BOX
  ) {
    return PlacementFrame.CANONICAL;
  }
  throw new Error(`Unsupported placement frame: ${value}`);
}

/** Canonical assets are grid-neutral; non-rigid frames keep a named folder. */
export function placementAssetRoot(frame: PlacementFrame): string {
  return frame === PlacementFrame.CANONICAL
    ? "/data/arrow_placement"
    : `/data/arrow_placement/${frame}`;
}
