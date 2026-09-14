/**
 * Terrain + layout invariants for the Earth wing (the Root Terrace).
 *
 * The same coupling invariants Water and Fire carry — one geometry source,
 * every walkable tile inside a rendered floor, the 0.6 m step rule, performer
 * anchors identical to layout anchors, the suppressedSpans regression — plus
 * the ones the terrace adds: the bed is blocked everywhere it is not under a
 * deck, every walked deck stays above the bed with no way down onto it, and
 * the ensemble landing sees all three cases on one axis.
 *
 * The sightline acceptance criterion the regrade was built to meet — the
 * console read, and the occluder sweep over every deck edge rather than only
 * the rails — lives in earth-root-terrace-sightlines.test.ts.
 */
import { describe, it, expect } from "vitest";
import { buildVulcanCaveFloorPlan } from "$lib/features/museum/data/vulcan-cave-floor-plan";
import {
  BED_Y,
  DOOR_Y,
  EYE_ABOVE_FLOOR,
  GALLERY_Y,
  LANDING_Y,
  OVERLOOK_Y,
  PROP_CENTRE_ABOVE_FEET,
  buildEarthRootTerraceLayout,
  createEarthRootTerraceTerrain,
  earthRootTerraceSpawnOffset,
  earthRootTerraceStationOffsets,
  ribbonElevationAt,
} from "$lib/features/museum/data/earth-root-terrace-terrain";
import { buildFirstFireProcessionBay } from "$lib/features/museum/data/first-fire-procession-terrain";
import {
  buildDrownedGalleryLayout,
  inRectClosed,
  TILE_METRES,
  type WorldRect,
} from "$lib/features/museum/data/drowned-gallery-terrain";
import { SOLID_TYPES } from "$lib/features/museum/services/museum-physics-provider";
import { bucketMuseumTilesByRoom } from "$lib/features/museum/services/museum-geometry-builder";
import { tileKey } from "$lib/features/museum/domain/museum-grid-types";

const TILE = TILE_METRES;

const plan = buildVulcanCaveFloorPlan();
const grid = plan.grid;
const terrain = createEarthRootTerraceTerrain(grid)!;
const layout = buildEarthRootTerraceLayout(grid)!;
/** The composed program the game actually runs on. */
const caveTerrain = grid.terrain!;

const wing = (id: string) => grid.wings.find((w) => w.id === id)!.bounds;
const centre = (r: WorldRect) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });

function isWalkable(tx: number, ty: number): boolean {
  const tile = grid.tiles.get(tileKey(tx, ty));
  if (!tile || SOLID_TYPES.has(tile.type)) return false;
  return !caveTerrain.blockedAt(tx * TILE, ty * TILE);
}

/** Every tile whose world position lies inside the earth bay. */
function bayTiles(): { tx: number; ty: number; x: number; z: number }[] {
  const out: { tx: number; ty: number; x: number; z: number }[] = [];
  for (const key of grid.tiles.keys()) {
    const [tx, ty] = key.split(",").map(Number);
    const x = tx! * TILE;
    const z = ty! * TILE;
    if (!layout.bayFootprint.some((rect) => inRectClosed(rect, x, z))) continue;
    out.push({ tx: tx!, ty: ty!, x, z });
  }
  return out;
}

const walkableBayTiles = bayTiles().filter((t) => isWalkable(t.tx, t.ty));

