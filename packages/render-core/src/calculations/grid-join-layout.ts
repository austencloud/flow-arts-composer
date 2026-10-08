/**
 * Joined-grid layout: one pictograph drawn on two grids, one per hand.
 *
 * Owns the geometry every joined painter shares, so the app's canvas card
 * path and the MCP's SVG renderers cannot drift apart:
 * - where each hand's grid sits (the blue grid is the anchor; the pair is
 *   centered in the 950-unit scene),
 * - which grid points are drawn: a point both grids share is drawn once, and
 *   an outer point that lands beside the other grid's point is hidden,
 * - the fit scale that keeps the joined picture clear of the cell's edge
 *   glyphs (the reversal dots sit at the middle of the left edge),
 * - the nudge that separates two props lying along one line, using the
 *   prop's beta-offset distance.
 *
 * Scene units throughout. Painters scale the joined content (grid, props,
 * arrows) about the scene center; glyphs stay where they always are.
 */
import type { GridLocation } from "../types.js";
import {
  CENTER_POINT,
  DIAMOND_OUTER_POINTS,
} from "../constants/grid-coordinates.js";
import { getNormalHandPointCoordinates } from "./grid-placement.js";
import {
  BOX_OUTER_RING_WIDTH,
  GRID_POINT_RADIUS,
  isBoxGrid,
} from "./grid-points.js";

export { BOX_OUTER_RING_WIDTH };

type Hand = "left" | "right";

/** The direction from the blue grid's center toward the red grid's. */
export type GridJoinDirection = Exclude<GridLocation, "c">;

/**
 * How the two hands' grids join. Mirrors `GridJoin` in `@tka/tka-types`, the
 * schema owner; this package takes no dependency on it, and the two types are
 * structurally the same.
 */
export interface GridJoinSpec {
  readonly toward: GridJoinDirection;
  /** Center distance in hand-point steps: 1 interlocks, 2 meets hand to hand. */
  readonly steps: 1 | 2;
}

export interface JoinVec {
  readonly x: number;
  readonly y: number;
}

export type JoinedGridPointKind = "center" | "hand" | "outer";

export interface JoinedGridPoint {
  readonly kind: JoinedGridPointKind;
  readonly x: number;
  readonly y: number;
  /** Every grid this point belongs to, with its location in that grid. */
  readonly members: readonly {
    readonly hand: Hand;
    readonly location: GridLocation;
  }[];
}

export interface GridJoinLayout {
  readonly join: GridJoinSpec;
  /** Each hand's grid offset from the scene center, before the fit scale. */
  readonly offsets: Readonly<Record<Hand, JoinVec>>;
  /** Points to draw, after shared points merge and crowded outer points hide. */
  readonly points: readonly JoinedGridPoint[];
  /** Scale about the scene center that fits the joined content in the cell. */
  readonly scale: number;
}

const SCENE_CENTER = CENTER_POINT.x;
/** Center to hand point on the drawn grid (143.1). */
export const JOIN_HAND_RADIUS =
  getNormalHandPointCoordinates("e", "diamond").x - SCENE_CENTER;
/** Center to outer point on the drawn grid (300). */
const OUTER_RADIUS = DIAMOND_OUTER_POINTS.e!.x - SCENE_CENTER;

/** Drawn radius of each point kind, as one grid draws them. */
export const JOINED_POINT_RADIUS: Readonly<
  Record<JoinedGridPointKind, number>
> = {
  center: GRID_POINT_RADIUS.center,
  hand: GRID_POINT_RADIUS.hand,
  outer: GRID_POINT_RADIUS.outer,
};

/**
 * Joined content stays this far inside the cell edge. The reversal dots
 * reach 86.5 units in from the left edge (x 71.5, radius 15).
 */
const FIT_MARGIN = 92;
/** Two points closer than this are one point. */
const SAME_POINT = 1;
/** An outer point this close to the other grid's point is hidden. */
const CROWDED_OUTER = 20;

