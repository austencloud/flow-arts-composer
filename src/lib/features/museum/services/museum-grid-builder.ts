/**
 * Museum Grid Builder
 *
 * Orchestrates the full layout pipeline:
 * 1. Layout engine computes room positions from the abstract graph
 * 2. Carve room floors
 * 3. Stamp wall segments (exhibits, doors, torches) via WallSegmentStamper
 * 4. Route corridors using stamped door positions
 * 5. Carve corridor floors
 * 6. Derive walls from adjacency
 * 7. Place performers + furniture
 * 8. Set spawn position
 * 9. Run validation
 */

import type { MuseumGridBuildResult } from "./types";
import type {
  RoomNode,
  RoomEdge,
  GridConfig,
  PlacedRoom,
  CorridorSegment,
} from "../domain/layout-types";
import type {
  MuseumGrid,
  MuseumTile,
  ExhibitDefinition,
  PerformerDefinition,
  FurnitureDefinition,
} from "../domain/museum-grid-types";
import { tileKey } from "../domain/museum-grid-types";
import { isWalkable } from "../domain/tile-registry";
import { computeLayout } from "./graph-layout-engine";
import { routeCorridor } from "./corridor-router";
import { validate as validateLayout } from "./layout-validator";
import { stampRoom } from "./wall-segment-stamper";
import { ROOM_CONTENT } from "../data/museum-room-content";

/**
 * Builds the museum grid: runs the full layout pipeline (layout → floors →
 * wall segments → corridors → walls → performers/furniture → spawn → validate).
 * Used by MuseumModule.svelte. Stateless — plain module functions, no singleton.
 */
export function buildMuseumGrid(
  rooms: RoomNode[],
  edges: RoomEdge[],
  config: GridConfig
): MuseumGridBuildResult {
  // Step 1: Compute room positions
  const layout = computeLayout(rooms, edges, config);
  const roomLookup = new Map(layout.rooms.map((r: PlacedRoom) => [r.id, r]));

  const tiles = new Map<string, MuseumTile>();
  const exhibits: ExhibitDefinition[] = [];
  const performers: PerformerDefinition[] = [];
  const furniture: FurnitureDefinition[] = [];

  // Step 2: Carve room floors
  for (const room of layout.rooms) {
    carveRoomFloor(tiles, room);
  }

  // Step 3: Stamp wall segments + collect door positions
  // Key by "roomId:edgeId" so each room's door gets a unique entry.
  // Two rooms share the same edgeId for the same connection - without the
  // room prefix the second room's stamp would overwrite the first, and the
  // corridor router would get the same position for both endpoints.
  const allDoorPositions = new Map<string, { x: number; y: number }>();

  for (const room of layout.rooms) {
    const result = stampRoom(tiles, room, edges);
    exhibits.push(...result.exhibits);
    for (const dp of result.doorPositions) {
      allDoorPositions.set(`${room.id}:${dp.edgeId}`, { x: dp.x, y: dp.y });
    }
  }

  // Step 4: Route corridors using stamped door positions
  const corridorData: { edge: RoomEdge; segments: CorridorSegment[] }[] = [];
  for (const edge of edges) {
    const fromRoom = roomLookup.get(edge.from);
    const toRoom = roomLookup.get(edge.to);
    if (!fromRoom || !toRoom) continue;
    const segments = routeCorridor(fromRoom, toRoom, edge, allDoorPositions);
    corridorData.push({ edge, segments });
  }

  // Step 5: Carve corridor floors
  for (const { segments } of corridorData) {
    carveCorridorFloor(tiles, segments);
  }

  // Step 6: Derive walls - any empty tile adjacent to a walkable tile becomes a wall
  deriveWalls(tiles, layout.gridWidth, layout.gridHeight);

  // Step 7: Place performers + furniture
  for (const room of layout.rooms) {
    placePerformers(tiles, room, performers);
    placeFurniture(room, furniture);
  }

  // Step 8: Spawn position. Rooms can author a relative start point; the
  // center remains the safe default for existing and isolated room graphs.
  const firstRoom = layout.rooms[0]!;
  const firstRoomCenterX = firstRoom.x + Math.floor(firstRoom.w / 2);
  const firstRoomCenterY = firstRoom.y + Math.floor(firstRoom.h / 2);
  const firstRoomInteriorW = firstRoom.w - 2;
  const firstRoomInteriorH = firstRoom.h - 2;
  const spawnX =
    firstRoomCenterX +
    Math.floor((firstRoom.spawn?.offsetX ?? 0) * firstRoomInteriorW);
  const spawnY =
    firstRoomCenterY +
    Math.floor((firstRoom.spawn?.offsetY ?? 0) * firstRoomInteriorH);

  const grid: MuseumGrid = {
    width: layout.gridWidth,
    height: layout.gridHeight,
    tileScale: 0.5,
    tiles,
    wings: layout.rooms.map((r: PlacedRoom) => ({
      id: r.id,
      name: r.name,
      bounds: { x: r.x, y: r.y, width: r.w, height: r.h },
      theme: r.theme,
      description: r.description,
      roomPresentation: r.roomPresentation,
    })),
    spawn: { x: spawnX, y: spawnY, facing: firstRoom.spawn?.facing ?? "north" },
    exhibits,
    performers,
    triggers: [],
    furniture,
  };

  // Step 9: Validate
  const validation = validateLayout(grid, layout.rooms);

  return { grid, validation };
}

/**
 * Stamps a tile onto the grid at the given position.
 */
