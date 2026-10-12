/**
 * The grid each hand of a pictograph draws when its sequence joins two grids.
 * A diamond or box pictograph draws both hands on that grid. A skewed one
 * (one hand turned 45° on its own, say) draws each hand on the grid its own
 * start and end points sit on, so a diamond grid can join a box one and
 * neither hand's grid moves when the other turns.
 *
 * The preparer, the live renderer, the canvas painter and the placement
 * overlay all read this, so every surface draws the same pair of grids.
 */
import { joinedGridModes, type JoinedGridModes } from "@tka/render-core";
import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { deriveGridMode } from "#lib/shared/pictograph/grid/services/grid-mode-deriver.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

export interface JoinedGridSource {
  readonly gridMode?: string | null;
  readonly motions?: {
    readonly left?: MotionData | null;
    readonly right?: MotionData | null;
  } | null;
}

/**
 * The pictograph's grid mode as the preparer reads it: its own `gridMode`,
 * else the mode its two visible motions derive, else diamond.
 */
export function pictographGridMode(pictograph: JoinedGridSource): string {
  if (pictograph.gridMode) return pictograph.gridMode.toLowerCase();
  const left = pictograph.motions?.left;
  const right = pictograph.motions?.right;
  if (!isVisibleMotion(left) || !isVisibleMotion(right)) return "diamond";
  try {
    return deriveGridMode(left, right);
  } catch {
    return "diamond";
  }
}

/** The pair of grids a joined pictograph draws, from `gridMode` and each hand's points. */
export function pictographJoinedGrids(
  pictograph: JoinedGridSource,
  gridMode: string = pictographGridMode(pictograph)
): JoinedGridModes {
  const points = (motion: MotionData | null | undefined): string[] => {
    if (!isVisibleMotion(motion)) return [];
    return [motion.startLocation, motion.endLocation].flatMap((location) =>
      location ? [String(location).toLowerCase()] : []
    );
  };
  return joinedGridModes(gridMode, {
    left: points(pictograph.motions?.left),
    right: points(pictograph.motions?.right),
  });
}