const INV_SQRT2 = Math.SQRT1_2;
/** Unit vector from a grid's center toward each location. */
const LOCATION_UNIT: Readonly<Record<GridLocation, JoinVec>> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
  ne: { x: INV_SQRT2, y: -INV_SQRT2 },
  se: { x: INV_SQRT2, y: INV_SQRT2 },
  sw: { x: -INV_SQRT2, y: INV_SQRT2 },
  nw: { x: -INV_SQRT2, y: -INV_SQRT2 },
  c: { x: 0, y: 0 },
};

/** Hand-point (and outer-point) locations of each drawn grid. */
const GRID_LOCATIONS: Readonly<
  Record<"diamond" | "box", readonly GridLocation[]>
> = {
  diamond: ["n", "e", "s", "w"],
  box: ["ne", "se", "sw", "nw"],
};

const JOIN_DIRECTIONS: ReadonlySet<string> = new Set<GridJoinDirection>([
  "n",
  "e",
  "s",
  "w",
  "ne",
  "se",
  "sw",
  "nw",
]);

/**
 * The directions a join can take on each drawn grid: along the grid's own
 * hand-point lines. Sliding a grid along one of them lands the other grid's
 * center on a hand point (one step) or meets hand to hand (two steps); along
 * any other line no point meets another, and the near-misses read as clutter.
 */
export const GRID_JOIN_DIRECTIONS: Readonly<
  Record<"diamond" | "box", readonly GridJoinDirection[]>
> = {
  diamond: ["n", "e", "s", "w"],
  box: ["ne", "se", "sw", "nw"],
};

/** A quarter-step clockwise turn of each direction. */
const CLOCKWISE_EIGHTH: Readonly<Record<GridJoinDirection, GridJoinDirection>> =
  {
    n: "ne",
    ne: "e",
    e: "se",
    se: "s",
    s: "sw",
    sw: "w",
    w: "nw",
    nw: "n",
  };

/**
 * The join as drawn on `gridMode`'s grid. A direction off that grid's
 * hand-point lines (a diagonal on a diamond grid, a straight one on a box
 * grid, as a sequence carries after its grid mode changes) turns 45°
 * clockwise onto them; a join already on them comes back unchanged.
 */
export function alignGridJoin<T extends GridJoinSpec>(
  join: T,
  gridMode: string | null | undefined
): T {
  const directions =
    GRID_JOIN_DIRECTIONS[isBoxGrid(gridMode ?? undefined) ? "box" : "diamond"];
  if (directions.includes(join.toward)) return join;
  return { ...join, toward: CLOCKWISE_EIGHTH[join.toward] };
}

/** True for a well-formed join (anything read from storage or a link). */
export function isGridJoin(value: unknown): value is GridJoinSpec {
  if (!value || typeof value !== "object") return false;
  const join = value as { toward?: unknown; steps?: unknown };
  return (
    typeof join.toward === "string" &&
    JOIN_DIRECTIONS.has(join.toward) &&
    (join.steps === 1 || join.steps === 2)
  );
}

/** Short stable cache-key term, e.g. "e1". */
export function gridJoinKey(join: GridJoinSpec): string {
  return `${join.toward}${join.steps}`;
}

/**
 * The join a sequence draws every cell with (the start placement included),
 * as one filename-safe term for image cache keys, e.g. "e1". Empty when the
 * sequence is on one grid, so one-grid cache keys stay unchanged.
 */
export function sequenceGridJoinKey(sequence: {
  readonly conjoined?: GridJoinSpec | null;
}): string {
  return isGridJoin(sequence.conjoined) ? gridJoinKey(sequence.conjoined) : "";
}

/**
 * Sets a card's cell to the sequence's join. A sequence has one join for every
 * cell (the start placement included), so a join a cell carries on its own is
 * never honored: the sequence's replaces it, or it is dropped when the
 * sequence is on one grid. Ordinary one-grid cells pass through untouched, so
 * one-grid cards keep their exact cache keys.
 */
