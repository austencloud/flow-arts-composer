/**
 * The registered geometry of the Kinetic Fire site, in world metres.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * These shapes are ground truth Austen gave in the section-by-section labeling
 * interview, traced over the registered orthophoto. They were living in a unit
 * test, and the tree layout needs the same polygons, so they now have one
 * owner and both consumers read from it. The full record — including how each
 * frame was registered and what Austen said about each zone — is
 * `docs/superpowers/specs/flow-fest-sim/site-labels-interview.md`.
 *
 * WORLD FRAME
 * -----------
 * EPSG:26916 (NAD83 / UTM 16N), origin at easting 690142 / northing 4384552:
 * `worldX = easting - 690142`, `worldZ = 4384552 - northing`. Axes are
 * x = east, y = up, z = south, so NEGATIVE z is north. The orthophoto is
 * 2048x2048 at 0.5 m/px with its top-left at world (-512, -512).
 *
 * This module holds shapes and point tests only. It must stay free of `#lib`
 * imports so scripts and tests can load it outside the SvelteKit graph.
 */

export type FlowFestWorldPoint = readonly [x: number, z: number];

/**
 * The fire field in Middle Earth, as Austen sized it: "a section probably
 * roughly equivalent to about seven blocks which feels more like a smushed
 * oval". Seven cells of the interview's Middle Earth grid area-match an
 * ellipse of 51 x 32 m centred where he placed it.
 *
 * Nothing grows here. Austen, asked directly how many trees stand in it:
 * "completely bare".
 */
export const FLOW_FEST_FIRE_FIELD = {
  centerX: 25 + 720 / 11,
  centerZ: -165 + 500 / 11,
  radiusX: 280 / 11,
  radiusZ: 176 / 11,
} as const;

/**
 * The lower campground loop road, traced off the orthophoto in the interview's
 * loop frame (source crop 1450,606, 310x300 px, magnified 4.516x), so
 * `worldX = 213 + px / 9.032` and `worldZ = -209 + py / 9.032`.
 *
 * Traffic runs counterclockwise and it is the only direction allowed.
 */
const LOOP_TRACE_PIXELS: ReadonlyArray<FlowFestWorldPoint> = [
  [960, 930],
  [1035, 760],
  [1052, 600],
  [990, 505],
  [880, 425],
  [690, 332],
  [480, 286],
  [330, 300],
  [196, 432],
  [96, 660],
  [52, 880],
  [70, 1015],
  [250, 1108],
  [470, 1168],
  [640, 1200],
  [810, 1130],
  [915, 1015],
];

export const FLOW_FEST_CAMPGROUND_LOOP: ReadonlyArray<FlowFestWorldPoint> =
  LOOP_TRACE_PIXELS.map(
    ([px, py]) => [213 + px / 9.032, -209 + py / 9.032] as FlowFestWorldPoint
  );

/**
 * The decorated pathway from the campground to Middle Earth. Austen: "it's an
 * ever so slightly diagonal path but it follows the same path that the bottom
 * part of the loop already follows, it just goes straight up into Middle Earth
 * and then it veers left to go up the road".
 *
 * It is invisible in the orthophoto because it runs under closed canopy — "it
 * looks like woods but it's really just you're looking at the tops of the
 * trees, it actually goes straight through really easily". The two ends are
 * visible: the road junction west of the loop at roughly (215, -95), and the
 * south-east corner of the Middle Earth clearing by the stage.
 */
export const FLOW_FEST_DECORATED_PATHWAY: ReadonlyArray<FlowFestWorldPoint> = [
  [214, -93],
  [196, -93],
  [170, -95],
  [148, -96],
  [126, -96],
];

/**
 * How far out from the loop road the campground treeline reads as a wall. Past
 * this it is ordinary back woods, and the ecology's habitat casting owns it.
 */
export const FLOW_FEST_TREELINE_DEPTH_METERS = 45;

/** Half-width of the corridor the decorated pathway keeps open overhead. */
export const FLOW_FEST_PATHWAY_HALF_WIDTH_METERS = 16;

export function insideFlowFestFireField(x: number, z: number): boolean {
  const dx = (x - FLOW_FEST_FIRE_FIELD.centerX) / FLOW_FEST_FIRE_FIELD.radiusX;
  const dz = (z - FLOW_FEST_FIRE_FIELD.centerZ) / FLOW_FEST_FIRE_FIELD.radiusZ;
  return dx * dx + dz * dz <= 1;
}

/** Even-odd ray casting against a closed ring. */
export function insideFlowFestPolygon(
  x: number,
  z: number,
  polygon: ReadonlyArray<FlowFestWorldPoint>
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!;
    const [xj, zj] = polygon[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance to a closed ring's edge, inside or outside. */
export function distanceToFlowFestPolygon(
  x: number,
  z: number,
  polygon: ReadonlyArray<FlowFestWorldPoint>
): number {
  return shortestDistance(x, z, polygon, true);
}

/** Shortest distance to an open polyline. */
export function distanceToFlowFestPolyline(
  x: number,
  z: number,
  polyline: ReadonlyArray<FlowFestWorldPoint>
): number {
  return shortestDistance(x, z, polyline, false);
}

function shortestDistance(
  x: number,
  z: number,
  points: ReadonlyArray<FlowFestWorldPoint>,
  closed: boolean
): number {
  let best = Number.POSITIVE_INFINITY;
  const start = closed ? 0 : 1;
  for (let i = start, j = closed ? points.length - 1 : 0; i < points.length; j = i++) {
    const [xi, zi] = points[i]!;
    const [xj, zj] = points[j]!;
    const dx = xj - xi;
    const dz = zj - zi;
    const lengthSquared = dx * dx + dz * dz;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((x - xi) * dx + (z - zi) * dz) / lengthSquared)
          );
    best = Math.min(best, Math.hypot(x - (xi + t * dx), z - (zi + t * dz)));
  }
  return best;
}
