/**
 * Headless playtest of the Vulcan Cave water route ("The Ring"):
 * spawn → squeeze north door → flooded approach → the flooded gallery's S-path
 * → the surfacing stair → the grotto apron → west walkway → procession past
 * A, B and C → carved threshold → cave-fire west door.
 *
 * Drives the REAL stack (buildVulcanCaveFloorPlan + MuseumPhysicsProvider) with
 * repeated movePlayer calls, exactly like the in-game controller does. A
 * line-hugging walk over the actual tile grid (honouring both solid tiles AND
 * terrain.blockedAt, falling back to BFS only to detour around a real
 * obstruction) finds the walkable route between waypoints — this mirrors what a
 * real player walks, including any corridor jog the layout introduces between
 * misaligned doors.
 *
 * Submersion is asserted with the trigger's own arithmetic: Museum3DScene calls
 * the player submerged when `position.y + 0.75 < terrain.waterlineY`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { buildVulcanCaveFloorPlan } from "#lib/features/museum/data/vulcan-cave-floor-plan.js";
import {
  MuseumPhysicsProvider,
  SOLID_TYPES,
} from "#lib/features/museum/services/museum-physics-provider.js";
import { tileKey } from "#lib/features/museum/domain/museum-grid-types.js";
import {
  buildDrownedGalleryLayout,
  CAUSEWAY_Y,
  GALLERY_FLOOR_Y,
  LANDING_Y,
  TILE_METRES,
  WATERLINE_Y,
} from "#lib/features/museum/data/drowned-gallery-terrain.js";

const TILE = TILE_METRES;
const STANDING_Y = 0.85;
/** UCC's first-person camera offset, the other half of the submersion trigger. */
const EYE_OFFSET = 0.75;
/** Required contiguous submerged walk through the gallery, in metres. */
const MIN_SUBMERGED_RUN = 24;

const plan = buildVulcanCaveFloorPlan();
const grid = plan.grid;
const terrain = grid.terrain!;
const layout = buildDrownedGalleryLayout(grid)!;

type TileCoord = { x: number; y: number };
type WorldPoint = { x: number; z: number };

function wingBounds(id: string) {
  const w = grid.wings.find((wing) => wing.id === id);
  if (!w) throw new Error(`missing wing "${id}"`);
  return w.bounds;
}

function doorTiles(
  roomId: string,
  wall: "north" | "south" | "east" | "west"
): TileCoord[] {
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
  return tiles;
}

function doorCenterTile(
  roomId: string,
  wall: "north" | "south" | "east" | "west"
): TileCoord {
  const tiles = doorTiles(roomId, wall);
  return tiles[Math.floor(tiles.length / 2)]!;
}

// World conversion matches the REAL engine's convention (Museum3DScene,
// museum-player-controller, museum-physics-provider and the terrain module):
// worldCoord = tileIndex * TILE, with no half-tile centring offset.
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

/**
 * Line-hugging walk toward a target: each step advances whichever axis is
 * currently furthest from the target, falling back to the other axis on a
 * block, and to a full BFS detour only when both are blocked.
 */
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

const mid = (a: number, b: number) => (a + b) / 2;

// ── Route waypoints, in walk order ──────────────────────────────────────────
const squeezeNorthDoor = doorCenterTile("cave-squeeze", "north");
const approachSouthDoor = doorCenterTile("cave-water-approach", "south");
const approachNorthDoor = doorCenterTile("cave-water-approach", "north");
const gallerySouthDoor = doorCenterTile("cave-water-gallery", "south");
const galleryNorthDoor = doorCenterTile("cave-water-gallery", "north");
const grottoSouthDoor = doorCenterTile("cave-water", "south");
const grottoEastDoor = doorCenterTile("cave-water", "east");
const fireWestDoor = doorCenterTile("cave-fire", "west");

const {
  descentStair,
  westRun,
  northRun,
  eastBend,
  surfacingLanding,
  surfacingLower,
  procession,
  westWalkway,
  eastWalkway,
  pool,
  apron,
  thresholdOpening,
  threshold,
  alcoves,
} = layout;

