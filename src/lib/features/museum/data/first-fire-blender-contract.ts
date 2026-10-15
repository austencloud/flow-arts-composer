/**
 * Blender authoring bridge for First Fire: The Cinder Court.
 *
 * The measured plan remains the spatial owner. This module converts its X/Z
 * ground plane into Blender's local X/Y plane with Z up and packages only the
 * information an artist or deterministic graybox builder needs.
 */
import type { Point2, WorldRect } from "./drowned-gallery-terrain";
import { buildVulcanCaveFloorPlan } from "./vulcan-cave-floor-plan";
import { buildFirstFireProcessionBay } from "./first-fire-procession-terrain";
import {
  buildNominalFirstFireProcessionPlan,
  type FirstFireProcessionPlan,
  type FirstFireShrineId,
} from "./first-fire-procession-plan";

export const FIRST_FIRE_BLENDER_CONTRACT_SCHEMA_VERSION = 2;
export const FIRST_FIRE_BLENDER_SCENE_NAME = "First Fire Cinder Court Graybox";
export const FIRST_FIRE_BLENDER_PLAYER_EYE_HEIGHT = 1.7;

export const FIRST_FIRE_BLENDER_COLLECTIONS = [
  "SHELL",
  "BASALT",
  "COURTS",
  "ROUTE",
  "PERFORMERS",
  "FIRE_GUIDES",
  "REFERENCE",
  "LOCATORS",
  "CAMERAS",
  "QA_ONLY",
] as const;

export const FIRST_FIRE_SEQUENCE_CATALOG = {
  dj: { catalogId: "tnd-split-opp-jdjd", word: "JDJD" },
  ek: { catalogId: "tnd-split-opp-keke", word: "KEKE" },
  fl: { catalogId: "tnd-split-opp-lflf", word: "LFLF" },
} as const;

export interface BlenderPoint {
  x: number;
  y: number;
  z: number;
}

export interface BlenderFootprint {
  centre: BlenderPoint;
  sizeX: number;
  sizeY: number;
}

export interface FirstFireBlenderCamera {
  id: string;
  name: string;
  position: BlenderPoint;
  target: BlenderPoint;
  horizontalFovDegrees: number;
  type: "perspective" | "orthographic";
  orthographicScale?: number;
}

export interface FirstFireBlenderContract {
  schemaVersion: number;
  sceneName: string;
  units: "metres";
  sourceModules: readonly string[];
  collections: readonly string[];
  coordinateSystem: {
    plan: {
      groundAxes: "X/Z";
      xDirection: "Water to Earth";
      zDirection: "room depth";
      origin: "north-west interior corner";
    };
    blender: {
      groundAxes: "X/Y";
      upAxis: "+Z";
      xFormula: "plan.x - roomCentre.x";
      yFormula: "roomCentre.z - plan.z";
      zFormula: "elevation";
    };
    gltfRuntime: {
      groundAxes: "X/Z";
      upAxis: "+Y";
      exporterTransform: "(Blender X, Y, Z) -> (runtime X, Z, -Y)";
      mount: string;
      integrationStatus:
        | "compiled-cave-fire-room"
        | "not-the-compiled-cave-fire-room";
      rotationRadians: readonly [0, 0, 0];
      scale: 1;
    };
  };
  room: {
    planBounds: WorldRect;
    planCentre: Point2;
    width: number;
    depth: number;
    playerEyeHeight: number;
    blenderBounds: {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
    };
  };
  doors: {
    water: {
      side: "west";
      plan: Point2;
      blender: BlenderPoint;
      /** The route's mouth at the doorway (4 m). */
      clearWidth: number;
      /** The museum's stamped doorway inside that mouth; the shell is cut to THIS. */
      tileClearWidth: number;
    };
    earth: {
      side: "east";
      plan: Point2;
      blender: BlenderPoint;
      clearWidth: number;
      tileClearWidth: number;
    };
  };
  /**
   * The museum corridor from the grotto's east door to this room's west door.
   * Both rooms suppress their tile geometry, so this shell must carry it: a
   * low passage at the corridor's real tile extent, in Blender metres.
   * Null for the isolated nominal plan.
   */
  approachCorridor: {
    clearance: number;
    planRects: WorldRect[];
    blenderRects: BlenderFootprint[];
  } | null;
  threshold: {
    planRect: WorldRect;
    blenderFootprint: BlenderFootprint;
    planCentre: Point2;
    blenderCentre: BlenderPoint;
  };
  courts: Array<{
    id: string;
    shrineId: string;
    planOutline: Point2[];
    blenderOutline: BlenderPoint[];
    planThroatCentre: Point2;
    blenderThroatCentre: BlenderPoint;
    planBeacon: Point2;
    blenderBeacon: BlenderPoint;
    planApproach: Point2;
    blenderApproach: BlenderPoint;
    planExitThroat: Point2;
    blenderExitThroat: BlenderPoint;
    throatWidth: number;
    sharedEntryAndExit: false;
  }>;
  shrines: Array<{
    id: FirstFireShrineId;
    label: string;
    performerId: string;
    sequenceId: string;
    catalogId: string;
    word: string;
    planCentre: Point2;
    blenderCentre: BlenderPoint;
    planEntry: Point2;
    blenderEntry: BlenderPoint;
    planExit: Point2;
    blenderExit: BlenderPoint;
    habitatRadius: number;
    trenchInnerRadius: number;
    trenchOuterRadius: number;
    orbitRadius: number;
    orbitWidth: number;
    orbitStartDegrees: number;
    orbitSweepDegrees: number;
    activationZones: Array<{
      id: string;
      startDegrees: number;
      sweepDegrees: number;
    }>;
  }>;
  pathSections: Array<{
    id: string;
    kind: string;
    shrineId?: string;
    width: number;
    planPoints: Point2[];
    blenderPoints: BlenderPoint[];
  }>;
  basalt: Array<{
    id: string;
    kind: string;
    planRect: WorldRect;
    blenderFootprint: BlenderFootprint;
    planPolygon: Point2[];
    blenderPolygon: BlenderPoint[];
    minimumHeight: number;
  }>;
  fireGuides: Array<{
    id: string;
    kind: string;
    state: string;
    collision: false;
    width: number;
    planPoints: Point2[];
    blenderPoints: BlenderPoint[];
  }>;
  torchBudget: FirstFireProcessionPlan["torchBudget"];
  cameras: FirstFireBlenderCamera[];
}

