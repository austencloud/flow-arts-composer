/**
 * Level 7 conjoined grid for the 2D animation: the "2 Diamond" topology
 * (grid B's center on grid A's east outer point) laid across the square
 * canvas. Each grid sits one hand-point radius from the canvas center, so the
 * pair spans the canvas edge to edge at the usual scale. The blue hand moves
 * on the left grid and the red hand on the right.
 */
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import {
  OUTER_POINT_MULTIPLIER,
  PIXELS_PER_UNIT,
} from "$lib/shared/multi-grid/domain/constants/grid-mode-offsets";

/** Grid-center shift from the canvas center, in hand-point radii (prop x/y units). */
export const CONJOINED_SHIFT_UNITS = OUTER_POINT_MULTIPLIER / 2;

/** The same shift in the 950-unit grid viewBox. */
export const CONJOINED_SHIFT_VIEWBOX = CONJOINED_SHIFT_UNITS * PIXELS_PER_UNIT;

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
 * Each grid's center lands on the other grid's outer point. Those big outer
 * dots are dropped so the center dots stay readable; the shared hand point
 * between the grids draws from both copies in the same spot.
 */
const HIDDEN_OUTER_POINT = {
  left: "e_diamond_outer_point",
  right: "w_diamond_outer_point",
} as const;

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
    .replace(/(\s)id="([^"]+)"/g, `$1id="${side}_$2"`);
  return `<g transform="translate(${dx} 0)">${points}</g>`;
}