export function gridJoinCellResolver(sequence: {
  readonly conjoined?: GridJoinSpec | null;
}): <T extends object>(cell: T) => T {
  const join = isGridJoin(sequence.conjoined) ? sequence.conjoined : null;
  if (join) return (cell) => ({ ...cell, conjoined: join });
  return (cell) => {
    const carried = cell as { conjoined?: unknown };
    if (carried.conjoined === undefined) return cell;
    const { conjoined: _stray, ...rest } = carried;
    return rest as typeof cell;
  };
}

/**
 * Each hand's grid offset: half the center distance either side of center.
 * `handRadius` is the painter's own center-to-hand-point distance (the cards'
 * is the default; the 2D animation draws 150, and passes 1 for offsets in
 * hand-point radii).
 */
export function gridJoinOffsets(
  join: GridJoinSpec,
  handRadius: number = JOIN_HAND_RADIUS
): Record<Hand, JoinVec> {
  const unit = LOCATION_UNIT[join.toward];
  const half = (join.steps * handRadius) / 2;
  return {
    left: { x: -unit.x * half, y: -unit.y * half },
    right: { x: unit.x * half, y: unit.y * half },
  };
}

/** The grid locations a drawn grid has hand and outer points at. */
export const JOIN_GRID_LOCATIONS: Readonly<
  Record<"diamond" | "box", readonly GridLocation[]>
> = GRID_LOCATIONS;

/** A painter's own grid size: center to hand point and center to outer point. */
export interface JoinGridGeometry {
  readonly handRadius: number;
  readonly outerRadius: number;
}

/** The painters' grid size on the 950-unit card scene. */
const CARD_GRID_GEOMETRY: JoinGridGeometry = {
  handRadius: JOIN_HAND_RADIUS,
  outerRadius: OUTER_RADIUS,
};

export interface JoinedGridPlan {
  /** Each hand's grid offset from the scene center, before any fit scale. */
  readonly offsets: Readonly<Record<Hand, JoinVec>>;
  /** Points to draw, after shared points merge and crowded outer points hide. */
  readonly points: readonly JoinedGridPoint[];
}

/**
 * Which points two joined grids draw, for any grid size. This is the one rule
 * every joined painter follows (the cards' layout and the 2D animation's grid
 * picture): a point both grids share is drawn once, by the blue grid, and an
 * outer point that lands beside the other grid's point is hidden. Coordinates
 * are in the 950-unit scene, centered on 475.
 */
export function planJoinedGridPoints(
  join: GridJoinSpec,
  locations: readonly GridLocation[],
  geometry: JoinGridGeometry
): JoinedGridPlan {
  const offsets = gridJoinOffsets(join, geometry.handRadius);
  const raw: {
    hand: Hand;
    kind: JoinedGridPointKind;
    location: GridLocation;
    x: number;
    y: number;
  }[] = [];
  for (const hand of ["left", "right"] as const) {
    const cx = SCENE_CENTER + offsets[hand].x;
    const cy = SCENE_CENTER + offsets[hand].y;
    raw.push({ hand, kind: "center", location: "c", x: cx, y: cy });
    for (const location of locations) {
      const unit = LOCATION_UNIT[location];
      raw.push({
        hand,
        kind: "hand",
        location,
        x: cx + unit.x * geometry.handRadius,
        y: cy + unit.y * geometry.handRadius,
      });
      raw.push({
        hand,
        kind: "outer",
        location,
        x: cx + unit.x * geometry.outerRadius,
        y: cy + unit.y * geometry.outerRadius,
      });
    }
  }

  const distance = (a: JoinVec, b: JoinVec) => Math.hypot(a.x - b.x, a.y - b.y);
  const points: JoinedGridPoint[] = [];
  for (const point of raw) {
    const others = raw.filter((other) => other.hand !== point.hand);
    const twin = others.find(
      (other) =>
        other.kind === point.kind && distance(other, point) < SAME_POINT
    );
    // A shared point is drawn once, by the blue grid.
    if (twin && point.hand === "right") continue;
    if (
      !twin &&
      point.kind === "outer" &&
      others.some((other) => distance(other, point) < CROWDED_OUTER)
    ) {
      continue;
    }
    points.push({
      kind: point.kind,
      x: point.x,
      y: point.y,
      members: twin
        ? [
            { hand: point.hand, location: point.location },
            { hand: twin.hand, location: twin.location },
          ]
        : [{ hand: point.hand, location: point.location }],
    });
  }
  return { offsets, points };
}

