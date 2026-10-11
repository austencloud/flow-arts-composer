/**
 * Tile Grid Analyzer
 *
 * Converts a 2D MuseumGrid into 3D RoomDefinitions and placement data.
 * Each WingRegion becomes one RoomDefinition. Door tiles at wing
 * boundaries become ConnectionDefs. Exhibit/performer/torch tiles
 * become placement objects with 3D coordinates.
 */

import type { MuseumGrid, WingRegion, Direction } from "../domain/museum-grid-types";
import { tileKey, parseTileKey } from "../domain/museum-grid-types";
import type {
  RoomDefinition, RoomObjectDefinition, RoomLightDefinition, EntranceDefinition, WallMaterialId,
} from "#lib/shared/3d/indoor/domain/room-types.js";
import type { AnalyzedMuseum, ExhibitPlacement, PerformerPlacement, LightPlacement, ConnectionDef } from "./types";

// ── Coordinate helpers ──

export function tileToWorld(
  tileX: number,
  tileY: number,
  scale: number,
): [number, number, number] {
  return [tileX * scale, 0, tileY * scale];
}

/**
 * Convention: yaw=0 faces +Z (south on the grid), yaw=PI faces -Z (north).
 * This matches the RoomGeometryBuilder's look direction = (sin(yaw), 0, cos(yaw)).
 */
export function directionToYaw(dir: Direction): number {
  switch (dir) {
    case "north":
      return Math.PI;
    case "south":
      return 0;
    case "east":
      return -Math.PI / 2;
    case "west":
      return Math.PI / 2;
  }
}

// Maps tile floor materials to the 3D wall material palette
function toWallMaterial(theme: string): WallMaterialId {
  switch (theme) {
    case "cave":
      return "stone";
    case "classical":
      return "marble";
    case "modern":
      return "metal";
    case "futuristic":
      return "metal";
    case "outdoor":
      return "sandstone";
    default:
      return "stone";
  }
}


export function analyze(grid: MuseumGrid): AnalyzedMuseum {
  const rooms: RoomDefinition[] = [];
  const connections: ConnectionDef[] = [];
  const exhibits: ExhibitPlacement[] = [];
  const performers: PerformerPlacement[] = [];
  const lights: LightPlacement[] = [];

  const scale = grid.tileScale;

  // Build a room for each wing
  for (const wing of grid.wings) {
    const room = buildRoom(grid, wing, scale);
    rooms.push(room);
  }

  // Find door connections between wings
  findConnections(grid, connections, scale);

  // Extract exhibits
  for (const exDef of grid.exhibits) {
    const tile = grid.tiles.get(tileKey(exDef.tileX, exDef.tileY));
    const facing = tile?.facing ?? "north";
    exhibits.push({
      id: exDef.id,
      position: tileToWorld(exDef.tileX, exDef.tileY, scale),
      facing: directionToYaw(facing),
      sequenceId: exDef.sequenceId,
    });
  }

  // Extract performers
  for (const perfDef of grid.performers) {
    performers.push({
      id: perfDef.id,
      position: tileToWorld(perfDef.tileX, perfDef.tileY, scale),
      facing: directionToYaw(perfDef.facing),
      sequenceId: perfDef.sequenceId,
      autoPlay: perfDef.autoPlay,
    });
  }

  // Extract torches from tile map
  for (const [key, tile] of grid.tiles) {
    if (tile.type === "torch") {
      const { x, y } = parseTileKey(key);
      lights.push({
        type: "torch",
        position: tileToWorld(x, y, scale),
      });
    }
  }

  return { rooms, connections, exhibits, performers, lights };
}

function buildRoom(
  grid: MuseumGrid,
  wing: WingRegion,
  scale: number,
): RoomDefinition {
  const { bounds } = wing;
  const material = toWallMaterial(wing.theme);

  const widthMeters = bounds.width * scale;
  const depthMeters = bounds.height * scale;
  const height = 3; // 3m ceiling default

  // Find the first door tile on this wing's boundary for the entrance
  const entrance = findEntrance(grid, wing, scale);

  // Collect objects (pedestals) within this wing
  const objects = collectObjects(grid, wing, scale);

  // Collect lighting definitions for this wing
  const lighting = collectLighting(grid, wing, scale);

  return {
    id: wing.id,
    name: wing.name,
    shape: "rectangular",
    width: widthMeters,
    depth: depthMeters,
    height,
    walls: {
      thickness: 0.25,
      material,
    },
    entrance,
    objects,
    lighting,
    spawn: {
      wall: "south",
      distance: 1,
      facing: "north",
    },
  };
}

