/**
 * The points one grid draws: its center, outer points, hand points and the
 * non-radial points between the hand points.
 *
 * A box grid is the diamond grid turned 45° clockwise, so its outer and hand
 * points sit at the intercardinal locations (diamond n lands on ne, e on se,
 * s on sw, w on nw) and its non-radial points at the cardinal ones. Box outer
 * points are rings; every other point is a filled dot. Every mode other than
 * box draws the diamond grid, as the app's dot grid does.
 *
 * The app's canvas dot grid and the MCP's SVG grid both paint these points,
 * so the two cannot drift apart. Scene units, in the 950-unit viewBox.
 */
import type { Coordinates, GridLocation } from "../types.js";
import {
  BOX_OUTER_POINTS,
  CENTER_POINT,
  DIAMOND_OUTER_POINTS,
} from "../constants/grid-coordinates.js";
import { getNormalHandPointCoordinates } from "./grid-placement.js";

export type GridPointKind = "center" | "outer" | "hand" | "nonRadial";

export interface GridPoint {
  readonly kind: GridPointKind;
  readonly location: GridLocation;
  readonly x: number;
  readonly y: number;
}

/** Drawn radius of each point kind. */
export const GRID_POINT_RADIUS: Readonly<Record<GridPointKind, number>> = {
  center: 12,
  hand: 4.7,
  outer: 25,
  nonRadial: 8.8,
};

/** Box outer points are rings stroked this wide. */
export const BOX_OUTER_RING_WIDTH = 13;

const DIAMOND_LOCATIONS = ["n", "e", "s", "w"] as const;
const BOX_LOCATIONS = ["ne", "se", "sw", "nw"] as const;

/** The diamond grid's non-radial points, between its hand points. */
const DIAMOND_NON_RADIAL_POINTS: Readonly<Record<string, Coordinates>> = {
  ne: { x: 618.1, y: 331.9 },
  se: { x: 618.1, y: 618.1 },
  sw: { x: 331.9, y: 618.1 },
  nw: { x: 331.9, y: 331.9 },
};

/** A diamond point turned 45° clockwise about the scene center. */
function turnClockwise45(point: Coordinates): Coordinates {
  const dx = point.x - CENTER_POINT.x;
  const dy = point.y - CENTER_POINT.y;
  return {
    x: CENTER_POINT.x + (dx - dy) * Math.SQRT1_2,
    y: CENTER_POINT.y + (dx + dy) * Math.SQRT1_2,
  };
}

const NON_RADIAL_BOX_LOCATIONS: Readonly<Record<string, GridLocation>> = {
  ne: "e",
  se: "s",
  sw: "w",
  nw: "n",
};

function planGridPoints(box: boolean): readonly GridPoint[] {
  const mode = box ? "box" : "diamond";
  const locations = box ? BOX_LOCATIONS : DIAMOND_LOCATIONS;
  const outer = box ? BOX_OUTER_POINTS : DIAMOND_OUTER_POINTS;
  const points: GridPoint[] = [
    { kind: "center", location: "c", ...CENTER_POINT },
  ];
  for (const location of locations) {
    points.push({ kind: "outer", location, ...outer[location]! });
  }
  for (const location of locations) {
    points.push({
      kind: "hand",
      location,
      ...getNormalHandPointCoordinates(location, mode),
    });
  }
  for (const [location, point] of Object.entries(DIAMOND_NON_RADIAL_POINTS)) {
    points.push(
      box
        ? {
            kind: "nonRadial",
            location: NON_RADIAL_BOX_LOCATIONS[location]!,
            ...turnClockwise45(point),
          }
        : { kind: "nonRadial", location: location as GridLocation, ...point }
    );
  }
  return Object.freeze(points.map((point) => Object.freeze(point)));
}

const DIAMOND_GRID_POINTS = planGridPoints(false);
const BOX_GRID_POINTS = planGridPoints(true);

/** True when the grid mode draws box grids. */
export function isBoxGrid(gridMode: string | undefined): boolean {
  return gridMode === "box";
}

/** Every point one grid of this mode draws. */
export function getGridPoints(
  gridMode: string | undefined
): readonly GridPoint[] {
  return isBoxGrid(gridMode) ? BOX_GRID_POINTS : DIAMOND_GRID_POINTS;
}

/**
 * SVG circles for `points` in `color`, each at its kind's radius. Box grids
 * draw their outer points as rings.
 */
export function gridPointsSvg(
  points: readonly { kind: GridPointKind; x: number; y: number }[],
  box: boolean,
  color: string
): string {
  return points
    .map((point) => {
      const paint =
        box && point.kind === "outer"
          ? `fill="none" stroke="${color}" stroke-width="${BOX_OUTER_RING_WIDTH}"`
          : `fill="${color}"`;
      return `<circle cx="${point.x}" cy="${point.y}" r="${GRID_POINT_RADIUS[point.kind]}" ${paint}/>`;
    })
    .join("");
}
