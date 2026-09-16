import type { MotionData } from "../../core/types/sequence-engine-types.js";
import { calculateEndOrientation } from "../../core/orientation/OrientationCalculator.js";
import {
  LOOPComponent,
  type ComponentSpec,
  type PropLOOPSpec,
} from "../loop-spec.js";
import { LOCATION_MAP_CLOCKWISE } from "../placement-maps/circular-placement-maps.js";
import {
  DEFAULT_FLIPPED_AXIS,
  DEFAULT_MIRRORED_AXIS,
  reflectLocation,
} from "../placement-maps/strict-loop-placement-maps.js";

export interface SoloLOOPDetectionResult {
  readonly isLoop: boolean;
  readonly isContinuous: boolean;
  readonly closesLocation: boolean;
  readonly closesOrientation: boolean;
  readonly spec?: PropLOOPSpec;
}

function reverseRotation(
  direction: MotionData["rotationDirection"]
): MotionData["rotationDirection"] {
  if (direction === "cw") return "ccw";
  if (direction === "ccw") return "cw";
  return direction;
}

function invertMotionType(
  type: MotionData["motionType"]
): MotionData["motionType"] {
  if (type === "pro") return "anti";
  if (type === "anti") return "pro";
  return type;
}

/** Reverse one hand-neutral motion without changing its duration or turns. */
export function rewindSoloMotion(motion: MotionData): MotionData {
  return {
    ...motion,
    startLocation: motion.endLocation,
    endLocation: motion.startLocation,
    startOrientation: motion.endOrientation,
    endOrientation: motion.startOrientation,
    rotationDirection: reverseRotation(motion.rotationDirection),
  };
}

/**
 * Close any non-empty solo seed as a canonical REWOUND LOOP. The second half
 * retraces the first in reverse order, so both location and prop orientation
 * close exactly without needing a second prop as context.
 */
export function buildRewoundSoloLoop(
  seed: readonly MotionData[]
): MotionData[] {
  if (seed.length === 0) {
    throw new RangeError("A solo LOOP seed must contain at least one motion");
  }
  return [
    ...seed.map((motion) => ({ ...motion })),
    ...[...seed].reverse().map(rewindSoloMotion),
  ];
}

function materializeMotion(
  source: MotionData,
  previousOrientation: MotionData["startOrientation"],
  startLocation: string,
  endLocation: string,
  options: { reflect?: boolean; invert?: boolean } = {}
): MotionData {
  const rotationDirection =
    options.reflect || options.invert
      ? reverseRotation(source.rotationDirection)
      : source.rotationDirection;
  const motionType = options.invert
    ? invertMotionType(source.motionType)
    : source.motionType;
  const motion: MotionData = {
    ...source,
    startLocation: startLocation as MotionData["startLocation"],
    endLocation: endLocation as MotionData["endLocation"],
    startOrientation: previousOrientation,
    rotationDirection,
    motionType,
  };
  return {
    ...motion,
    endOrientation: calculateEndOrientation(motion),
  };
}

function materializePass(
  seed: readonly MotionData[],
  previousOrientation: MotionData["startOrientation"],
  transformLocation: (location: string) => string,
  options?: { reflect?: boolean; invert?: boolean }
): MotionData[] {
  const pass: MotionData[] = [];
  let orientation = previousOrientation;
  for (const source of seed) {
    const motion = materializeMotion(
      source,
      orientation,
      transformLocation(source.startLocation),
      transformLocation(source.endLocation),
      options
    );
    pass.push(motion);
    orientation = motion.endOrientation;
  }
  return pass;
}

/** Expand a seed whose endpoint is one orbit step from its start. */
export function buildRotatedSoloLoop(
  seed: readonly MotionData[],
  period: 2 | 4
): MotionData[] {
  if (seed.length === 0) {
    throw new RangeError("A solo LOOP seed must contain at least one motion");
  }
  const quarterTurns = period === 2 ? 2 : 1;
  const motions: MotionData[] = [];
  let orientation = seed[0]!.startOrientation;
  for (let pass = 0; pass < period; pass += 1) {
    const materialized = materializePass(seed, orientation, (location) =>
      rotateLocation(location, pass * quarterTurns)
    );
    motions.push(...materialized);
    orientation = materialized.at(-1)!.endOrientation;
  }
  return motions;
}

/** Expand a seed across one of the canonical reflection axes. */
export function buildReflectedSoloLoop(
  seed: readonly MotionData[],
  component: LOOPComponent.MIRRORED | LOOPComponent.FLIPPED
): MotionData[] {
  if (seed.length === 0) {
    throw new RangeError("A solo LOOP seed must contain at least one motion");
  }
  const axis =
    component === LOOPComponent.MIRRORED
      ? DEFAULT_MIRRORED_AXIS
      : DEFAULT_FLIPPED_AXIS;
  const reflected = materializePass(
    seed,
    seed.at(-1)!.endOrientation,
    (location) => reflectLocation(location, axis) ?? location,
    { reflect: true }
  );
  return [...seed.map((motion) => ({ ...motion })), ...reflected];
}