function clean(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : value;
}

export function firstFirePlanPointToBlender(
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

export function firstFireBlenderPointToPlan(
  point: BlenderPoint,
  planCentre: Point2
): Point2 {
  return {
    x: clean(point.x + planCentre.x),
    z: clean(planCentre.z - point.y),
  };
}

export function firstFirePlanRectToBlenderFootprint(
  rect: WorldRect,
  planCentre: Point2,
  elevation = 0
): BlenderFootprint {
  return {
    centre: firstFirePlanPointToBlender(
      {
        x: (rect.minX + rect.maxX) / 2,
        z: (rect.minZ + rect.maxZ) / 2,
      },
      planCentre,
      elevation
    ),
    sizeX: clean(rect.maxX - rect.minX),
    sizeY: clean(rect.maxZ - rect.minZ),
  };
}

function camera(
  id: string,
  position: Point2,
  target: Point2,
  planCentre: Point2,
  horizontalFovDegrees = 68
): FirstFireBlenderCamera {
  return {
    id,
    name: `QA_Camera_${id.replaceAll("-", "_")}`,
    position: firstFirePlanPointToBlender(
      position,
      planCentre,
      FIRST_FIRE_BLENDER_PLAYER_EYE_HEIGHT
    ),
    target: firstFirePlanPointToBlender(target, planCentre, 1.05),
    horizontalFovDegrees,
    type: "perspective",
  };
}

/** Headroom of the grotto→fire passage: a squeeze before the court opens. */
export const FIRST_FIRE_APPROACH_CORRIDOR_CLEARANCE = 2.6;

export function buildFirstFireBlenderContract(
  plan = buildNominalFirstFireProcessionPlan(),
  approachCorridor: WorldRect[] = []
): FirstFireBlenderContract {
  const compiled = plan.doorTileSpans !== undefined;
  const width = plan.room.maxX - plan.room.minX;
  const depth = plan.room.maxZ - plan.room.minZ;
  const planCentre = {
    x: plan.room.minX + width / 2,
    z: plan.room.minZ + depth / 2,
  };
  const toBlender = (point: Point2, elevation = 0) =>
    firstFirePlanPointToBlender(point, planCentre, elevation);
  const westDoorCentre = (plan.westDoor.min + plan.westDoor.max) / 2;
  const eastDoorCentre = (plan.eastDoor.min + plan.eastDoor.max) / 2;
  const waterDoor = { x: plan.room.minX, z: westDoorCentre };
  const earthDoor = { x: plan.room.maxX, z: eastDoorCentre };
  const shrine = (id: "dj" | "ek" | "fl") => {
    const result = plan.shrines.find((candidate) => candidate.id === id);
    if (!result) throw new Error(`First Fire Blender contract: missing ${id}`);
    return result;
  };
  const dj = shrine("dj");
  const ek = shrine("ek");
  const fl = shrine("fl");
  const thresholdCentre = {
    x: (plan.threshold.minX + plan.threshold.maxX) / 2,
    z: (plan.threshold.minZ + plan.threshold.maxZ) / 2,
  };
  const gateFor = (id: "dj" | "ek" | "fl") => {
    const result = plan.gates.find((candidate) => candidate.shrineId === id);
    if (!result) {
      throw new Error(`First Fire Blender contract: missing ${id} gate`);
    }
    return result;
  };

  return {
    schemaVersion: FIRST_FIRE_BLENDER_CONTRACT_SCHEMA_VERSION,
    sceneName: FIRST_FIRE_BLENDER_SCENE_NAME,
    units: "metres",
    sourceModules: [
      "src/lib/features/museum/data/first-fire-procession-plan.ts",
    ],
    collections: FIRST_FIRE_BLENDER_COLLECTIONS,
    coordinateSystem: {
      plan: {
        groundAxes: "X/Z",
        xDirection: "Water to Earth",
        zDirection: "room depth",
        origin: "north-west interior corner",
      },
      blender: {
        groundAxes: "X/Y",
        upAxis: "+Z",
        xFormula: "plan.x - roomCentre.x",
        yFormula: "roomCentre.z - plan.z",
        zFormula: "elevation",
      },
      gltfRuntime: {
        groundAxes: "X/Z",
        upAxis: "+Y",
        exporterTransform: "(Blender X, Y, Z) -> (runtime X, Z, -Y)",
        mount: compiled
          ? "compiled cave-fire room; GLB origin at the plan centre, museum datum floor"
          : "isolated 58 x 44 metre Gate 2 review shell",
        integrationStatus: compiled
          ? "compiled-cave-fire-room"
          : "not-the-compiled-cave-fire-room",
        rotationRadians: [0, 0, 0],
        scale: 1,
      },
    },
    room: {
      planBounds: plan.room,
      planCentre,
      width,
      depth,
      playerEyeHeight: FIRST_FIRE_BLENDER_PLAYER_EYE_HEIGHT,
      blenderBounds: {
        minX: clean(plan.room.minX - planCentre.x),
        maxX: clean(plan.room.maxX - planCentre.x),
        minY: clean(planCentre.z - plan.room.maxZ),
        maxY: clean(planCentre.z - plan.room.minZ),
      },
    },
    doors: {
      water: {
        side: "west",
        plan: waterDoor,
        blender: toBlender(waterDoor),
        clearWidth: clean(plan.westDoor.max - plan.westDoor.min),
        tileClearWidth: clean(
          (plan.doorTileSpans?.west ?? plan.westDoor).max -
            (plan.doorTileSpans?.west ?? plan.westDoor).min
        ),
      },
      earth: {
        side: "east",
        plan: earthDoor,
        blender: toBlender(earthDoor),
        clearWidth: clean(plan.eastDoor.max - plan.eastDoor.min),
        tileClearWidth: clean(
          (plan.doorTileSpans?.east ?? plan.eastDoor).max -
            (plan.doorTileSpans?.east ?? plan.eastDoor).min
        ),
      },
    },
    approachCorridor:
      approachCorridor.length > 0
        ? {
            clearance: FIRST_FIRE_APPROACH_CORRIDOR_CLEARANCE,
            planRects: approachCorridor,
            blenderRects: approachCorridor.map((rect) =>
              firstFirePlanRectToBlenderFootprint(rect, planCentre)
            ),
          }
        : null,
    threshold: {
      planRect: plan.threshold,
      blenderFootprint: firstFirePlanRectToBlenderFootprint(
        plan.threshold,
        planCentre
      ),
      planCentre: thresholdCentre,
      blenderCentre: toBlender(thresholdCentre),
    },
    courts: plan.shrines.map((candidate) => {
      const gate = gateFor(candidate.id);
      return {
        id: `${candidate.id}-court`,
        shrineId: candidate.id,
        planOutline: candidate.courtPolygon,
        blenderOutline: candidate.courtPolygon.map((point) => toBlender(point)),
        planThroatCentre: candidate.entry,
        blenderThroatCentre: toBlender(candidate.entry),
        planBeacon: gate.beacon,
        blenderBeacon: toBlender(gate.beacon),
        planApproach: gate.approach,
        blenderApproach: toBlender(gate.approach),
        planExitThroat: candidate.exit,
        blenderExitThroat: toBlender(candidate.exit),
        throatWidth: gate.width,
        sharedEntryAndExit: false as const,
      };
    }),
    shrines: plan.shrines.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      performerId: candidate.performerId,
      sequenceId: candidate.sequenceId,
      catalogId: FIRST_FIRE_SEQUENCE_CATALOG[candidate.id].catalogId,
      word: FIRST_FIRE_SEQUENCE_CATALOG[candidate.id].word,
      planCentre: candidate.centre,
      blenderCentre: toBlender(candidate.centre),
      planEntry: candidate.entry,
      blenderEntry: toBlender(candidate.entry),
      planExit: candidate.exit,
      blenderExit: toBlender(candidate.exit),
      habitatRadius: candidate.habitatRadius,
      trenchInnerRadius: candidate.trenchInnerRadius,
      trenchOuterRadius: candidate.trenchOuterRadius,
      orbitRadius: candidate.orbitRadius,
      orbitWidth: candidate.orbitWidth,
      orbitStartDegrees: candidate.orbitStartDegrees,
      orbitSweepDegrees: candidate.orbitSweepDegrees,
      activationZones: candidate.activationZones,
    })),
    pathSections: plan.pathSections.map((section) => ({
      id: section.id,
      kind: section.kind,
      ...(section.shrineId ? { shrineId: section.shrineId } : {}),
      width: section.width,
      planPoints: section.points,
      blenderPoints: section.points.map((point) => toBlender(point, 0.035)),
    })),
    basalt: plan.basaltMasses.map((mass) => ({
      id: mass.id,
      kind: mass.kind,
      planRect: mass.rect,
      blenderFootprint: firstFirePlanRectToBlenderFootprint(
        mass.rect,
        planCentre
      ),
      planPolygon: mass.polygon,
      blenderPolygon: mass.polygon.map((point) => toBlender(point)),
      minimumHeight: mass.minimumHeight,
    })),
    fireGuides: plan.guidePaths.map((guide) => ({
      id: guide.id,
      kind: guide.kind,
      state: guide.state,
      collision: guide.collision,
      width: guide.width,
      planPoints: guide.points,
      blenderPoints: guide.points.map((point) => toBlender(point, 0.04)),
    })),
    torchBudget: plan.torchBudget,
    cameras: [
      camera(
        "water-entry",
        { x: 2, z: westDoorCentre },
        thresholdCentre,
        planCentre,
        72
      ),
      camera(
        "ember-bridge",
        thresholdCentre,
        gateFor("dj").beacon,
        planCentre,
        68
      ),
      camera("dj-threshold", dj.entry, dj.centre, planCentre, 62),
      camera("ek-threshold", ek.entry, ek.centre, planCentre, 62),
      camera("fl-threshold", fl.entry, fl.centre, planCentre, 62),
      camera("blackout", fl.exit, earthDoor, planCentre, 70),
      camera("earth-reveal", { x: 54, z: 28 }, earthDoor, planCentre, 68),
      {
        id: "overview",
        name: "QA_Camera_overview",
        position: { x: 34, y: -31, z: 30 },
        target: { x: 0, y: 0, z: 1.2 },
        horizontalFovDegrees: 52,
        type: "perspective",
      },
      {
        id: "plan",
        name: "QA_Camera_plan",
        position: { x: 0, y: 0, z: 52 },
        target: { x: 0, y: 0, z: 0 },
        horizontalFovDegrees: 52,
        type: "orthographic",
        orthographicScale: 62,
      },
    ],
  };
}

/**
 * The contract for the room the museum actually compiles: the procession laid
 * on the live cave-fire wing, with its stamped doors and the corridor from the
 * grotto. This is what the production shell is built from.
 */
export function buildCompiledFirstFireBlenderContract(): FirstFireBlenderContract {
  const bay = buildFirstFireProcessionBay(buildVulcanCaveFloorPlan().grid);
  if (!bay)
    throw new Error(
      "First Fire Blender contract: cave-fire is not in the museum plan"
    );
  return buildFirstFireBlenderContract(bay.plan, bay.corridor);
}
