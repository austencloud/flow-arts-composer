/**
 * One settled reading of one configuration at one phase, reduced to the
 * numbers a matrix cell is scored on.
 *
 * The rig hands back three raw records per frame — the collisions it found,
 * the pose it achieved, and the post-IK grip geometry. This module turns a
 * confirmed pair of those records into a flat sample. It is deliberately pure
 * so the same derivation runs in a test with typed literals and in the browser
 * against a live skeleton, and so a matrix never re-derives a metric the
 * engine already computed.
 *
 * Reach numbers delegate to `performer-reach-measurements`, which owns what a
 * measured body can hold. Nothing here re-derives arm geometry.
 */

import type { CollisionEvent } from "@austencloud/scene-3d";

// The package exports `CollisionEvent` but not the field types it's built
// from, so derive them here rather than re-declaring the union by hand.
export type CollisionSeverity = CollisionEvent["severity"];
export type CollisionZone = CollisionEvent["zone"];
import {
  fitStaffLengthForHug,
  measurePerformerReach,
  type PerformerReachMeasurements,
} from "#lib/shared/3d/domain/performer-reach-measurements.js";

/** Read-only point. Structurally satisfied by three.js `Vector3`. */
export interface SweepPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SweepSegment {
  readonly a: SweepPoint;
  readonly b: SweepPoint;
}

/**
 * The subset of `AvatarPoseDiagnostics` the sweep scores on, restated
 * structurally so this module and its tests need no three.js import.
 */
export interface SweepPoseReading {
  requestedStanceYawRad: number;
  achievedShoulderYawRad: number;
  shoulderWidth: number;
  leftUpperArmLength: number;
  leftForearmLength: number;
  rightUpperArmLength: number;
  rightForearmLength: number;
}

/** The subset of `AvatarGripDiagnostics` the sweep scores on. */
export interface SweepGripReading {
  stepNumber: number;
  beatProgress: number;
  leftPalm: SweepPoint | null;
  rightPalm: SweepPoint | null;
  leftGripAxis: SweepPoint | null;
  rightGripAxis: SweepPoint | null;
  renderedBlueGrip: SweepPoint | null;
  renderedRedGrip: SweepPoint | null;
  blueStaffSegment: SweepSegment | null;
  redStaffSegment: SweepSegment | null;
}

/** Everything the rig reports on one frame. */
export interface SweepReading {
  collisionEvents: readonly CollisionEvent[];
  pose: SweepPoseReading;
  grip: SweepGripReading;
}

/** Worst-first ordering of the package's collision severities. */
export const COLLISION_SEVERITY_RANK: Record<CollisionSeverity, number> = {
  graze: 0,
  clip: 1,
  penetrate: 2,
};

/**
 * A staff passing through the other staff is a rendering artifact between two
 * held objects. A staff passing through the head is a body failure. Scoring
 * has to tell them apart, so the zones are split here rather than at the call
 * site.
 */
const PROP_ONLY_ZONES = new Set<CollisionZone>(["prop-through-prop"]);

export interface SweepCollisionMetrics {
  eventCount: number;
  /** Deepest penetration this frame, in millimetres. */
  deepestPenetrationMm: number;
  /** Deepest penetration that involves the body rather than only the props. */
  deepestBodyPenetrationMm: number;
  /** Deepest prop-through-prop overlap, which is a different kind of wrong. */
  deepestPropPenetrationMm: number;
  worstSeverity: CollisionSeverity | null;
  /** Worst severity among body zones only. */
  worstBodySeverity: CollisionSeverity | null;
  zones: readonly CollisionZone[];
  /** `zone:severity` pairs, sorted, for grouping distinct failure kinds. */
  kinds: readonly string[];
  worstDescription: string | null;
}

export interface SweepGripMetrics {
  /** Worst of the two hands: angle between the palm's grip axis and the shaft. */
  axisErrorDeg: number | null;
  /** Worst of the two hands: palm-to-rendered-grip distance. */
  contactOffsetMm: number | null;
  /** Distance between the two rendered grips. */
  gripSeparationMm: number | null;
  /** Longest rendered prop this frame, tip to tip. */
  renderedPropLengthMm: number | null;
}

export interface SweepStanceMetrics {
  requestedYawDeg: number;
  achievedYawDeg: number;
  /** How much of the requested turn the rig failed to deliver. */
  yawErrorDeg: number;
}

