/**
 * Headless playtest of The First Fire: the grotto east door, the dogleg
 * corridor, the steam threshold, the torch lane, the DJ court and its
 * horseshoe orbit, the transfer to EK, the EK orbit, the transfer to FL,
 * the FL orbit, the growth path, the Earth door.
 *
 * Drives the REAL stack (buildVulcanCaveFloorPlan + MuseumPhysicsProvider) with
 * repeated movePlayer calls, exactly like the in-game controller does, walking
 * a line-hugging path over the actual tile grid (honouring solid tiles AND
 * terrain.blockedAt, with a BFS detour only around a real obstruction).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { buildVulcanCaveFloorPlan } from "#lib/features/museum/data/vulcan-cave-floor-plan.js";
import {
  MuseumPhysicsProvider,
  SOLID_TYPES,
} from "#lib/features/museum/services/museum-physics-provider.js";
import { tileKey } from "#lib/features/museum/domain/museum-grid-types.js";
import { TILE_METRES } from "#lib/features/museum/data/drowned-gallery-terrain.js";
import {
  buildFirstFireProcessionBay,
  CINDER_FLOOR_Y,
} from "#lib/features/museum/data/first-fire-procession-terrain.js";

const TILE = TILE_METRES;
const STANDING_Y = 0.85;

const plan = buildVulcanCaveFloorPlan();
const grid = plan.grid;
const terrain = grid.terrain!;
const procession = buildFirstFireProcessionBay(grid)!.plan;

type TileCoord = { x: number; y: number };
type WorldPoint = { x: number; z: number };

function wingBounds(id: string) {
  const w = grid.wings.find((wing) => wing.id === id);
  if (!w) throw new Error(`missing wing "${id}"`);
  return w.bounds;
}

function doorCenterTile(
  roomId: string,
  wall: "north" | "south" | "east" | "west"
): TileCoord {
  const { x, y, width, height } = wingBounds(roomId);
  const tiles: TileCoord[] = [];
  if (wall === "north" || wall === "south") {
    const wallY = wall === "north" ? y : y + height - 1;
    for (let wx = x; wx < x + width; wx++) {
      if (grid.tiles.get(tileKey(wx, wallY))?.type === "door")
        tiles.push({ x: wx, y: wallY });
    }
  } else {
    const wallX = wall === "west" ? x : x + width - 1;
    for (let wy = y; wy < y + height; wy++) {
      if (grid.tiles.get(tileKey(wallX, wy))?.type === "door")
        tiles.push({ x: wallX, y: wy });
    }
  }
  if (tiles.length === 0)
    throw new Error(`No ${wall} door in cave room "${roomId}"`);
  return tiles[Math.floor(tiles.length / 2)]!;
}

function worldOfTile(t: TileCoord): WorldPoint {
  return { x: t.x * TILE, z: t.y * TILE };
}

function tileOfWorld(p: WorldPoint): TileCoord {
  return { x: Math.round(p.x / TILE), y: Math.round(p.z / TILE) };
}

function isWalkableTile(tx: number, ty: number): boolean {
  const tile = grid.tiles.get(tileKey(tx, ty));
  if (!tile || SOLID_TYPES.has(tile.type)) return false;
  const w = worldOfTile({ x: tx, y: ty });
  return !terrain.blockedAt(w.x, w.z);
}

/** Shortest walkable path (4-directional) honouring solids AND terrain.blockedAt. */
function bfsPath(from: TileCoord, to: TileCoord): TileCoord[] {
  if (!isWalkableTile(from.x, from.y))
    throw new Error(`BFS start (${from.x},${from.y}) is not walkable`);
  if (!isWalkableTile(to.x, to.y))
    throw new Error(`BFS target (${to.x},${to.y}) is not walkable`);
  const key = (p: TileCoord) => `${p.x},${p.y}`;
  const visited = new Set<string>([key(from)]);
  const prev = new Map<string, TileCoord>();
  const queue: TileCoord[] = [from];
  let head = 0;
  const DIRS: TileCoord[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  while (head < queue.length) {
    const cur = queue[head++]!;
    if (cur.x === to.x && cur.y === to.y) {
      const path: TileCoord[] = [];
      let node: TileCoord | undefined = cur;
      while (node) {
        path.unshift(node);
        node = prev.get(key(node));
      }
      return path;
    }
    for (const d of DIRS) {
      const nxt = { x: cur.x + d.x, y: cur.y + d.y };
      const k = key(nxt);
      if (visited.has(k) || !isWalkableTile(nxt.x, nxt.y)) continue;
      visited.add(k);
      prev.set(k, cur);
      queue.push(nxt);
    }
  }
  throw new Error(
    `No walkable path from (${from.x},${from.y}) to (${to.x},${to.y}) — the route is physically severed`
  );
}

function greedyPath(from: TileCoord, to: TileCoord): TileCoord[] {
  const path: TileCoord[] = [from];
  let cur = from;
  let guard = 0;
  while ((cur.x !== to.x || cur.y !== to.y) && guard++ < 20000) {
    const dx = to.x - cur.x;
    const dy = to.y - cur.y;
    const stepX: TileCoord = { x: cur.x + Math.sign(dx), y: cur.y };
    const stepY: TileCoord = { x: cur.x, y: cur.y + Math.sign(dy) };
    const primary = Math.abs(dx) >= Math.abs(dy) ? stepX : stepY;
    const secondary = primary === stepX ? stepY : stepX;
    let next: TileCoord | null = null;
    if (primary.x !== cur.x || primary.y !== cur.y) {
      if (isWalkableTile(primary.x, primary.y)) next = primary;
    }
    if (!next && (secondary.x !== cur.x || secondary.y !== cur.y)) {
      if (isWalkableTile(secondary.x, secondary.y)) next = secondary;
    }
    if (!next) {
      const detour = bfsPath(cur, to);
      path.push(...detour.slice(1));
      cur = to;
      break;
    }
    cur = next;
    path.push(cur);
  }
  if (cur.x !== to.x || cur.y !== to.y)
    throw new Error(`greedyPath stalled short of (${to.x},${to.y})`);
  return path;
}

interface Sample {
  x: number;
  z: number;
  y: number;
  elevation: number;
}

function walkWaypoints(
  physics: MuseumPhysicsProvider,
  waypoints: WorldPoint[]
): Sample[] {
  const samples: Sample[] = [];
  for (const wp of waypoints) {
    let guard = 0;
    while (guard++ < 200) {
      const pos = physics.getPlayerPosition();
      const dx = wp.x - pos.x;
      const dz = wp.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.06) break;
      const step = Math.min(0.05, dist);
      physics.movePlayer(
        { x: (dx / dist) * step, y: -0.2, z: (dz / dist) * step },
        1 / 60
      );
      const p = physics.getPlayerPosition();
      samples.push({
        x: p.x,
        z: p.z,
        y: p.y,
        elevation: terrain.elevationAt(p.x, p.z),
      });
    }
    const finalPos = physics.getPlayerPosition();
    const finalDist = Math.hypot(wp.x - finalPos.x, wp.z - finalPos.z);
    if (finalDist >= 0.06) {
      throw new Error(
        `Stalled short of waypoint (${wp.x.toFixed(2)}, ${wp.z.toFixed(2)}): ` +
          `stuck at (${finalPos.x.toFixed(2)}, ${finalPos.y.toFixed(2)}, ${finalPos.z.toFixed(2)}), ` +
          `elevationAt(stuck point)=${terrain.elevationAt(finalPos.x, finalPos.z).toFixed(2)}`
      );
    }
  }
  return samples;
}

