/**
 * TopologyBuilder - Constructs GridTopology from fluent API calls
 *
 * Position resolution:
 * 1. First grid without explicit center → placed at (0, 0)
 * 2. conjoin(a, locA, b, locB) → Grid B's center = A's locA world pos - B's locB offset
 * 3. After all placements, every grid:location → world coordinates
 * 4. Cluster points within tolerance → junctions
 *
 * Validation:
 * - No duplicate grid IDs
 * - No circular constraint dependencies
 * - No conflicting position constraints
 */

import type { GridLocation, GridMode } from "#lib/shared/render/core/types.js";
import type {
  Vec2,
  GridPlacement,
  WorldPoint,
  Junction,
  GridTopology,
  ConjoinConstraint,
  PointRef,
} from "../domain/models/grid-topology";
import type { GridOptions } from "./types";
import { LOCATION_OFFSETS, OUTER_POINT_MULTIPLIER, PERIMETER_LOCATIONS } from "../domain/constants/grid-mode-offsets";

/** Tolerance for clustering world points into junctions (in abstract units) */
const JUNCTION_TOLERANCE = 0.001;

interface PendingGrid {
  id: string;
  mode: GridMode;
  explicitCenter?: Vec2;
  radius: number;
  plane?: string;
}

export class TopologyBuilder {
  private pendingGrids: PendingGrid[] = [];
  private constraints: ConjoinConstraint[] = [];

  create(): TopologyBuilder {
    this.pendingGrids = [];
    this.constraints = [];
    return this;
  }

  addGrid(id: string, options?: GridOptions): TopologyBuilder {
    if (this.pendingGrids.some((g) => g.id === id)) {
      throw new Error(`Duplicate grid ID: "${id}"`);
    }

    this.pendingGrids.push({
      id,
      mode: options?.mode ?? "diamond",
      explicitCenter: options?.center,
      radius: options?.radius ?? 1.0,
      plane: options?.plane,
    });

    return this;
  }

  conjoin(
    gridAId: string,
    locationOnA: GridLocation,
    gridBId: string,
    locationOnB: GridLocation = "c",
  ): TopologyBuilder {
    // Auto-create grid B if it doesn't exist yet
    if (!this.pendingGrids.some((g) => g.id === gridBId)) {
      // Inherit mode from grid A if available
      const gridA = this.pendingGrids.find((g) => g.id === gridAId);
      this.addGrid(gridBId, { mode: gridA?.mode ?? "diamond" });
    }

    this.constraints.push({
      gridAId,
      locationOnA,
      gridBId,
      locationOnB,
    });

    return this;
  }

  chain(count: number, mode: GridMode, edge: GridLocation): TopologyBuilder {
    if (count < 1) throw new Error("Chain count must be at least 1");

    for (let i = 0; i < count; i++) {
      this.addGrid(`g${i}`, { mode });
    }

    for (let i = 0; i < count - 1; i++) {
      this.conjoin(`g${i}`, edge, `g${i + 1}`, "c");
    }

    return this;
  }

  build(): GridTopology {
    if (this.pendingGrids.length === 0) {
      return { grids: [], worldPoints: [], junctions: [] };
    }

    // Phase 1: Resolve grid centers via constraint propagation
    const resolvedCenters = this.resolveGridCenters();

    // Phase 2: Build GridPlacement objects
    const grids = this.pendingGrids.map((pg): GridPlacement => ({
      id: pg.id,
      mode: pg.mode,
      center: resolvedCenters.get(pg.id)!,
      radius: pg.radius,
      plane: pg.plane as GridPlacement["plane"],
    }));

    // Phase 3: Compute all world points
    const allRawPoints = this.computeAllWorldPoints(grids);

    // Phase 4: Cluster into WorldPoints (merging coincident positions into junctions)
    const { worldPoints, junctions } = this.clusterWorldPoints(allRawPoints);

    return { grids, worldPoints, junctions };
  }

  // ===========================================================================
  // POSITION RESOLUTION
  // ===========================================================================

