/**
 * Museum Geometry Scaling Test
 *
 * Measures tile bucketing performance at progressive museum sizes to find
 * the tipping point where geometry build time becomes a problem.
 *
 * Uses bucketMuseumTiles (pure data, no Three.js) so it runs in vitest/jsdom.
 * The actual InstancedMesh creation happens in buildMuseumGeometry which
 * requires WebGL and is tested manually via the loading overlay.
 */

import { describe, it, expect } from "vitest";
import { buildMuseumGrid } from "#lib/features/museum/services/museum-grid-builder.js";
import { bucketMuseumTiles } from "#lib/features/museum/services/museum-geometry-builder.js";
import { MUSEUM_ROOMS, MUSEUM_EDGES, GRID_CONFIG } from "#lib/features/museum/data/museum-room-graph.js";
import type { RoomNode, RoomEdge } from "#lib/features/museum/domain/layout-types.js";

/**
 * Build a museum grid with only the first N rooms and their connecting edges.
 * Edges that reference rooms outside the subset are excluded.
 */
function buildSubsetGrid(roomCount: number) {
  const rooms = MUSEUM_ROOMS.slice(0, roomCount);
  const roomIds = new Set(rooms.map((r) => r.id));
  const edges = MUSEUM_EDGES.filter(
    (e) => roomIds.has(e.from) && roomIds.has(e.to),
  );
  return buildMuseumGrid(rooms, edges, GRID_CONFIG);
}

describe("MuseumGeometryScaling", () => {
  it("full museum grid build completes", () => {
    const start = performance.now();
    const { grid, validation } = buildMuseumGrid(
      MUSEUM_ROOMS,
      MUSEUM_EDGES,
      GRID_CONFIG,
    );
    const gridTime = performance.now() - start;

    expect(grid.tiles.size).toBeGreaterThan(0);
    expect(grid.wings.length).toBe(MUSEUM_ROOMS.length);

    console.log(
      `Full museum grid: ${grid.tiles.size} tiles, ${grid.wings.length} wings, ${gridTime.toFixed(1)}ms`,
    );
  });

  it("full museum bucketing completes under 500ms", () => {
    const { grid } = buildMuseumGrid(
      MUSEUM_ROOMS,
      MUSEUM_EDGES,
      GRID_CONFIG,
    );

    const start = performance.now();
    const result = bucketMuseumTiles(grid);
    const elapsed = performance.now() - start;

    expect(result.totalFloorInstances).toBeGreaterThan(0);
    expect(result.totalWallInstances).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);

    console.log(
      `Full museum bucketing: ${result.totalTiles} tiles → ${result.floorBuckets.size} floor buckets (${result.totalFloorInstances} instances), ${result.wallBuckets.size} wall buckets (${result.totalWallInstances} instances) in ${elapsed.toFixed(1)}ms`,
    );
  });

  // Progressive scale test — find the tipping point
  const ROOM_COUNTS = [1, 3, 5, 8, 12, 16];

  describe("progressive scale", () => {
    const results: {
      rooms: number;
      tiles: number;
      gridMs: number;
      bucketMs: number;
      floorBuckets: number;
      wallBuckets: number;
      floorInstances: number;
      wallInstances: number;
      torches: number;
      plaques: number;
    }[] = [];

    for (const roomCount of ROOM_COUNTS) {
      const maxRooms = Math.min(roomCount, MUSEUM_ROOMS.length);

      it(`${maxRooms} rooms: measure grid + bucketing time`, () => {
        const gridStart = performance.now();
        const { grid } = buildSubsetGrid(maxRooms);
        const gridMs = performance.now() - gridStart;

        const bucketStart = performance.now();
        const result = bucketMuseumTiles(grid);
        const bucketMs = performance.now() - bucketStart;

        expect(result.totalFloorInstances).toBeGreaterThan(0);

        results.push({
          rooms: maxRooms,
          tiles: result.totalTiles,
          gridMs: Math.round(gridMs * 10) / 10,
          bucketMs: Math.round(bucketMs * 10) / 10,
          floorBuckets: result.floorBuckets.size,
          wallBuckets: result.wallBuckets.size,
          floorInstances: result.totalFloorInstances,
          wallInstances: result.totalWallInstances,
          torches: result.torchPositions.length,
          plaques: result.plaquePlacements.length,
        });
      });
    }

    it("scaling summary", () => {
      // This test runs last — print the full table
      if (results.length > 0) {
        console.log("\n=== Museum Geometry Scaling ===");
        console.table(results);

        // Check for super-linear growth (bucketing should be ~linear with tile count)
        const first = results[0]!;
        const last = results[results.length - 1]!;
        const tileRatio = last.tiles / first.tiles;
        const timeRatio = last.bucketMs / Math.max(first.bucketMs, 0.1);

        console.log(
          `Tile ratio: ${tileRatio.toFixed(1)}x, Time ratio: ${timeRatio.toFixed(1)}x (should be similar for linear scaling)`,
        );
      }
    });
  });

  it("single room bucketing is fast", () => {
    const { grid } = buildSubsetGrid(1);
    const start = performance.now();
    const result = bucketMuseumTiles(grid);
    const elapsed = performance.now() - start;

    // Single room should be very fast — under 20ms
    expect(elapsed).toBeLessThan(20);
    console.log(
      `1 room: ${result.totalTiles} tiles, ${elapsed.toFixed(1)}ms`,
    );
  });
});
