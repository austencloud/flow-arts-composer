/**
 * The Root Terrace: the Earth wing (TOGETHER-SAME, cases G, H, I) as the
 * museum walks it, and the terrain program physics reads for it.
 *
 * The room's subject is three automatons performing the same TOGETHER-SAME
 * case in unison. The first cut of this plan put the visitor on a terrace
 * 5.2 m above them and never let them closer: G, H and I read at 9-18 m and
 * 12-24 degrees below the horizon, which is a diorama, not a performance. The
 * regrade keeps the "never share a floor with a performer" rule - the barrier
 * is still elevation - but spends the height budget differently:
 *
 *   west door (0) -> vestibule (0), the hub
 *     - north: entry ramp climbing east (0 -> +1.8) -> OVERLOOK (+1.8), a
 *       balcony spur that shows the whole bed at once. Dead end by design:
 *       it is the reveal, and you come back through it.
 *     - south: gallery descent falling east (0 -> -1.0) -> ROOT GALLERY (-1.0),
 *       a 1.5 m catwalk cantilevered over the bed, 1.4 m above it, running the
 *       row. Three alcoves bump north off it at G, H and I; each holds a
 *       control console set flush into the rail cap, and the operator reads
 *       their case at 4.05 m and 24 degrees - close enough to be a duet.
 *   -> east link (-1.0 -> -1.2) -> landing (-1.2) on the row's axis: the
 *      ensemble sightline, three unison figures nested away down the row
 *   -> exit ramp (-1.2 -> 0) past the cleft where the floor falls away
 *   -> south door (0) to Air.
 *
 * Everything off the ribbon is rock or the bed, and both are blocked: the bed
 * is 2.4 m below the museum datum with no way down. Both doors sit on the
 * datum, so Fire's growth path arrives level and the Air corridor's 0.6 m step
 * rule holds at the south door.
 *
 * Two constraints shape every number here. The terrain program is 2.5D - one
 * height per (x, z) - so no deck may pass over another, which rules out a
 * descent tunnelled under the entry ramp. And the traversal step rule rejects
 * more than 0.6 m between neighbouring walkable tiles at 0.5 m spacing, so
 * decks at different heights are separated by rock wide enough to guarantee a
 * blocked tile row between them. The overlook is a spur rather than a through
 * route because those two rules together leave no corridor for a descent that
 * both clears the vestibule and stays off the overlook's flank.
 *
 * The Blender shell (scripts/build-earth-root-terrace-graybox.py and
 * -production.py) is carved from the SAME rects this module returns, via the
 * hash-stamped contract in earth-root-terrace-blender-contract.ts, so the
 * collider and the rock can never disagree about where an edge is.
 *
 * Like the other suppressed-tile bays, this module owns the corridor between
 * the Fire room and this one (both suppress their tile geometry). The
 * corridor on to Air belongs to air-chimney-layout.ts from the south door
 * row down.
 */
import type { MuseumGrid, MuseumTerrainProgram } from "../domain/museum-grid-types";
import {
  TILE_METRES,
  bandRects,
  doorSpan,
  inRectClosed,
  interiorWorldRect,
  unionRect,
  type FloorRect,
  type Point2,
  type Span,
  type WorldRect,
} from "./drowned-gallery-terrain";

export const EARTH_ROOM_ID = "cave-earth";
export const FIRE_ROOM_ID = "cave-fire";