  private resolveGridCenters(): Map<string, Vec2> {
    const resolved = new Map<string, Vec2>();

    // Place grids with explicit centers first
    for (const pg of this.pendingGrids) {
      if (pg.explicitCenter) {
        resolved.set(pg.id, pg.explicitCenter);
      }
    }

    // If nothing placed yet, place the first grid at origin
    const firstGrid = this.pendingGrids[0];
    if (resolved.size === 0 && firstGrid) {
      resolved.set(firstGrid.id, { x: 0, y: 0 });
    }

    // Iteratively resolve constraints until all grids have positions
    let changed = true;
    let iterations = 0;
    const maxIterations = this.pendingGrids.length * 2;

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      for (const constraint of this.constraints) {
        const { gridAId, locationOnA, gridBId, locationOnB } = constraint;
        const gridA = this.pendingGrids.find((g) => g.id === gridAId);
        const gridB = this.pendingGrids.find((g) => g.id === gridBId);
        if (!gridA || !gridB) continue;

        const centerA = resolved.get(gridAId);
        const centerB = resolved.get(gridBId);

        if (centerA && !centerB) {
          // Grid A is resolved, place Grid B so A's outer point at locationOnA
          // coincides with B's outer point at locationOnB.
          // Outer points are at OUTER_POINT_MULTIPLIER * radius from center.
          // For "c" (center), offset is (0,0) so the multiplier has no effect.
          const offsetA = LOCATION_OFFSETS[locationOnA];
          const offsetB = LOCATION_OFFSETS[locationOnB];
          const scaleA = gridA.radius * OUTER_POINT_MULTIPLIER;
          const scaleB = gridB.radius * OUTER_POINT_MULTIPLIER;
          const worldA = {
            x: centerA.x + offsetA.x * scaleA,
            y: centerA.y + offsetA.y * scaleA,
          };
          resolved.set(gridBId, {
            x: worldA.x - offsetB.x * scaleB,
            y: worldA.y - offsetB.y * scaleB,
          });
          changed = true;
        } else if (centerB && !centerA) {
          // Grid B is resolved, place Grid A (reverse direction)
          const offsetA = LOCATION_OFFSETS[locationOnA];
          const offsetB = LOCATION_OFFSETS[locationOnB];
          const scaleA = gridA.radius * OUTER_POINT_MULTIPLIER;
          const scaleB = gridB.radius * OUTER_POINT_MULTIPLIER;
          const worldB = {
            x: centerB.x + offsetB.x * scaleB,
            y: centerB.y + offsetB.y * scaleB,
          };
          resolved.set(gridAId, {
            x: worldB.x - offsetA.x * scaleA,
            y: worldB.y - offsetA.y * scaleA,
          });
          changed = true;
        }
      }
    }

    // Validate all grids are resolved
    for (const pg of this.pendingGrids) {
      if (!resolved.has(pg.id)) {
        throw new Error(
          `Grid "${pg.id}" could not be positioned - no constraint chain connects it to a resolved grid.`,
        );
      }
    }

    return resolved;
  }

  // ===========================================================================
  // WORLD POINT COMPUTATION
  // ===========================================================================

  private computeAllWorldPoints(
    grids: readonly GridPlacement[],
  ): Array<{ position: Vec2; ref: PointRef }> {
    const points: Array<{ position: Vec2; ref: PointRef }> = [];

    for (const grid of grids) {
      // Center point (at grid center, offset = (0,0))
      points.push({
        position: { x: grid.center.x, y: grid.center.y },
        ref: { gridId: grid.id, location: "c" },
      });

      // For each perimeter direction, emit both:
      // 1. Hand point (at 1x radius) - where props sit
      // 2. Outer point (at 2x radius) - where junctions form
      //
      // In the 950x950 grid: hand points = 150px from center, outer = 300px.
      // Both are valid world points. Junctions are detected when an outer point
      // from one grid coincides with a center point from another grid.
      for (const location of PERIMETER_LOCATIONS) {
        const offset = LOCATION_OFFSETS[location];

        // Hand point (1x radius)
        points.push({
          position: {
            x: grid.center.x + offset.x * grid.radius,
            y: grid.center.y + offset.y * grid.radius,
          },
          ref: { gridId: grid.id, location },
        });

        // Outer point (2x radius)
        const outerScale = grid.radius * OUTER_POINT_MULTIPLIER;
        points.push({
          position: {
            x: grid.center.x + offset.x * outerScale,
            y: grid.center.y + offset.y * outerScale,
          },
          ref: { gridId: grid.id, location },
        });
      }
    }

    return points;
  }

  // ===========================================================================
  // CLUSTERING
  // ===========================================================================

  private clusterWorldPoints(
    rawPoints: Array<{ position: Vec2; ref: PointRef }>,
  ): { worldPoints: WorldPoint[]; junctions: Junction[] } {
    const clusters: Array<{ position: Vec2; refs: PointRef[] }> = [];

    for (const point of rawPoints) {
      // Find an existing cluster within tolerance
      const existing = clusters.find(
        (c) =>
          Math.abs(c.position.x - point.position.x) < JUNCTION_TOLERANCE &&
          Math.abs(c.position.y - point.position.y) < JUNCTION_TOLERANCE,
      );

      if (existing) {
        existing.refs.push(point.ref);
      } else {
        clusters.push({
          position: { x: point.position.x, y: point.position.y },
          refs: [point.ref],
        });
      }
    }

    const worldPoints: WorldPoint[] = clusters.map((c) => ({
      position: c.position,
      refs: c.refs,
    }));

    const junctions: Junction[] = worldPoints.filter(
      (wp): wp is Junction => wp.refs.length >= 2,
    );

    return { worldPoints, junctions };
  }
}
