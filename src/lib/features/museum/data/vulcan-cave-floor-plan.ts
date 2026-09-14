import type { GridConfig, RoomEdge, RoomNode } from "../domain/layout-types";
import type {
  MuseumFloorPlanPoint,
  MuseumFloorPlanZone,
  MuseumFloorPlanZoneTone,
} from "../domain/museum-floor-plan-types";
import { tileKey } from "../domain/museum-grid-types";
import type {
  MuseumGrid,
  MuseumTerrainProgram,
} from "../domain/museum-grid-types";
import type { WallDefinition } from "../domain/wall-segment-types";
import { computeRoomDimensions } from "../domain/wall-segment-types";
import { buildMuseumGrid } from "../services/museum-grid-builder";
import type { MuseumGridBuildResult } from "../services/types";
import {
  ALCOVE_X_FRACTIONS,
  ALCOVE_Z_OFFSET_M,
  SHELF_Y,
  TILE_METRES,
  createDrownedGalleryTerrain,
  tileCentredOffset,
} from "./drowned-gallery-terrain";
import {
  buildDrownedGalleryLayout,
  inRectClosed,
  type WorldRect,
} from "./drowned-gallery-terrain";
import {
  buildSundialLayout,
  createSundialTerrain,
  sunChamberCentreMetres,
  SUN_PILLAR_RADIUS_M,
  SUN_PILLAR_TOP_Y,
} from "./sundial-layout";
import {
  buildFirstFireProcessionBay,
  createFirstFireProcessionTerrain,
  CINDER_FLOOR_Y,
} from "./first-fire-procession-terrain";
import {
  buildFirstFireProcessionPlan,
  FIRST_FIRE_PROCESSION_AUTHORING_MINIMUM,
  FIRST_FIRE_SHRINE_ORDER,
} from "./first-fire-procession-plan";
import {
  buildEarthRootTerraceLayout,
  createEarthRootTerraceTerrain,
  earthRootTerraceStationOffsets,
  earthRootTerraceSpawnOffset,
  BED_Y as EARTH_BED_Y,
} from "./earth-root-terrace-terrain";
import {
  buildAirChimneyLayout,
  createAirChimneyTerrain,
  airLedgeStationOffsets,
} from "./air-chimney-layout";
import {
  buildMoonLayout,
  createMoonTerrain,
  moonCentreMetres,
  MOON_MOUND_TOP_Y,
  MOON_STATIONS,
} from "./moon-layout";
import { CAVE_THRESHOLD_ROOM } from "./lobby-floor-plan";
import { VULCAN_CAVE_WINGS } from "./wing-declarations/vulcan-cave-wings";

type WallName = "north" | "south" | "east" | "west";

export interface CaveModeRoom {
  roomId: string;
  label: string;
  category: "SS" | "SO" | "TS" | "TO" | "QS" | "QO";
  technicalMode: string;
  /** Every performer the chamber stages. The Water grotto stages three. */
  performerIds: readonly string[];
  /** One authored sequence per performer, in the same order. */
  sequenceIds: readonly string[];
  tone: MuseumFloorPlanZoneTone;
}

/**
 * Dev-facing flavor that stays with the cave floor plan rather than the
 * era-agnostic declarations: the elemental shorthand label and the zone tone.
 */
const WING_ROOM_META: Record<
  string,
  { label: string; tone: MuseumFloorPlanZoneTone }
> = {
  "cave-water": { label: "Water", tone: "arrival" },
  "cave-fire": { label: "Fire", tone: "retail" },
  "cave-earth": { label: "Earth", tone: "social" },
  "cave-air": { label: "Air", tone: "service" },
  "cave-sun": { label: "Sun", tone: "anchor" },
  "cave-moon": { label: "Moon", tone: "exhibit" },
};

/**
 * Derived from the wing declarations (the single source since 2026-08-12) —
 * do not hand-edit mode data here. Ordering follows the declarations' walk
 * order. Note the Moon wing has three cases, not four: MPMP, NQNQ and OROR
 * are the Quarter-Opposite pairs that close across M–R (PM = MP collapse);
 * the fourth compass point is the arrival hole.
 */
export const CAVE_MODE_ROOMS: readonly CaveModeRoom[] = VULCAN_CAVE_WINGS.map(
  (wing) => {
    const meta = WING_ROOM_META[wing.roomId];
    if (!meta) {
      throw new Error(`No cave room meta for wing room ${wing.roomId}`);
    }
    return {
      roomId: wing.roomId,
      label: meta.label,
      category: wing.mode.category,
      technicalMode: wing.mode.technicalMode,
      performerIds: wing.beats[2].cases.map(
        (exhibitCase) => exhibitCase.showcaseStationRef
      ),
      sequenceIds: wing.beats[2].cases.map(
        (exhibitCase) => exhibitCase.sequenceKey
      ),
      tone: meta.tone,
    };
  }
);

export const CAVE_SPACE_ORDER = [
  "cave-threshold",
  "cave-squeeze",
  "cave-water-approach",
  "cave-water-gallery",
  "cave-water",
  "cave-fire",
  "cave-earth",
  "cave-air",
  "cave-sun",
  "cave-moon",
  "egypt-threshold",
] as const;

const LOBBY_TO_CAVE_EDGE_ID = "lobby->cave-threshold";

const EDGE_IDS = {
  thresholdToSqueeze: "cave-threshold->cave-squeeze",
  squeezeToApproach: "cave-squeeze->cave-water-approach",
  approachToGallery: "cave-water-approach->cave-water-gallery",
  galleryToGrotto: "cave-water-gallery->cave-water",
  waterToFire: "cave-water->cave-fire",
  fireToEarth: "cave-fire->cave-earth",
  earthToAir: "cave-earth->cave-air",
  airToSun: "cave-air->cave-sun",
  sunToMoon: "cave-sun->cave-moon",
  moonToEgypt: "cave-moon->egypt-threshold",
} as const;