// -- Datums (world Y, metres) -----------------------------------------------
/** Both doors: Fire's growth path arrives here and the Air corridor leaves here. */
export const DOOR_Y = 0;
/** The overlook balcony: the whole-bed view, 4.2 m above the performers. */
export const OVERLOOK_Y = 1.8;
/** The root gallery catwalk: 1.4 m above the bed, close enough to work a console. */
export const GALLERY_Y = -1.0;
/** The ensemble landing on the row's axis, at the foot of the east link. */
export const LANDING_Y = -1.2;
/** The rootbed the performers stand on. No way down onto it. */
export const BED_Y = -2.4;
/** The cleft beside the exit: the floor falling away toward Air. */
export const CLEFT_Y = -6.5;
/** Vault crown over the rootbed. */
export const BED_CROWN_Y = 9.6;
/** Crown over the overlook and the east channel. */
export const OVERLOOK_CROWN_Y = 7.4;
/** Crown over the vestibule: a lower cave, so the overlook opens up out of it. */
export const VESTIBULE_CROWN_Y = 5.4;
/** Top of the daylight aven over the bed. */
export const AVEN_TOP_Y = 17.0;
export const AVEN_RADIUS = 3.2;
/** Brass rail height above the deck it stands on. */
export const RAIL_HEIGHT = 1.0;
/**
 * Consoles are set FLUSH into the rail cap, not stood on it. Anything proud of
 * the rail eats the 0.11 m of foot clearance the overlook's sightline has over
 * that same cap, and a vertical screen would make the visitor look at the
 * screen instead of the performer. The cap is the work surface.
 */
export const CONSOLE_CAP_Y = GALLERY_Y + RAIL_HEIGHT;
export const CONSOLE_WIDTH = 1.6;
/** Where a person stands back from a railing they are working at. */
export const CONSOLE_SETBACK = 0.45;
/** Where the props circle above a performer's feet, for the sightline proofs. */
export const PROP_CENTRE_ABOVE_FEET = 1.35;
export const EYE_ABOVE_FLOOR = 1.6;

// -- Plan offsets from the room interior's north-west corner (metres) --------
// The compiled interior is 34 by 24 m; every number below is an offset from
// its minimum X (west) and minimum Z (north), so the plan lands identically
// in the standalone cave grid and the whole-museum walk grid.
const VESTIBULE_RUN = 6; // west door to the ramp foot and the descent head
const VESTIBULE_NORTH = 2;
const VESTIBULE_SOUTH = 16.5;
const WALK_NORTH = 2; // rock behind the north lane, north of the deck
const WALK_WIDTH = 4; // entry ramp and overlook width
const ENTRY_RAMP_RUN = 10; // 0 -> 1.8 over 10 m: a 10.2 degree climb
const OVERLOOK_RUN = 6; // the balcony spur east of the ramp head
// Every deck edge lands on a quarter-metre, never on a half-metre. Tile
// centres fall on x.25 and x.75, and the physics provider probes 0.15 m
// around the player, so a deck edge ON a tile centre makes that whole row
// unstandable: the collider pushes back off an edge the terrain says is
// walkable. A 1.5 m catwalk spanning 8.25-9.75 has exactly that fault at both
// edges, and the headless playtest stalls trying to enter it.
const GALLERY_NORTH = 8.0;
const GALLERY_SOUTH = 9.5; // a 1.5 m catwalk: two abreast, or one working
const GALLERY_DESCENT_RUN = 4; // 0 -> -1.0 over 4 m: a 14.0 degree fall
const GALLERY_EAST = 30; // flush with the bed's east face and the east channel
const ALCOVE_DEPTH = 1.0; // bumps NORTH off the catwalk, away from the bed
const ALCOVE_WIDTH = 3.0; // half of it lands on a half-metre, off the tile grid
const EAST_RUN = 3.5; // width of the east channel (x), against the east wall
const EAST_LINK_END = 12; // z offset where the east link reaches the landing
const LANDING_DEPTH = 2.5;
const EXIT_RAMP_END = 20; // z offset where the exit ramp regains the datum
const BED_WEST = 8;
const BED_EAST = 30; // the bed runs to the east channel's west face
const BED_NORTH = WALK_NORTH + WALK_WIDTH; // the bed starts under the overlook rail
const BED_SOUTH = 20;
const STATION_Z = 13; // the performers' row
const STATION_XS = [13, 20, 27] as const; // G, H, I west -> east
const OPENER = { x: 4, z: 14.2 };
// Just inside the west door, on its axis: the visitor faces east into the
// vestibule with both routes ahead of them - the ramp climbing away on their
// left, the descent falling away on their right. The isolated-room spawn in
// vulcan-cave-floor-plan.ts is derived from these same two numbers, so the
// standalone room and the whole-museum walk start on the same tile.
const SPAWN = { x: 1.2, z: 12 };
const CLEFT = { minX: 27.5, maxX: 29.7, minZ: 19.5, maxZ: 24 } as const;

