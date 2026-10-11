/**
 * Camera-choreography shot helpers.
 *
 * Pure functions that compute camera target + eye position for each
 * plane-locked shot and the auto-orbit opening shot. Shared across
 * presets so Plane-locked, Quad-plane tour, and Ensemble-focus all
 * frame the same way.
 */

import { Vector3 } from "three";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { joinedPerformerExtent } from "#lib/shared/3d/camera/viewer-camera-framing.js";
import {
  DEFAULT_PERFORMER_HAND_DISTANCE,
  largestHandDistance,
  type PerformerHandDistance,
} from "#lib/shared/3d/domain/performer-hand-distance.js";
import { resolveGridJoin3D } from "#lib/shared/3d/services/grid-join-3d.js";

export type Plane3 = "wall" | "wheel" | "floor";

/** Body-reference y-level used as camera target height. */
export const TARGET_Y = 0;
/**
 * Safety padding added to the performer-group radius when fitting the
 * shot. Matches the spec's "+1.2m safety" callout for Auto-orbit and
 * the "+10% padding" for plane-locked shots.
 */
const AUTO_ORBIT_SAFETY_METERS = 1.2;
const PLANE_PADDING_MULT = 1.1;
/** Vertical half-FOV in radians, mirroring Viewer3DCamera's FOV_DEG=50. */
const HALF_FOV_RAD = ((50 / 2) * Math.PI) / 180;
/** Min distance camera-controls allows (Viewer3DCamera enforces 1m). */
const MIN_DIST = 1.05;

export interface PerformerGroupBounds {
  center: Vector3;
  radius: number;
}

/** Stage position plus optional loaded score and reach for joined-grid framing. */
export interface PerformerShotSubject {
  position: { x: number; z: number };
  loadedSequence?: SequenceData | null;
  handDistance?: PerformerHandDistance;
  /** Actual outer ring adds half the performer's staff length to hand reach. */
  staffHalfLength?: number;
}

/**
 * Bounding sphere of the performer group in world space. Uses each
 * performer's XZ position with a generous per-performer radius that
 * covers head height + arm span so props don't poke outside the shot.
 */
export function computeGroupBounds(
  performers: readonly PerformerShotSubject[]
): PerformerGroupBounds {
  if (performers.length === 0) {
    return { center: new Vector3(0, TARGET_Y, 0), radius: 1.2 };
  }

  // Center = mean XZ position (Y fixed at shoulder height).
  const sum = new Vector3();
  for (const p of performers)
    sum.add(new Vector3(p.position.x, 0, p.position.z));
  const center = sum.divideScalar(performers.length);
  center.y = TARGET_Y;

  // Radius = farthest performer + per-performer extent (arm span + prop).
  const PER_PERFORMER_EXTENT = 1.2;
  const defaultReach = largestHandDistance(DEFAULT_PERFORMER_HAND_DISTANCE);
  let maxDist = 0;
  for (const p of performers) {
    const d = Math.hypot(p.position.x - center.x, p.position.z - center.z);
    const join = resolveGridJoin3D(p.loadedSequence);
    const joinedReach = join
      ? joinedPerformerExtent(
          p.handDistance ?? DEFAULT_PERFORMER_HAND_DISTANCE,
          join
        )
      : 0;
    const extent = join
      ? Math.max(
          PER_PERFORMER_EXTENT + joinedReach - defaultReach,
          joinedReach + (p.staffHalfLength ?? 0)
        )
      : PER_PERFORMER_EXTENT;
    maxDist = Math.max(maxDist, d + extent);
  }
  return { center, radius: maxDist };
}

/**
 * Distance at which a sphere of the given radius fills the vertical
 * frustum at FOV=50°. Matches `fitToSphere` geometry but computed
 * explicitly so callers can pad + clamp without triggering
 * camera-controls' own transition.
 */
function distanceForSphere(radius: number, viewportAspect = 1): number {
  const safeAspect =
    Number.isFinite(viewportAspect) && viewportAspect > 0 ? viewportAspect : 1;
  const horizontalHalfFov = Math.atan(Math.tan(HALF_FOV_RAD) * safeAspect);
  const framingHalfFov = Math.min(HALF_FOV_RAD, horizontalHalfFov);
  return Math.max(MIN_DIST, radius / Math.sin(framingHalfFov));
}

export interface Shot {
  /** Camera position in world space. */
  eye: Vector3;
  /** Camera lookAt target in world space. */
  target: Vector3;
}

/**
 * Plane-locked shot: camera sits along the plane's normal axis,
 * framing the group bounding sphere + 10% padding.
 */
