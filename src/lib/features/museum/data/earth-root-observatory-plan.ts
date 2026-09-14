/**
 * Measured Gate 1 spatial contract for the proposed Earth Root Observatory.
 *
 * Superseded: the Earth wing shipped as the Root Terrace
 * (`earth-root-terrace-terrain.ts`), and this plan is kept only as the record
 * of a proposal. It keeps the compiled 34 by 24 metre shell and its real Fire
 * and Air doors, then proposes a different interior. Drawings and later Blender
 * work must consume this contract instead of copying coordinates out of the
 * review board.
 */
import type { MuseumGrid } from "../domain/museum-grid-types";
import {
  doorSpan,
  interiorWorldRect,
  type Point2,
  type Span,
  type WorldRect,
} from "./drowned-gallery-terrain";

export const EARTH_ROOT_OBSERVATORY_ROOM_ID = "cave-earth";
export const EARTH_ROOT_OBSERVATORY_NOMINAL_SIZE = {
  width: 34,
  depth: 24,
} as const;
export const EARTH_ROOT_OBSERVATORY_ROUTE_WIDTH = 2.4;
export const EARTH_ROOT_OBSERVATORY_EYE_HEIGHT = 1.6;
export const EARTH_ROOT_OBSERVATORY_PERFORMER_FLOOR = -2.4;
export const EARTH_ROOT_OBSERVATORY_CEILING = 6.5;
export const EARTH_ROOT_OBSERVATORY_TREE_TOP = 15;

export const EARTH_ROOT_OBSERVATORY_PERFORMER_ORDER = ["g", "h", "i"] as const;
export type EarthRootObservatoryPerformerId =
  (typeof EARTH_ROOT_OBSERVATORY_PERFORMER_ORDER)[number];

export interface EarthRootObservatoryFrame {
  room: WorldRect;
  westDoor: Span;
  southDoor: Span;
}

export interface EarthRootObservatoryRoutePoint extends Point2 {
  elevation: number;
}

export interface EarthRootObservatoryStop extends EarthRootObservatoryRoutePoint {
  id: string;
  number: number;
  title: string;
  focus: string;
  action: string;
  response: string;
  nextCue: string;
}

export interface EarthRootObservatoryPerformer {
  id: EarthRootObservatoryPerformerId;
  label: "G" | "H" | "I";
  performerId: string;
  sequenceId: string;
  centre: Point2;
  floorElevation: number;
  habitatRadius: number;
  interactionRadius: number;
  environmentTrace: "ring" | "petal" | "ring-and-petal";
  environmentMeaning: string;
  viewingWindow: {
    fromPathIndex: number;
    toPathIndex: number;
    startFraction: number;
  };
}

export interface EarthRootObservatoryHabitatMass {
  id: string;
  label: string;
  centre: Point2;
  radiusX: number;
  radiusZ: number;
  maximumElevation: number;
  density: "moss" | "understory";
}

export interface EarthRootObservatoryOccluder {
  id: string;
  kind: "root-buttress";
  rect: WorldRect;
}

export interface EarthRootObservatoryTree {
  centre: Point2;
  baseElevation: number;
  trunkRadius: number;
  rootFieldRadius: number;
  ceilingBreakRadius: number;
  topElevation: number;
}

export interface EarthRootObservatoryCamera {
  position: EarthRootObservatoryRoutePoint;
  target: Point2;
  horizontalFovDegrees: number;
}

export interface EarthRootObservatoryPlan {
  room: WorldRect;
  westDoor: Span;
  southDoor: Span;
  routeWidth: number;
  eyeHeight: number;
  performerFloorElevation: number;
  ceilingElevation: number;
  tree: EarthRootObservatoryTree;
  performers: EarthRootObservatoryPerformer[];
  habitatMasses: EarthRootObservatoryHabitatMass[];
  occluders: EarthRootObservatoryOccluder[];
  walkPath: EarthRootObservatoryRoutePoint[];
  stops: EarthRootObservatoryStop[];
  finalCamera: EarthRootObservatoryCamera;
  recognitionZone: {
    centre: Point2;
    radius: number;
    prerequisitePerformerIds: EarthRootObservatoryPerformerId[];
  };
}

const NOMINAL_WIDTH = EARTH_ROOT_OBSERVATORY_NOMINAL_SIZE.width;
const NOMINAL_DEPTH = EARTH_ROOT_OBSERVATORY_NOMINAL_SIZE.depth;