export const EARTH_CASE_LETTERS = ["G", "H", "I"] as const;
export type EarthCaseLetter = (typeof EARTH_CASE_LETTERS)[number];

export interface EarthStation {
  letter: EarthCaseLetter;
  performerId: string;
  sequenceId: string;
  catalogId: string;
  /** Where the performer stands, in world metres (its pedestal's centre). */
  centre: Point2;
  /** The bed elevation the pedestal stands on. */
  floorY: number;
}

/** One case's control console, set into the gallery rail cap opposite its performer. */
export interface EarthConsole {
  letter: EarthCaseLetter;
  /** Centre of the cap panel, on the gallery's south rail line. */
  centre: Point2;
  /** Top of the panel: flush with the rail cap. */
  capY: number;
  width: number;
  /** Where the operator stands to work it. */
  stand: Point2;
  standY: number;
}

export interface EarthRootTerraceLayout {
  /** The room interior, wall tiles excluded. */
  earth: WorldRect;
  westDoor: Span;
  southDoor: Span;
  /** Corridor + door tiles between the Fire room and this one. */
  corridor: WorldRect[];
  /**
   * The walked ribbon, in query order: elevationAt takes the FIRST rect that
   * covers a point, so the flat decks are listed before the ramps that meet
   * them and every seam is answered by the deck side.
   */
  floorRects: FloorRect[];
  vestibule: WorldRect;
  entryRamp: WorldRect;
  overlook: WorldRect;
  galleryDescent: WorldRect;
  gallery: WorldRect;
  /** The three console bays bumping north off the catwalk, in G, H, I order. */
  alcoves: WorldRect[];
  eastLink: WorldRect;
  landing: WorldRect;
  exitRamp: WorldRect;
  doorApproach: WorldRect;
  /** The rootbed: blocked, BED_Y, the performers' floor. */
  bed: WorldRect;
  /** The cleft beside the exit: blocked, CLEFT_Y. */
  cleft: WorldRect;
  /** The daylight shaft's centre, over the middle case. */
  avenCentre: Point2;
  stations: EarthStation[];
  consoles: EarthConsole[];
  /** The opener station's dais on the vestibule floor. */
  opener: { centre: Point2; floorY: number };
  /**
   * The brass rail along every drop edge, RAIL_HEIGHT above the deck under it.
   * Disjoint runs, because the ribbon has three separate exposed edges: the
   * north lane over the bed, the gallery's perimeter (stepping around each
   * alcove), and the east channel's west face.
   */
  rails: Point2[][];
  /** The ensemble sightline: where the visitor stands, and where they look. */
  ensemble: { eye: Point2; eyeY: number; target: Point2 };
  /** Where the visitor enters and which way they face. */
  spawn: { centre: Point2; floorY: number; yaw: number };
  /** Rects the composed cave terrain routes queries by: the room plus its corridor. */
  bayFootprint: WorldRect[];
  bayBounds: WorldRect;
}

const CASE_BINDINGS: Record<EarthCaseLetter, { sequenceId: string; catalogId: string }> = {
  G: { sequenceId: "cave-earth-seq-g", catalogId: "tnd-tog-same-gggg" },
  H: { sequenceId: "cave-earth-seq-h", catalogId: "tnd-tog-same-hhhh" },
  I: { sequenceId: "cave-earth-seq-i", catalogId: "tnd-tog-same-iiii" },
};

/**
 * Station offsets from the interior's north-west corner, for the floor plan's
 * performer declarations (which are fractions of the compiled interior).
 */