export function computePlaneShot(
  plane: Plane3,
  performers: readonly PerformerShotSubject[]
): Shot {
  const { center, radius } = computeGroupBounds(performers);
  const padded = radius * PLANE_PADDING_MULT;
  const dist = distanceForSphere(padded);

  const eye = center.clone();
  switch (plane) {
    case "wall":
      // Wall = XY plane. Camera along -Z so the audience view matches
      // the 2D canvas (same orientation as Viewer3DCamera defaults).
      eye.z -= dist;
      break;
    case "wheel":
      // Wheel = YZ plane. Camera along +X (stage-right perspective).
      eye.x += dist;
      break;
    case "floor":
      // Floor = XZ plane. Camera above, looking straight down.
      eye.y += dist;
      break;
  }
  return { eye, target: center };
}

/**
 * Initial auto-orbit shot: camera at radius around the primary
 * performer at polar angle 65° (25° above horizon) and the current
 * azimuth derived from the group bounds' -Z axis.
 */
export function computeAutoOrbitShot(
  performers: readonly PerformerShotSubject[],
  initialAzimuth: number
): Shot {
  const { center, radius } = computeGroupBounds(performers);
  const padded = radius + AUTO_ORBIT_SAFETY_METERS;
  const dist = distanceForSphere(padded);

  // Polar = 65° measured from +Y (25° above horizon).
  const polar = (65 * Math.PI) / 180;
  const eye = new Vector3(
    center.x + dist * Math.sin(polar) * Math.sin(initialAzimuth),
    center.y + dist * Math.cos(polar),
    center.z + dist * Math.sin(polar) * Math.cos(initialAzimuth)
  );
  return { eye, target: center };
}

/** Elevation angle from horizontal — 36° matches the ideal choreographer sightline. */
const CHOREO_POLAR_RAD = (36 * Math.PI) / 180;
/** Extra padding keeps the nearest row clear of the viewer's transport bar. */
const CHOREO_FRAMING_PADDING = 1.35;
/** Floor for solo performer — close intimate view. */
const CHOREO_MIN_DIST = 3.0;
/** Target looks at performer hip height, not the ground. */
const CHOREO_TARGET_HEIGHT = 0.55;
/** Welcome reveal starts this much further back than the final position. */
const REVEAL_DISTANCE_MULT = 1.4;
/** Reveal start target sits at this Y above stage ground (chest height). */
const REVEAL_TARGET_HEIGHT = 1.5;

/**
 * Choreographer POV: behind and above the performer group, looking
 * down at them. Scales with formation size so all performers are
 * visible regardless of count or spread.
 *
 * Camera sits along a ray from group center at CHOREO_POLAR_RAD above
 * horizontal, offset toward -Z (behind performers). Distance is
 * FOV-derived so the full bounding sphere fits in frame.
 */
export function computeChoreographerShot(
  performers: readonly PerformerShotSubject[],
  stageGroundOffset: number,
  viewportAspect = 1
): Shot {
  const { center, radius } = computeGroupBounds(performers);

  const paddedRadius = radius * CHOREO_FRAMING_PADDING;
  const dist = Math.max(
    CHOREO_MIN_DIST,
    distanceForSphere(paddedRadius, viewportAspect)
  );

  const behindDist = dist * Math.cos(CHOREO_POLAR_RAD);
  const height = dist * Math.sin(CHOREO_POLAR_RAD);

  const eye = new Vector3(
    center.x,
    stageGroundOffset + height,
    center.z - behindDist
  );
  const target = new Vector3(
    center.x,
    stageGroundOffset + CHOREO_TARGET_HEIGHT,
    center.z
  );
  return { eye, target };
}

/**
 * Starting position for the welcome reveal sweep. Same angle as the
 * final choreographer shot but 40% further back, with the target at
 * a generic stage-center chest height. The camera animates from here
 * into the tighter choreographer position.
 */
export function computeRevealStartShot(
  performers: readonly PerformerShotSubject[],
  stageGroundOffset: number,
  viewportAspect = 1
): Shot {
  const { center, radius } = computeGroupBounds(performers);
  const paddedRadius = radius * CHOREO_FRAMING_PADDING;
  const baseDist = Math.max(
    CHOREO_MIN_DIST,
    distanceForSphere(paddedRadius, viewportAspect)
  );
  const dist = baseDist * REVEAL_DISTANCE_MULT;

  const behindDist = dist * Math.cos(CHOREO_POLAR_RAD);
  const height = dist * Math.sin(CHOREO_POLAR_RAD);

  const eye = new Vector3(
    center.x,
    stageGroundOffset + height,
    center.z - behindDist
  );
  const target = new Vector3(
    center.x,
    stageGroundOffset + REVEAL_TARGET_HEIGHT,
    center.z
  );
  return { eye, target };
}
