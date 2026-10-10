/**
 * Joined grids for the 2D animation: two grids, the blue hand moving on one
 * and the red hand on the other, set by the sequence's own join (any of eight
 * directions, one or two points across).
 *
 * The join is read from the sequence data the animation plays, never from a
 * viewer preference, so the animation, the cards and every picture made from
 * the sequence draw the same pair of grids. Where the grids sit and which of
 * their points are drawn come from `@tka/render-core`, the rule the cards
 * follow; this module only adds the animation's own scale: the grid it draws
 * puts hand points 150 units from the center and outer points 300 out, in the
 * 950-unit viewBox, and props use hand-point radii as their unit.
 */
import type { GridJoin } from "@tka/tka-types";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import { PIXELS_PER_UNIT } from "#lib/shared/multi-grid/domain/constants/grid-mode-offsets.js";
import {
  JOINED_GRID_TINT,
  JOIN_GRID_LOCATIONS,
  alignGridJoin,
  gridJoinKey,
  gridJoinOffsets,
  isGridJoin,
  joinedPointColors,
  joinedPointKey,
  joinedPointsDrawnBy,
  mixHexColors,
  planJoinedGridPoints,
  type JoinGridGeometry,
  type JoinVec,
} from "@tka/render-core";
import type { GridLocation } from "@tka/render-core";

/** Center to hand point, and center to outer point, on the animation's grid. */
export const ANIMATION_GRID_GEOMETRY: JoinGridGeometry = Object.freeze({
  handRadius: PIXELS_PER_UNIT,
  outerRadius: 2 * PIXELS_PER_UNIT,
});

type JoinedSequence = {
  readonly conjoined?: GridJoin | null;
  readonly gridMode?: string | null;
};

/**
 * The join the animation draws for a sequence, or null for one grid. Overlaid
 * tunnel layers share one grid, so they keep it single. The join is lined up
 * with the grid drawn (`gridMode`, else the sequence's own), as the cards
 * line it up.
 */
export function resolveAnimationGridJoin(
  sequence: JoinedSequence | null | undefined,
  tunnelLayerCount = 0,
  gridMode?: string | null
): GridJoin | null {
  const join = sequence?.conjoined;
  return tunnelLayerCount === 0 && isGridJoin(join)
    ? alignGridJoin(join, gridMode ?? sequence?.gridMode)
    : null;
}

/** Short stable cache-key term for a join, e.g. "e1"; "" for one grid. */
export function animationGridJoinKey(join: GridJoin | null): string {
  return join ? gridJoinKey(join) : "";
}

/** Prop index 0 is the blue (left) hand; 1 is red. */
function handOf(propIndex: number): "left" | "right" {
  return propIndex === 0 ? "left" : "right";
}

/**
 * Where a hand's grid sits from the canvas center, in hand-point radii (the
 * unit of prop x/y): half the center distance, blue back and red forward.
 */
export function gridJoinShiftUnits(join: GridJoin, propIndex: number): JoinVec {
  return gridJoinOffsets(join, 1)[handOf(propIndex)];
}

/** The same shift in the 950-unit grid viewBox. */
export function gridJoinShiftViewBox(
  join: GridJoin,
  propIndex: number
): JoinVec {
  return gridJoinOffsets(join, PIXELS_PER_UNIT)[handOf(propIndex)];
}

/**
 * Moves path-cache trail points, which are built from step data on the single
 * grid, onto the hand's own grid. `scaleFactor` is canvas pixels per viewBox
 * unit.
 */
export function shiftTrailPoints(
  points: { x: number; y: number }[],
  join: GridJoin,
  propIndex: number,
  scaleFactor: number
): void {
  const shift = gridJoinShiftViewBox(join, propIndex);
  const dx = shift.x * scaleFactor;
  const dy = shift.y * scaleFactor;
  for (const point of points) {
    point.x += dx;
    point.y += dy;
  }
}

/**
 * Moves path-cache trail points by a hand's displayed grid offset in
 * hand-point radii, which during a layout slide sits between two joins'
 * offsets. `scaleFactor` is canvas pixels per viewBox unit.
 */