function walk(waypoints: TileCoord[]): Sample[] {
  const tilePath: TileCoord[] = [waypoints[0]!];
  for (let i = 0; i < waypoints.length - 1; i++) {
    tilePath.push(...greedyPath(waypoints[i]!, waypoints[i + 1]!).slice(1));
  }
  const start = worldOfTile(tilePath[0]!);
  const physics = new MuseumPhysicsProvider(grid, TILE, {
    x: start.x,
    y: 0,
    z: start.z,
  });
  return walkWaypoints(physics, tilePath.slice(1).map(worldOfTile));
}

// ── Route waypoints, in walk order ──────────────────────────────────────────
const grottoEastDoor = doorCenterTile("cave-water", "east");
const fireWestDoor = doorCenterTile("cave-fire", "west");
const fireEastDoor = doorCenterTile("cave-fire", "east");

/** The plan route itself, one waypoint per vertex, doors at either end. */
const ROUTE: TileCoord[] = [
  grottoEastDoor,
  fireWestDoor,
  ...procession.walkPath
    .filter((p) => p.x > procession.room.minX + 0.5 && p.x < procession.room.maxX - 0.5)
    .map(tileOfWorld),
  fireEastDoor,
].filter((tile, index, all) => index === 0 || tile.x !== all[index - 1]!.x || tile.y !== all[index - 1]!.y);

describe("first fire traversal (headless playtest)", () => {
  let samples: Sample[];

  beforeAll(() => {
    samples = walk(ROUTE);
  });

  it("walks the whole route from the grotto door to the Earth door", () => {
    expect(samples.length).toBeGreaterThan(500);
    const target = worldOfTile(fireEastDoor);
    const last = samples.at(-1)!;
    expect(Math.hypot(last.x - target.x, last.z - target.z)).toBeLessThan(0.1);
  });

  it("passes through all three courts in DJ, EK, FL order", () => {
    const firstVisit = procession.shrines.map((shrine) => {
      const index = samples.findIndex(
        (s) => Math.hypot(s.x - shrine.centre.x, s.z - shrine.centre.z) < shrine.orbitRadius + 1
      );
      expect(index, `${shrine.id} never reached`).toBeGreaterThanOrEqual(0);
      return index;
    });
    expect(firstVisit[0]).toBeLessThan(firstVisit[1]!);
    expect(firstVisit[1]).toBeLessThan(firstVisit[2]!);
  });

  it("stays on the cinder datum the whole way", () => {
    for (const s of samples) {
      expect(s.elevation).toBe(CINDER_FLOOR_Y);
      expect(s.y).toBeCloseTo(CINDER_FLOOR_Y + STANDING_Y, 5);
    }
  });

  it("never walks into basalt", () => {
    for (const s of samples) {
      expect(terrain.blockedAt(s.x, s.z)).toBe(false);
    }
  });
});