const EMPTY_WALL: WallDefinition = { segments: [], minMargin: 1 };

function doorWall(
  edgeId: string,
  alignment: NonNullable<WallDefinition["alignment"]>,
  width = 4
): WallDefinition {
  return {
    segments: [{ type: "door", edgeId, width }],
    minMargin: 1,
    alignment,
  };
}

/**
 * Door wall with no extra margin beyond the two corner tiles. The stamper
 * already reserves both corners, so minMargin 0 is safe — it just lets a
 * passage be as narrow as its door, and lets a door sit flush against a
 * corner (the flooded gallery's south door hugs its east wall, which is what
 * turns its path into an S rather than a U).
 */
function narrowDoorWall(
  edgeId: string,
  alignment: NonNullable<WallDefinition["alignment"]>,
  width = 3
): WallDefinition {
  return {
    segments: [{ type: "door", edgeId, width }],
    minMargin: 0,
    alignment,
  };
}

function torchWall(
  alignment: NonNullable<WallDefinition["alignment"]> = "center"
): WallDefinition {
  return {
    segments: [{ type: "torch" }],
    minMargin: 1,
    alignment,
  };
}

/**
 * The Water grotto's authored shell. Declared before VULCAN_CAVE_ROOMS so the
 * performer stations can be derived from the SAME compiled dimensions the
 * layout engine will use — see grottoPerformers below.
 */
const GROTTO_MIN_INTERIOR_WIDTH = 33;
const GROTTO_MIN_INTERIOR_HEIGHT = 29;

const grottoWalls = {
  north: torchWall("center"),
  south: doorWall(EDGE_IDS.galleryToGrotto, "center", 6),
  east: doorWall(EDGE_IDS.waterToFire, "end"),
  west: EMPTY_WALL,
} satisfies Record<WallName, WallDefinition>;

const grottoDimensions = computeRoomDimensions({
  walls: grottoWalls,
  minInteriorWidth: GROTTO_MIN_INTERIOR_WIDTH,
  minInteriorHeight: GROTTO_MIN_INTERIOR_HEIGHT,
});

/**
 * Converts "n metres from the interior's minimum edge" into the centre-relative
 * fraction `placePerformers` expects, landing on the very tile the layout
 * module's alcove anchor names — `tileCentredOffset` is the shared expression
 * that decides which tile that is. The +0.5 keeps
 * `Math.floor(offset * interior)` exact for negative offsets instead of riding
 * a floating-point boundary.
 */
function interiorOffsetFraction(
  metresFromInteriorMin: number,
  roomSpanTiles: number,
  interiorSpanTiles: number
): number {
  const centred = tileCentredOffset(metresFromInteriorMin);
  const targetTile = 1 + Math.round((centred - TILE_METRES / 2) / TILE_METRES);
  const centreTile = Math.floor(roomSpanTiles / 2);
  return (targetTile - centreTile + 0.5) / interiorSpanTiles;
}

/**
 * A, B and C stand on the alcove shelves. Their anchors come off ONE
 * expression shared with the terrain module (ALCOVE_X_FRACTIONS /
 * ALCOVE_Z_OFFSET_M / SHELF_Y), so a performer can never drift off the shelf
 * the graybox renders under it.
 */
const grottoPerformers = ALCOVE_X_FRACTIONS.map((fraction, index) => ({
  offsetX: interiorOffsetFraction(
    fraction * (grottoDimensions.w - 2) * TILE_METRES,
    grottoDimensions.w,
    grottoDimensions.w - 2
  ),
  offsetY: interiorOffsetFraction(
    ALCOVE_Z_OFFSET_M,
    grottoDimensions.h,
    grottoDimensions.h - 2
  ),
  facing: "south" as const,
  refId: `cave-water-${["a", "b", "c"][index]}`,
  collisionRadiusTiles: 2,
  elevation: SHELF_Y,
}));

/**
 * The First Fire chamber's authored shell. Declared before VULCAN_CAVE_ROOMS
 * for the same reason the grotto's is: the three shrine stations come off
 * the SAME compiled dimensions the layout engine uses, so a performer cannot
 * drift off the court carved around it.
 *
 * The room is sized by the Cinder Court procession plan's authoring minimum
 * (77 × 59 tiles → 58 × 44.5 m interior): a 58 × 44 m S-route of corridors
 * and three rock-isolated shrine courts, with the extra half metre of depth
 * split as margin either side.
 */
const FIRE_MIN_INTERIOR_WIDTH = FIRST_FIRE_PROCESSION_AUTHORING_MINIMUM.width;
const FIRE_MIN_INTERIOR_HEIGHT = FIRST_FIRE_PROCESSION_AUTHORING_MINIMUM.height;

/**
 * Wall tiles kept between the Earth door and the south corner of the east
 * wall. Wall content is scaled by ROOM_SCALE when it sizes the room, so the
 * gap is declared as the trailing margin of an "end"-aligned wall rather
 * than as the leading offset: 17 tiles after the 4-tile door leaves the door
 * on wing rows 70..73 (world z 34.75..36.75), inside the nominal plan's
 * (depth - 12 .. depth - 8) window, and 2 + 4 + 17 tiles stays under the
 * 59-tile interior minimum so the room keeps its authored size.
 */
const FIRE_EAST_DOOR_SOUTH_GAP_TILES = 17;

const fireWalls = {
  north: torchWall("start"),
  south: EMPTY_WALL,
  // The Earth door sits three quarters of the way down the east wall, where
  // the plan's green growth path leaves the FL court. A gap holds it off the
  // south corner so the growth carve keeps its rock margin to the outdoors
  // (the amphitheatre-era "end" alignment put it 2 m from the corner).
  east: {
    segments: [
      { type: "door", edgeId: EDGE_IDS.fireToEarth, width: 4 },
      { type: "gap", minTiles: FIRE_EAST_DOOR_SOUTH_GAP_TILES },
    ],
    minMargin: 1,
    alignment: "end",
  },
  west: doorWall(EDGE_IDS.waterToFire, "center"),
} satisfies Record<WallName, WallDefinition>;

