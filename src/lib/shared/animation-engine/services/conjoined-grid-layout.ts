/**
 * Level 7 conjoined grid for the 2D animation: two grids side by side, the
 * blue hand moving on the left grid and the red hand on the right. The grid
 * centers sit one hand-point step apart, so the grids interlock: each center
 * lands exactly on the other grid's inner hand point instead of beside it.
 * When both hands reach the same point with their staffs level (north, say),
 * the staffs overlap and each tip stops just short of the other hand, the
 * same gap a staff leaves before the center point when it points in.
 */
import type { GridJoin } from "@tka/tka-types";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import { PIXELS_PER_UNIT } from "$lib/shared/multi-grid/domain/constants/grid-mode-offsets";
import { isGridJoin } from "@tka/render-core";
import type { GridLayout } from "../state/animation-visibility-state.svelte";

/** Grid-center shift from the canvas center in the 950-unit grid viewBox. */
export const CONJOINED_SHIFT_VIEWBOX = PIXELS_PER_UNIT / 2;

/** The same shift in hand-point radii (prop x/y units). */
export const CONJOINED_SHIFT_UNITS = CONJOINED_SHIFT_VIEWBOX / PIXELS_PER_UNIT;

/**
 * The join this layout draws, in the sequence schema: red's grid one
 * hand-point step east of blue's.
 */
export const ANIMATION_GRID_JOIN: GridJoin = Object.freeze({
  toward: "e",
  steps: 1,
});

type JoinedSequence = { readonly conjoined?: GridJoin | null };

/**
 * The layout the animation draws: joined while the viewer's Conjoined switch
 * is on, or for a sequence saved with the join this layout draws.
 */
export function effectiveGridLayout(
  switchLayout: GridLayout,
  sequence: JoinedSequence | null | undefined
): GridLayout {
  const join = sequence?.conjoined;
  return switchLayout === "conjoined" ||
    (isGridJoin(join) &&
      join.toward === ANIMATION_GRID_JOIN.toward &&
      join.steps === ANIMATION_GRID_JOIN.steps)
    ? "conjoined"
    : "single";
}

/**
 * The sequence a card or picture made from the animation draws: its own join
 * when it has one, otherwise this layout's join while the switch is on.
 */
export function withAnimationGridJoin<T extends JoinedSequence>(
  sequence: T,
  switchLayout: GridLayout
): T {
  if (switchLayout !== "conjoined" || isGridJoin(sequence.conjoined)) {
    return sequence;
  }
  return { ...sequence, conjoined: ANIMATION_GRID_JOIN };
}

/** Prop index 0 is the blue (left) hand and moves left; 1 is red and moves right. */
export function conjoinedShiftUnits(propIndex: number): number {
  return propIndex === 0 ? -CONJOINED_SHIFT_UNITS : CONJOINED_SHIFT_UNITS;
}

/**
 * Moves path-cache trail points, which are built from step data on the single
 * grid, onto the hand's own grid. `scaleFactor` is canvas pixels per viewBox
 * unit.
 */
export function shiftTrailPoints(
  points: { x: number }[],
  propIndex: number,
  scaleFactor: number
): void {
  const dx = conjoinedShiftUnits(propIndex) * PIXELS_PER_UNIT * scaleFactor;
  for (const point of points) point.x += dx;
}

/**
 * Writes `source` moved `dxUnits` sideways into `target` and returns it.
 * Setting x/y sends every position reader (renderer, trail capture, effects)
 * down their shared Cartesian branch, which places a prop exactly where the
 * angle branch would, plus the shift.
 */
export function shiftPropState(
  source: PropState,
  dxUnits: number,
  target: PropState
): PropState {
  const cartesian = source.x !== undefined && source.y !== undefined;
  target.centerPathAngle = source.centerPathAngle;
  target.staffRotationAngle = source.staffRotationAngle;
  target.x =
    (cartesian ? source.x! : Math.cos(source.centerPathAngle)) + dxUnits;
  target.y = cartesian ? source.y! : Math.sin(source.centerPathAngle);
  return target;
}

/**
 * The left grid's east outer dot lands on the right grid's east hand point,
 * and the right grid's west outer dot on the left grid's west hand point.
 * Those two dots are dropped so every hand point stays visible.
 */
const HIDDEN_OUTER_POINT = {
  left: "e_diamond_outer_point",
  right: "w_diamond_outer_point",
} as const;

/**
 * Nonradial guide points (the grid files' layer 2), where a staff lying
 * across the radius points. No hand stops on them, pictographs hide them by
 * default, and here a diamond grid's inner ones would sit on the other grid's
 * north and south hand points, so the joined view leaves them out.
 */
const NONRADIAL_POINT = /<[a-zA-Z]+\b[^>]*\sclass="[^"]*layer2-point[^"]*"[^>]*\/>/g;

/**
 * Turns one grid SVG (950 viewBox, style block first) into the joined pair:
 * two shifted copies of its points under the original root and style.
 * Unrecognised markup is returned unchanged.
 */
export function buildConjoinedGridSvg(gridSvg: string): string {
  const rootOpen = /<svg\b[^>]*>/.exec(gridSvg);
  const closeAt = gridSvg.lastIndexOf("</svg>");
  if (!rootOpen || closeAt < 0) return gridSvg;

  const bodyStart = rootOpen.index + rootOpen[0].length;
  const styleClose = gridSvg.indexOf("</style>", bodyStart);
  const splitAt =
    styleClose >= 0 && styleClose < closeAt
      ? styleClose + "</style>".length
      : bodyStart;
  const body = gridSvg.slice(splitAt, closeAt);

  return (
    gridSvg.slice(0, splitAt) +
    gridCopy(body, "left", -CONJOINED_SHIFT_VIEWBOX) +
    gridCopy(body, "right", CONJOINED_SHIFT_VIEWBOX) +
    gridSvg.slice(closeAt)
  );
}

function gridCopy(body: string, side: "left" | "right", dx: number): string {
  const hidden = new RegExp(
    `<[a-zA-Z]+\\b[^>]*\\sid="${HIDDEN_OUTER_POINT[side]}"[^>]*/>`,
    "g"
  );
  const points = body
    .replace(hidden, "")
    .replace(NONRADIAL_POINT, "")
    .replace(/(\s)id="([^"]+)"/g, `$1id="${side}_$2"`);
  return `<g transform="translate(${dx} 0)">${points}</g>`;
}