export function earthRootTerraceStationOffsets(): { xMetres: number; zMetres: number }[] {
  return STATION_XS.map((x) => ({ xMetres: x, zMetres: STATION_Z }));
}

/**
 * Where the visitor starts when this room is walked on its own
 * (`/museum?room=cave-earth`), as a plan offset for the floor plan's spawn
 * placement. Without it the picker dropped the visitor on the room's centre
 * tile, which in this plan is the middle of the rootbed: inside the exhibit,
 * on a blocked tile, level with the performers.
 */
export function earthRootTerraceSpawnOffset(): {
  xMetres: number;
  zMetres: number;
  facing: "east";
} {
  return { xMetres: SPAWN.x, zMetres: SPAWN.z, facing: "east" };
}

function rect(earth: WorldRect, x0: number, z0: number, x1: number, z1: number): WorldRect {
  return {
    minX: earth.minX + x0,
    maxX: earth.minX + x1,
    minZ: earth.minZ + z0,
    maxZ: earth.minZ + z1,
  };
}

export function buildEarthRootTerraceLayout(grid: MuseumGrid): EarthRootTerraceLayout | null {
  const earthWing = grid.wings.find((w) => w.id === EARTH_ROOM_ID);
  const fireWing = grid.wings.find((w) => w.id === FIRE_ROOM_ID);
  // Fire is optional. It is needed only to span the corridor between the two
  // wings, and the room picker can isolate cave-earth on its own - a grid with
  // no Fire room has no such corridor to own. Requiring it here returned null,
  // which left the component with a [0,0,0] origin: the shell mounted at the
  // world origin, far from the visitor, and the isolated room rendered black.
  if (!earthWing) return null;

  const earth = interiorWorldRect(earthWing.bounds);
  const westDoor = doorSpan(grid, EARTH_ROOM_ID, "west");
  const southDoor = doorSpan(grid, EARTH_ROOM_ID, "south");
  if (!westDoor || !southDoor) {
    throw new Error(
      "Root Terrace layout: a door on the earth route is missing from the compiled grid"
    );
  }
  const width = earth.maxX - earth.minX;
  const depth = earth.maxZ - earth.minZ;
  if (width < 34 - 1e-6 || depth < 24 - 1e-6) {
    throw new Error(
      `Root Terrace layout: the compiled interior is ${width.toFixed(1)} × ${depth.toFixed(1)} m; ` +
        "the plan needs 34 × 24 — widen cave-earth"
    );
  }
  // The plan is anchored on the doors the grid actually compiled: the
  // vestibule must contain the whole west door, and the east channel the whole
  // south door, or the visitor steps off a door tile onto rock.
  const vestibule = rect(earth, 0, VESTIBULE_NORTH, VESTIBULE_RUN, VESTIBULE_SOUTH);
  if (westDoor.min < vestibule.minZ || westDoor.max > vestibule.maxZ) {
    throw new Error("Root Terrace layout: the west door lies outside the vestibule");
  }
  const eastMinX = earth.maxX - 0.5 - EAST_RUN;
  const eastMaxX = earth.maxX - 0.5;
  if (southDoor.min < eastMinX || southDoor.max > eastMaxX) {
    throw new Error("Root Terrace layout: the south door lies outside the east channel");
  }

  // -- North lane: the entry ramp and the overlook spur it ends on.
  const entryRamp = rect(
    earth,
    VESTIBULE_RUN,
    WALK_NORTH,
    VESTIBULE_RUN + ENTRY_RAMP_RUN,
    WALK_NORTH + WALK_WIDTH
  );
  const overlook: WorldRect = {
    minX: entryRamp.maxX,
    maxX: entryRamp.maxX + OVERLOOK_RUN,
    minZ: entryRamp.minZ,
    maxZ: entryRamp.maxZ,
  };

  // -- South lane: the descent off the vestibule and the catwalk it lands on.
  const galleryDescent = rect(
    earth,
    VESTIBULE_RUN,
    GALLERY_NORTH,
    VESTIBULE_RUN + GALLERY_DESCENT_RUN,
    GALLERY_SOUTH
  );
  const gallery = rect(earth, VESTIBULE_RUN + GALLERY_DESCENT_RUN, GALLERY_NORTH, GALLERY_EAST, GALLERY_SOUTH);
  const alcoves = STATION_XS.map((x) =>
    rect(earth, x - ALCOVE_WIDTH / 2, GALLERY_NORTH - ALCOVE_DEPTH, x + ALCOVE_WIDTH / 2, GALLERY_NORTH)
  );

  // -- East channel: cut BELOW the datum, so its west face is a drop to the bed
  // and its east face is the room's rock wall.
  const eastLink: WorldRect = {
    minX: eastMinX,
    maxX: eastMaxX,
    minZ: gallery.minZ,
    maxZ: earth.minZ + EAST_LINK_END,
  };
  const landing: WorldRect = {
    minX: eastMinX,
    maxX: eastMaxX,
    minZ: eastLink.maxZ,
    maxZ: eastLink.maxZ + LANDING_DEPTH,
  };
  const exitRamp: WorldRect = {
    minX: eastMinX,
    maxX: eastMaxX,
    minZ: landing.maxZ,
    maxZ: earth.minZ + EXIT_RAMP_END,
  };
  const doorApproach: WorldRect = {
    minX: eastMinX,
    maxX: eastMaxX,
    minZ: exitRamp.maxZ,
    maxZ: earth.maxZ,
  };
  const bed = rect(earth, BED_WEST, BED_NORTH, BED_EAST, BED_SOUTH);
  const cleft = rect(earth, CLEFT.minX, CLEFT.minZ, CLEFT.maxX, CLEFT.maxZ);

  const floorRects: FloorRect[] = [
    { id: "vestibule", rect: vestibule, kind: "flat", fromY: DOOR_Y, toY: DOOR_Y },
    { id: "overlook", rect: overlook, kind: "flat", fromY: OVERLOOK_Y, toY: OVERLOOK_Y },
    { id: "gallery", rect: gallery, kind: "flat", fromY: GALLERY_Y, toY: GALLERY_Y },
    { id: "alcove-g", rect: alcoves[0]!, kind: "flat", fromY: GALLERY_Y, toY: GALLERY_Y },
    { id: "alcove-h", rect: alcoves[1]!, kind: "flat", fromY: GALLERY_Y, toY: GALLERY_Y },
    { id: "alcove-i", rect: alcoves[2]!, kind: "flat", fromY: GALLERY_Y, toY: GALLERY_Y },
    { id: "landing", rect: landing, kind: "flat", fromY: LANDING_Y, toY: LANDING_Y },
    { id: "door-approach", rect: doorApproach, kind: "flat", fromY: DOOR_Y, toY: DOOR_Y },
    { id: "entry-ramp", rect: entryRamp, kind: "ramp-x", fromY: DOOR_Y, toY: OVERLOOK_Y },
    { id: "gallery-descent", rect: galleryDescent, kind: "ramp-x", fromY: DOOR_Y, toY: GALLERY_Y },
    { id: "east-link", rect: eastLink, kind: "ramp-z", fromY: GALLERY_Y, toY: LANDING_Y },
    { id: "exit-ramp", rect: exitRamp, kind: "ramp-z", fromY: LANDING_Y, toY: DOOR_Y },
  ];

  const stations: EarthStation[] = EARTH_CASE_LETTERS.map((letter, index) => ({
    letter,
    performerId: `cave-earth-automaton-${letter.toLowerCase()}`,
    ...CASE_BINDINGS[letter],
    centre: { x: earth.minX + STATION_XS[index]!, z: earth.minZ + STATION_Z },
    floorY: BED_Y,
  }));
  for (const station of stations) {
    if (!inRectClosed(bed, station.centre.x, station.centre.z)) {
      throw new Error(`Root Terrace layout: case ${station.letter} stands off the bed`);
    }
  }
  const middle = stations[1]!;
  const avenCentre = { x: middle.centre.x, z: middle.centre.z };
  // The daylight shaft drops onto the middle case. It must clear the catwalk,
  // or the visitor walks through the column of light instead of watching it
  // land on a performer.
  if (avenCentre.z - AVEN_RADIUS < gallery.maxZ) {
    throw new Error("Root Terrace layout: the aven cuts the gallery catwalk");
  }

  // One console per case, set into the catwalk's south rail cap directly
  // opposite its performer, with its alcove behind the operator.
  const consoles: EarthConsole[] = stations.map((station) => ({
    letter: station.letter,
    centre: { x: station.centre.x, z: gallery.maxZ },
    capY: CONSOLE_CAP_Y,
    width: CONSOLE_WIDTH,
    stand: { x: station.centre.x, z: gallery.maxZ - CONSOLE_SETBACK },
    standY: GALLERY_Y,
  }));
  for (const console_ of consoles) {
    if (!inRectClosed(gallery, console_.stand.x, console_.stand.z)) {
      throw new Error(`Root Terrace layout: console ${console_.letter} has no deck to stand on`);
    }
  }

  // The rail runs every drop edge, and only the drop edges. The east channel's
  // east face is rock rising, not a fall, and the overlook's east end is the
  // same, so neither carries brass.
  const rails: Point2[][] = [
    // The north lane over the bed: the entry ramp from the bed's west face,
    // then the overlook spur.
    [
      { x: bed.minX, z: bed.minZ },
      { x: overlook.maxX, z: bed.minZ },
    ],
    // The catwalk's south edge, the face the consoles are set into.
    [
      { x: bed.minX, z: gallery.maxZ },
      { x: gallery.maxX, z: gallery.maxZ },
    ],
    // The catwalk's north edge, stepping north around each alcove, then on
    // along the east link's north face.
    [
      { x: bed.minX, z: gallery.minZ },
      ...alcoves.flatMap((a) => [
        { x: a.minX, z: gallery.minZ },
        { x: a.minX, z: a.minZ },
        { x: a.maxX, z: a.minZ },
        { x: a.maxX, z: gallery.minZ },
      ]),
      { x: eastMaxX, z: gallery.minZ },
    ],
    // The east channel's west face, past the bed and then the cleft.
    [
      { x: eastMinX, z: gallery.maxZ },
      { x: eastMinX, z: earth.maxZ - 0.5 },
    ],
  ];

  // Half a metre in from the channel's west rail, which is where a person
  // stops at a railing. It is not a stylistic choice: a rail casts a shadow
  // outward across whatever is below it, and the further back the eye, the
  // more of the bed it hides. From here the bar sits under the sightline,
  // where a railing belongs, and the three cases nest away down the axis:
  // one shape at three scales.
  const ensembleEye = { x: landing.minX + 0.5, z: earth.minZ + STATION_Z };
  if (!inRectClosed(landing, ensembleEye.x, ensembleEye.z)) {
    throw new Error("Root Terrace layout: the ensemble landing is off the row's axis");
  }

  // The visitor arrives through the west door facing east, into the vestibule
  // with both routes ahead: the ramp up on their left, the descent on their
  // right. Yaw follows the museum compass (look direction sin/cos, 0 = south).
  const spawn = {
    centre: { x: earth.minX + SPAWN.x, z: earth.minZ + SPAWN.z },
    floorY: DOOR_Y,
    yaw: Math.PI / 2,
  };
  if (!inRectClosed(vestibule, spawn.centre.x, spawn.centre.z)) {
    throw new Error("Root Terrace layout: the spawn point is off the vestibule floor");
  }

  // -- Corridor from the First Fire. Both wings suppress their tile geometry,
  // so the corridor between them is suppressed too and this module owns it.
  const eb = earthWing.bounds;
  const corridor = fireWing
    ? bandRects(
        grid,
        fireWing.bounds.x + fireWing.bounds.width - 1,
        eb.x,
        Math.min(fireWing.bounds.y, eb.y) - 2,
        Math.max(
          fireWing.bounds.y + fireWing.bounds.height,
          eb.y + eb.height
        ) + 2,
        (t) => t === "corridor" || t === "door"
      )
    : [];

  // The footprint is the INTERIOR plus the corridor. The south wall row is the
  // Air corridor's first row and Air answers for it (cave-terrain-routing).
  const bayFootprint = [earth, ...corridor];
  return {
    earth,
    westDoor,
    southDoor,
    corridor,
    floorRects,
    vestibule,
    entryRamp,
    overlook,
    galleryDescent,
    gallery,
    alcoves,
    eastLink,
    landing,
    exitRamp,
    doorApproach,
    bed,
    cleft,
    avenCentre,
    stations,
    consoles,
    opener: {
      centre: { x: earth.minX + OPENER.x, z: earth.minZ + OPENER.z },
      floorY: DOOR_Y,
    },
    rails,
    ensemble: {
      eye: ensembleEye,
      eyeY: LANDING_Y + EYE_ABOVE_FLOOR,
      target: { x: stations[0]!.centre.x, z: stations[0]!.centre.z },
    },
    spawn,
    bayFootprint,
    bayBounds: unionRect(bayFootprint),
  };
}