/** The key a hand's grid point is looked up by: "outer:e", "center:c". */
export function joinedPointKey(
  kind: JoinedGridPointKind,
  location: GridLocation
): string {
  return `${kind}:${location}`;
}

/**
 * The points one hand's grid draws, as `joinedPointKey` keys. A point both
 * grids share belongs to the blue grid alone, which is where the plan puts
 * its first member.
 */
export function joinedPointsDrawnBy(
  points: readonly JoinedGridPoint[],
  hand: Hand
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const point of points) {
    const owner = point.members[0]!;
    if (owner.hand === hand)
      keys.add(joinedPointKey(point.kind, owner.location));
  }
  return keys;
}

/**
 * Scale about the scene center that keeps joined points (and their drawn
 * dots) `margin` units inside the scene edge; 1 when they already fit.
 */
export function joinedFitScale(
  points: readonly JoinedGridPoint[],
  box: boolean,
  margin: number
): number {
  const outerReach =
    JOINED_POINT_RADIUS.outer + (box ? BOX_OUTER_RING_WIDTH / 2 : 0);
  const reach = Math.max(
    ...points.map(
      (point) =>
        Math.max(
          Math.abs(point.x - SCENE_CENTER),
          Math.abs(point.y - SCENE_CENTER)
        ) +
        (point.kind === "outer" ? outerReach : JOINED_POINT_RADIUS[point.kind])
    )
  );
  return Math.min(1, (SCENE_CENTER - margin) / reach);
}

const layoutCache = new Map<string, GridJoinLayout>();

/**
 * The joined layout for a join and grid mode. Box draws box grids; every
 * other mode draws diamond grids, as the single-grid painters do. The join is
 * aligned to that grid first, so `layout.join` is the join actually drawn.
 */
export function getGridJoinLayout(
  join: GridJoinSpec,
  gridMode: string | undefined
): GridJoinLayout {
  const box = gridMode === "box";
  join = alignGridJoin(join, gridMode);
  const cacheKey = `${gridJoinKey(join)}:${box ? "box" : "diamond"}`;
  const cached = layoutCache.get(cacheKey);
  if (cached) return cached;

  const { offsets, points } = planJoinedGridPoints(
    join,
    GRID_LOCATIONS[box ? "box" : "diamond"],
    CARD_GRID_GEOMETRY
  );
  const scale = joinedFitScale(points, box, FIT_MARGIN);

  const layout: GridJoinLayout = Object.freeze({
    join: Object.freeze({ toward: join.toward, steps: join.steps }),
    offsets: Object.freeze(offsets),
    points: Object.freeze(points),
    scale,
  });
  layoutCache.set(cacheKey, layout);
  return layout;
}

/** The part of a joined layout that places one hand's drawing. */
export type JoinedHandFrame = Pick<GridJoinLayout, "offsets" | "scale">;

/**
 * Where a point of one hand's one-grid scene lands in the joined drawing: on
 * that hand's own grid, then shrunk with the joined fit about the scene
 * center. The painters draw each hand's props and arrows exactly this way
 * (preparation adds the grid offset, the fit transform scales), so a hit
 * target or drag handle placed here sits on what that hand draws.
 */
export function toJoinedHandPoint(
  layout: JoinedHandFrame,
  hand: Hand,
  point: JoinVec
): JoinVec {
  const offset = layout.offsets[hand];
  return {
    x: SCENE_CENTER + layout.scale * (point.x - SCENE_CENTER + offset.x),
    y: SCENE_CENTER + layout.scale * (point.y - SCENE_CENTER + offset.y),
  };
}

/**
 * The inverse: a point of the joined drawing (a pointer, say) read in one
 * hand's one-grid scene, where that hand's grid points have their ordinary
 * coordinates.
 */
