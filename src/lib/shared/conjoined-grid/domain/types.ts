/**
 * Conjoined Grid Domain Types
 *
 * Types for the unified conjoined grid tab that supports N-grid topologies
 * with junction-based overlap detection between blue and red props.
 */

import type { PointRef, Junction } from "#lib/shared/multi-grid/domain/models/grid-topology.js";

/** Whether the user is browsing existing sequences or exploring grid arrangements */
export type ConjoinedGridMode = "browse" | "explore";

/**
 * A detected overlap where both props occupy refs that resolve to the same junction.
 *
 * distance is 0 when both props land exactly on junction refs.
 * Future: nonzero distance for "near miss" proximity detection.
 */
export interface JunctionOverlap {
  readonly junction: Junction;
  readonly leftRef: PointRef;
  readonly rightRef: PointRef;
  readonly distance: number;
}

/** Current placement of the blue and red props on the topology */
export interface PropPlacement {
  readonly left: PointRef;
  readonly right: PointRef;
}

// LEGACY CONSTANTS (migrated from conjoined-lab, needed for rendering)

/**
 * Strict hand point absolute coordinates within a 950x950 grid.
 * Used for global overlap detection between grids.
 */
export const STRICT_HAND_POINT_COORDS: Record<string, { x: number; y: number }> = {
  n: { x: 475, y: 325 },
  e: { x: 625, y: 475 },
  s: { x: 475, y: 625 },
  w: { x: 325, y: 475 },
  ne: { x: 581.1, y: 368.9 },
  se: { x: 581.1, y: 581.1 },
  sw: { x: 368.9, y: 581.1 },
  nw: { x: 368.9, y: 368.9 },
};

/**
 * Opposite edges for conjoined grid junction detection.
 * If grid A's east is conjoined with grid B, then grid B's west is the mirror.
 */
export const EDGE_OPPOSITES: Record<string, string> = {
  n: "s",
  s: "n",
  e: "w",
  w: "e",
  ne: "sw",
  sw: "ne",
  se: "nw",
  nw: "se",
};
