/**
 * SVG markup for two joined grids, for the live pictograph (the workspace
 * cells, the step editor, anything drawn through PictographRenderer).
 *
 * The geometry, the dot sizes and the tint all come from `@tka/render-core`
 * (getGridJoinLayout, gridPointsSvg, joinedPointColors), the same rule the
 * card renderer and both MCP renderers paint with, so a joined sequence looks
 * the same in the workspace as on its card. This file only picks which hand
 * points show and turns the layout into circles.
 */
import {
  BOX_OUTER_RING_WIDTH,
  DIAMOND_OUTER_POINTS,
  JOIN_GRID_LOCATIONS,
  JOIN_HAND_RADIUS,
  JOINED_POINT_RADIUS,
  gridPointsSvg,
  joinedPointColors,
  type GridJoinLayout,
  type JoinVec,
  type JoinedGridMode,
  type JoinedGridModes,
  type JoinedGridPoint,
} from "@tka/render-core";

/** The one-grid dot colors the card and MCP renderers mix the tint into. */
const GRID_POINT_COLOR_DARK = "#ffffff";
const GRID_POINT_COLOR_LIGHT = "#000000";

export interface JoinedGridMarkupOptions {
  darkMode: boolean;
  /** The grid each hand draws; a box grid's outer points are rings. */
  grids: JoinedGridModes;
  /** Each hand's color; the dots lean toward their own hand's. */
  handColors: Readonly<Record<"left" | "right", string>>;
  /**
   * "all" draws every hand point, "none" none, and "active" only the points
   * each hand starts or ends on in its own grid (`activeHandPoints`).
   */
  handPointVisibility?: "all" | "active" | "none";
  activeHandPoints?: Readonly<Record<"left" | "right", ReadonlySet<string>>>;
}

/** The joined layout's dots as SVG circles, in the 950-unit scene. */
export function joinedGridMarkup(
  layout: Pick<GridJoinLayout, "points">,
  options: JoinedGridMarkupOptions
): string {
  return pointsMarkup(layout.points, options, true);
}

/**
 * The joined layout's dots mid-turn: each outer dot is `ring` of the way
 * from a filled diamond dot (0) to a box ring (1), the same fill and stroke
 * fade the single grid's outer points make while GridSvg turns it. Every
 * other dot is drawn as at rest.
 */
export function turningGridMarkup(
  layout: Pick<GridJoinLayout, "points">,
  ring: number,
  options: JoinedGridMarkupOptions
): string {
  return pointsMarkup(layout.points, options, true, ring);
}

/**
 * One outer dot between filled and ring, drawn as GridSvg draws its outer
 * points (one circle whose fill and stroke opacities cross), so the midway
 * look matches a single grid's turn.
 */
function morphingOuterPointSvg(
  point: JoinedGridPoint,
  color: string,
  ring: number
): string {
  const clamped = ring <= 0 ? 0 : ring >= 1 ? 1 : ring;
  return `<circle cx="${point.x}" cy="${point.y}" r="${JOINED_POINT_RADIUS.outer}" fill="${color}" fill-opacity="${(1 - clamped).toFixed(3)}" stroke="${color}" stroke-width="${BOX_OUTER_RING_WIDTH}" stroke-opacity="${clamped.toFixed(3)}"/>`;
}

function pointsMarkup(
  points: readonly JoinedGridPoint[],
  options: JoinedGridMarkupOptions,
  tinted: boolean,
  outerRing?: number
): string {
  const base = options.darkMode
    ? GRID_POINT_COLOR_DARK
    : GRID_POINT_COLOR_LIGHT;
  const colors = tinted
    ? joinedPointColors(points, base, options.handColors)
    : points.map(() => base);
  const visibility = options.handPointVisibility ?? "all";
  const active = visibility === "active" ? options.activeHandPoints : null;
  const shown = (point: JoinedGridPoint): boolean =>
    point.kind !== "hand" ||
    (visibility !== "none" &&
      (!active ||
        point.members.some((member) =>
          active[member.hand].has(member.location)
        )));
  return points
    .map((point, index) => {
      if (!shown(point)) return "";
      const color = colors[index]!;
      if (outerRing !== undefined && point.kind === "outer") {
        return morphingOuterPointSvg(point, color, outerRing);
      }
      return gridPointsSvg([point], point.ring, color);
    })
    .join("");
}

const SCENE_CENTER = 475;
const OUTER_RADIUS = DIAMOND_OUTER_POINTS.e!.x - SCENE_CENTER;
const INTERCARDINAL: ReadonlySet<string> = new Set(JOIN_GRID_LOCATIONS.box);

/** One hand's whole grid, centered `offset` from the scene center. */
function handGridPoints(
  hand: "left" | "right",
  offset: JoinVec,
  mode: JoinedGridMode
): JoinedGridPoint[] {
  const cx = SCENE_CENTER + offset.x;
  const cy = SCENE_CENTER + offset.y;
  const points: JoinedGridPoint[] = [
    {
      kind: "center",
      x: cx,
      y: cy,
      members: [{ hand, location: "c" }],
      ring: false,
    },
  ];
  for (const location of JOIN_GRID_LOCATIONS[mode]) {
    const unit = LOCATION_UNIT[location]!;
    for (const [kind, radius] of [
      ["hand", JOIN_HAND_RADIUS],
      ["outer", OUTER_RADIUS],
    ] as const) {
      points.push({
        kind,
        x: cx + unit.x * radius,
        y: cy + unit.y * radius,
        members: [{ hand, location }],
        ring: kind === "outer" && INTERCARDINAL.has(location),
      });
    }
  }
  return points;
}

const INV_SQRT2 = Math.SQRT1_2;
const LOCATION_UNIT: Readonly<Record<string, JoinVec>> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
  ne: { x: INV_SQRT2, y: -INV_SQRT2 },
  se: { x: INV_SQRT2, y: INV_SQRT2 },
  sw: { x: -INV_SQRT2, y: INV_SQRT2 },
  nw: { x: -INV_SQRT2, y: -INV_SQRT2 },
};

/**
 * Both hands' grids mid-slide, each whole and at its shown offset: nothing
 * merges or hides while they move. `joined` (0 to 1) is how far the picture
 * is from one grid: the red grid shows that strongly, and the blue grid's
 * dots lean toward blue that much, so one grid splitting in two (or two
 * becoming one) changes color with the move rather than at its end.
 */
export function slidingGridsMarkup(
  offsets: Readonly<Record<"left" | "right", JoinVec>>,
  joined: number,
  options: JoinedGridMarkupOptions
): string {
  const blue = handGridPoints("left", offsets.left, options.grids.left);
  const red = handGridPoints("right", offsets.right, options.grids.right);
  const layer = (markup: string, opacity: number): string =>
    opacity <= 0.001 ? "" : `<g opacity="${opacity.toFixed(3)}">${markup}</g>`;
  return [
    // Plain underneath at full strength and the tint over it, so the blue
    // grid keeps its full strength while its color shifts.
    layer(pointsMarkup(blue, options, false), joined < 1 ? 1 : 0),
    layer(pointsMarkup(blue, options, true), joined),
    layer(pointsMarkup(red, options, true), joined),
  ].join("");
}

/**
 * The transform that shrinks the joined grids, props and arrows about the
 * scene center so they clear the glyphs at the cell edges, as the card
 * renderer's `applyJoinedGridFit` does.
 */
export function joinedGridFitTransform(
  layout: GridJoinLayout,
  sceneSize = 950
): string {
  const center = sceneSize / 2;
  return `translate(${center} ${center}) scale(${layout.scale}) translate(${-center} ${-center})`;
}
