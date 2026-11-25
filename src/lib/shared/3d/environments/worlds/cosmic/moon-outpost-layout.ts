import { Vector3 } from "three";

/**
 * The fixed facts of the lunar outpost and the pure arithmetic that places its
 * parametric parts around the landing pad. The authored model
 * (`scripts/build-moon-outpost.py`) uses the same sun and Earth directions,
 * converted from Blender's Z-up axes: Blender (x, y, z) is Three (x, z, -y).
 */

/**
 * Where the sun is, as a unit vector from the scene towards it. About 15
 * degrees above the horizon, to the right of and behind the opening view, so
 * shadows run long across the frame towards the camera's left. Everything that
 * is lit by the sun reads this one vector: the light, the Earth's day side and
 * the sun's disc in the sky.
 */
export const MOON_SUN_DIRECTION = Object.freeze(
  new Vector3(0.875, 0.259, -0.408).normalize()
) as Readonly<Vector3>;

/**
 * Where the Earth hangs, as a unit vector: 14.5 degrees up and 16 degrees left
 * of the opening view: whole in frame, clear of the hills and the toolbar.
 */
export const MOON_EARTH_DIRECTION = Object.freeze(
  new Vector3(-0.2669, 0.2504, -0.9307).normalize()
) as Readonly<Vector3>;

/** Earth's distance and radius: about 15 degrees across, far behind the hills. */
export const MOON_EARTH_DISTANCE = 320;
export const MOON_EARTH_RADIUS = 42;

/**
 * How far the Earth's lighting leans towards the viewer. The sun stands to the
 * right of and beyond the opening view, so true lighting shows the Earth only
 * half lit; the lean keeps its day side on the sun's side while turning enough
 * of it to the camera that land, ocean and the terminator read at a glance.
 */
export const MOON_EARTH_VIEWER_LEAN = 1.2;

/** The authored apron is flattened to this height (relative to groundY). */
export const MOON_APRON_HEIGHT = -0.02;

/** The pad reaches this far beyond the performers' stage radius. */
export const MOON_PAD_MARGIN = 2;
/** Floods aim at the performer's upper body, not at the ground. */
export const MOON_FLOOD_TARGET_HEIGHT = 1.4;
/** Half-angle of a flood's cone: tight enough to keep the feet out of it. */
export const MOON_FLOOD_ANGLE = 0.1;
/** Floodlight masts stand this far outside the pad's painted edge. */
export const MOON_MAST_OFFSET = 1;
/** The audience benches sit this far outside the pad's painted edge. */
export const MOON_BENCH_OFFSET = 1.4;
/** The cargo stands this far outside the pad's painted edge. */
export const MOON_CARGO_OFFSET = 2.6;

/** Audience arc, centred on +Z (between the opening camera and the pad). */
export const MOON_AUDIENCE_SPREAD = Math.PI * 0.55;

/** Mast directions in the ground plane, measured from +Z towards +X. */
const MAST_ANGLES = [-0.72 * Math.PI, 0.8 * Math.PI, -0.42 * Math.PI];
/** Cargo directions and which template each uses. */
const CARGO_SPOTS: readonly { angle: number; template: "A" | "B"; yaw: number }[] = [
  { angle: -0.85 * Math.PI, template: "A", yaw: 0.5 },
  { angle: -0.56 * Math.PI, template: "B", yaw: -0.3 },
];

export interface GroundPlacement {
  x: number;
  z: number;
  /** Rotation about Y. */
  yaw: number;
}

/** Radius of the painted pad for a stage of the given radius. */
export function moonPadRadius(stageRadius: number): number {
  return stageRadius + MOON_PAD_MARGIN;
}

function facingCentre(angle: number, radius: number): GroundPlacement {
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  // The templates face Three +Z, so turn +Z towards the pad centre.
  return { x, z, yaw: Math.atan2(-x, -z) };
}

/** Floodlight mast feet, each turned so its lamps face the pad centre. */
export function moonMastPlacements(padRadius: number): GroundPlacement[] {
  return MAST_ANGLES.map((angle) =>
    facingCentre(angle, padRadius + MOON_MAST_OFFSET)
  );
}

/** Cargo groups beside the pad. */
export function moonCargoPlacements(
  padRadius: number
): (GroundPlacement & { template: "A" | "B" })[] {
  return CARGO_SPOTS.map(({ angle, template, yaw }) => {
    const spot = facingCentre(angle, padRadius + MOON_CARGO_OFFSET);
    return { ...spot, yaw: spot.yaw + yaw, template };
  });
}

/** Radius of the audience arc for a pad of the given radius. */
export function moonAudienceArcRadius(padRadius: number): number {
  return padRadius + MOON_BENCH_OFFSET;
}

/**
 * One bench per audience seat, on the exact arc and facing that
 * `createCosmicAudience` uses, so every figure sits on its own bench.
 */
export function moonBenchPlacements(
  count: number,
  arcRadius: number,
  arcSpread = MOON_AUDIENCE_SPREAD
): GroundPlacement[] {
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const angle = (t - 0.5) * arcSpread;
    return {
      x: Math.sin(angle) * arcRadius,
      z: Math.cos(angle) * arcRadius,
      yaw: Math.PI + angle,
    };
  });
}

/** Number of flush lights round a pad of the given radius, about 1 m apart. */
export function moonPadLightCount(padRadius: number): number {
  return Math.max(16, Math.round((Math.PI * 2 * padRadius) / 1.0));
}

/**
 * Brightness of pad light `index` of `count` at time `seconds`: a slow chase
 * round the ring. With motion off, every light holds the same steady glow.
 */
export function moonPadLightLevel(
  index: number,
  count: number,
  seconds: number,
  motionScale: number
): number {
  if (motionScale <= 0) return 0.7;
  const head = (seconds * 0.12) % 1;
  let distance = index / count - head;
  distance -= Math.floor(distance);
  // The lit head trails a short fading tail.
  const tail = Math.max(0, 1 - distance * 7);
  return 0.35 + tail * tail * 1.4;
}

/** The comms beacon: a short flash every 2.4 s; steady with motion off. */
export function moonBeaconLevel(seconds: number, motionScale: number): number {
  if (motionScale <= 0) return 0.6;
  const phase = (seconds / 2.4) % 1;
  return phase < 0.12 ? 1 : 0.04;
}
