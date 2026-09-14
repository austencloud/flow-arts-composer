/**
 * The Root Terrace's Blender contract: every rect, datum and station of the
 * Earth layout, restated in the Blender authoring frame so the carve and the
 * production bake are driven by the same numbers physics reads.
 *
 * Frame: Blender x = plan.x − planCentre.x, Blender y = planCentre.z − plan.z
 * (north is +y), Blender z = elevation. The runtime mounts the GLB at the
 * compiled Earth interior's centre and maps (X, Y, Z) → (X, Z, −Y).
 *
 * scripts/export-earth-root-terrace-blender-plan.ts writes this as a
 * hash-stamped JSON manifest; the Blender scripts refuse to build from a
 * manifest whose digest does not match its own contract.
 */
import type { FloorRect, Point2, WorldRect } from "./drowned-gallery-terrain";
import type { MuseumGrid } from "../domain/museum-grid-types";
import { buildMuseumGrid } from "../services/museum-grid-builder";
import { GRID_CONFIG } from "./museum-room-graph";
import { MUSEUM_WALK_EDGES, MUSEUM_WALK_ROOMS, attachMuseumWalkTerrain } from "./museum-walk";
import {
  AVEN_RADIUS,
  AVEN_TOP_Y,
  BED_CROWN_Y,
  BED_Y,
  CLEFT_Y,
  CONSOLE_CAP_Y,
  DOOR_Y,
  EYE_ABOVE_FLOOR,
  GALLERY_Y,
  LANDING_Y,
  OVERLOOK_CROWN_Y,
  OVERLOOK_Y,
  PROP_CENTRE_ABOVE_FEET,
  RAIL_HEIGHT,
  VESTIBULE_CROWN_Y,
  buildEarthRootTerraceLayout,
  type EarthRootTerraceLayout,
} from "./earth-root-terrace-terrain";

export const EARTH_ROOT_TERRACE_SCENE_ID = "earth-root-terrace";
export const EARTH_ROOT_TERRACE_EXPORT_PREFIX = "ET_";
export const EARTH_ROOT_TERRACE_GLB_URL = "/models/museum/cave/earth-root-terrace.glb";

export interface BlenderPoint2 {
  x: number;
  y: number;
}
export interface BlenderPoint {
  x: number;
  y: number;
  z: number;
}
/** A plan rectangle in Blender x/y. */
export interface BlenderBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface BlenderFloor {
  id: string;
  box: BlenderBox;
  /** Blender axis the floor ramps along; a flat floor has none. */
  kind: "flat" | "ramp-x" | "ramp-y";
  /** Elevation at the box's minimum edge along the ramp axis (equal to toZ when flat). */
  fromZ: number;
  /** Elevation at the box's maximum edge along the ramp axis. */
  toZ: number;
  /** Vault crown over this floor. */
  crown: number;
}
export interface BlenderCamera {
  id: string;
  name: string;
  position: BlenderPoint;
  target: BlenderPoint;
  horizontalFovDegrees: number;
  type: "perspective" | "orthographic";
  orthographicScale?: number;
}

export interface EarthRootTerraceBlenderContract {
  schemaVersion: 1;
  sceneId: typeof EARTH_ROOT_TERRACE_SCENE_ID;
  sceneName: string;
  exportPrefix: typeof EARTH_ROOT_TERRACE_EXPORT_PREFIX;
  sourceModules: string[];
  collections: string[];
  room: {
    width: number;
    depth: number;
    planCentre: Point2;
    planInterior: WorldRect;
    blenderBounds: BlenderBox;
  };
  coordinateSystem: {
    origin: Point2;
    blender: string;
    gltfRuntime: { mount: string; mapping: string; integrationStatus: string };
  };
  datums: {
    door: number;
    overlook: number;
    gallery: number;
    landing: number;
    bed: number;
    cleft: number;
    bedCrown: number;
    overlookCrown: number;
    vestibuleCrown: number;
    avenTop: number;
    avenRadius: number;
    railHeight: number;
    eyeAboveFloor: number;
    propCentreAboveFeet: number;
  };
  floors: BlenderFloor[];
  bed: BlenderBox;
  cleft: BlenderBox;
  aven: { centre: BlenderPoint2; radius: number; base: number; top: number };
  doors: {
    west: { centre: BlenderPoint2; span: { min: number; max: number }; clearance: number };
    south: { centre: BlenderPoint2; span: { min: number; max: number }; clearance: number };
  };
  approachCorridor: {
    blenderRects: { centre: BlenderPoint2; sizeX: number; sizeY: number }[];
    clearance: number;
  };
  stations: {
    letter: string;
    performerId: string;
    sequenceId: string;
    catalogId: string;
    blender: BlenderPoint;
    /** Compass facing in Blender: the performers face +y, the terrace. */
    facing: "north";
  }[];
  opener: { blender: BlenderPoint };
  /**
   * Disjoint rail runs. The ribbon has separate exposed edges - the north
   * lane over the bed, the catwalk perimeter stepping around each alcove, and
   * the east channel's west face - and joining them into one polyline would
   * stand brass across the openings between them.
   */
  rails: { points: BlenderPoint2[]; height: number }[];
  /** The three control consoles, set flush into the catwalk's south rail cap. */
  consoles: {
    letter: string;
    blender: BlenderPoint2;
    capZ: number;
    width: number;
    stand: BlenderPoint;
  }[];
  ensemble: { eye: BlenderPoint; target: BlenderPoint };
  /** Where the visitor arrives, for the graybox walk test. */
  spawn: { blender: BlenderPoint; yaw: number };
  cameras: BlenderCamera[];
}