const fireDimensions = computeRoomDimensions({
  walls: fireWalls,
  minInteriorWidth: FIRE_MIN_INTERIOR_WIDTH,
  minInteriorHeight: FIRE_MIN_INTERIOR_HEIGHT,
});

/**
 * The procession plan laid out on the compiled interior, origin at the
 * room's NW corner. Door spans only need to satisfy the plan's fit check
 * here; the live plan (buildFirstFireProcessionPlanForGrid) re-reads them
 * from the stamped door tiles, and the shrine centres depend only on the
 * room frame.
 */
const fireInteriorMetres = {
  width: (fireDimensions.w - 2) * TILE_METRES,
  depth: (fireDimensions.h - 2) * TILE_METRES,
};
const fireAuthoringPlan = buildFirstFireProcessionPlan({
  room: { minX: 0, maxX: fireInteriorMetres.width, minZ: 0, maxZ: fireInteriorMetres.depth },
  westDoor: { min: fireInteriorMetres.depth / 2 - 2, max: fireInteriorMetres.depth / 2 + 2 },
  eastDoor: { min: fireInteriorMetres.depth - 12, max: fireInteriorMetres.depth - 8 },
});

/** The shrine performer faces the mouth the visitor arrives through. */
function shrineFacing(shrine: { centre: { x: number; z: number }; entry: { x: number; z: number } }) {
  const dx = shrine.entry.x - shrine.centre.x;
  const dz = shrine.entry.z - shrine.centre.z;
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? ("east" as const) : ("west" as const);
  return dz >= 0 ? ("south" as const) : ("north" as const);
}

const firePerformers = FIRST_FIRE_SHRINE_ORDER.map((shrineId) => {
  const shrine = fireAuthoringPlan.shrines.find((candidate) => candidate.id === shrineId)!;
  return {
    offsetX: interiorOffsetFraction(
      shrine.centre.x,
      fireDimensions.w,
      fireDimensions.w - 2
    ),
    offsetY: interiorOffsetFraction(
      shrine.centre.z,
      fireDimensions.h,
      fireDimensions.h - 2
    ),
    facing: shrineFacing(shrine),
    refId: `cave-fire-automaton-${shrineId}`,
    collisionRadiusTiles: 2,
    elevation: CINDER_FLOOR_Y,
  };
});

/**
 * The Earth wing's authored shell (the Root Terrace), declared before
 * VULCAN_CAVE_ROOMS for the same reason Water's and Fire's are: the three
 * case stations come off the SAME compiled dimensions the layout engine uses.
 *
 * Interior metres = ceil(minInterior × 1.5) × 0.5, so 45 × 32 compiles to
 * 34 × 24 m: a 6 m vestibule, a 10 m ramp and an 18 m terrace along the north
 * wall, the rootbed 5.2 m below the terrace, and the east descent to Air.
 */
// Interior metres = ceil(minInterior × 1.5) × 0.5, the same compile the Earth
// note above describes. 23 × 27 gives 17.5 × 20.5 m.
//
// These were 34 × 48, chosen for the prototype's 18 m ramp run and carrying a
// comment that read them as tiles (17 × 24 m). They are not tiles — the real
// compile was 25.5 × 36 m, which is why the shaft looked lost in the room and
// why the performer ledges sat 11 m from the column. With the ramp gone the
// footprint should be the wing's smallest, per the pacing thesis: Air is the
// narrowest plan and the tallest space.
const AIR_MIN_INTERIOR_WIDTH = 23;
const AIR_MIN_INTERIOR_HEIGHT = 27;

const EARTH_MIN_INTERIOR_WIDTH = 45;
const EARTH_MIN_INTERIOR_HEIGHT = 32;

const earthWalls = {
  // The terrace runs along the north wall; the carved shell is that wall.
  // The compiled wall stays for collision and the room suppresses its tiles.
  north: EMPTY_WALL,
  // The Air door sits at the east end of the south wall, at the foot of the
  // descent that comes down the east wall from the terrace.
  south: doorWall(EDGE_IDS.earthToAir, "end"),
  east: torchWall("start"),
  west: doorWall(EDGE_IDS.fireToEarth, "center"),
} satisfies Record<WallName, WallDefinition>;

const earthDimensions = computeRoomDimensions({
  walls: earthWalls,
  minInteriorWidth: EARTH_MIN_INTERIOR_WIDTH,
  minInteriorHeight: EARTH_MIN_INTERIOR_HEIGHT,
});

const EARTH_STATION_SUFFIXES = ["g", "h", "i"] as const;

const earthPerformers = earthRootTerraceStationOffsets().map((offset, index) => ({
  offsetX: interiorOffsetFraction(
    offset.xMetres,
    earthDimensions.w,
    earthDimensions.w - 2
  ),
  offsetY: interiorOffsetFraction(
    offset.zMetres,
    earthDimensions.h,
    earthDimensions.h - 2
  ),
  // Up toward the catwalk rail, where the visitor works their console 1.4 m
  // above them, and on past it to the overlook.
  facing: "north" as const,
  refId: `cave-earth-automaton-${EARTH_STATION_SUFFIXES[index]}`,
  collisionRadiusTiles: 2,
  elevation: EARTH_BED_Y,
}));

const airWalls = {
  north: doorWall(EDGE_IDS.earthToAir, "start"),
  south: doorWall(EDGE_IDS.airToSun, "end", 3),
  east: torchWall("start"),
  west: EMPTY_WALL,
} satisfies Record<WallName, WallDefinition>;

const airDimensions = computeRoomDimensions({
  walls: airWalls,
  minInteriorWidth: AIR_MIN_INTERIOR_WIDTH,
  minInteriorHeight: AIR_MIN_INTERIOR_HEIGHT,
});

/** Fire's three pairs, met again — DJ, EK, FL — now one per ledge, low → high. */
const AIR_STATION_SUFFIXES = ["dj", "ek", "fl"] as const;