export interface SweepReachMetrics {
  measurements: PerformerReachMeasurements | null;
  reachMm: number | null;
  shoulderWidthMm: number | null;
  /** Longest prop this body can hold inside its own converged hold. */
  maxHoldableLengthCm: number | null;
  /** Configured length minus what the body can hold. Positive means too long. */
  propOverrunCm: number | null;
  /** The body cannot hold even the shortest supported prop. */
  reachTooShort: boolean;
}

export interface SweepConvergenceMetrics {
  /**
   * How far the two confirmation reads disagreed about where the grips are.
   * A converged solve reads the same twice; a still-moving one does not, and
   * that is exactly the transient that made a naive sampler report phantom
   * collisions right after a seek.
   */
  gripSeparationSpreadMm: number | null;
  /** How far the two reads disagreed about collision depth. */
  penetrationSpreadMm: number;
  /** Whether the two reads reported the same set of collision kinds. */
  kindsAgree: boolean;
}

export interface SweepPhaseSample {
  phase: number;
  stepNumber: number;
  beatProgress: number;
  collisions: SweepCollisionMetrics;
  grip: SweepGripMetrics;
  stance: SweepStanceMetrics;
  reach: SweepReachMetrics;
  convergence: SweepConvergenceMetrics;
}

const RAD_TO_DEG = 180 / Math.PI;

function distanceMm(a: SweepPoint | null, b: SweepPoint | null): number | null {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * 1000;
}

function segmentLengthMm(segment: SweepSegment | null): number | null {
  if (!segment) return null;
  return distanceMm(segment.a, segment.b);
}

/**
 * Angle between the hand's grip axis and the shaft it is supposed to be
 * holding. Sign is meaningless here — a hand rotated either way off the shaft
 * is equally wrong — so the absolute dot product folds the two directions
 * together and the answer stays in `[0, 90]`.
 */
export function gripAxisErrorDeg(
  axis: SweepPoint | null,
  segment: SweepSegment | null
): number | null {
  if (!axis || !segment) return null;
  const sx = segment.b.x - segment.a.x;
  const sy = segment.b.y - segment.a.y;
  const sz = segment.b.z - segment.a.z;
  const shaftLength = Math.hypot(sx, sy, sz);
  const axisLength = Math.hypot(axis.x, axis.y, axis.z);
  if (shaftLength < 1e-6 || axisLength < 1e-6) return null;
  const dot = Math.abs(
    (sx * axis.x + sy * axis.y + sz * axis.z) / (shaftLength * axisLength)
  );
  return Math.acos(Math.min(1, Math.max(-1, dot))) * RAD_TO_DEG;
}

function worstOf(
  a: number | null,
  b: number | null
): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

export function collisionMetrics(
  events: readonly CollisionEvent[]
): SweepCollisionMetrics {
  let deepest = 0;
  let deepestBody = 0;
  let deepestProp = 0;
  let worst: CollisionSeverity | null = null;
  let worstBody: CollisionSeverity | null = null;
  let worstDescription: string | null = null;
  const zones = new Set<CollisionZone>();
  const kinds = new Set<string>();

  for (const event of events) {
    zones.add(event.zone);
    kinds.add(`${event.zone}:${event.severity}`);
    const bodyZone = !PROP_ONLY_ZONES.has(event.zone);
    if (event.penetrationDepth > deepest) {
      deepest = event.penetrationDepth;
      worstDescription = event.description;
    }
    if (bodyZone && event.penetrationDepth > deepestBody) {
      deepestBody = event.penetrationDepth;
    }
    if (!bodyZone && event.penetrationDepth > deepestProp) {
      deepestProp = event.penetrationDepth;
    }
    if (!worst || COLLISION_SEVERITY_RANK[event.severity] > COLLISION_SEVERITY_RANK[worst]) {
      worst = event.severity;
    }
    if (
      bodyZone &&
      (!worstBody ||
        COLLISION_SEVERITY_RANK[event.severity] > COLLISION_SEVERITY_RANK[worstBody])
    ) {
      worstBody = event.severity;
    }
  }

  return {
    eventCount: events.length,
    deepestPenetrationMm: deepest * 1000,
    deepestBodyPenetrationMm: deepestBody * 1000,
    deepestPropPenetrationMm: deepestProp * 1000,
    worstSeverity: worst,
    worstBodySeverity: worstBody,
    zones: [...zones].sort(),
    kinds: [...kinds].sort(),
    worstDescription,
  };
}