function clean(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function earthPlanPointToBlender(
  point: Point2,
  planCentre: Point2,
  elevation = 0
): BlenderPoint {
  return {
    x: clean(point.x - planCentre.x),
    y: clean(planCentre.z - point.z),
    z: clean(elevation),
  };
}

function boxOf(rect: WorldRect, c: Point2): BlenderBox {
  return {
    minX: clean(rect.minX - c.x),
    maxX: clean(rect.maxX - c.x),
    minY: clean(c.z - rect.maxZ),
    maxY: clean(c.z - rect.minZ),
  };
}

function floorOf(floor: FloorRect, c: Point2, crown: number): BlenderFloor {
  const box = boxOf(floor.rect, c);
  if (floor.kind === "flat") {
    return { id: floor.id, box, kind: "flat", fromZ: floor.fromY, toZ: floor.toY, crown };
  }
  if (floor.kind === "ramp-x") {
    return { id: floor.id, box, kind: "ramp-x", fromZ: floor.fromY, toZ: floor.toY, crown };
  }
  // A world ramp along +z runs along Blender −y: its minimum-Z end is the
  // box's maximum-y edge, so the ends swap.
  return { id: floor.id, box, kind: "ramp-y", fromZ: floor.toY, toZ: floor.fromY, crown };
}

// The crown steps three times on the way in: a low vestibule cave, the taller
// north lane the overlook sits in, and the full bed vault over the catwalk.
// The visitor ducks out of one and into the next, which is what makes the
// rootbed read as big when they reach it.
const FLOOR_CROWN: Record<string, number> = {
  vestibule: VESTIBULE_CROWN_Y,
  "entry-ramp": OVERLOOK_CROWN_Y,
  overlook: OVERLOOK_CROWN_Y,
  "gallery-descent": OVERLOOK_CROWN_Y,
  gallery: BED_CROWN_Y,
  "alcove-g": BED_CROWN_Y,
  "alcove-h": BED_CROWN_Y,
  "alcove-i": BED_CROWN_Y,
  "east-link": OVERLOOK_CROWN_Y,
  landing: OVERLOOK_CROWN_Y,
  "exit-ramp": OVERLOOK_CROWN_Y,
  "door-approach": OVERLOOK_CROWN_Y,
};

export function buildEarthRootTerraceBlenderContract(
  layout: EarthRootTerraceLayout
): EarthRootTerraceBlenderContract {
  const { earth } = layout;
  const c: Point2 = { x: (earth.minX + earth.maxX) / 2, z: (earth.minZ + earth.maxZ) / 2 };
  const p2 = (p: Point2): BlenderPoint2 => ({ x: clean(p.x - c.x), y: clean(c.z - p.z) });
  const p3 = (p: Point2, elevation: number): BlenderPoint => earthPlanPointToBlender(p, c, elevation);
  const DOOR_CLEARANCE = 3.4;

  const westDoorCentre: Point2 = { x: earth.minX, z: (layout.westDoor.min + layout.westDoor.max) / 2 };
  const southDoorCentre: Point2 = {
    x: (layout.southDoor.min + layout.southDoor.max) / 2,
    z: earth.maxZ,
  };

  const g = layout.stations[0]!.centre;
  const h = layout.stations[1]!.centre;
  const rampMidZ = (layout.entryRamp.minZ + layout.entryRamp.maxZ) / 2;
  const camera = (
    id: string,
    position: Point2,
    positionY: number,
    target: Point2,
    targetY: number,
    fov: number
  ): BlenderCamera => ({
    id,
    name: `CAM_${id}`,
    position: p3(position, positionY),
    target: p3(target, targetY),
    horizontalFovDegrees: fov,
    type: "perspective",
  });

  return {
    schemaVersion: 1,
    sceneId: EARTH_ROOT_TERRACE_SCENE_ID,
    sceneName: "Earth: The Root Terrace",
    exportPrefix: EARTH_ROOT_TERRACE_EXPORT_PREFIX,
    sourceModules: [
      "src/lib/features/museum/data/earth-root-terrace-terrain.ts",
      "src/lib/features/museum/data/earth-root-terrace-blender-contract.ts",
      "src/lib/features/museum/data/vulcan-cave-floor-plan.ts",
      "src/lib/features/museum/data/museum-walk.ts",
    ],
    collections: ["SHELL", "FURNITURE", "GROWTH", "LOCATORS", "CAMERAS", "QA_ONLY"],
    room: {
      width: clean(earth.maxX - earth.minX),
      depth: clean(earth.maxZ - earth.minZ),
      planCentre: { x: clean(c.x), z: clean(c.z) },
      planInterior: {
        minX: clean(earth.minX),
        maxX: clean(earth.maxX),
        minZ: clean(earth.minZ),
        maxZ: clean(earth.maxZ),
      },
      blenderBounds: boxOf(earth, c),
    },
    coordinateSystem: {
      origin: { x: clean(c.x), z: clean(c.z) },
      blender: "x = plan.x - planCentre.x; y = planCentre.z - plan.z; z = elevation (metres)",
      gltfRuntime: {
        mount: "compiled cave-earth interior centre, museum datum",
        mapping: "Blender (X, Y, Z) -> runtime (X, Z, -Y)",
        integrationStatus: "compiled-cave-earth-room",
      },
    },
    datums: {
      door: DOOR_Y,
      overlook: OVERLOOK_Y,
      gallery: GALLERY_Y,
      landing: LANDING_Y,
      bed: BED_Y,
      cleft: CLEFT_Y,
      bedCrown: BED_CROWN_Y,
      overlookCrown: OVERLOOK_CROWN_Y,
      vestibuleCrown: VESTIBULE_CROWN_Y,
      avenTop: AVEN_TOP_Y,
      avenRadius: AVEN_RADIUS,
      railHeight: RAIL_HEIGHT,
      eyeAboveFloor: EYE_ABOVE_FLOOR,
      propCentreAboveFeet: PROP_CENTRE_ABOVE_FEET,
    },
    floors: layout.floorRects.map((floor) =>
      floorOf(floor, c, FLOOR_CROWN[floor.id] ?? OVERLOOK_CROWN_Y)
    ),
    bed: boxOf(layout.bed, c),
    cleft: boxOf(layout.cleft, c),
    aven: {
      centre: p2(layout.avenCentre),
      radius: AVEN_RADIUS,
      base: BED_CROWN_Y - 3,
      top: AVEN_TOP_Y,
    },
    doors: {
      west: {
        centre: p2(westDoorCentre),
        span: { min: clean(c.z - layout.westDoor.max), max: clean(c.z - layout.westDoor.min) },
        clearance: DOOR_CLEARANCE,
      },
      south: {
        centre: p2(southDoorCentre),
        span: { min: clean(layout.southDoor.min - c.x), max: clean(layout.southDoor.max - c.x) },
        clearance: DOOR_CLEARANCE,
      },
    },
    approachCorridor: {
      blenderRects: layout.corridor.map((r) => ({
        centre: p2({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 }),
        sizeX: clean(r.maxX - r.minX),
        sizeY: clean(r.maxZ - r.minZ),
      })),
      clearance: DOOR_CLEARANCE,
    },
    stations: layout.stations.map((station) => ({
      letter: station.letter,
      performerId: station.performerId,
      sequenceId: station.sequenceId,
      catalogId: station.catalogId,
      blender: p3(station.centre, station.floorY),
      facing: "north",
    })),
    opener: { blender: p3(layout.opener.centre, layout.opener.floorY) },
    rails: layout.rails.map((run) => ({ points: run.map(p2), height: RAIL_HEIGHT })),
    consoles: layout.consoles.map((panel) => ({
      letter: panel.letter,
      blender: p2(panel.centre),
      capZ: CONSOLE_CAP_Y,
      width: panel.width,
      stand: p3(panel.stand, panel.standY),
    })),
    ensemble: {
      eye: p3(layout.ensemble.eye, layout.ensemble.eyeY),
      target: p3(layout.ensemble.target, BED_Y + PROP_CENTRE_ABOVE_FEET),
    },
    spawn: { blender: p3(layout.spawn.centre, layout.spawn.floorY), yaw: layout.spawn.yaw },
    cameras: [
      // Aimed between the wing stamp and the mouth of the ramp, not at the
      // opener. The opener is a runtime station and is not in the shell at
      // all, so aiming at it pointed the frame south and cut the class name
      // in half at the left edge - the one thing this beat exists to show.
      // A metre off the door axis so the vestibule has depth rather than
      // reading as a flat wall.
      camera(
        "threshold",
        { x: earth.minX + 0.8, z: westDoorCentre.z + 1.0 },
        DOOR_Y + EYE_ABOVE_FLOOR,
        { x: layout.vestibule.maxX - 0.6, z: westDoorCentre.z - 1.2 },
        DOOR_Y + 2.0,
        72
      ),
      // Six metres up the ramp, aimed at the MIDDLE case rather than the
      // nearest. From three metres up, aimed at G, half the frame was the
      // rock west of the rootbed; from here the pit opens along its length
      // and the climb is what the shot is about.
      camera(
        "ramp-climb",
        { x: layout.entryRamp.minX + 6, z: rampMidZ },
        DOOR_Y +
          (OVERLOOK_Y * 6) / (layout.entryRamp.maxX - layout.entryRamp.minX) +
          EYE_ABOVE_FLOOR,
        h,
        BED_Y + PROP_CENTRE_ABOVE_FEET,
        70
      ),
      // The overlook's standing point: a metre in from the spur's west end,
      // half a metre back from its rail. From here the foot line of every
      // case clears the catwalk rail below by 0.11 m - the tightest number
      // in the room, and the one the regrade is built around.
      camera(
        "overlook",
        { x: layout.overlook.minX + 1.0, z: layout.overlook.maxZ - 0.5 },
        OVERLOOK_Y + EYE_ABOVE_FLOOR,
        h,
        BED_Y + PROP_CENTRE_ABOVE_FEET,
        75
      ),
      // The regrade's whole argument in one frame: standing at the middle
      // console on the catwalk, the case is 4.05 m away and 24 degrees down.
      // The old terrace read the same performer at 9.2 m and 29 degrees.
      camera(
        "console",
        layout.consoles[1]!.stand,
        GALLERY_Y + EYE_ABOVE_FLOOR,
        h,
        BED_Y + PROP_CENTRE_ABOVE_FEET,
        68
      ),
      // Aimed at the bed floor under the middle case. The row runs AWAY from
      // this eye, so its three figures are not side by side in the frame but
      // stacked in depth. Dropping the landing to -1.2 flattened that axis
      // from a 12-to-47-degree spread to 4.7-to-22.5, which a normal lens
      // now holds end to end: one shape at three scales on one line.
      camera("ensemble", layout.ensemble.eye, layout.ensemble.eyeY, h, BED_Y, 75),
      camera(
        "exit",
        { x: (layout.exitRamp.minX + layout.exitRamp.maxX) / 2, z: layout.exitRamp.minZ + 1 },
        LANDING_Y - 0.2 + EYE_ABOVE_FLOOR,
        southDoorCentre,
        DOOR_Y + 1.2,
        72
      ),
      {
        id: "overview",
        name: "CAM_overview",
        position: p3({ x: earth.minX - 14, z: earth.maxZ + 18 }, 22),
        target: p3(c, 1.5),
        horizontalFovDegrees: 60,
        type: "perspective",
      },
      {
        id: "plan",
        name: "CAM_plan",
        position: p3(c, 40),
        target: p3(c, 0),
        horizontalFovDegrees: 0,
        type: "orthographic",
        orthographicScale: 44,
      },
    ],
  };
}

/**
 * The grid the museum actually walks: every room, laid out by the same engine
 * and config MuseumModule uses. The standalone cave plan
 * (buildVulcanCaveFloorPlan) places the SAME room interiors but not the same
 * neighbours — in the full museum the First Fire sits five metres further
 * south of this room than it does in the cave-only plan, so the corridor
 * between the two doors is five metres longer. The shell carves that corridor
 * (both rooms suppress their tile geometry), so the contract has to read it
 * from the grid the visitor stands in, not from the cave-only rehearsal.
 */
export function buildCompiledEarthRootTerraceGrid(): MuseumGrid {
  const grid = buildMuseumGrid(MUSEUM_WALK_ROOMS, MUSEUM_WALK_EDGES, GRID_CONFIG).grid;
  attachMuseumWalkTerrain(grid);
  return grid;
}

export function buildCompiledEarthRootTerraceBlenderContract(): EarthRootTerraceBlenderContract {
  const layout = buildEarthRootTerraceLayout(buildCompiledEarthRootTerraceGrid());
  if (!layout) {
    throw new Error("Root Terrace Blender contract: cave-earth is not in the museum plan");
  }
  return buildEarthRootTerraceBlenderContract(layout);
}