/** Expand a location-closed seed through the PRO/ANTI inversion primitive. */
export function buildInvertedSoloLoop(
  seed: readonly MotionData[]
): MotionData[] {
  if (seed.length === 0) {
    throw new RangeError("A solo LOOP seed must contain at least one motion");
  }
  const inverted = materializePass(
    seed,
    seed.at(-1)!.endOrientation,
    (location) => location,
    { invert: true }
  );
  return [...seed.map((motion) => ({ ...motion })), ...inverted];
}

function componentSpec(component: LOOPComponent, period: number): PropLOOPSpec {
  const value: ComponentSpec =
    component === LOOPComponent.MIRRORED
      ? { period, reflectionAxis: DEFAULT_MIRRORED_AXIS }
      : component === LOOPComponent.FLIPPED
        ? { period, reflectionAxis: DEFAULT_FLIPPED_AXIS }
        : { period };
  return { components: new Map([[component, value]]) };
}

function matchesRewind(a: MotionData, b: MotionData): boolean {
  return (
    b.startLocation === a.endLocation &&
    b.endLocation === a.startLocation &&
    b.startOrientation === a.endOrientation &&
    b.endOrientation === a.startOrientation &&
    b.motionType === a.motionType &&
    b.turns === a.turns &&
    b.rotationDirection === reverseRotation(a.rotationDirection)
  );
}

function rotateLocation(location: string, quarterTurns: number): string {
  let result = location;
  for (let index = 0; index < quarterTurns; index += 1) {
    result = LOCATION_MAP_CLOCKWISE[result] ?? result;
  }
  return result;
}

function matchesSpatialTransform(
  source: readonly MotionData[],
  candidate: readonly MotionData[],
  transform: (location: string) => string,
  reverseDirection = false
): boolean {
  return source.every((motion, index) => {
    const other = candidate[index];
    return (
      !!other &&
      other.motionType === motion.motionType &&
      other.turns === motion.turns &&
      other.rotationDirection ===
        (reverseDirection
          ? reverseRotation(motion.rotationDirection)
          : motion.rotationDirection) &&
      other.startLocation === transform(motion.startLocation) &&
      other.endLocation === transform(motion.endLocation)
    );
  });
}

function matchesInversion(
  source: readonly MotionData[],
  candidate: readonly MotionData[]
): boolean {
  return source.every((motion, index) => {
    const other = candidate[index];
    return (
      !!other &&
      other.startLocation === motion.startLocation &&
      other.endLocation === motion.endLocation &&
      other.motionType === invertMotionType(motion.motionType) &&
      other.rotationDirection === reverseRotation(motion.rotationDirection) &&
      other.turns === motion.turns
    );
  });
}

function detectStructure(
  motions: readonly MotionData[]
): PropLOOPSpec | undefined {
  if (motions.length % 4 === 0) {
    const quarter = motions.length / 4;
    const seed = motions.slice(0, quarter);
    const rotated = [1, 2, 3].every((pass) =>
      matchesSpatialTransform(
        seed,
        motions.slice(pass * quarter, (pass + 1) * quarter),
        (location) => rotateLocation(location, pass)
      )
    );
    if (rotated) return componentSpec(LOOPComponent.ROTATED, 4);
  }

  if (motions.length % 2 === 0) {
    const half = motions.length / 2;
    const first = motions.slice(0, half);
    const second = motions.slice(half);
    if (
      first.every((motion, index) =>
        matchesRewind(motion, second[half - 1 - index]!)
      )
    ) {
      return componentSpec(LOOPComponent.REWOUND, 2);
    }
    if (
      matchesSpatialTransform(first, second, (location) =>
        rotateLocation(location, 2)
      )
    ) {
      return componentSpec(LOOPComponent.ROTATED, 2);
    }
    if (
      matchesSpatialTransform(
        first,
        second,
        (location) =>
          reflectLocation(location, DEFAULT_MIRRORED_AXIS) ?? location,
        true
      )
    ) {
      return componentSpec(LOOPComponent.MIRRORED, 2);
    }
    if (
      matchesSpatialTransform(
        first,
        second,
        (location) =>
          reflectLocation(location, DEFAULT_FLIPPED_AXIS) ?? location,
        true
      )
    ) {
      return componentSpec(LOOPComponent.FLIPPED, 2);
    }
    if (matchesInversion(first, second)) {
      return componentSpec(LOOPComponent.INVERTED, 2);
    }
  }

  return undefined;
}

/** Detect a self-contained, structured LOOP on a single prop. */
export function detectSoloLOOP(
  motions: readonly MotionData[]
): SoloLOOPDetectionResult {
  if (motions.length === 0) {
    return {
      isLoop: false,
      isContinuous: false,
      closesLocation: false,
      closesOrientation: false,
    };
  }

  const isContinuous = motions.slice(1).every((motion, index) => {
    const previous = motions[index]!;
    return (
      motion.startLocation === previous.endLocation &&
      motion.startOrientation === previous.endOrientation
    );
  });
  const first = motions[0]!;
  const last = motions[motions.length - 1]!;
  const closesLocation = last.endLocation === first.startLocation;
  const closesOrientation = last.endOrientation === first.startOrientation;
  const spec =
    isContinuous && closesLocation && closesOrientation
      ? detectStructure(motions)
      : undefined;

  return {
    isLoop: !!spec,
    isContinuous,
    closesLocation,
    closesOrientation,
    ...(spec ? { spec } : {}),
  };
}