const LOCAL_PERFORMERS = [
  {
    id: "g",
    label: "G",
    performerId: "cave-earth-automaton-g",
    sequenceId: "cave-earth-seq-g",
    centre: { x: 10.5, z: 10 },
    environmentTrace: "ring",
    environmentMeaning: "One continuous circular root channel",
    viewingWindow: {
      fromPathIndex: 2,
      toPathIndex: 3,
      startFraction: 0.25,
    },
  },
  {
    id: "h",
    label: "H",
    performerId: "cave-earth-automaton-h",
    sequenceId: "cave-earth-seq-h",
    centre: { x: 15, z: 6.5 },
    environmentTrace: "petal",
    environmentMeaning: "One continuous four-lobed root channel",
    viewingWindow: {
      fromPathIndex: 4,
      toPathIndex: 5,
      startFraction: 0.35,
    },
  },
  {
    id: "i",
    label: "I",
    performerId: "cave-earth-automaton-i",
    sequenceId: "cave-earth-seq-i",
    centre: { x: 25.5, z: 11.5 },
    environmentTrace: "ring-and-petal",
    environmentMeaning: "A circular channel intertwined with a petal channel",
    viewingWindow: {
      fromPathIndex: 6,
      toPathIndex: 7,
      startFraction: 0.35,
    },
  },
] as const;

const LOCAL_HABITAT_MASSES = [
  {
    id: "west-fern-shelf",
    label: "FERN SHELF",
    centre: { x: 6.5, z: 18 },
    radiusX: 2.3,
    radiusZ: 2.6,
    maximumElevation: -1.25,
    density: "understory",
  },
  {
    id: "south-west-fern-fan",
    label: "FERN FAN",
    centre: { x: 10.5, z: 20.5 },
    radiusX: 2.8,
    radiusZ: 1.4,
    maximumElevation: -1.35,
    density: "understory",
  },
  {
    id: "central-moss-terrace",
    label: "LOW MOSS",
    centre: { x: 16, z: 16 },
    radiusX: 2.5,
    radiusZ: 2,
    maximumElevation: -2.15,
    density: "moss",
  },
  {
    id: "north-root-understory",
    label: "ROOT UNDERSTORY",
    centre: { x: 19.2, z: 4.4 },
    radiusX: 1.7,
    radiusZ: 1,
    maximumElevation: -1.4,
    density: "understory",
  },
  {
    id: "east-fern-shelf",
    label: "FERN SHELF",
    centre: { x: 25.5, z: 18 },
    radiusX: 2,
    radiusZ: 2.4,
    maximumElevation: -1.3,
    density: "understory",
  },
] as const;

const LOCAL_OCCLUDERS = [
  {
    id: "root-ridge-g-h",
    kind: "root-buttress",
    rect: { minX: 11.8, maxX: 12.8, minZ: 5.5, maxZ: 8.2 },
  },
  {
    id: "root-ridge-h-i",
    kind: "root-buttress",
    rect: { minX: 21, maxX: 22.5, minZ: 6, maxZ: 8.5 },
  },
] as const;

const LOCAL_PATH: EarthRootObservatoryRoutePoint[] = [
  { x: 0, z: 12, elevation: 0 },
  { x: 3.2, z: 12, elevation: 0 },
  { x: 4.8, z: 14.5, elevation: 0 },
  { x: 7, z: 10.5, elevation: 0 },
  { x: 6, z: 3, elevation: 0.1 },
  { x: 14, z: 2.4, elevation: 0.15 },
  { x: 25.5, z: 3, elevation: 0.25 },
  { x: 29.5, z: 10.5, elevation: 0.3 },
  { x: 29.5, z: 17, elevation: 0.45 },
  { x: 18.5, z: 21.5, elevation: 0.6 },
  { x: 28.5, z: 21.5, elevation: 0.2 },
  { x: 32.5, z: 24, elevation: 0 },
];

