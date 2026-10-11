/**
 * GridTopology - Core data model for N-grid arrangements
 *
 * Defines the fundamental types for representing multiple grids
 * in arbitrary spatial arrangements with auto-detected junctions.
 *
 * Design decisions:
 * - Abstract units (radius=1.0), not pixels - resolution-independent, JSON-serializable
 * - Junctions are derived (auto-detected), never manually declared
 * - Immutable data - topologies are built once, then read
 * - Plane field on GridPlacement is for L8+ (3D) - defaults to "wall", ignored until then
 */

import type { GridLocation, GridMode } from "#lib/shared/render/core/types.js";
import type { Plane } from "@austencloud/scene-3d";


/** Immutable 2D vector in abstract units (radius=1.0 = distance from center to hand point) */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}


/**
 * A single grid's placement within the topology.
 *
 * Each grid has a center position in world space, a mode (diamond/box/skewed),
 * and an optional plane for 3D arrangements (L8+).
 */
export interface GridPlacement {
  /** Unique identifier within the topology (e.g., "g0", "g1", "a", "b") */
  readonly id: string;
  /** Grid rendering mode - determines which locations are hand points */
  readonly mode: GridMode;
  /** Center position in abstract world coordinates */
  readonly center: Vec2;
  /** Distance from center to hand points (default: 1.0) */
  readonly radius: number;
  /** Which plane this grid lives on (default: "wall", used at L8+ for multi-plane) */
  readonly plane?: Plane;
}


/**
 * A reference to a specific point on a specific grid.
 *
 * This is the fundamental addressing unit: "east on grid A" = { gridId: "a", location: "e" }.
 */
export interface PointRef {
  readonly gridId: string;
  readonly location: GridLocation;
}

/**
 * A point in world space, with back-references to which grid:location pairs map here.
 *
 * When refs.length === 1, this point belongs to exactly one grid.
 * When refs.length > 1, this is a junction - multiple grids share this physical location.
 */
export interface WorldPoint {
  /** Position in abstract world coordinates (within-plane for 3D) */
  readonly position: Vec2;
  /** Which grid:location pairs resolve to this world position */
  readonly refs: readonly PointRef[];
}

/**
 * A junction is a WorldPoint where two or more grid:location pairs overlap.
 *
 * Junctions are never manually declared - they are auto-detected by the
 * TopologyBuilder when it finds world points within a clustering tolerance.
 */
export type Junction = WorldPoint & {
  readonly refs: readonly [PointRef, PointRef, ...PointRef[]];
};


/**
 * Complete topology: all grids, all world points, all junctions.
 *
 * This is the immutable output of TopologyBuilder.build().
 * It's plain data - no class instances, no functions.
 * JSON-serializable for storage (Firestore, export, sharing).
 */
export interface GridTopology {
  readonly grids: readonly GridPlacement[];
  readonly worldPoints: readonly WorldPoint[];
  readonly junctions: readonly Junction[];
}


/**
 * A constraint declaring that two grid:location pairs should share the same world point.
 * Used internally by the TopologyBuilder during position resolution.
 */
export interface ConjoinConstraint {
  readonly gridAId: string;
  readonly locationOnA: GridLocation;
  readonly gridBId: string;
  readonly locationOnB: GridLocation;
}