export function shiftTrailPointsBy(
  points: { x: number; y: number }[],
  shiftUnits: JoinVec,
  scaleFactor: number
): void {
  if (shiftUnits.x === 0 && shiftUnits.y === 0) return;
  const dx = shiftUnits.x * PIXELS_PER_UNIT * scaleFactor;
  const dy = shiftUnits.y * PIXELS_PER_UNIT * scaleFactor;
  for (const point of points) {
    point.x += dx;
    point.y += dy;
  }
}

/**
 * Writes `source` moved by `shift` (in hand-point radii) into `target` and
 * returns it. Setting x/y sends every position reader (renderer, trail
 * capture, effects) down their shared Cartesian branch, which places a prop
 * exactly where the angle branch would, plus the shift.
 */
export function shiftPropState(
  source: PropState,
  shift: JoinVec,
  target: PropState
): PropState {
  const cartesian = source.x !== undefined && source.y !== undefined;
  target.centerPathAngle = source.centerPathAngle;
  target.staffRotationAngle = source.staffRotationAngle;
  target.x =
    (cartesian ? source.x! : Math.cos(source.centerPathAngle)) + shift.x;
  target.y =
    (cartesian ? source.y! : Math.sin(source.centerPathAngle)) + shift.y;
  return target;
}

/**
 * Nonradial guide points (the grid files' layer 2), where a staff lying
 * across the radius points. No hand stops on them, pictographs hide them by
 * default, and in a joined view they would sit on the other grid's hand
 * points, so the joined view leaves them out.
 */
const NONRADIAL_POINT =
  /<[a-zA-Z]+\b[^>]*\sclass="[^"]*layer2-point[^"]*"[^>]*\/>/g;

/**
 * The grid files name the box outer points by the opposite corner of the one
 * each sits at (`ne_box_outer_point` is drawn top-left, where the hand points
 * and the cards call it nw). Hand points are named correctly.
 */
const BOX_OUTER_ID_LOCATION: Readonly<Record<string, GridLocation>> = {
  ne: "nw",
  se: "ne",
  sw: "se",
  nw: "sw",
};

const POINT_ELEMENT = /<(?:circle|path)\b[^>]*\sid="([^"]+)"[^>]*\/>/g;

/** Which grid point an element of a grid file draws, or null for the rest. */
export function gridPointOfElementId(id: string): string | null {
  if (id === "center_point") return joinedPointKey("center", "c");
  let match = /^([nesw])_diamond_outer_point$/.exec(id);
  if (match) return joinedPointKey("outer", match[1] as GridLocation);
  match = /^([nesw])_diamond_hand_point_strict$/.exec(id);
  if (match) return joinedPointKey("hand", match[1] as GridLocation);
  match = /^(ne|se|sw|nw)_box_outer_point$/.exec(id);
  if (match) {
    return joinedPointKey("outer", BOX_OUTER_ID_LOCATION[match[1]!]!);
  }
  match = /^strict_(ne|se|sw|nw)_box_hand_point$/.exec(id);
  if (match) return joinedPointKey("hand", match[1] as GridLocation);
  return null;
}

/** The grid locations a grid file has points at: diamond, box, or both. */
function gridFileLocations(body: string): GridLocation[] {
  const locations: GridLocation[] = [];
  if (/_diamond_(?:outer|hand)_point/.test(body)) {
    locations.push(...JOIN_GRID_LOCATIONS.diamond);
  }
  if (/_box_(?:outer|hand)_point/.test(body)) {
    locations.push(...JOIN_GRID_LOCATIONS.box);
  }
  return locations;
}

/**
 * Colors for a joined grid's dots: `base` is the one-grid dot color, and each
 * dot leans toward its hand's color (spots both grids share, toward the mix).
 */
export interface JoinedGridPaint {
  readonly base: string;
  readonly hands: Readonly<Record<"left" | "right", string>>;
}

/** Short stable cache-key term for a paint; "" for unpainted. */
export function joinedGridPaintKey(paint: JoinedGridPaint | null): string {
  return paint ? `${paint.base}|${paint.hands.left}|${paint.hands.right}` : "";
}