const airPerformers = airLedgeStationOffsets(
  (airDimensions.w - 2) * TILE_METRES
).map((offset, index) => ({
  offsetX: interiorOffsetFraction(
    offset.xMetres,
    airDimensions.w,
    airDimensions.w - 2
  ),
  offsetY: interiorOffsetFraction(
    offset.zMetres,
    airDimensions.h,
    airDimensions.h - 2
  ),
  // Each ledge faces the shaft the visitor rises through.
  facing: offset.facing,
  refId: `cave-air-automaton-${AIR_STATION_SUFFIXES[index]}`,
  // No collision radius on purpose: these stations are 2.4–7.6 m overhead and
  // unreachable by design, and the collider is 2D — one here would plant an
  // invisible pillar in the open floor the room depends on being open.
  elevation: offset.y,
}));

// Interior metres = ceil(minInterior * 1.5) * 0.5, NOT tiles. 43 -> 32.5 m and
// 46 -> 34.5 m, which carries the 24 m round chamber plus the 10 m north light
// crack. Verified against the compiled grid, not assumed: at 45 (34.0 m) the
// chamber's south edge landed 0.25 m inside the south wall, because the centre
// sits on a tile CENTRE and so is a quarter-metre south of 10 + 12.
const SUN_MIN_INTERIOR_WIDTH = 43;
const SUN_MIN_INTERIOR_HEIGHT = 46;

const sunWalls = {
  north: doorWall(EDGE_IDS.airToSun, "start", 3),
  south: torchWall("end"),
  // RETAINED DELIBERATELY, and slated for deletion. The design has the visitor
  // leave the Sundial UP — the ground rises at the eye, a hatch opens, and they
  // surface on the Moon — which makes this door redundant. But it is currently
  // the ONLY route to Moon: buildCirculation resolves the sunToMoon edge to a
  // real door tile and throws without one. Removing it before the eye lift
  // exists strands the last room in the wing. Delete it in the same change that
  // lands the lift, not before.
  east: doorWall(EDGE_IDS.sunToMoon, "end"),
  west: EMPTY_WALL,
} satisfies Record<WallName, WallDefinition>;

// ── The Sundial's four Quarter-Same stations ────────────────────────────────
//
// The chamber is NOT centred in the bay. The northern 10 m of the 34 m interior
// is the rising light crack, so the ⌀24 m chamber occupies the southern 24 m and
// its centre sits 22 m from the interior's north edge — 5 m south of the room's
// own centre. Placing the pillars on the room centre would put the whole exhibit
// off-axis from the sun mapping, which is polar about the CHAMBER centre.
//
// Station assignment note (updated 2026-08-11): after the canonical
// retranscription all four Sun sequences (SSSS/TTTT/UUUU/VVVV) start and end
// on gamma11 per the l1-tnd-motions catalog, so the old gamma3-vs-gamma11
// rationale for the axis split no longer holds. The current layout (U/V one
// axis, S/T the cross axis) is retained as authored; re-derive or reconfirm
// the axis assignment at Sun's Gate 1 board.
const sunDimensions = computeRoomDimensions({
  walls: sunWalls,
  minInteriorWidth: SUN_MIN_INTERIOR_WIDTH,
  minInteriorHeight: SUN_MIN_INTERIOR_HEIGHT,
});

// The centre comes from `sundial-layout.ts`, which is also what the terrain and
// the graybox measure every polar quantity from. Deriving a second one here is
// how the pillars and the sun mapping end up on different axes.
const { xMetres: SUN_CHAMBER_CENTRE_X_M, zMetres: SUN_CHAMBER_CENTRE_Z_M } =
  sunChamberCentreMetres(sunDimensions.w);

/** North, east, south, west — each faced inward at the visitor. */
const SUN_STATIONS = [
  { suffix: "u", dx: 0, dz: -SUN_PILLAR_RADIUS_M, facing: "south" },
  { suffix: "s", dx: SUN_PILLAR_RADIUS_M, dz: 0, facing: "west" },
  { suffix: "v", dx: 0, dz: SUN_PILLAR_RADIUS_M, facing: "north" },
  { suffix: "t", dx: -SUN_PILLAR_RADIUS_M, dz: 0, facing: "east" },
] as const;

const sunPerformers = SUN_STATIONS.map((station) => ({
  offsetX: interiorOffsetFraction(
    SUN_CHAMBER_CENTRE_X_M + station.dx,
    sunDimensions.w,
    sunDimensions.w - 2
  ),
  offsetY: interiorOffsetFraction(
    SUN_CHAMBER_CENTRE_Z_M + station.dz,
    sunDimensions.h,
    sunDimensions.h - 2
  ),
  facing: station.facing,
  refId: `cave-sun-automaton-${station.suffix}`,
  // No collider: the pillars stand in the collapse ring, which is already
  // blocked as a whole by the terrain program. A second 2D collider here would
  // only fence off floor the visitor cannot reach anyway.
  elevation: SUN_PILLAR_TOP_Y,
}));

// ── The Moon's plain and its three Quarter-Opposite stations ────────────────
//
// Interior metres = ceil(minInterior * 1.5) * 0.5, NOT tiles. 30 -> 22.5 m
// each way, which carries the ⌀20 m plain with a 1.25 m rock margin on every
// side. Measured against the compiled grid, not assumed.
//
// Both doors are CENTRED on purpose. blockedAt keeps the plain round and opens
// only the band the two door approaches cross; with the doors at opposite
// corners that band would span nearly the whole bay and the "round plain" would
// be a rectangle with rounded corners drawn on it.
// 140 -> a 105 m interior (`ceil(140 * 1.5) * 0.5`, the same conversion the Sun
// comment above documents). It was 30 (22.5 m), a bay that held the ⌀20 crater
// and nothing else — so the mare the Moon graybox draws out to 420 m was
// scenery you could look at and not walk on. Austen (2026-08-05): *"allow me to
// walk on the moon and bounce around."* The room now carries a ~51 m walkable
// plain around the crater; the rest of the mare stays scenery, and the bay wall
// is the horizon you never reach rather than a fence at arm's length. The room
// draws no tile geometry (`suppressTileGeometry`), so the bigger shell adds
// nothing to look at — only ground to cross.
const MOON_MIN_INTERIOR_WIDTH = 140;
const MOON_MIN_INTERIOR_HEIGHT = 140;