// Legs of the gallery's S-path, then the ring.
const GALLERY_LEGS: TileCoord[] = [
  tileOfWorld({ x: mid(descentStair.minX, descentStair.maxX), z: descentStair.minZ + 0.5 }),
  tileOfWorld({ x: mid(northRun.minX, northRun.maxX), z: mid(westRun.minZ, westRun.maxZ) }),
  tileOfWorld({ x: mid(northRun.minX, northRun.maxX), z: mid(eastBend.minZ, eastBend.maxZ) }),
  tileOfWorld({ x: mid(surfacingLower.minX, surfacingLower.maxX), z: mid(eastBend.minZ, eastBend.maxZ) }),
  tileOfWorld({ x: mid(surfacingLower.minX, surfacingLower.maxX), z: surfacingLower.maxZ - 0.5 }),
  tileOfWorld({ x: mid(surfacingLanding.minX, surfacingLanding.maxX), z: mid(surfacingLanding.minZ, surfacingLanding.maxZ) }),
];

const RING_LEGS: TileCoord[] = [
  tileOfWorld({ x: mid(apron.minX, apron.maxX), z: mid(apron.minZ, apron.maxZ) }),
  tileOfWorld({ x: mid(westWalkway.minX, westWalkway.maxX), z: pool.maxZ - 1 }),
  tileOfWorld({ x: mid(westWalkway.minX, westWalkway.maxX), z: mid(procession.minZ, procession.maxZ) }),
  ...alcoves.map((a) =>
    tileOfWorld({ x: a.x, z: mid(procession.minZ, procession.maxZ) })
  ),
  tileOfWorld({ x: mid(eastWalkway.minX, eastWalkway.maxX), z: mid(procession.minZ, procession.maxZ) }),
  tileOfWorld({ x: mid(thresholdOpening.minX, thresholdOpening.maxX), z: threshold.minZ - 1 }),
  tileOfWorld({ x: mid(thresholdOpening.minX, thresholdOpening.maxX), z: threshold.maxZ + 1 }),
];

const ROUTE: TileCoord[] = [
  squeezeNorthDoor,
  approachSouthDoor,
  approachNorthDoor,
  gallerySouthDoor,
  ...GALLERY_LEGS,
  galleryNorthDoor,
  grottoSouthDoor,
  ...RING_LEGS,
  grottoEastDoor,
  fireWestDoor,
];

function fullTilePath(waypoints: TileCoord[]): TileCoord[] {
  const path: TileCoord[] = [waypoints[0]!];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const leg = greedyPath(waypoints[i]!, waypoints[i + 1]!);
    path.push(...leg.slice(1));
  }
  return path;
}

function walk(waypoints: TileCoord[]): Sample[] {
  const tilePath = fullTilePath(waypoints);
  const start = worldOfTile(tilePath[0]!);
  const physics = new MuseumPhysicsProvider(grid, TILE, {
    x: start.x,
    y: 0,
    z: start.z,
  });
  return walkWaypoints(physics, tilePath.slice(1).map(worldOfTile));
}

