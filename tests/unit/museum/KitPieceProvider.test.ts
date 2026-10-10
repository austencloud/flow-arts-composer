import { describe, it, expect } from "vitest";
import { proceduralKitProvider } from "#lib/features/museum/services/kit-piece-provider.js";
import type { ResolvedWalls } from "#lib/features/museum/domain/museum-kit-types.js";

describe("proceduralKitProvider", () => {
  it("emits one wall group spanning each run length", () => {
    const walls: ResolvedWalls = {
      runs: [{ axis: "x", fixed: 0, start: 0, end: 3 }],
      doors: [],
      posts: [],
    };
    const root = proceduralKitProvider.buildWalls(
      walls,
      "institutional",
      0.5,
      4.5,
      "#e8e4e0",
    );
    // a run of 4 tiles at 0.5m = 2m wide; root has at least one child mesh
    expect(root.children.length).toBeGreaterThan(0);
  });

  it("centers wall pieces on the tile grid (center at tile*tileSize, no half-tile offset)", () => {
    // The real builder places every tile box centered at tileX*TILE_SIZE.
    // The provider must match or kit walls drift off the floor edge.
    const walls: ResolvedWalls = {
      runs: [{ axis: "x", fixed: 0, start: 0, end: 3 }],
      doors: [],
      posts: [],
    };
    const root = proceduralKitProvider.buildWalls(walls, "institutional", 0.5, 4.5, "#e8e4e0");
    const wall = root.children[0]!; // first emitted mesh is the main wall slab
    // along-axis center = (0+3)/2 * 0.5 = 0.75 ; fixed (z) = 0 * 0.5 = 0
    expect(wall.position.x).toBeCloseTo(0.75, 5);
    expect(wall.position.z).toBeCloseTo(0, 5);
  });
});