const moonWalls = {
  north: EMPTY_WALL,
  south: torchWall("start"),
  east: doorWall(EDGE_IDS.moonToEgypt, "center"),
  west: doorWall(EDGE_IDS.sunToMoon, "center"),
} satisfies Record<WallName, WallDefinition>;

const moonDimensions = computeRoomDimensions({
  walls: moonWalls,
  minInteriorWidth: MOON_MIN_INTERIOR_WIDTH,
  minInteriorHeight: MOON_MIN_INTERIOR_HEIGHT,
});

// The centre comes from `moon-layout.ts` — the same expression the terrain and
// the graybox measure every polar quantity from. A second one derived here is
// exactly how the Sundial's stations and its sun mapping ended up on different
// axes.
const { xMetres: MOON_CENTRE_X_M, zMetres: MOON_CENTRE_Z_M } = moonCentreMetres(
  moonDimensions.w,
  moonDimensions.h
);

const moonPerformers = MOON_STATIONS.map((station) => ({
  offsetX: interiorOffsetFraction(
    MOON_CENTRE_X_M + station.dx,
    moonDimensions.w,
    moonDimensions.w - 2
  ),
  offsetY: interiorOffsetFraction(
    MOON_CENTRE_Z_M + station.dz,
    moonDimensions.h,
    moonDimensions.h - 2
  ),
  facing: station.facing,
  refId: `cave-moon-automaton-${station.suffix}`,
  // No collider: the mounds are 0.35 m rises on an open plain the visitor is
  // meant to walk across and around. A 2D collision disc here would fence off
  // floor for no reason the eye can see.
  elevation: MOON_MOUND_TOP_Y,
}));

const thresholdRoom: RoomNode = {
  ...CAVE_THRESHOLD_ROOM,
  spawn: { offsetX: -0.28, offsetY: 0.28, facing: "north" },
  walls: {
    ...CAVE_THRESHOLD_ROOM.walls,
    north: doorWall(EDGE_IDS.thresholdToSqueeze, "start", 3),
    south: doorWall(LOBBY_TO_CAVE_EDGE_ID, "end", 6),
  },
};