export function fromJoinedHandPoint(
  layout: JoinedHandFrame,
  hand: Hand,
  point: JoinVec
): JoinVec {
  const offset = layout.offsets[hand];
  return {
    x: SCENE_CENTER + (point.x - SCENE_CENTER) / layout.scale - offset.x,
    y: SCENE_CENTER + (point.y - SCENE_CENTER) / layout.scale - offset.y,
  };
}

/**
 * `toJoinedHandPoint` as an SVG transform, for one-grid content (a prop, a
 * path) drawn whole on one hand's grid.
 */
export function joinedHandTransform(
  layout: JoinedHandFrame,
  hand: Hand
): string {
  const offset = layout.offsets[hand];
  return `translate(${SCENE_CENTER} ${SCENE_CENTER}) scale(${layout.scale}) translate(${offset.x - SCENE_CENTER} ${offset.y - SCENE_CENTER})`;
}

/** A prop as the nudge sees it: a segment through its hand point. */
export interface JoinPropBody {
  /** Hand point, with the grid offset applied. */
  readonly x: number;
  readonly y: number;
  /** Degrees, as the painters rotate the prop artwork. */
  readonly rotation: number;
  /** Half the prop's drawn length along its rotation. */
  readonly halfLength: number;
}

/** An end this close to the other prop's hand point counts as on it. */
const TIP_ON_HAND = 30;
const PARALLEL = 1e-3;
const SAME_LINE = 1;
const OVERLAP = 1;

/**
 * Separation for two props drawn on joined grids, or null when they do not
 * overlap. Props lying along one line and overlapping each move their own
 * beta-offset distance off that line, in opposite directions: blue toward its
 * own grid when the join crosses the line, otherwise red a quarter turn
 * counterclockwise of the line (up, for a horizontal line) and blue the
 * other way. When an end lands on the other prop's hand point they stay put,
 * so the touch shows as it does in the animation.
 */
export function gridJoinPropNudges(
  join: GridJoinSpec,
  left: JoinPropBody,
  right: JoinPropBody,
  distances: Readonly<Record<Hand, number>>
): Record<Hand, JoinVec> | null {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const leftAxis = {
    x: Math.cos(toRadians(left.rotation)),
    y: Math.sin(toRadians(left.rotation)),
  };
  const rightAxis = {
    x: Math.cos(toRadians(right.rotation)),
    y: Math.sin(toRadians(right.rotation)),
  };
  if (Math.abs(leftAxis.x * rightAxis.y - leftAxis.y * rightAxis.x) > PARALLEL)
    return null;

  // One direction per line, so the result does not depend on which way
  // either artwork happens to face.
  const axis =
    leftAxis.x < -PARALLEL ||
    (Math.abs(leftAxis.x) <= PARALLEL && leftAxis.y < 0)
      ? { x: -leftAxis.x, y: -leftAxis.y }
      : leftAxis;
  const apart = { x: right.x - left.x, y: right.y - left.y };
  if (Math.abs(apart.x * axis.y - apart.y * axis.x) > SAME_LINE) return null;
  const along = apart.x * axis.x + apart.y * axis.y;
  const overlap =
    Math.min(left.halfLength, along + right.halfLength) -
    Math.max(-left.halfLength, along - right.halfLength);
  if (overlap <= OVERLAP) return null;

  if (
    Math.abs(Math.abs(along) - left.halfLength) < TIP_ON_HAND ||
    Math.abs(Math.abs(along) - right.halfLength) < TIP_ON_HAND
  ) {
    return null;
  }

  const toward = LOCATION_UNIT[join.toward];
  const towardAlong = toward.x * axis.x + toward.y * axis.y;
  const across = {
    x: toward.x - towardAlong * axis.x,
    y: toward.y - towardAlong * axis.y,
  };
  const acrossLength = Math.hypot(across.x, across.y);
  const redDirection =
    acrossLength > PARALLEL
      ? { x: across.x / acrossLength, y: across.y / acrossLength }
      : { x: axis.y, y: -axis.x };
  return {
    left: {
      x: -redDirection.x * distances.left,
      y: -redDirection.y * distances.left,
    },
    right: {
      x: redDirection.x * distances.right,
      y: redDirection.y * distances.right,
    },
  };
}