const LOCAL_STOPS = [
  {
    id: "fire-threshold",
    number: 1,
    pathIndex: 1,
    title: "Fire threshold",
    focus: "The last green seam from Fire",
    action: "Walk through a low, wet root throat",
    response: "Heat and orange light fall away",
    nextCue: "Cool daylight leaks around the bend",
  },
  {
    id: "tree-reveal",
    number: 2,
    pathIndex: 2,
    title: "Tree reveal",
    focus: "The tree breaking through the cave roof",
    action: "Enter the root basin",
    response: "The room opens vertically around the trunk",
    nextCue: "A circular root current leads left to G",
  },
  {
    id: "performer-g",
    number: 3,
    pathIndex: 3,
    title: "G habitat",
    focus: "G alone on the west side",
    action: "Approach and keep moving along the ledge",
    response: "A circular root trace becomes visible and remains faintly lit",
    nextCue: "The retained trace climbs toward the north wall",
  },
  {
    id: "performer-h",
    number: 4,
    pathIndex: 5,
    title: "H habitat",
    focus: "H alone beneath the north wall",
    action: "Cross the northern bridge",
    response: "A four-lobed root trace becomes visible and remains",
    nextCue: "The branching trace turns east",
  },
  {
    id: "performer-i",
    number: 5,
    pathIndex: 7,
    title: "I habitat",
    focus: "I alone on the east side",
    action: "Round the east wall and approach",
    response: "Circular and petal traces interlock and remain",
    nextCue: "All three traces point toward the south rise",
  },
  {
    id: "recognition-overlook",
    number: 6,
    pathIndex: 9,
    title: "Recognition overlook",
    focus: "G, H, I, and the tree in one composition",
    action: "Complete the horseshoe and step onto the overlook",
    response:
      "The retained traces converge up the trunk; the canopy inclines toward the visitor",
    nextCue: "A cool opening appears at the south-east exit",
  },
  {
    id: "air-exit",
    number: 7,
    pathIndex: 11,
    title: "Air exit",
    focus: "The bright vertical opening into Air",
    action: "Descend the final gentle ramp",
    response: "The root response settles; one new leaf remains",
    nextCue: "Rising air replaces the room's damp stillness",
  },
] as const;

function scalePoint(point: Point2, room: WorldRect): Point2 {
  const width = room.maxX - room.minX;
  const depth = room.maxZ - room.minZ;
  return {
    x: room.minX + (point.x / NOMINAL_WIDTH) * width,
    z: room.minZ + (point.z / NOMINAL_DEPTH) * depth,
  };
}

function scaleLength(length: number, room: WorldRect): number {
  const xScale = (room.maxX - room.minX) / NOMINAL_WIDTH;
  const zScale = (room.maxZ - room.minZ) / NOMINAL_DEPTH;
  return length * Math.min(xScale, zScale);
}

function scaleRect(rect: WorldRect, room: WorldRect): WorldRect {
  const min = scalePoint({ x: rect.minX, z: rect.minZ }, room);
  const max = scalePoint({ x: rect.maxX, z: rect.maxZ }, room);
  return { minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z };
}

export function buildEarthRootObservatoryPlan(
  frame: EarthRootObservatoryFrame
): EarthRootObservatoryPlan {
  const { room } = frame;
  const entry = {
    x: room.minX,
    z: (frame.westDoor.min + frame.westDoor.max) / 2,
    elevation: 0,
  };
  const exit = {
    x: (frame.southDoor.min + frame.southDoor.max) / 2,
    z: room.maxZ,
    elevation: 0,
  };
  const walkPath = LOCAL_PATH.map((point, index) => ({
    ...scalePoint(point, room),
    elevation: point.elevation,
    ...(index === 0 ? entry : {}),
    ...(index === LOCAL_PATH.length - 1 ? exit : {}),
  }));
  const treeCentre = scalePoint({ x: 20.5, z: 9.5 }, room);
  const finalPosition = walkPath[9]!;

  return {
    room,
    westDoor: frame.westDoor,
    southDoor: frame.southDoor,
    routeWidth: scaleLength(EARTH_ROOT_OBSERVATORY_ROUTE_WIDTH, room),
    eyeHeight: EARTH_ROOT_OBSERVATORY_EYE_HEIGHT,
    performerFloorElevation: EARTH_ROOT_OBSERVATORY_PERFORMER_FLOOR,
    ceilingElevation: EARTH_ROOT_OBSERVATORY_CEILING,
    tree: {
      centre: treeCentre,
      baseElevation: EARTH_ROOT_OBSERVATORY_PERFORMER_FLOOR,
      trunkRadius: scaleLength(2.4, room),
      rootFieldRadius: scaleLength(6.2, room),
      ceilingBreakRadius: scaleLength(5.5, room),
      topElevation: EARTH_ROOT_OBSERVATORY_TREE_TOP,
    },
    performers: LOCAL_PERFORMERS.map((performer) => ({
      ...performer,
      centre: scalePoint(performer.centre, room),
      floorElevation: EARTH_ROOT_OBSERVATORY_PERFORMER_FLOOR,
      habitatRadius: scaleLength(2.2, room),
      interactionRadius: scaleLength(3.2, room),
    })),
    habitatMasses: LOCAL_HABITAT_MASSES.map((mass) => ({
      ...mass,
      centre: scalePoint(mass.centre, room),
      radiusX: scaleLength(mass.radiusX, room),
      radiusZ: scaleLength(mass.radiusZ, room),
    })),
    occluders: LOCAL_OCCLUDERS.map((occluder) => ({
      ...occluder,
      rect: scaleRect(occluder.rect, room),
    })),
    walkPath,
    stops: LOCAL_STOPS.map((stop) => ({
      id: stop.id,
      number: stop.number,
      title: stop.title,
      focus: stop.focus,
      action: stop.action,
      response: stop.response,
      nextCue: stop.nextCue,
      ...walkPath[stop.pathIndex]!,
    })),
    finalCamera: {
      position: finalPosition,
      // Aim between the outer performers. The tree stays slightly right of
      // centre, while G and I both remain inside a normal 75 degree frame.
      target: scalePoint({ x: 18.5, z: 9.5 }, room),
      horizontalFovDegrees: 75,
    },
    recognitionZone: {
      centre: finalPosition,
      radius: scaleLength(2.5, room),
      prerequisitePerformerIds: [...EARTH_ROOT_OBSERVATORY_PERFORMER_ORDER],
    },
  };
}