export const VULCAN_CAVE_ROOMS: RoomNode[] = [
  thresholdRoom,
  {
    id: "cave-squeeze",
    name: "The Squeeze",
    material: "dirt",
    theme: "cave",
    minInteriorWidth: 4,
    minInteriorHeight: 12,
    description:
      "A narrow, bent passage that removes the lobby before the first chamber opens.",
    walls: {
      north: doorWall(EDGE_IDS.squeezeToApproach, "start", 3),
      south: doorWall(EDGE_IDS.thresholdToSqueeze, "end", 3),
      east: torchWall("end"),
      west: EMPTY_WALL,
    },
  },
  {
    id: "cave-water-approach",
    name: "The Flooded Approach",
    material: "stone",
    theme: "cave",
    minInteriorWidth: 3,
    minInteriorHeight: 16,
    description:
      "A descending passage where water is heard before it is seen; the floor drops toward the waterline.",
    roomPresentation: { suppressTileGeometry: true },
    walls: {
      north: narrowDoorWall(EDGE_IDS.approachToGallery, "start", 3),
      south: narrowDoorWall(EDGE_IDS.squeezeToApproach, "end", 3),
      east: EMPTY_WALL,
      west: EMPTY_WALL,
    },
  },
  {
    id: "cave-water-gallery",
    name: "The Flooded Gallery",
    material: "stone",
    theme: "cave",
    // Interior ≈ 13.5 × 24 m once ROOM_SCALE (1.5) is applied. Sized by the
    // walk it has to carry: the submerged span must stay contiguous for 24 m
    // or more, and the S-path plus its two stairs need the room to hold them.
    minInteriorWidth: 18,
    minInteriorHeight: 32,
    description:
      "A rock-roofed flooded gallery walked on the bottom. The ceiling sits below the waterline, so there is no sign of air until the surfacing stair.",
    roomPresentation: { suppressTileGeometry: true },
    walls: {
      // Centred 6-tile (3 m) door onto the grotto: the surfacing stair, the
      // corridor and the grotto's own south door share one axis, which is what
      // makes the arrival a symmetric centre-south composition.
      north: doorWall(EDGE_IDS.galleryToGrotto, "center", 6),
      // Flush against the east wall, so the descent lands off-centre and the
      // path reads as an S rather than doubling back on itself.
      south: narrowDoorWall(EDGE_IDS.approachToGallery, "end", 3),
      east: EMPTY_WALL,
      west: EMPTY_WALL,
    },
  },
  {
    id: "cave-water",
    name: "The Drowned Gallery",
    material: "stone",
    theme: "cave",
    minInteriorWidth: GROTTO_MIN_INTERIOR_WIDTH,
    minInteriorHeight: GROTTO_MIN_INTERIOR_HEIGHT,
    description:
      "The Water grotto: a ring of walkways around a channel and a mirror pool, with three alcoves performing A, B, C across the water.",
    roomPresentation: { suppressTileGeometry: true },
    walls: grottoWalls,
    performers: grottoPerformers,
  },
  {
    id: "cave-fire",
    name: "The First Fire",
    material: "stone",
    theme: "cave",
    minInteriorWidth: FIRE_MIN_INTERIOR_WIDTH,
    minInteriorHeight: FIRE_MIN_INTERIOR_HEIGHT,
    description:
      "The Cinder Court: an S-route of torch-lit basalt corridors threads three rock-isolated shrine courts, each performing DJ, EK or FL inside a horseshoe of fire, until the last flame goes out and green growth leads on to Earth.",
    roomPresentation: { suppressTileGeometry: true },
    walls: fireWalls,
    performers: firePerformers,
  },
  {
    id: "cave-earth",
    name: "The Root Terrace",
    material: "stone",
    theme: "cave",
    minInteriorWidth: EARTH_MIN_INTERIOR_WIDTH,
    minInteriorHeight: EARTH_MIN_INTERIOR_HEIGHT,
    // The visitor must not start on the room's centre tile: in this plan that
    // is the middle of the rootbed, which is blocked and level with the
    // performers. Start them inside the west door instead.
    spawn: {
      offsetX: interiorOffsetFraction(
        earthRootTerraceSpawnOffset().xMetres,
        earthDimensions.w,
        earthDimensions.w - 2
      ),
      offsetY: interiorOffsetFraction(
        earthRootTerraceSpawnOffset().zMetres,
        earthDimensions.h,
        earthDimensions.h - 2
      ),
      facing: earthRootTerraceSpawnOffset().facing,
    },
    description:
      "The Root Terrace: out of a mossy vestibule one ramp climbs to an overlook above the rootbed and another falls to a brass-railed catwalk that runs the row 1.4 m above it, with a control console set into the rail opposite each of the three figures performing G, H and I in daylight from an aven. There is no way down onto the bed; the east channel lands on the row's axis before the floor falls away toward Air.",
    roomPresentation: { suppressTileGeometry: true },
    walls: earthWalls,
    performers: earthPerformers,
  },
  {
    id: "cave-air",
    name: "Air Chamber",
    material: "stone",
    theme: "cave",
    minInteriorWidth: AIR_MIN_INTERIOR_WIDTH,
    minInteriorHeight: AIR_MIN_INTERIOR_HEIGHT,
    description:
      "A tall shaft with an open floor and no stair. A column of rising air carries the visitor past three ledges — one pair at a time, each arriving at eye level — to an overlook nine metres up; a second, warmer column sets them back down beside the door on.",
    roomPresentation: { suppressTileGeometry: true },
    walls: airWalls,
    performers: airPerformers,
  },
  {
    id: "cave-sun",
    name: "Sun Chamber",
    material: "sandstone",
    theme: "cave",
    // Interior metres = ceil(minInterior * 1.5) * 0.5, NOT tiles. 43 -> 32.5 m
    // and 45 -> 34.0 m, which carries the 24 m chamber plus the north light
    // crack. Measure the compiled grid before trusting this comment; the Air
    // comment in this same file once read these as tiles and was out by 40%.
    minInteriorWidth: SUN_MIN_INTERIOR_WIDTH,
    minInteriorHeight: SUN_MIN_INTERIOR_HEIGHT,
    description:
      "A round chamber whose sun is driven by where the visitor stands: bearing from the centre is azimuth, distance from it is elevation. A spiral crossing sweeps a quarter of the compass on the way to a zenith noon, and the ground itself lifts the visitor out through the ceiling onto the Moon.",
    roomPresentation: { suppressTileGeometry: true },
    walls: sunWalls,
    performers: sunPerformers,
  },
  {
    id: "cave-moon",
    name: "Moon Chamber",
    material: "stone",
    theme: "cave",
    minInteriorWidth: MOON_MIN_INTERIOR_WIDTH,
    minInteriorHeight: MOON_MIN_INTERIOR_HEIGHT,
    description:
      "A flat regolith plain under an open black sky, lit by one hard white sun with nothing to scatter it. The visitor surfaces through a hole in the floor on the Sun's own stone; the first step off it is where the gravity lets go.",
    roomPresentation: { suppressTileGeometry: true },
    walls: moonWalls,
    performers: moonPerformers,
  },
  {
    id: "egypt-threshold",
    name: "Egypt Threshold",
    material: "sandstone",
    theme: "classical",
    minInteriorWidth: 6,
    minInteriorHeight: 6,
    description:
      "A small sealed transition where warm sandstone light previews the next wing.",
    walls: {
      north: torchWall("end"),
      south: EMPTY_WALL,
      east: EMPTY_WALL,
      west: doorWall(EDGE_IDS.moonToEgypt, "start"),
    },
  },
];

export const VULCAN_CAVE_EDGES: RoomEdge[] = [
  {
    from: "cave-threshold",
    to: "cave-squeeze",
    type: "main-path",
    fromWall: "north",
    toWall: "south",
    corridorWidth: 3,
  },
  {
    from: "cave-squeeze",
    to: "cave-water-approach",
    type: "main-path",
    fromWall: "north",
    toWall: "south",
    corridorWidth: 3,
  },
  {
    from: "cave-water-approach",
    to: "cave-water-gallery",
    type: "main-path",
    fromWall: "north",
    toWall: "south",
    corridorWidth: 3,
  },
  {
    from: "cave-water-gallery",
    to: "cave-water",
    type: "main-path",
    fromWall: "north",
    toWall: "south",
    // Matches the 6-tile doors at both ends so the surfacing stair runs
    // straight through into the grotto with no pinch.
    corridorWidth: 6,
  },
  {
    from: "cave-water",
    to: "cave-fire",
    type: "main-path",
    fromWall: "east",
    toWall: "west",
    corridorWidth: 4,
  },
  {
    from: "cave-fire",
    to: "cave-earth",
    type: "main-path",
    fromWall: "east",
    toWall: "west",
    corridorWidth: 4,
  },
  {
    from: "cave-earth",
    to: "cave-air",
    type: "main-path",
    fromWall: "south",
    toWall: "north",
    corridorWidth: 4,
  },
  {
    from: "cave-air",
    to: "cave-sun",
    type: "main-path",
    fromWall: "south",
    toWall: "north",
    corridorWidth: 3,
  },
  {
    from: "cave-sun",
    to: "cave-moon",
    type: "main-path",
    fromWall: "east",
    toWall: "west",
    corridorWidth: 4,
  },
  {
    from: "cave-moon",
    to: "egypt-threshold",
    type: "main-path",
    fromWall: "east",
    toWall: "west",
    corridorWidth: 4,
  },
];