/**
 * Turns one grid SVG (950 viewBox, style block first) into the joined pair:
 * two shifted copies of its points under the original root and style, each
 * keeping only the points the join draws. With `paint`, each drawn point
 * gets its own color inline; without it the points keep the file's ink.
 * Unrecognised markup is returned unchanged.
 */
export function buildJoinedGridSvg(
  gridSvg: string,
  join: GridJoin,
  paint: JoinedGridPaint | null = null
): string {
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

  const plan = planJoinedGridPoints(
    join,
    gridFileLocations(body),
    ANIMATION_GRID_GEOMETRY
  );
  const colors = new Map<string, string>();
  if (paint) {
    const pointColors = joinedPointColors(plan.points, paint.base, paint.hands);
    plan.points.forEach((point, index) => {
      const owner = point.members[0]!;
      colors.set(
        `${owner.hand}|${joinedPointKey(point.kind, owner.location)}`,
        pointColors[index]!
      );
    });
  }

  return (
    gridSvg.slice(0, splitAt) +
    gridCopy(
      body,
      "left",
      plan.offsets.left,
      joinedPointsDrawnBy(plan.points, "left"),
      colors
    ) +
    gridCopy(
      body,
      "right",
      plan.offsets.right,
      joinedPointsDrawnBy(plan.points, "right"),
      colors
    ) +
    gridSvg.slice(closeAt)
  );
}

/**
 * One whole grid for a hand to slide on while the layout changes: every
 * hand, outer and center point painted `color`, the nonradial guide points
 * left out as in the joined view. Unrecognised markup is returned unchanged.
 */
export function buildHandGridCopySvg(gridSvg: string, color: string): string {
  const rootOpen = /<svg\b[^>]*>/.exec(gridSvg);
  const closeAt = gridSvg.lastIndexOf("</svg>");
  if (!rootOpen || closeAt < 0) return gridSvg;
  const bodyStart = rootOpen.index + rootOpen[0].length;
  const styleClose = gridSvg.indexOf("</style>", bodyStart);
  const splitAt =
    styleClose >= 0 && styleClose < closeAt
      ? styleClose + "</style>".length
      : bodyStart;
  const body = gridSvg
    .slice(splitAt, closeAt)
    .replace(POINT_ELEMENT, (element, id: string) =>
      gridPointOfElementId(id) === null ? element : paintElement(element, color)
    )
    .replace(NONRADIAL_POINT, "");
  return gridSvg.slice(0, splitAt) + body + gridSvg.slice(closeAt);
}

/**
 * The color a hand's own grid copy is painted while it slides: the color a
 * joined grid gives a point only that hand's grid draws.
 */
export function handGridCopyColor(
  paint: JoinedGridPaint,
  hand: "left" | "right"
): string {
  return mixHexColors(paint.base, paint.hands[hand], JOINED_GRID_TINT);
}

function gridCopy(
  body: string,
  side: "left" | "right",
  offset: JoinVec,
  drawn: ReadonlySet<string>,
  colors: ReadonlyMap<string, string>
): string {
  const points = body
    .replace(POINT_ELEMENT, (element, id: string) => {
      const point = gridPointOfElementId(id);
      if (point === null) return element;
      if (!drawn.has(point)) return "";
      const color = colors.get(`${side}|${point}`);
      return color ? paintElement(element, color) : element;
    })
    .replace(NONRADIAL_POINT, "")
    .replace(/(\s)id="([^"]+)"/g, `$1id="${side}_$2"`);
  return `<g transform="translate(${offset.x} ${offset.y})">${points}</g>`;
}

/**
 * Colors one point element inline, which outranks the file's class rules: a
 * ring (the box outer points) by its stroke, a dot by its fill.
 */
function paintElement(element: string, color: string): string {
  const paint = /\sclass="[^"]*box-outer-ring/.test(element)
    ? `stroke:${color}`
    : `fill:${color}`;
  return element.replace(/\s*\/>$/, ` style="${paint}"/>`);
}
