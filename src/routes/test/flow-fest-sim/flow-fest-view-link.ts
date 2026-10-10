/**
 * Shareable viewpoints for the Flow Fest sim.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The sim could only be addressed by a registered review camera — `?gate3=1`
 * plus one of five ids. That is enough to re-shoot a known frame and useless
 * for the thing Austen actually does, which is walk the site, notice something,
 * and want to hand that exact spot to someone else. Austen, 2026-09-03: "I'm
 * unable to send you a URL to give you the exact placement of where I'm looking
 * at it under this test page it always just hard codes the moment and the
 * camera but it doesn't actually show the location like the XYZ like we do in
 * other 3D scenes."
 *
 * "Like we do in other 3D scenes" is literal, and this file does not reinvent
 * it: `#lib/shared/3d/domain/camera-url-pose.js` already owns the `?cam=&look=&fov=`
 * vocabulary that the ocean, autumn, winter, celestial, and forest review routes
 * share. What is genuinely new here is the conversion, because this route has no
 * orbit camera to read a target off — it has a walking player with a yaw and a
 * pitch.
 *
 * ROUND TRIP
 * ----------
 * The walk scene turns a review camera into that pair through `yawPitchForCamera`:
 * `yaw = atan2(dx, dz)` and `pitch = atan2(positionY - targetY, horizontal)` —
 * note that a POSITIVE pitch is looking DOWN. The look point produced here is
 * the exact inverse, which is what lets a pasted link land on the frame it came
 * from instead of somewhere near it.
 */

import {
  readCameraUrlPose,
  setCameraUrlPose,
} from "#lib/shared/3d/domain/camera-url-pose.js";
import type { FlowFestReviewCamera } from "../flow-fest-graybox/flow-fest-runtime-contract";

/**
 * Where the look point is planted ahead of the eye. Any positive distance
 * describes the same ray; 20 m keeps the printed numbers close to the site's
 * own scale, so a glance at the URL still says roughly where you were aimed.
 */
const LOOK_DISTANCE_METERS = 20;

/** The walk scene's own default when no camera has narrowed it. */
const DEFAULT_HORIZONTAL_FOV_DEGREES = 65;

/** The reserved id a URL viewpoint occupies in the review-camera list. */
export const FLOW_FEST_VIEW_LINK_CAMERA_ID = "url-view";

export interface FlowFestViewPose {
  /** Camera eye position, not the player's body centre. */
  x: number;
  y: number;
  z: number;
  yawRadians: number;
  /** Positive is looking down, matching the walk scene. */
  pitchRadians: number;
  horizontalFovDegrees: number;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Read a viewpoint out of a query string, as the review camera this route
 * teleports to. Null when the link carries no pose.
 */
export function parseFlowFestViewLink(
  query: URLSearchParams
): FlowFestReviewCamera | null {
  const pose = readCameraUrlPose(query, DEFAULT_HORIZONTAL_FOV_DEGREES);
  if (!pose) return null;
  return {
    id: FLOW_FEST_VIEW_LINK_CAMERA_ID,
    label: "Shared viewpoint",
    horizontalFovDegrees: pose.fov,
    positionWorld: [pose.position.x, pose.position.y, pose.position.z],
    targetWorld: [pose.target.x, pose.target.y, pose.target.z],
  };
}

/** The look point 20 m along the ray the pose is aimed down. */
export function flowFestViewLookTarget(pose: FlowFestViewPose): {
  x: number;
  y: number;
  z: number;
} {
  const horizontal = LOOK_DISTANCE_METERS * Math.cos(pose.pitchRadians);
  return {
    x: pose.x + horizontal * Math.sin(pose.yawRadians),
    y: pose.y - LOOK_DISTANCE_METERS * Math.sin(pose.pitchRadians),
    z: pose.z + horizontal * Math.cos(pose.yawRadians),
  };
}

/**
 * The same URL with this viewpoint written into it.
 *
 * Every other parameter survives untouched, so a link copied while reviewing in
 * `?moment=night` still says night. A decimetre of precision is plenty for a
 * viewpoint and keeps the query readable enough to skim.
 */
export function flowFestViewLinkUrl(current: URL, pose: FlowFestViewPose): URL {
  const next = new URL(current.href);
  setCameraUrlPose(
    next,
    {
      position: { x: pose.x, y: pose.y, z: pose.z },
      target: flowFestViewLookTarget(pose),
      fov: round(pose.horizontalFovDegrees),
    },
    1
  );
  return next;
}

/** The short `x, y, z` a reader can say out loud. Metres, one decimal. */
export function formatFlowFestViewCoordinates(pose: FlowFestViewPose): string {
  return `${round(pose.x).toFixed(1)}, ${round(pose.y).toFixed(1)}, ${round(pose.z).toFixed(1)}`;
}

/**
 * Whether a pose has moved far enough to be worth rewriting the URL for.
 * Sub-decimetre drift and a degree of head-turn are noise: the printed link
 * would not change, and the history churn while walking is the cost.
 */
export function flowFestViewPoseChanged(
  previous: FlowFestViewPose | null,
  next: FlowFestViewPose
): boolean {
  if (!previous) return true;
  return (
    Math.hypot(next.x - previous.x, next.y - previous.y, next.z - previous.z) >
      0.15 ||
    Math.abs(next.yawRadians - previous.yawRadians) > 0.02 ||
    Math.abs(next.pitchRadians - previous.pitchRadians) > 0.02
  );
}