const CAVE_PLAN_GRID_CONFIG: GridConfig = {
  cellWidth: 40,
  cellHeight: 40,
  padding: 2,
};

interface CaveSpaceProgram {
  id: (typeof CAVE_SPACE_ORDER)[number];
  title: string;
  description: string;
  tone: MuseumFloorPlanZoneTone;
}

const CAVE_SPACE_PROGRAM: readonly CaveSpaceProgram[] = [
  {
    id: "cave-threshold",
    title: "Cave threshold",
    description:
      "A stone vestibule turns away from the lobby and establishes the inhabited archaeological frame.",
    tone: "threshold",
  },
  {
    id: "cave-squeeze",
    title: "The squeeze",
    description:
      "The narrowest room removes the lobby sightline before any performer appears.",
    tone: "threshold",
  },
  {
    id: "cave-water-approach",
    title: "Flooded approach",
    description:
      "A descending passage where the sound of water builds before anything is visible.",
    tone: "threshold",
  },
  {
    id: "cave-water-gallery",
    title: "The flooded gallery",
    description:
      "Thirty metres walked on the bottom of a rock-roofed gallery, with a bloom of cave life at the midpoint.",
    tone: "threshold",
  },
  {
    id: "cave-water",
    title: "The drowned gallery",
    description:
      "A surfacing stair breaks the water at the mirror pool; a ring of walkways passes three alcoves performing A, B, and C.",
    tone: "arrival",
  },
  {
    id: "cave-fire",
    title: "The cinder court",
    description:
      "A torch lane threads three shrine courts cut from one basalt mass; each fire darkens behind the visitor until the last goes out and growth leads on.",
    tone: "retail",
  },
  {
    id: "cave-earth",
    title: "The root terrace",
    description:
      "A ramp climbs to a railed terrace above a rootbed lit from an aven; three figures work in one row 5.2 m below, and the descent lands on the row's axis.",
    tone: "social",
  },
  {
    id: "cave-air",
    title: "Air chamber",
    description:
      "A narrower footprint and taller authored shell create a vertical release after Earth.",
    tone: "service",
  },
  {
    id: "cave-sun",
    title: "Sun chamber",
    description:
      "The first celestial figure begins a paired idea while remaining a separate encounter.",
    tone: "anchor",
  },
  {
    id: "cave-moon",
    title: "Moon chamber",
    description:
      "A colder final solo completes the pair without creating an ensemble sightline.",
    tone: "exhibit",
  },
  {
    id: "egypt-threshold",
    title: "Egypt threshold",
    description:
      "A sealed sandstone transition supplies the first warm cue from the next wing.",
    tone: "threshold",
  },
];

export interface VulcanCaveFloorPlan extends MuseumGridBuildResult {
  edges: RoomEdge[];
  zones: MuseumFloorPlanZone[];
  circulation: MuseumFloorPlanPoint[];
  modeRooms: readonly CaveModeRoom[];
  totalInteriorAreaMetres: number;
}