/** Elevation on one floor rect, interpolated along a ramp's axis. */
export function heightOnFloor(floor: FloorRect, x: number, z: number): number {
  if (floor.kind === "flat") return floor.fromY;
  const alongZ = floor.kind === "ramp-z";
  const min = alongZ ? floor.rect.minZ : floor.rect.minX;
  const max = alongZ ? floor.rect.maxZ : floor.rect.maxX;
  const v = alongZ ? z : x;
  const t = max === min ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
  return floor.fromY + (floor.toY - floor.fromY) * t;
}

/**
 * A tile-centre probe can legally sit a quarter tile past a rect edge (the
 * door tiles in the wall rows do); the elevation query answers those from the
 * nearest deck. The BLOCKING query never grows: the deck edge is the edge.
 */
const TILE_ROUNDING_SLOP = TILE_METRES / 2;

function grown(r: WorldRect, by: number): WorldRect {
  return { minX: r.minX - by, maxX: r.maxX + by, minZ: r.minZ - by, maxZ: r.maxZ + by };
}

/** Elevation of the ribbon at a point, or null when the point is off it. */
export function ribbonElevationAt(
  layout: EarthRootTerraceLayout,
  x: number,
  z: number,
  slop = 0
): number | null {
  for (const floor of layout.floorRects) {
    if (inRectClosed(floor.rect, x, z)) return heightOnFloor(floor, x, z);
  }
  if (slop > 0) {
    for (const floor of layout.floorRects) {
      if (inRectClosed(grown(floor.rect, slop), x, z)) return heightOnFloor(floor, x, z);
    }
  }
  return null;
}

export function createEarthRootTerraceTerrain(grid: MuseumGrid): MuseumTerrainProgram | null {
  const layout = buildEarthRootTerraceLayout(grid);
  if (!layout) return null;
  const { earth, bed, cleft } = layout;
  return {
    waterlineY: -Infinity,
    elevationAt(x, z) {
      const onRibbon = ribbonElevationAt(layout, x, z, TILE_ROUNDING_SLOP);
      if (onRibbon !== null) return onRibbon;
      // Off the ribbon nothing is walkable, but the query must still answer:
      // the cleft and the bed at their own floors, everything else (the rock,
      // and the corridor outside the interior) at the datum.
      if (inRectClosed(cleft, x, z)) return CLEFT_Y;
      if (inRectClosed(bed, x, z)) return BED_Y;
      return DOOR_Y;
    },
    blockedAt(x, z) {
      // Only the room's interior is authored; the corridor from the Fire room
      // and the door tiles are museum circulation and always open.
      if (!inRectClosed(earth, x, z)) return false;
      return ribbonElevationAt(layout, x, z) === null;
    },
  };
}