function placeTile(
  tiles: Map<string, MuseumTile>,
  x: number,
  y: number,
  tile: MuseumTile
): void {
  tiles.set(tileKey(x, y), tile);
}

/**
 * Carve room interior as floor tiles. The boundary (perimeter) is left
 * empty so that deriveWalls can turn non-segment boundary tiles into
 * walls. Wall segments (exhibits, doors, torches, etc.) are stamped onto
 * the boundary separately by WallSegmentStamper.
 */
function carveRoomFloor(
  tiles: Map<string, MuseumTile>,
  room: PlacedRoom
): void {
  for (let dy = 1; dy < room.h - 1; dy++) {
    for (let dx = 1; dx < room.w - 1; dx++) {
      tiles.set(tileKey(room.x + dx, room.y + dy), {
        type: "floor",
        material: room.material,
      });
    }
  }
}

/**
 * Carve corridor segments as floor tiles only.
 * Each segment is a straight run. The corridor width expands perpendicular
 * to the run direction.
 */
function carveCorridorFloor(
  tiles: Map<string, MuseumTile>,
  segments: CorridorSegment[]
): void {
  for (const seg of segments) {
    const isVertical = seg.x1 === seg.x2;
    const halfWidth = Math.floor(seg.width / 2);

    if (isVertical) {
      const minY = Math.min(seg.y1, seg.y2);
      const maxY = Math.max(seg.y1, seg.y2);
      for (let y = minY; y <= maxY; y++) {
        for (let dx = -halfWidth; dx < seg.width - halfWidth; dx++) {
          const x = seg.x1 + dx;
          const key = tileKey(x, y);
          if (tiles.get(key)?.type !== "door") {
            tiles.set(key, { type: "corridor", material: "stone" });
          }
        }
      }
    } else {
      const minX = Math.min(seg.x1, seg.x2);
      const maxX = Math.max(seg.x1, seg.x2);
      for (let x = minX; x <= maxX; x++) {
        for (let dy = -halfWidth; dy < seg.width - halfWidth; dy++) {
          const y = seg.y1 + dy;
          const key = tileKey(x, y);
          if (tiles.get(key)?.type !== "door") {
            tiles.set(key, { type: "corridor", material: "stone" });
          }
        }
      }
    }
  }
}

/**
 * Derive walls from adjacency.
 * Any empty tile (not in the map) that is adjacent (8-directional)
 * to a walkable tile becomes a wall.
 */
function deriveWalls(
  tiles: Map<string, MuseumTile>,
  gridWidth: number,
  gridHeight: number
): void {
  const NEIGHBORS: [number, number][] = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  const wallPositions: { x: number; y: number }[] = [];

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const key = tileKey(x, y);
      if (tiles.has(key)) continue;

      const adjacentToWalkable = NEIGHBORS.some(([dx, dy]) => {
        const tile = tiles.get(tileKey(x + dx, y + dy));
        return tile !== undefined && isWalkable(tile.type);
      });

      if (adjacentToWalkable) {
        wallPositions.push({ x, y });
      }
    }
  }

  for (const pos of wallPositions) {
    tiles.set(tileKey(pos.x, pos.y), { type: "wall" });
  }
}

/**
 * Places performer tiles inside a room based on center-relative offsets.
 */
function placePerformers(
  tiles: Map<string, MuseumTile>,
  room: PlacedRoom,
  performers: PerformerDefinition[]
): void {
  if (!room.performers) return;

  for (const placement of room.performers) {
    const centerX = room.x + Math.floor(room.w / 2);
    const centerY = room.y + Math.floor(room.h / 2);

    const interiorW = room.w - 2;
    const interiorH = room.h - 2;
    const px = centerX + Math.floor(placement.offsetX * interiorW);
    const py = centerY + Math.floor(placement.offsetY * interiorH);

    const content = ROOM_CONTENT[room.id]?.performers?.[placement.refId];
    // A withheld figure leaves plain floor: no station, collider or prompt.
    if (content?.withheld) continue;

    placeTile(tiles, px, py, {
      type: "performer-station",
      refId: placement.refId,
      facing: placement.facing,
      material: room.material,
    });

    performers.push({
      id: placement.refId,
      tileX: px,
      tileY: py,
      facing: placement.facing,
      sequenceId: content?.sequenceId,
      autoPlay: content?.autoPlay ?? false,
      label: content?.label,
      description: content?.description,
      handout: content?.handout,
      presentation: placement.presentation,
      scale: placement.scale,
      collisionRadiusTiles: placement.collisionRadiusTiles,
      elevation: placement.elevation ?? 0,
    });
  }
}

/**
 * Places furniture definitions inside a room based on center-relative offsets.
 * Furniture doesn't stamp tiles - it only produces FurnitureDefinition entries
 * that the 3D renderer reads to place GLTF models.
 */
function placeFurniture(
  room: PlacedRoom,
  furniture: FurnitureDefinition[]
): void {
  if (!room.furniture) return;

  const centerX = room.x + Math.floor(room.w / 2);
  const centerY = room.y + Math.floor(room.h / 2);
  const interiorW = room.w - 2;
  const interiorH = room.h - 2;

  for (let i = 0; i < room.furniture.length; i++) {
    const placement = room.furniture[i]!;
    const px = centerX + Math.floor(placement.offsetX * interiorW);
    const py = centerY + Math.floor(placement.offsetY * interiorH);

    furniture.push({
      id: `${room.id}-furniture-${i}`,
      role: placement.role,
      tileX: px,
      tileY: py,
      rotationY: placement.rotationY ?? 0,
    });
  }
}