describe("drowned gallery traversal (headless playtest)", () => {
  let samples: Sample[];

  beforeAll(() => {
    samples = walk(ROUTE);
  });

  it("walks the whole route from the squeeze to the Fire door", () => {
    expect(samples.length).toBeGreaterThan(100);
    const target = worldOfTile(fireWestDoor);
    const last = samples.at(-1)!;
    expect(Math.hypot(last.x - target.x, last.z - target.z)).toBeLessThan(0.1);
  });

  it("passes all three alcove x positions along the procession", () => {
    for (const alcove of alcoves) {
      const passed = samples.some(
        (s) =>
          Math.abs(s.x - alcove.x) < 0.3 &&
          s.z >= procession.minZ &&
          s.z <= procession.maxZ
      );
      expect(passed, `never read the alcove at x=${alcove.x}`).toBe(true);
    }
  });

  it("stays submerged for a contiguous 24 m or more through the gallery", () => {
    let best = 0;
    let run = 0;
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1]!;
      const cur = samples[i]!;
      const submerged =
        cur.y + EYE_OFFSET < WATERLINE_Y && prev.y + EYE_OFFSET < WATERLINE_Y;
      if (submerged) {
        run += Math.hypot(cur.x - prev.x, cur.z - prev.z);
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    expect(best).toBeGreaterThanOrEqual(MIN_SUBMERGED_RUN);
  });

  it("keeps the procession and the apron out of the water", () => {
    const dry = samples.filter(
      (s) =>
        (s.z >= procession.minZ && s.z <= procession.maxZ) ||
        (s.z >= apron.minZ && s.z <= apron.maxZ && s.z <= layout.grotto.maxZ)
    );
    expect(dry.length).toBeGreaterThan(20);
    for (const s of dry) {
      expect(s.y + EYE_OFFSET).toBeGreaterThanOrEqual(WATERLINE_Y + 0.05);
    }
  });

  it("breaks the surface on the mid-stair landing", () => {
    const onLanding = samples.filter(
      (s) => Math.abs(s.elevation - LANDING_Y) <= 0.05
    );
    expect(onLanding.length).toBeGreaterThan(0);
    for (const s of onLanding) {
      expect(Math.abs(s.y + EYE_OFFSET - WATERLINE_Y)).toBeLessThanOrEqual(0.25);
    }
  });

  it("never pops the floor more than 0.6 m between successive steps", () => {
    for (let i = 1; i < samples.length; i++) {
      const jump = Math.abs(samples[i]!.elevation - samples[i - 1]!.elevation);
      if (jump > 0.6) {
        throw new Error(
          `Elevation cliff of ${jump.toFixed(2)} m between ` +
            `(${samples[i - 1]!.x.toFixed(2)}, ${samples[i - 1]!.z.toFixed(2)}) elev=${samples[i - 1]!.elevation.toFixed(2)} and ` +
            `(${samples[i]!.x.toFixed(2)}, ${samples[i]!.z.toFixed(2)}) elev=${samples[i]!.elevation.toFixed(2)}`
        );
      }
    }
  });

  it("walks the gallery on the gallery floor, not on top of the water", () => {
    const inGallery = samples.filter(
      (s) =>
        s.x >= layout.gallery.minX &&
        s.x <= layout.gallery.maxX &&
        s.z >= westRun.minZ &&
        s.z <= westRun.maxZ
    );
    expect(inGallery.length).toBeGreaterThan(0);
    for (const s of inGallery) {
      expect(s.y).toBeCloseTo(GALLERY_FLOOR_Y + STANDING_Y, 2);
    }
  });

  it("reaches the Fire door at museum datum elevation (~0)", () => {
    const exit = worldOfTile(grottoEastDoor);
    expect(terrain.elevationAt(exit.x, exit.z)).toBeCloseTo(0, 1);
  });

  it("closes the ring: apron → west → procession → east → apron", () => {
    const ring: TileCoord[] = [
      tileOfWorld({ x: mid(apron.minX, apron.maxX), z: mid(apron.minZ, apron.maxZ) }),
      tileOfWorld({ x: mid(westWalkway.minX, westWalkway.maxX), z: pool.maxZ - 1 }),
      tileOfWorld({ x: mid(westWalkway.minX, westWalkway.maxX), z: mid(procession.minZ, procession.maxZ) }),
      tileOfWorld({ x: mid(procession.minX, procession.maxX), z: mid(procession.minZ, procession.maxZ) }),
      tileOfWorld({ x: mid(eastWalkway.minX, eastWalkway.maxX), z: mid(procession.minZ, procession.maxZ) }),
      tileOfWorld({ x: mid(thresholdOpening.minX, thresholdOpening.maxX), z: threshold.maxZ + 1 }),
      tileOfWorld({ x: mid(apron.minX, apron.maxX), z: mid(apron.minZ, apron.maxZ) }),
    ];
    const ringSamples = walk(ring);
    const start = worldOfTile(ring[0]!);
    const end = ringSamples.at(-1)!;
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(0.1);
    for (const s of ringSamples) {
      expect(terrain.blockedAt(s.x, s.z)).toBe(false);
      expect(s.elevation).toBeLessThanOrEqual(CAUSEWAY_Y + 1e-6);
    }
  });

  it("keeps the pool a barrier from the procession", () => {
    const start = layout.probes.procession;
    const physics = new MuseumPhysicsProvider(grid, TILE, {
      x: start.x,
      y: 0,
      z: start.z,
    });
    const target = layout.probes.pool;
    for (let i = 0; i < 400; i++) {
      const pos = physics.getPlayerPosition();
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.1) break;
      const step = Math.min(0.05, dist);
      physics.movePlayer(
        { x: (dx / dist) * step, y: -0.2, z: (dz / dist) * step },
        1 / 60
      );
      const p = physics.getPlayerPosition();
      expect(terrain.blockedAt(p.x, p.z)).toBe(false);
    }
    expect(physics.getPlayerPosition().z).toBeLessThanOrEqual(pool.minZ + 0.01);
  });

  it("keeps the alcove shore unreachable from the procession", () => {
    for (const alcove of alcoves) {
      const target = tileOfWorld({ x: alcove.x, z: alcove.z });
      const from = tileOfWorld(layout.probes.procession);
      expect(() => bfsPath(from, target)).toThrow();
    }
  });
});