function roomCenter(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): MuseumFloorPlanPoint {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

function findDoorCenter(
  build: MuseumGridBuildResult,
  roomId: string,
  wall: WallName
): MuseumFloorPlanPoint {
  const room = build.grid.wings.find((wing) => wing.id === roomId);
  if (!room) throw new Error(`Missing authored cave room "${roomId}"`);

  const coordinates: MuseumFloorPlanPoint[] = [];
  const { x, y, width, height } = room.bounds;
  if (wall === "north" || wall === "south") {
    const wallY = wall === "north" ? y : y + height - 1;
    for (let wallX = x; wallX < x + width; wallX++) {
      if (build.grid.tiles.get(tileKey(wallX, wallY))?.type === "door") {
        coordinates.push({ x: wallX + 0.5, y: wallY + 0.5 });
      }
    }
  } else {
    const wallX = wall === "west" ? x : x + width - 1;
    for (let wallY = y; wallY < y + height; wallY++) {
      if (build.grid.tiles.get(tileKey(wallX, wallY))?.type === "door") {
        coordinates.push({ x: wallX + 0.5, y: wallY + 0.5 });
      }
    }
  }

  if (coordinates.length === 0) {
    throw new Error(`Expected a ${wall} door in cave room "${roomId}"`);
  }

  return {
    x:
      coordinates.reduce((sum, point) => sum + point.x, 0) / coordinates.length,
    y:
      coordinates.reduce((sum, point) => sum + point.y, 0) / coordinates.length,
  };
}

function buildCirculation(
  build: MuseumGridBuildResult
): MuseumFloorPlanPoint[] {
  const points: MuseumFloorPlanPoint[] = [];
  const append = (point: MuseumFloorPlanPoint) => {
    const previous = points.at(-1);
    if (previous?.x !== point.x || previous?.y !== point.y) {
      points.push(point);
    }
  };

  append({ x: build.grid.spawn.x + 0.5, y: build.grid.spawn.y + 0.5 });

  for (const edge of VULCAN_CAVE_EDGES) {
    const fromRoom = build.grid.wings.find((wing) => wing.id === edge.from);
    const toRoom = build.grid.wings.find((wing) => wing.id === edge.to);
    if (!fromRoom || !toRoom) {
      throw new Error(`Cave circulation is missing ${edge.from} or ${edge.to}`);
    }

    const fromDoor = findDoorCenter(build, edge.from, edge.fromWall);
    const toDoor = findDoorCenter(build, edge.to, edge.toWall);
    append(roomCenter(fromRoom.bounds));
    append(fromDoor);

    if (edge.fromWall === "north" || edge.fromWall === "south") {
      const midY = Math.floor((fromDoor.y + toDoor.y) / 2) + 0.5;
      append({ x: fromDoor.x, y: midY });
      append({ x: toDoor.x, y: midY });
    } else {
      const midX = Math.floor((fromDoor.x + toDoor.x) / 2) + 0.5;
      append({ x: midX, y: fromDoor.y });
      append({ x: midX, y: toDoor.y });
    }

    append(toDoor);
    append(roomCenter(toRoom.bounds));
  }

  return points;
}

/**
 * Routes an elevation/blocking query to the bay that owns the point. Outside
 * every bay the museum datum stands, which is what the tile-built rooms use.
 *
 * Ownership is a bay's FOOTPRINT — its room plus the corridor rects it draws —
 * never its bounding box. A corridor can dogleg well past the room it serves
 * (Earth's Fire corridor runs 3 m south of the Earth room), and a bbox grown
 * to hold it swallows the neighbour's corridor and door tiles beside it. That
 * is how the walk out of the Earth room died: the Earth→Air corridor lay inside
 * Earth's bbox, Earth was asked first, no Earth floor covers those tiles, and
 * Earth's loud "no elevation zone" throw killed the frame loop.
 */
function composeCaveTerrain(
  grid: MuseumGrid,
  bays: {
    footprint: WorldRect[] | undefined;
    program: MuseumTerrainProgram | null;
  }[]
): MuseumTerrainProgram | null {
  const active = bays.filter(
    (bay): bay is { footprint: WorldRect[]; program: MuseumTerrainProgram } =>
      Boolean(bay.footprint && bay.program)
  );
  if (active.length === 0) return null;
  const owns = (footprint: WorldRect[], x: number, z: number) =>
    footprint.some((rect) => inRectClosed(rect, x, z));

  return {
    waterlineY: active[0]!.program.waterlineY,
    elevationAt(x, z, fromY) {
      for (const bay of active) {
        if (owns(bay.footprint, x, z)) {
          return bay.program.elevationAt(x, z, fromY);
        }
      }
      return 0;
    },
    blockedAt(x, z) {
      // Corridors win over every bay program. A routed corridor is the museum's
      // own circulation — the grid carved it because two doors had to meet —
      // and a bay whose blocked region happens to overlap it would sever the
      // walk with nothing visible to explain why. This is exactly how the Moon
      // fell out of the one-walk museum: the Sun's east door and the Moon's
      // west door sit at different heights on their walls, the router doglegged
      // between them along the inside of the Sun's bay, and the Sundial's rock
      // corners blocked the dogleg.
      const tile = grid.tiles.get(
        tileKey(Math.round(x / grid.tileScale), Math.round(z / grid.tileScale))
      );
      if (tile?.type === "corridor" || tile?.type === "door") return false;
      for (const bay of active) {
        if (owns(bay.footprint, x, z) && bay.program.blockedAt(x, z)) {
          return true;
        }
      }
      return false;
    },
    updraftAt(x, z, y) {
      for (const bay of active) {
        if (owns(bay.footprint, x, z)) {
          return bay.program.updraftAt?.(x, z, y) ?? 0;
        }
      }
      return 0;
    },
  };
}

/**
 * Elevation + blocking for every authored bay in the cave, for ANY grid that
 * contains the cave rooms — the review route's cave-only grid, or the whole
 * museum's single walk grid (`museum-walk.ts`). Physics reads it for ground
 * clamping; each graybox layer reads the same layout for its meshes. Each
 * program answers only inside its own footprint, so a bay's loud "no elevation
 * zone" failure can never be swallowed by its neighbour — and never fires for a
 * neighbour's corridor.
 *
 * Each layout builder returns null when its room is absent from the grid, so
 * this is safe on a grid that carries only some of the chambers.
 */
export function composeCaveTerrainForGrid(
  grid: MuseumGrid
): MuseumTerrainProgram | null {
  return composeCaveTerrain(grid, [
    {
      footprint: buildDrownedGalleryLayout(grid)?.bayFootprint,
      program: createDrownedGalleryTerrain(grid),
    },
    {
      footprint: buildFirstFireProcessionBay(grid)?.bayFootprint,
      program: createFirstFireProcessionTerrain(grid),
    },
    {
      footprint: buildEarthRootTerraceLayout(grid)?.bayFootprint,
      program: createEarthRootTerraceTerrain(grid),
    },
    {
      footprint: buildAirChimneyLayout(grid)?.bayFootprint,
      program: createAirChimneyTerrain(grid),
    },
    {
      footprint: buildSundialLayout(grid)?.bayFootprint,
      program: createSundialTerrain(grid),
    },
    {
      footprint: buildMoonLayout(grid)?.bayFootprint,
      program: createMoonTerrain(grid),
    },
  ]);
}

export function buildVulcanCaveFloorPlan(): VulcanCaveFloorPlan {
  const build = buildMuseumGrid(
    VULCAN_CAVE_ROOMS,
    VULCAN_CAVE_EDGES,
    CAVE_PLAN_GRID_CONFIG
  );

  const zones = CAVE_SPACE_PROGRAM.map((space, index) => {
    const room = build.grid.wings.find((wing) => wing.id === space.id);
    if (!room) throw new Error(`Cave plan did not produce room "${space.id}"`);

    return {
      ...space,
      number: index + 1,
      x: room.bounds.x + 1,
      y: room.bounds.y + 1,
      width: room.bounds.width - 2,
      height: room.bounds.height - 2,
    } satisfies MuseumFloorPlanZone;
  });

  const terrain = composeCaveTerrainForGrid(build.grid);
  if (terrain) build.grid.terrain = terrain;

  const totalInteriorTiles = build.grid.wings.reduce(
    (sum, wing) => sum + (wing.bounds.width - 2) * (wing.bounds.height - 2),
    0
  );

  return {
    ...build,
    edges: VULCAN_CAVE_EDGES,
    zones,
    circulation: buildCirculation(build),
    modeRooms: CAVE_MODE_ROOMS,
    totalInteriorAreaMetres:
      totalInteriorTiles * build.grid.tileScale * build.grid.tileScale,
  };
}