function findEntrance(
  grid: MuseumGrid,
  wing: WingRegion,
  scale: number,
): EntranceDefinition {
  const { bounds } = wing;

  // Scan boundary tiles for doors
  for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
      const isBoundary =
        x === bounds.x ||
        y === bounds.y ||
        x === bounds.x + bounds.width - 1 ||
        y === bounds.y + bounds.height - 1;
      if (!isBoundary) continue;

      const tile = grid.tiles.get(tileKey(x, y));
      if (tile?.type === "door") {
        // Determine which wall the door is on
        let wall: "north" | "south" | "east" | "west" = "south";
        if (y === bounds.y) wall = "north";
        else if (y === bounds.y + bounds.height - 1) wall = "south";
        else if (x === bounds.x) wall = "west";
        else if (x === bounds.x + bounds.width - 1) wall = "east";

        return {
          wall,
          width: 1 * scale,
          height: 2.5,
          offset: "center",
        };
      }
    }
  }

  // Default entrance on the south wall if no door found
  return {
    wall: "south",
    width: 1.5,
    height: 2.5,
    offset: "center",
  };
}

function collectObjects(
  grid: MuseumGrid,
  wing: WingRegion,
  scale: number,
): RoomObjectDefinition[] {
  const objects: RoomObjectDefinition[] = [];
  const { bounds } = wing;

  for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
      const tile = grid.tiles.get(tileKey(x, y));
      if (!tile) continue;

      if (tile.type === "pedestal") {
        objects.push({
          id: `pedestal-${x}-${y}`,
          type: "pedestal",
          placement: {
            anchor: "center",
            offsetX: (x - bounds.x - bounds.width / 2) * scale,
            offsetZ: (y - bounds.y - bounds.height / 2) * scale,
          },
        });
      }
    }
  }

  return objects;
}

function collectLighting(
  grid: MuseumGrid,
  wing: WingRegion,
  _scale: number,
): RoomLightDefinition[] {
  const lighting: RoomLightDefinition[] = [];
  const { bounds } = wing;

  let torchIndex = 0;
  for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
      const tile = grid.tiles.get(tileKey(x, y));
      if (tile?.type === "torch") {
        lighting.push({
          type: "torch",
          targetObjectId: `torch-${wing.id}-${torchIndex++}`,
          intensity: 1.0,
        });
      }
    }
  }

  // Always add ambient light
  lighting.push({
    type: "ambient",
    color: "#ffffff",
    intensity: 0.3,
  });

  return lighting;
}

/**
 * Finds door tiles that sit on the boundary between two wings.
 * A door at (x,y) connects wing A and wing B if the tile is on A's
 * boundary and an adjacent tile belongs to B (or vice versa).
 */
function findConnections(
  grid: MuseumGrid,
  connections: ConnectionDef[],
  scale: number,
): void {
  const foundPairs = new Set<string>();

  for (const [key, tile] of grid.tiles) {
    if (tile.type !== "door") continue;
    const { x, y } = parseTileKey(key);

    // Check all 4 neighbors
    const neighbors: [number, number][] = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];

    const myWing = findWingAt(grid.wings, x, y);
    if (!myWing) continue;

    for (const [nx, ny] of neighbors) {
      const neighborTile = grid.tiles.get(tileKey(nx, ny));
      if (!neighborTile) continue;

      const neighborWing = findWingAt(grid.wings, nx, ny);
      if (!neighborWing || neighborWing.id === myWing.id) continue;

      // Found a cross-wing door connection
      const pairKey = [myWing.id, neighborWing.id].sort().join("|");
      if (foundPairs.has(pairKey)) continue;
      foundPairs.add(pairKey);

      connections.push({
        fromWingId: myWing.id,
        toWingId: neighborWing.id,
        position: tileToWorld(x, y, scale),
      });
    }
  }
}

function findWingAt(
  wings: WingRegion[],
  x: number,
  y: number,
): WingRegion | undefined {
  return wings.find(
    (w) =>
      x >= w.bounds.x &&
      x < w.bounds.x + w.bounds.width &&
      y >= w.bounds.y &&
      y < w.bounds.y + w.bounds.height,
  );
}