export function buildNominalEarthRootObservatoryPlan(): EarthRootObservatoryPlan {
  return buildEarthRootObservatoryPlan({
    room: { minX: 0, maxX: NOMINAL_WIDTH, minZ: 0, maxZ: NOMINAL_DEPTH },
    westDoor: { min: 11, max: 13 },
    southDoor: { min: 31.5, max: 33.5 },
  });
}

export function buildEarthRootObservatoryPlanForGrid(
  grid: MuseumGrid
): EarthRootObservatoryPlan | null {
  const wing = grid.wings.find(
    (candidate) => candidate.id === EARTH_ROOT_OBSERVATORY_ROOM_ID
  );
  if (!wing) return null;
  const westDoor = doorSpan(grid, EARTH_ROOT_OBSERVATORY_ROOM_ID, "west");
  const southDoor = doorSpan(grid, EARTH_ROOT_OBSERVATORY_ROOM_ID, "south");
  if (!westDoor || !southDoor) {
    throw new Error("Earth Root Observatory requires west and south doors");
  }
  return buildEarthRootObservatoryPlan({
    room: interiorWorldRect(wing.bounds),
    westDoor,
    southDoor,
  });
}

export function segmentIntersectsEarthRect(
  from: Point2,
  to: Point2,
  rect: WorldRect
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const p = [-dx, dx, -dz, dz];
  const q = [
    from.x - rect.minX,
    rect.maxX - from.x,
    from.z - rect.minZ,
    rect.maxZ - from.z,
  ];
  let near = 0;
  let far = 1;
  for (let index = 0; index < 4; index++) {
    const pi = p[index]!;
    const qi = q[index]!;
    if (Math.abs(pi) < 1e-12) {
      if (qi < 0) return false;
      continue;
    }
    const ratio = qi / pi;
    if (pi < 0) near = Math.max(near, ratio);
    else far = Math.min(far, ratio);
    if (near > far) return false;
  }
  return true;
}

export function segmentIntersectsEarthCircle(
  from: Point2,
  to: Point2,
  centre: Point2,
  radius: number
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-12) {
    return Math.hypot(from.x - centre.x, from.z - centre.z) <= radius;
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((centre.x - from.x) * dx + (centre.z - from.z) * dz) / lengthSquared
    )
  );
  const nearestX = from.x + dx * t;
  const nearestZ = from.z + dz * t;
  return Math.hypot(nearestX - centre.x, nearestZ - centre.z) <= radius;
}

export function isEarthRootObservatorySightlineBlocked(
  plan: EarthRootObservatoryPlan,
  from: Point2,
  to: Point2,
  includeTree = true
): boolean {
  if (
    plan.occluders.some((occluder) =>
      segmentIntersectsEarthRect(from, to, occluder.rect)
    )
  ) {
    return true;
  }
  return (
    includeTree &&
    segmentIntersectsEarthCircle(
      from,
      to,
      plan.tree.centre,
      plan.tree.trunkRadius
    )
  );
}

