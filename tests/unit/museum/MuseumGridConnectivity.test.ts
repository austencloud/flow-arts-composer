/**
 * Museum Grid Connectivity Test
 *
 * Validates that all rooms are reachable from spawn after the full
 * grid build pipeline (carve floors -> stamp segments -> route corridors
 * -> derive walls -> validate).
 */

import { describe, it, expect } from "vitest";
import { buildMuseumGrid } from "#lib/features/museum/services/museum-grid-builder.js";
import { MUSEUM_ROOMS, MUSEUM_EDGES, GRID_CONFIG } from "#lib/features/museum/data/museum-room-graph.js";
import { tileKey } from "#lib/features/museum/domain/museum-grid-types.js";
import { isWalkable } from "#lib/features/museum/domain/tile-registry.js";
import type { RoomNode, RoomEdge } from "#lib/features/museum/domain/layout-types.js";

describe("MuseumGridConnectivity", () => {
  it("all rooms are reachable from spawn (full museum)", () => {
    const { grid, validation } = buildMuseumGrid(MUSEUM_ROOMS, MUSEUM_EDGES, GRID_CONFIG);

    if (validation.unreachableRooms.length > 0) {
      console.log("Unreachable rooms:", validation.unreachableRooms);
      console.log("Validation errors:", validation.errors);
    }

    expect(validation.spawnOnWalkable).toBe(true);
    expect(validation.unreachableRooms).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("boundary tiles become walls (not floor) after interior-only carve", () => {
    const { grid } = buildMuseumGrid(MUSEUM_ROOMS, MUSEUM_EDGES, GRID_CONFIG);

    // Pick the first room (entrance). Its south wall should have wall tiles
    // on the boundary except where segments are placed.
    const entrance = grid.wings.find((w) => w.id === "entrance")!;
    const southY = entrance.bounds.y + entrance.bounds.height - 1;

    let hasWallOnSouthBoundary = false;
    for (let x = entrance.bounds.x; x < entrance.bounds.x + entrance.bounds.width; x++) {
      const tile = grid.tiles.get(tileKey(x, southY));
      if (tile && tile.type === "wall") {
        hasWallOnSouthBoundary = true;
        break;
      }
    }

    // The south wall of entrance has no segments (EMPTY_WALL), so all
    // boundary tiles should be walls derived from adjacency.
    expect(hasWallOnSouthBoundary).toBe(true);
  });

  it("corridor tiles connect room interiors through door openings", () => {
    const { grid } = buildMuseumGrid(MUSEUM_ROOMS, MUSEUM_EDGES, GRID_CONFIG);

    // For each wing, verify that at least one boundary tile is walkable
    // (either a door or corridor that overwrote a door). This proves
    // the room has an opening to the outside.
    for (const wing of grid.wings) {
      const { x, y, width, height } = wing.bounds;

      let hasWalkableBoundary = false;

      // Check all four boundaries
      for (let bx = x; bx < x + width && !hasWalkableBoundary; bx++) {
        // North boundary
        const northTile = grid.tiles.get(tileKey(bx, y));
        if (northTile && isWalkable(northTile.type)) hasWalkableBoundary = true;
        // South boundary
        const southTile = grid.tiles.get(tileKey(bx, y + height - 1));
        if (southTile && isWalkable(southTile.type)) hasWalkableBoundary = true;
      }
      for (let by = y; by < y + height && !hasWalkableBoundary; by++) {
        // West boundary
        const westTile = grid.tiles.get(tileKey(x, by));
        if (westTile && isWalkable(westTile.type)) hasWalkableBoundary = true;
        // East boundary
        const eastTile = grid.tiles.get(tileKey(x + width - 1, by));
        if (eastTile && isWalkable(eastTile.type)) hasWalkableBoundary = true;
      }

      // Every room should have at least one walkable opening (door/corridor)
      // on its boundary. The entrance's south wall has no door, but the north
      // wall does — so it should still have a walkable boundary tile.
      expect(
        hasWalkableBoundary,
        `Room "${wing.id}" has no walkable boundary tiles (fully walled in)`,
      ).toBe(true);
    }
  });

  it("minimal two-room grid is fully connected", () => {
    const EMPTY_WALL = { segments: [] as any[], minMargin: 2 };
    const rooms: RoomNode[] = [
      {
        id: "test-a",
        name: "Test A",
        material: "marble",
        theme: "institutional",
        minInteriorWidth: 10,
        minInteriorHeight: 10,
        walls: {
          north: {
            segments: [{ type: "door", edgeId: "test-a->test-b", width: 4 }],
            minMargin: 2,
          },
          south: EMPTY_WALL,
          east: EMPTY_WALL,
          west: EMPTY_WALL,
        },
      },
      {
        id: "test-b",
        name: "Test B",
        material: "marble",
        theme: "institutional",
        minInteriorWidth: 10,
        minInteriorHeight: 10,
        walls: {
          north: EMPTY_WALL,
          south: {
            segments: [{ type: "door", edgeId: "test-a->test-b", width: 4 }],
            minMargin: 2,
          },
          east: EMPTY_WALL,
          west: EMPTY_WALL,
        },
      },
    ];
    const edges: RoomEdge[] = [
      {
        from: "test-a",
        to: "test-b",
        type: "main-path",
        fromWall: "north",
        toWall: "south",
        corridorWidth: 4,
      },
    ];

    const { validation } = buildMuseumGrid(rooms, edges, GRID_CONFIG);

    expect(validation.spawnOnWalkable).toBe(true);
    expect(validation.unreachableRooms).toEqual([]);
    expect(validation.valid).toBe(true);
  });
});