describe("earth root terrace terrain", () => {
  it("exists for the cave plan and owns the earth bay", () => {
    expect(terrain).toBeTruthy();
    expect(layout.stations.map((s) => s.letter)).toEqual(["G", "H", "I"]);
    expect(layout.floorRects.map((f) => f.id)).toEqual([
      "vestibule",
      "overlook",
      "gallery",
      "alcove-g",
      "alcove-h",
      "alcove-i",
      "landing",
      "door-approach",
      "entry-ramp",
      "gallery-descent",
      "east-link",
      "exit-ramp",
    ]);
    // Flats before ramps: elevationAt takes the FIRST covering rect, so every
    // seam has to be answered by the deck side, not the sloping side.
    const kinds = layout.floorRects.map((f) => f.kind);
    expect(kinds.lastIndexOf("flat")).toBeLessThan(
      kinds.findIndex((k) => k !== "flat")
    );
  });

  it("keeps every deck edge off the tile grid, so the collider can stand there", () => {
    // Tile centres land on quarter-metres; the physics provider probes 0.15 m
    // around the player. A deck edge sitting exactly on a tile centre leaves
    // that row walkable to the terrain and unstandable to the collider, which
    // is how the headless playtest first stalled entering the catwalk.
    const RADIUS = 0.15;
    const offenders: string[] = [];
    for (const tile of walkableBayTiles) {
      if (!inRectClosed(layout.earth, tile.x, tile.z)) continue;
      for (const [dx, dz] of [
        [RADIUS, 0],
        [-RADIUS, 0],
        [0, RADIUS],
        [0, -RADIUS],
      ] as const) {
        if (caveTerrain.blockedAt(tile.x + dx, tile.z + dz)) {
          offenders.push(`(${tile.x},${tile.z}) +(${dx},${dz})`);
        }
      }
    }
    expect(offenders.slice(0, 8)).toEqual([]);
  });

  it("never puts two decks over one point, because the terrain is 2.5D", () => {
    const overlaps: string[] = [];
    for (let i = 0; i < layout.floorRects.length; i++) {
      for (let j = i + 1; j < layout.floorRects.length; j++) {
        const a = layout.floorRects[i]!.rect;
        const b = layout.floorRects[j]!.rect;
        const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const d = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
        if (w > 1e-9 && d > 1e-9) {
          overlaps.push(`${layout.floorRects[i]!.id} over ${layout.floorRects[j]!.id}`);
        }
      }
    }
    expect(overlaps).toEqual([]);
  });

  it("starts the visitor inside the west door, not on the rootbed", () => {
    // The centre tile of this room is the middle of the bed: blocked, and
    // level with the performers. The room has to author its own spawn.
    const spawnOffset = earthRootTerraceSpawnOffset();
    expect(layout.spawn.centre.x).toBeCloseTo(layout.earth.minX + spawnOffset.xMetres, 6);
    expect(layout.spawn.centre.z).toBeCloseTo(layout.earth.minZ + spawnOffset.zMetres, 6);
    expect(inRectClosed(layout.vestibule, layout.spawn.centre.x, layout.spawn.centre.z)).toBe(true);
    expect(caveTerrain.blockedAt(layout.spawn.centre.x, layout.spawn.centre.z)).toBe(false);
    expect(terrain.elevationAt(layout.spawn.centre.x, layout.spawn.centre.z)).toBeCloseTo(DOOR_Y, 5);
    // Facing east, into the room: yaw follows the museum compass, where the
    // look direction is (sin yaw, cos yaw) and 0 is south.
    expect(Math.sin(layout.spawn.yaw)).toBeCloseTo(1, 6);
    expect(spawnOffset.facing).toBe("east");
    // And the compiled grid agrees: the picked room drops the visitor on the
    // same tile the layout names.
    const spawnTile = { x: grid.spawn.x * TILE, z: grid.spawn.y * TILE };
    expect(caveTerrain.blockedAt(spawnTile.x, spawnTile.z)).toBe(false);
  });

  it("keeps the museum datum outside the earth bay", () => {
    const squeeze = wing("cave-squeeze");
    const x = (squeeze.x + squeeze.width / 2) * TILE;
    const z = (squeeze.y + squeeze.height / 2) * TILE;
    expect(caveTerrain.elevationAt(x, z)).toBe(0);
  });

  it("holds both doors on the datum and climbs the entry ramp east to the overlook", () => {
    const west = centre(layout.vestibule);
    expect(terrain.elevationAt(layout.earth.minX + 0.3, west.z)).toBeCloseTo(DOOR_Y, 5);
    const rampZ = centre(layout.entryRamp).z;
    expect(terrain.elevationAt(layout.entryRamp.minX, rampZ)).toBeCloseTo(DOOR_Y, 5);
    expect(terrain.elevationAt(centre(layout.entryRamp).x, rampZ)).toBeCloseTo(OVERLOOK_Y / 2, 5);
    expect(terrain.elevationAt(layout.entryRamp.maxX, rampZ)).toBeCloseTo(OVERLOOK_Y, 5);
    // The ramp only ever climbs, west → east.
    let previous = DOOR_Y - 1e-9;
    for (let x = layout.entryRamp.minX; x <= layout.entryRamp.maxX; x += 0.25) {
      const here = terrain.elevationAt(x, rampZ);
      expect(here).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = here;
    }
    const south = centre(layout.doorApproach);
    expect(terrain.elevationAt(south.x, layout.earth.maxZ - 0.01)).toBeCloseTo(DOOR_Y, 5);
  });

  it("falls from the same vestibule to the catwalk, so the overlook is a spur", () => {
    const galleryZ = centre(layout.gallery).z;
    expect(terrain.elevationAt(layout.galleryDescent.minX, galleryZ)).toBeCloseTo(DOOR_Y, 5);
    expect(terrain.elevationAt(layout.galleryDescent.maxX, galleryZ)).toBeCloseTo(GALLERY_Y, 5);
    // The descent only ever falls, west → east.
    let previous = DOOR_Y + 1e-9;
    for (let x = layout.galleryDescent.minX; x <= layout.galleryDescent.maxX; x += 0.25) {
      const here = terrain.elevationAt(x, galleryZ);
      expect(here).toBeLessThanOrEqual(previous + 1e-9);
      previous = here;
    }
    // Both lanes leave the vestibule's east face, and the rock between them is
    // wide enough that no walkable tile of one ever neighbours the other.
    expect(layout.entryRamp.minX).toBeCloseTo(layout.vestibule.maxX, 6);
    expect(layout.galleryDescent.minX).toBeCloseTo(layout.vestibule.maxX, 6);
    const nearestDeckZ = Math.min(...layout.alcoves.map((a) => a.minZ), layout.gallery.minZ);
    expect(nearestDeckZ - layout.entryRamp.maxZ).toBeGreaterThanOrEqual(1.0);
    // The overlook is a dead end: nothing east of it is walkable.
    expect(caveTerrain.blockedAt(layout.overlook.maxX + 0.5, centre(layout.overlook).z)).toBe(true);
  });

  it("holds the catwalk and its alcoves on one datum, walkable end to end", () => {
    const z = centre(layout.gallery).z;
    for (let x = layout.gallery.minX; x <= layout.gallery.maxX; x += 0.5) {
      expect(terrain.elevationAt(x, z), `gallery x=${x}`).toBeCloseTo(GALLERY_Y, 5);
      expect(caveTerrain.blockedAt(x, z)).toBe(false);
    }
    expect(layout.alcoves).toHaveLength(3);
    layout.alcoves.forEach((alcove, index) => {
      const c = centre(alcove);
      expect(terrain.elevationAt(c.x, c.z), `alcove ${index}`).toBeCloseTo(GALLERY_Y, 5);
      expect(caveTerrain.blockedAt(c.x, c.z)).toBe(false);
      // Level with the catwalk, and bumping NORTH off it, away from the bed.
      expect(alcove.maxZ).toBeCloseTo(layout.gallery.minZ, 6);
      // Wide enough for someone to step out of the walking line.
      expect(alcove.maxX - alcove.minX).toBeGreaterThanOrEqual(2.0);
    });
  });

  it("falls the east channel from the catwalk to the landing and out the door", () => {
    const landing = centre(layout.landing);
    expect(terrain.elevationAt(landing.x, landing.z)).toBeCloseTo(LANDING_Y, 5);
    expect(terrain.elevationAt(landing.x, layout.eastLink.minZ)).toBeCloseTo(GALLERY_Y, 5);
    expect(terrain.elevationAt(landing.x, layout.exitRamp.maxZ)).toBeCloseTo(DOOR_Y, 5);
    // The channel falls to the landing, then climbs back to the door datum:
    // the landing is the low point of the whole route.
    let previous = GALLERY_Y + 1e-9;
    for (let z = layout.eastLink.minZ; z <= layout.landing.maxZ; z += 0.25) {
      const here = terrain.elevationAt(landing.x, z);
      expect(here).toBeLessThanOrEqual(previous + 1e-9);
      previous = here;
    }
    previous = LANDING_Y - 1e-9;
    for (let z = layout.landing.maxZ; z <= layout.doorApproach.maxZ; z += 0.25) {
      const here = terrain.elevationAt(landing.x, z);
      expect(here).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = here;
    }
    for (const floor of layout.floorRects) {
      expect(floor.fromY, `${floor.id} floor`).toBeGreaterThanOrEqual(LANDING_Y - 1e-9);
      expect(floor.toY, `${floor.id} floor`).toBeGreaterThanOrEqual(LANDING_Y - 1e-9);
    }
  });

  it("blocks the bed and the cleft everywhere they are not under a deck", () => {
    // The catwalk and its alcoves are cantilevered OVER the bed rect, and the
    // terrain is 2.5D: one height per point, so those points answer as the
    // deck. Everywhere else inside the bed there is no way down onto it.
    const offenders: string[] = [];
    let cantilevered = 0;
    for (const rect of [layout.bed, layout.cleft]) {
      for (let x = rect.minX + 0.3; x <= rect.maxX - 0.3; x += 0.25) {
        for (let z = rect.minZ + 0.3; z <= rect.maxZ - 0.3; z += 0.25) {
          if (ribbonElevationAt(layout, x, z) !== null) {
            cantilevered++;
            continue;
          }
          if (!caveTerrain.blockedAt(x, z)) offenders.push(`${x.toFixed(2)},${z.toFixed(2)}`);
        }
      }
    }
    expect(offenders.slice(0, 8)).toEqual([]);
    expect(cantilevered).toBeGreaterThan(0);
    // Every deck that hangs over the bed clears it by at least a chest height,
    // so a visitor on it is looking down on the performers, never across.
    for (const floor of layout.floorRects) {
      const c = centre(floor.rect);
      if (!inRectClosed(layout.bed, c.x, c.z)) continue;
      expect(terrain.elevationAt(c.x, c.z) - BED_Y, `${floor.id} over the bed`).toBeGreaterThanOrEqual(1.2);
    }
    for (const station of layout.stations) {
      expect(caveTerrain.blockedAt(station.centre.x, station.centre.z)).toBe(true);
      expect(terrain.elevationAt(station.centre.x, station.centre.z)).toBeCloseTo(BED_Y, 5);
    }
    const cleft = centre(layout.cleft);
    expect(terrain.elevationAt(cleft.x, cleft.z)).toBeLessThan(BED_Y);
  });

  it("blocks the rock beside the ribbon, so the bed rail is the only edge", () => {
    // North of the overlook (the rock behind the rail wall), south of the
    // vestibule, and the room's south-west corner beyond the bed.
    const z0 = layout.earth.minZ + 0.5;
    expect(caveTerrain.blockedAt(centre(layout.overlook).x, z0)).toBe(true);
    expect(caveTerrain.blockedAt(centre(layout.vestibule).x, layout.earth.maxZ - 0.5)).toBe(true);
    expect(caveTerrain.blockedAt(layout.bed.minX - 1, layout.bed.maxZ + 1)).toBe(true);
    expect(ribbonElevationAt(layout, layout.bed.minX - 1, layout.bed.maxZ + 1)).toBeNull();
  });

  it("keeps every deck above the bed, with the eye above the prop line", () => {
    // The regrade spends height to get close, so this is no longer "a storey
    // above" — it is the invariant that actually has to hold: the visitor
    // never stands on the performers' floor, and always looks DOWN onto the
    // circle a prop travels, never across it into their own eyeline.
    for (const floor of layout.floorRects) {
      const c = centre(floor.rect);
      const deck = terrain.elevationAt(c.x, c.z);
      expect(deck - BED_Y, `${floor.id} deck above the bed`).toBeGreaterThanOrEqual(1.2);
      expect(
        deck + EYE_ABOVE_FLOOR - (BED_Y + PROP_CENTRE_ABOVE_FEET),
        `${floor.id} eye above the prop line`
      ).toBeGreaterThanOrEqual(1.4);
    }
    expect(OVERLOOK_Y - BED_Y).toBeCloseTo(4.2, 5);
    expect(GALLERY_Y - BED_Y).toBeCloseTo(1.4, 5);
  });

  it("stages performers on exactly the layout's station anchors", () => {
    const performers = grid.performers.filter((p) => p.id.startsWith("cave-earth-"));
    expect(performers).toHaveLength(3);
    for (const station of layout.stations) {
      const performer = performers.find((p) => p.id === station.performerId);
      expect(performer, station.performerId).toBeTruthy();
      // Tile-snapped by the grid builder: within half a tile of the anchor.
      expect(Math.abs(performer!.tileX * TILE - station.centre.x)).toBeLessThanOrEqual(0.26);
      expect(Math.abs(performer!.tileY * TILE - station.centre.z)).toBeLessThanOrEqual(0.26);
      expect(performer!.elevation).toBeCloseTo(BED_Y, 5);
      expect(performer!.sequenceId).toBe(station.sequenceId);
    }
  });

  it("derives the station anchors from the one shared expression", () => {
    const offsets = earthRootTerraceStationOffsets();
    expect(offsets).toHaveLength(3);
    layout.stations.forEach((station, index) => {
      expect(station.centre.x).toBeCloseTo(layout.earth.minX + offsets[index]!.xMetres, 6);
      expect(station.centre.z).toBeCloseTo(layout.earth.minZ + offsets[index]!.zMetres, 6);
    });
    // One row: every case on the same z, in G/H/I order west → east.
    const zs = new Set(layout.stations.map((s) => s.centre.z.toFixed(3)));
    expect(zs.size).toBe(1);
    expect(layout.stations[0]!.centre.x).toBeLessThan(layout.stations[1]!.centre.x);
    expect(layout.stations[1]!.centre.x).toBeLessThan(layout.stations[2]!.centre.x);
  });

  it("shows the whole bed from the overlook without looking straight down it", () => {
    // The old terrace read every case at 36° or steeper, which is what made
    // the room a diorama: you looked at the tops of three heads. The overlook
    // trades 1 m of height for that angle. It is still a vista, not a close
    // read — the close read is the catwalk, and it is proved in
    // earth-root-terrace-sightlines.test.ts.
    const eyeY = OVERLOOK_Y + EYE_ABOVE_FLOOR;
    const eye = { x: layout.overlook.minX + 1.0, z: layout.overlook.maxZ - 0.5 };
    expect(inRectClosed(layout.overlook, eye.x, eye.z)).toBe(true);
    for (const station of layout.stations) {
      const run = Math.hypot(station.centre.x - eye.x, station.centre.z - eye.z);
      const drop = eyeY - (BED_Y + PROP_CENTRE_ABOVE_FEET);
      const depression = (Math.atan2(drop, run) * 180) / Math.PI;
      expect(depression, station.letter).toBeLessThan(35);
      expect(depression, station.letter).toBeGreaterThan(10);
    }
  });

  it("aligns all three cases on one axis from the ensemble landing", () => {
    const { eye, eyeY } = layout.ensemble;
    expect(inRectClosed(layout.landing, eye.x, eye.z)).toBe(true);
    expect(caveTerrain.blockedAt(eye.x, eye.z)).toBe(false);
    expect(eyeY).toBeCloseTo(LANDING_Y + EYE_ABOVE_FLOOR, 5);
    const bearings = layout.stations.map((s) => Math.atan2(s.centre.z - eye.z, s.centre.x - eye.x));
    for (const bearing of bearings) expect(Math.abs(bearing - bearings[0]!)).toBeLessThan(1e-6);
    const targetY = BED_Y + PROP_CENTRE_ABOVE_FEET;
    const depressions = layout.stations.map((s) => {
      const run = Math.hypot(s.centre.x - eye.x, s.centre.z - eye.z);
      return (Math.atan2(eyeY - targetY, run) * 180) / Math.PI;
    });
    // Nearest case steepest, farthest shallowest. Dropping the landing below
    // the datum flattened this axis from a 12°-to-47° spread to one a normal
    // lens holds end to end, which is what makes the three read as one shape
    // at three scales rather than as a near figure and two distant ones.
    expect(depressions[2]).toBeGreaterThan(depressions[1]!);
    expect(depressions[1]).toBeGreaterThan(depressions[0]!);
    expect(depressions[0]).toBeGreaterThan(3);
    expect(depressions[2]! - depressions[0]!).toBeLessThan(25);
  });

  it("covers every walkable earth-bay tile with a rendered floor rect", () => {
    expect(walkableBayTiles.length).toBeGreaterThan(300);
    const uncovered = walkableBayTiles.filter(
      (t) =>
        inRectClosed(layout.earth, t.x, t.z) &&
        !layout.floorRects.some((f) => inRectClosed(f.rect, t.x, t.z))
    );
    expect(
      uncovered.slice(0, 10).map((t) => `${t.x},${t.z}`),
      `${uncovered.length} walkable tiles have no rendered floor under them`
    ).toEqual([]);
  });

  it("never steps more than 0.6 m between neighbouring walkable tiles", () => {
    const walkable = new Set(walkableBayTiles.map((t) => `${t.tx},${t.ty}`));
    const offenders: string[] = [];
    for (const tile of walkableBayTiles) {
      const here = caveTerrain.elevationAt(tile.x, tile.z);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = tile.tx + dx;
        const ny = tile.ty + dy;
        if (!walkable.has(`${nx},${ny}`)) continue;
        const there = caveTerrain.elevationAt(nx * TILE, ny * TILE);
        if (Math.abs(there - here) > 0.6) {
          offenders.push(
            `(${tile.x},${tile.z})=${here.toFixed(2)} -> (${nx * TILE},${ny * TILE})=${there.toFixed(2)}`
          );
        }
      }
    }
    expect(offenders.slice(0, 6)).toEqual([]);
  });

  it("keeps both door tiles walkable and level with the room beyond them", () => {
    const b = wing("cave-earth");
    const doors: { tx: number; ty: number }[] = [];
    for (let ty = b.y; ty < b.y + b.height; ty++) {
      for (let tx = b.x; tx < b.x + b.width; tx++) {
        if (grid.tiles.get(tileKey(tx, ty))?.type === "door") doors.push({ tx, ty });
      }
    }
    expect(doors.length).toBeGreaterThanOrEqual(4);
    for (const door of doors) {
      expect(isWalkable(door.tx, door.ty), `${door.tx},${door.ty}`).toBe(true);
      expect(caveTerrain.elevationAt(door.tx * TILE, door.ty * TILE)).toBeCloseTo(DOOR_Y, 5);
    }
  });

  it("answers off the ribbon without throwing, at the datum", () => {
    expect(terrain.elevationAt(layout.earth.minX - 40, layout.earth.minZ - 40)).toBe(DOOR_Y);
    expect(terrain.blockedAt(layout.earth.minX - 40, layout.earth.minZ - 40)).toBe(false);
  });

  it("keeps every walkable tile rendered when cave-earth joins the suppressed set", () => {
    const suppressed = grid.wings.filter((w) => w.roomPresentation?.suppressTileGeometry);
    expect(suppressed.map((w) => w.id)).toContain("cave-earth");
    expect(suppressed.length).toBeGreaterThanOrEqual(3);

    const buckets = bucketMuseumTilesByRoom(grid);
    const rendered = new Set<string>();
    const collect = (dry: {
      floorBuckets: Map<string, { positions: { x: number; z: number }[] }>;
    }) => {
      for (const bucket of dry.floorBuckets.values()) {
        for (const position of bucket.positions) {
          rendered.add(`${position.x.toFixed(3)},${position.z.toFixed(3)}`);
        }
      }
    };
    collect(buckets.corridorBucket);
    for (const dry of buckets.roomBuckets.values()) collect(dry);

    const authored = [
      ...buildDrownedGalleryLayout(grid)!.floorRects,
      ...buildFirstFireProcessionBay(grid)!.floorRects,
      ...layout.floorRects,
    ];
    const insideSuppressedWing = (tx: number, ty: number) =>
      suppressed.some(
        (w) =>
          tx >= w.bounds.x &&
          tx < w.bounds.x + w.bounds.width &&
          ty >= w.bounds.y &&
          ty < w.bounds.y + w.bounds.height
      );

    const orphans: string[] = [];
    for (const key of grid.tiles.keys()) {
      const [tx, ty] = key.split(",").map(Number);
      if (!isWalkable(tx!, ty!)) continue;
      if (insideSuppressedWing(tx!, ty!)) continue;
      const x = tx! * TILE;
      const z = ty! * TILE;
      if (rendered.has(`${x.toFixed(3)},${z.toFixed(3)}`)) continue;
      if (authored.some((f) => inRectClosed(f.rect, x, z))) continue;
      orphans.push(`${tx},${ty}`);
    }
    expect(
      orphans.slice(0, 10),
      `${orphans.length} walkable tiles outside the suppressed wings render no floor`
    ).toEqual([]);
  });
});
