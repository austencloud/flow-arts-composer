/**
 * Headless playtest of the Root Terrace: Fire's east door → the corridor →
 * the vestibule → up the entry ramp to the overlook → back down → the gallery
 * descent → all three consoles along the catwalk → the east link → the
 * ensemble landing → the exit ramp → the Air door.
 *
 * The walk back down from the overlook is the point of the spur, not an
 * oversight: the terrain is 2.5D and the step rule needs a metre of rock
 * between decks at different heights, which leaves no corridor for a descent
 * that clears the vestibule without flanking the overlook. This test proves
 * the round trip is actually walkable rather than merely drawn.
 *
 * Drives the REAL stack (buildVulcanCaveFloorPlan + MuseumPhysicsProvider) with
 * repeated movePlayer calls, exactly like the in-game controller does, walking a
 * line-hugging path over the actual tile grid (honouring solid tiles AND
 * terrain.blockedAt, with a BFS detour only around a real obstruction).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { buildVulcanCaveFloorPlan } from "$lib/features/museum/data/vulcan-cave-floor-plan";
import {
  MuseumPhysicsProvider,
  SOLID_TYPES,
} from "$lib/features/museum/services/museum-physics-provider";
import { tileKey } from "$lib/features/museum/domain/museum-grid-types";
import { TILE_METRES, inRectClosed } from "$lib/features/museum/data/drowned-gallery-terrain";
import {
  BED_Y,
  DOOR_Y,
  GALLERY_Y,
  LANDING_Y,
  OVERLOOK_Y,
  buildEarthRootTerraceLayout,
} from "$lib/features/museum/data/earth-root-terrace-terrain";

const TILE = TILE_METRES;
const STANDING_Y = 0.85;

const plan = buildVulcanCaveFloorPlan();
const grid = plan.grid;
const terrain = grid.terrain!;
const layout = buildEarthRootTerraceLayout(grid)!;

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
      if (grid.tiles.get(tileKey(wx, wallY))?.type === "door") tiles.push({ x: wx, y: wallY });
    }
  } else {
    const wallX = wall === "west" ? x : x + width - 1;
    for (let wy = y; wy < y + height; wy++) {
      if (grid.tiles.get(tileKey(wallX, wy))?.type === "door") tiles.push({ x: wallX, y: wy });
    }
  }
  if (tiles.length === 0) throw new Error(`No ${wall} door in cave room "${roomId}"`);
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

function walkWaypoints(physics: MuseumPhysicsProvider, waypoints: WorldPoint[]): Sample[] {
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
      physics.movePlayer({ x: (dx / dist) * step, y: -0.2, z: (dz / dist) * step }, 1 / 60);
      const p = physics.getPlayerPosition();
      samples.push({ x: p.x, z: p.z, y: p.y, elevation: terrain.elevationAt(p.x, p.z) });
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
  const physics = new MuseumPhysicsProvider(grid, TILE, { x: start.x, y: 0, z: start.z });
  return walkWaypoints(physics, tilePath.slice(1).map(worldOfTile));
}

const mid = (r: { minX: number; maxX: number; minZ: number; maxZ: number }) => ({
  x: (r.minX + r.maxX) / 2,
  z: (r.minZ + r.maxZ) / 2,
});

// ── Route waypoints, in walk order ──────────────────────────────────────────
const fireEastDoor = doorCenterTile("cave-fire", "east");
const earthWestDoor = doorCenterTile("cave-earth", "west");
const earthSouthDoor = doorCenterTile("cave-earth", "south");

const opener = tileOfWorld(layout.opener.centre);
const rampFoot = tileOfWorld({ x: layout.entryRamp.minX + 0.5, z: mid(layout.entryRamp).z });
const overlookStand = tileOfWorld({
  x: layout.overlook.minX + 1.0,
  z: layout.overlook.maxZ - 0.5,
});
const descentFoot = tileOfWorld({ x: layout.gallery.minX + 0.5, z: mid(layout.gallery).z });
const consoles = layout.consoles.map((panel) => tileOfWorld(panel.stand));
const landing = tileOfWorld(layout.ensemble.eye);
const exit = tileOfWorld(mid(layout.doorApproach));

const ROUTE: TileCoord[] = [
  fireEastDoor,
  earthWestDoor,
  opener,
  rampFoot,
  overlookStand,
  // …and back out of the spur, through the vestibule, down the other lane.
  descentFoot,
  ...consoles,
  landing,
  exit,
  earthSouthDoor,
];

describe("earth root terrace traversal (headless playtest)", () => {
  let samples: Sample[];

  beforeAll(() => {
    samples = walk(ROUTE);
  });

  it("walks the whole route from Fire's door to the Air door", () => {
    expect(samples.length).toBeGreaterThan(300);
    const target = worldOfTile(earthSouthDoor);
    const last = samples.at(-1)!;
    expect(Math.hypot(last.x - target.x, last.z - target.z)).toBeLessThan(0.1);
  });

  it("stands on the datum at both doors and in the vestibule", () => {
    const inVestibule = samples.filter((s) => inRectClosed(layout.vestibule, s.x, s.z));
    expect(inVestibule.length).toBeGreaterThan(20);
    for (const s of inVestibule) {
      expect(s.elevation).toBeCloseTo(DOOR_Y, 5);
      expect(s.y).toBeCloseTo(DOOR_Y + STANDING_Y, 5);
    }
    const last = samples.at(-1)!;
    expect(last.elevation).toBeCloseTo(DOOR_Y, 5);
  });

  it("climbs the entry ramp and holds the overlook datum on the spur", () => {
    const onRamp = samples.filter((s) => inRectClosed(layout.entryRamp, s.x, s.z));
    expect(onRamp.length).toBeGreaterThan(50);
    expect(Math.min(...onRamp.map((s) => s.elevation))).toBeLessThan(0.3);
    expect(Math.max(...onRamp.map((s) => s.elevation))).toBeGreaterThan(OVERLOOK_Y - 0.3);
    const onOverlook = samples.filter((s) => inRectClosed(layout.overlook, s.x, s.z));
    expect(onOverlook.length).toBeGreaterThan(5);
    for (const s of onOverlook) {
      expect(s.elevation).toBeCloseTo(OVERLOOK_Y, 5);
      expect(s.y).toBeCloseTo(OVERLOOK_Y + STANDING_Y, 5);
    }
  });

  it("comes back down and walks the whole catwalk, stopping at all three consoles", () => {
    const onGallery = samples.filter((s) => inRectClosed(layout.gallery, s.x, s.z));
    expect(onGallery.length).toBeGreaterThan(100);
    for (const s of onGallery) {
      expect(s.elevation).toBeCloseTo(GALLERY_Y, 5);
      expect(s.y).toBeCloseTo(GALLERY_Y + STANDING_Y, 5);
    }
    // Every console is actually reached, not merely passed near.
    for (const panel of layout.consoles) {
      const reached = samples.some(
        (s) => Math.hypot(s.x - panel.stand.x, s.z - panel.stand.z) < 0.4
      );
      expect(reached, `console ${panel.letter}`).toBe(true);
    }
    // The overlook is walked BEFORE the catwalk: the reveal, then the work.
    const firstOverlook = samples.findIndex((s) => inRectClosed(layout.overlook, s.x, s.z));
    const firstGallery = samples.findIndex((s) => inRectClosed(layout.gallery, s.x, s.z));
    expect(firstOverlook).toBeGreaterThanOrEqual(0);
    expect(firstOverlook).toBeLessThan(firstGallery);
  });

  it("stands on the landing, below the datum, on the row's axis", () => {
    const onLanding = samples.filter((s) => inRectClosed(layout.landing, s.x, s.z));
    expect(onLanding.length).toBeGreaterThan(5);
    for (const s of onLanding) expect(s.elevation).toBeCloseTo(LANDING_Y, 5);
    const axis = layout.stations[0]!.centre.z;
    expect(onLanding.some((s) => Math.abs(s.z - axis) < 0.3)).toBe(true);
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

  it("never reaches the performers' floor, on the bed or in the cleft", () => {
    // The catwalk and its alcoves are cantilevered over the bed rect, so being
    // inside that rect in plan is expected now. What must never happen is
    // standing ON the bed: every sample is on a deck at least 1.2 m above it.
    for (const s of samples) {
      expect(terrain.blockedAt(s.x, s.z)).toBe(false);
      expect(inRectClosed(layout.cleft, s.x, s.z)).toBe(false);
      expect(s.elevation - BED_Y).toBeGreaterThanOrEqual(1.2 - 1e-9);
      if (inRectClosed(layout.bed, s.x, s.z)) {
        const overDeck = [layout.galleryDescent, layout.gallery, ...layout.alcoves].some(
          (r) => inRectClosed(r, s.x, s.z)
        );
        expect(overDeck, `${s.x.toFixed(2)},${s.z.toFixed(2)} inside the bed`).toBe(true);
      }
    }
  });

  it("cannot step off the catwalk rail onto the bed", () => {
    const start = { x: layout.consoles[1]!.stand.x, z: layout.gallery.maxZ - 0.3 };
    const physics = new MuseumPhysicsProvider(grid, TILE, { x: start.x, y: 0, z: start.z });
    for (let i = 0; i < 80; i++) physics.movePlayer({ x: 0, y: -0.2, z: 0.05 }, 1 / 60);
    const pos = physics.getPlayerPosition();
    expect(pos.z).toBeLessThan(layout.gallery.maxZ + 0.5);
    expect(pos.y).toBeCloseTo(GALLERY_Y + STANDING_Y, 3);
  });

  it("cannot step off the overlook spur onto the bed", () => {
    const start = { x: mid(layout.overlook).x, z: layout.overlook.maxZ - 0.3 };
    const physics = new MuseumPhysicsProvider(grid, TILE, { x: start.x, y: 0, z: start.z });
    for (let i = 0; i < 80; i++) physics.movePlayer({ x: 0, y: -0.2, z: 0.05 }, 1 / 60);
    const pos = physics.getPlayerPosition();
    expect(pos.z).toBeLessThan(layout.bed.minZ + 0.5);
    expect(pos.y).toBeCloseTo(OVERLOOK_Y + STANDING_Y, 3);
  });
});
