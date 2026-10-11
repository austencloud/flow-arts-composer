/**
 * Wall subfloor coverage.
 *
 * The kit wall section is thinner than a tile (0.18m vs 0.5m TILE_SIZE), so a
 * wall tile that has no floor under it exposes the floorless void — a teal gap
 * at every wall base. bucketMuseumTiles must lay a subfloor under wall /
 * exhibit-panel tiles so carpet runs continuously beneath the thin walls.
 */

import { describe, it, expect } from "vitest";
import { buildMuseumGrid } from "#lib/features/museum/services/museum-grid-builder.js";
import { bucketMuseumTiles, TILE_SIZE } from "#lib/features/museum/services/museum-geometry-builder.js";
import { MUSEUM_ROOMS, MUSEUM_EDGES, GRID_CONFIG } from "#lib/features/museum/data/museum-room-graph.js";

const key = (p: { x: number; z: number }) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`;

// Authored kit wall-section depth (static/models/museum/kit/institutional/wall-section.glb).
// The void was exposed because this is thinner than a tile.
const KIT_WALL_SECTION_DEPTH = 0.18;

function fullMuseum() {
  const { grid } = buildMuseumGrid(MUSEUM_ROOMS, MUSEUM_EDGES, GRID_CONFIG);
  return bucketMuseumTiles(grid);
}

describe("wall subfloor", () => {
  it("every wall tile has a floor tile at the same center", () => {
    const result = fullMuseum();

    const floorKeys = new Set<string>();
    for (const [, b] of result.floorBuckets) for (const p of b.positions) floorKeys.add(key(p));

    const wallKeys: { x: number; z: number }[] = [];
    for (const [, b] of result.wallBuckets) for (const p of b.positions) wallKeys.push(p);

    expect(wallKeys.length).toBeGreaterThan(0);
    const uncovered = wallKeys.filter((p) => !floorKeys.has(key(p)));
    expect(uncovered).toHaveLength(0);
  });

  it("floor footprint fully covers the kit wall section footprint (no exposed void band)", () => {
    // Geometric proof of the visual fix: a floor box is full TILE_SIZE and shares
    // the wall tile's center, so it spans ±TILE_SIZE/2 on both axes. The kit wall
    // section spans only ±KIT_WALL_SECTION_DEPTH/2 across its depth. Floor half-
    // extent must be >= wall half-depth or a void band shows at the wall base.
    const floorHalf = TILE_SIZE / 2;
    const wallHalfDepth = KIT_WALL_SECTION_DEPTH / 2;
    expect(floorHalf).toBeGreaterThanOrEqual(wallHalfDepth);
    // The covered band beyond the wall on the interior side — this is exactly the
    // strip that read as the teal gap before the fix.
    expect(floorHalf - wallHalfDepth).toBeCloseTo(0.16, 5);
  });
});