export function earthRootObservatoryRouteLength(
  plan: EarthRootObservatoryPlan
): number {
  return plan.walkPath.slice(1).reduce((total, point, index) => {
    const previous = plan.walkPath[index]!;
    return total + Math.hypot(point.x - previous.x, point.z - previous.z);
  }, 0);
}

export function earthRootObservatoryMaximumGrade(
  plan: EarthRootObservatoryPlan
): number {
  return plan.walkPath.slice(1).reduce((maximum, point, index) => {
    const previous = plan.walkPath[index]!;
    const run = Math.hypot(point.x - previous.x, point.z - previous.z);
    return Math.max(
      maximum,
      Math.abs(point.elevation - previous.elevation) / run
    );
  }, 0);
}

export interface EarthRootObservatoryViewingSample
  extends EarthRootObservatoryRoutePoint {
  fraction: number;
}

export function earthRootObservatoryViewingSamples(
  plan: EarthRootObservatoryPlan,
  performer: EarthRootObservatoryPerformer,
  sampleCount = 7
): EarthRootObservatoryViewingSample[] {
  const from = plan.walkPath[performer.viewingWindow.fromPathIndex];
  const to = plan.walkPath[performer.viewingWindow.toPathIndex];
  if (!from || !to) {
    throw new Error(`Invalid viewing window for performer ${performer.label}`);
  }
  if (sampleCount < 2) {
    throw new Error("A moving sightline window needs at least two samples");
  }

  return Array.from({ length: sampleCount }, (_, index) => {
    const progress = index / (sampleCount - 1);
    const fraction =
      performer.viewingWindow.startFraction +
      (1 - performer.viewingWindow.startFraction) * progress;
    return {
      x: from.x + (to.x - from.x) * fraction,
      z: from.z + (to.z - from.z) * fraction,
      elevation:
        from.elevation + (to.elevation - from.elevation) * fraction,
      fraction,
    };
  });
}

export function earthRootObservatoryFloorSightlineMargin(
  plan: EarthRootObservatoryPlan,
  viewer: EarthRootObservatoryRoutePoint,
  performer: EarthRootObservatoryPerformer
): number {
  const distance = Math.hypot(
    performer.centre.x - viewer.x,
    performer.centre.z - viewer.z
  );
  if (distance <= plan.routeWidth / 2) return Number.NEGATIVE_INFINITY;

  const eyeElevation = viewer.elevation + plan.eyeHeight;
  const routeEdgeDistance = plan.routeWidth / 2;
  const sightlineAtRouteEdge =
    eyeElevation +
    (performer.floorElevation - eyeElevation) *
      (routeEdgeDistance / distance);

  return sightlineAtRouteEdge - viewer.elevation;
}

export function earthRootObservatoryMinimumRouteSeparation(
  plan: EarthRootObservatoryPlan,
  target: Point2
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < plan.walkPath.length; index++) {
    const from = plan.walkPath[index - 1]!;
    const to = plan.walkPath[index]!;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const lengthSquared = dx * dx + dz * dz;
    const fraction =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((target.x - from.x) * dx + (target.z - from.z) * dz) /
                lengthSquared
            )
          );
    const nearest = {
      x: from.x + dx * fraction,
      z: from.z + dz * fraction,
    };
    minimum = Math.min(
      minimum,
      Math.hypot(target.x - nearest.x, target.z - nearest.z)
    );
  }
  return minimum;
}

export function earthRootObservatoryBearingFromNorth(
  from: Point2,
  to: Point2
): number {
  return (Math.atan2(to.x - from.x, from.z - to.z) * 180) / Math.PI;
}

export function isInsideEarthRootObservatoryFinalFrame(
  plan: EarthRootObservatoryPlan,
  target: Point2
): boolean {
  const cameraBearing = earthRootObservatoryBearingFromNorth(
    plan.finalCamera.position,
    plan.finalCamera.target
  );
  const targetBearing = earthRootObservatoryBearingFromNorth(
    plan.finalCamera.position,
    target
  );
  let difference = targetBearing - cameraBearing;
  while (difference > 180) difference -= 360;
  while (difference < -180) difference += 360;
  return Math.abs(difference) <= plan.finalCamera.horizontalFovDegrees / 2;
}