export function gripMetrics(grip: SweepGripReading): SweepGripMetrics {
  return {
    axisErrorDeg: worstOf(
      gripAxisErrorDeg(grip.leftGripAxis, grip.blueStaffSegment),
      gripAxisErrorDeg(grip.rightGripAxis, grip.redStaffSegment)
    ),
    contactOffsetMm: worstOf(
      distanceMm(grip.leftPalm, grip.renderedBlueGrip),
      distanceMm(grip.rightPalm, grip.renderedRedGrip)
    ),
    gripSeparationMm: distanceMm(grip.renderedBlueGrip, grip.renderedRedGrip),
    renderedPropLengthMm: worstOf(
      segmentLengthMm(grip.blueStaffSegment),
      segmentLengthMm(grip.redStaffSegment)
    ),
  };
}

export function stanceMetrics(pose: SweepPoseReading): SweepStanceMetrics {
  const requestedYawDeg = pose.requestedStanceYawRad * RAD_TO_DEG;
  const achievedYawDeg = pose.achievedShoulderYawRad * RAD_TO_DEG;
  return {
    requestedYawDeg,
    achievedYawDeg,
    yawErrorDeg: Math.abs(requestedYawDeg - achievedYawDeg),
  };
}

/**
 * What this body can hold, and whether the prop the run configured fits.
 *
 * Both answers come from `performer-reach-measurements`: the arm chain the
 * skeleton reports becomes a reach, the reach becomes a converged hold, and
 * the hold bounds the prop. A rig whose skeleton has not finished loading
 * reports zero-length arms, which that owner rejects, so the metrics come back
 * null rather than describing a body that does not exist yet.
 */
export function reachMetrics(
  pose: SweepPoseReading,
  configuredPropLengthCm: number
): SweepReachMetrics {
  const measurements = measurePerformerReach({
    leftUpperArmM: pose.leftUpperArmLength,
    leftForearmM: pose.leftForearmLength,
    rightUpperArmM: pose.rightUpperArmLength,
    rightForearmM: pose.rightForearmLength,
    shoulderWidthM: pose.shoulderWidth,
  });
  if (!measurements) {
    return {
      measurements: null,
      reachMm: null,
      shoulderWidthMm: null,
      maxHoldableLengthCm: null,
      propOverrunCm: null,
      reachTooShort: false,
    };
  }
  const fit = fitStaffLengthForHug(measurements);
  return {
    measurements,
    reachMm: measurements.reachM * 1000,
    shoulderWidthMm: measurements.shoulderWidthM * 1000,
    maxHoldableLengthCm: fit.maxStaffLengthCm,
    propOverrunCm: configuredPropLengthCm - fit.maxStaffLengthCm,
    reachTooShort: !fit.fits,
  };
}

function sameKinds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((kind, index) => kind === b[index]);
}

/**
 * Fold a confirmed pair of reads into one sample.
 *
 * The second read is the sample. The first exists to prove the solve had
 * stopped moving: the disagreement between them becomes the convergence
 * metric, which is the only signal that separates a genuine clip from a
 * mid-seek transient.
 */
export function deriveSweepPhaseSample(
  phase: number,
  first: SweepReading,
  second: SweepReading,
  configuredPropLengthCm: number
): SweepPhaseSample {
  const firstCollisions = collisionMetrics(first.collisionEvents);
  const collisions = collisionMetrics(second.collisionEvents);
  const firstGrip = gripMetrics(first.grip);
  const grip = gripMetrics(second.grip);

  const gripSeparationSpreadMm =
    firstGrip.gripSeparationMm === null || grip.gripSeparationMm === null
      ? null
      : Math.abs(firstGrip.gripSeparationMm - grip.gripSeparationMm);

  return {
    phase,
    stepNumber: second.grip.stepNumber,
    beatProgress: second.grip.beatProgress,
    collisions,
    grip,
    stance: stanceMetrics(second.pose),
    reach: reachMetrics(second.pose, configuredPropLengthCm),
    convergence: {
      gripSeparationSpreadMm,
      penetrationSpreadMm: Math.abs(
        firstCollisions.deepestPenetrationMm - collisions.deepestPenetrationMm
      ),
      kindsAgree: sameKinds(firstCollisions.kinds, collisions.kinds),
    },
  };
}
