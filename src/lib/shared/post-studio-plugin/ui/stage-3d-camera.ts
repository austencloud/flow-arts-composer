import { computeChoreographerShot } from "#lib/shared/sequence-viewer/camera-choreography/presets/shots.js";
import type { PerformerShotSubject } from "#lib/shared/sequence-viewer/camera-choreography/presets/shots.js";
import { getViewerFrontStageCameraZ } from "#lib/shared/3d/domain/viewer-formation-facing.js";
import { rotateEyeAboutTarget } from "#lib/shared/3d/camera/viewer-camera-framing.js";
import type { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
import {
  POST_STAGE_3D_DEFAULT_ELEVATION,
  POST_STAGE_3D_MAX_ELEVATION,
  POST_STAGE_3D_MAX_ZOOM,
  POST_STAGE_3D_MIN_ELEVATION,
  POST_STAGE_3D_MIN_ZOOM,
  type PostStage3D,
} from "../item-kinds";

/**
 * Where a 3D animation clip's camera stands for each shot. The framing is the
 * 3D viewer's own (`computeChoreographerShot`: a sphere around the whole cast,
 * elevated, from the environment's front-stage side), fitted to the clip's
 * own box rather than the window. Every shot keeps that distance and height,
 * so a pair framed from the front stays framed at every orbit angle.
 */

export interface StagePoint {
  x: number;
  y: number;
  z: number;
}

export interface StageCameraPose {
  position: StagePoint;
  target: StagePoint;
}

/** The cast's framing, with the stage floor's height it was framed over. */
export interface StageBaseShot extends StageCameraPose {
  groundY: number;
}

/**
 * How far the front shot turns off dead front. Dead front, a performer
 * standing in a file behind another is hidden by them; this little turn and
 * the shot's elevation show both while both still face the camera.
 */
export const STAGE_3D_FRONT_TURN_RAD = (14 * Math.PI) / 180;

/** The cast framed from the front-stage side, before any turn. */
export function stage3DBaseShot(
  subjects: readonly PerformerShotSubject[],
  groundY: number,
  aspect: number,
  environmentId: SceneEnvironmentId
): StageBaseShot {
  const shot = computeChoreographerShot(subjects, groundY, aspect);
  const eyeZ = getViewerFrontStageCameraZ(
    shot.target.z,
    shot.eye.z - shot.target.z,
    environmentId
  );
  return {
    position: { x: shot.eye.x, y: shot.eye.y, z: eyeZ },
    target: { x: shot.target.x, y: shot.target.y, z: shot.target.z },
    groundY,
  };
}

/**
 * How high a low camera looks: the choreographer shot aims at the cast's
 * waist (0.55 m), which from 36° up keeps heads in frame. A lower camera sees
 * the bodies more side on, so aimed that low it crops their heads and raised
 * staffs; it aims at chest height instead, 1 m at 20° and below, easing back
 * to the waist at 36°.
 */
export const STAGE_3D_LOW_TARGET_HEIGHT = 1;
const LOW_TARGET_ELEVATION = 20;

export function stage3DTargetLift(elevationDeg: number, baseHeight: number): number {
  const low = Math.min(
    1,
    Math.max(
      0,
      (POST_STAGE_3D_DEFAULT_ELEVATION - elevationDeg) /
        (POST_STAGE_3D_DEFAULT_ELEVATION - LOW_TARGET_ELEVATION)
    )
  );
  return Math.max(0, (STAGE_3D_LOW_TARGET_HEIGHT - baseHeight) * low);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The framing seen from `elevationDeg` above the ground and `zoom` times as
 * far. The choreographer shot puts its eye `distance` from the cast's centre
 * on the floor, `distance·sin(36°)` up; this keeps that distance and its
 * ground direction and swaps the angle, so the eye stands
 * `distance·cos(elevation)` out and `distance·sin(elevation)` up. Then the
 * eye moves along its line to the target by `zoom`. Below 36° the target
 * rises toward chest height (`stage3DTargetLift`). At 36° and 1 the base
 * pose comes back unchanged.
 */
export function stage3DFramedPose(
  base: StageBaseShot,
  elevationDeg = POST_STAGE_3D_DEFAULT_ELEVATION,
  zoom = 1
): StageCameraPose {
  const { position: eye, groundY } = base;
  const dx = eye.x - base.target.x;
  const dz = eye.z - base.target.z;
  const flat = Math.hypot(dx, dz);
  const distance = Math.hypot(flat, eye.y - groundY);
  const degrees = clamp(
    elevationDeg,
    POST_STAGE_3D_MIN_ELEVATION,
    POST_STAGE_3D_MAX_ELEVATION
  );
  const elevation = (degrees * Math.PI) / 180;
  const target: StagePoint = {
    ...base.target,
    y: base.target.y + stage3DTargetLift(degrees, base.target.y - groundY),
  };
  const outward = distance * Math.cos(elevation);
  const ux = flat > 1e-9 ? dx / flat : 0;
  const uz = flat > 1e-9 ? dz / flat : 1;
  const elevated: StagePoint = {
    x: target.x + ux * outward,
    y: groundY + distance * Math.sin(elevation),
    z: target.z + uz * outward,
  };
  const factor = clamp(zoom, POST_STAGE_3D_MIN_ZOOM, POST_STAGE_3D_MAX_ZOOM);
  return {
    position: {
      x: target.x + (elevated.x - target.x) * factor,
      y: target.y + (elevated.y - target.y) * factor,
      z: target.z + (elevated.z - target.z) * factor,
    },
    target: { ...target },
  };
}

/** A pose swung around its target on the ground plane, keeping its height. */
export function turnStagePose(
  pose: StageCameraPose,
  angleRad: number
): StageCameraPose {
  const turned = rotateEyeAboutTarget(
    { x: pose.position.x, z: pose.position.z },
    { x: pose.target.x, z: pose.target.z },
    angleRad
  );
  return {
    position: { x: turned.x, y: pose.position.y, z: turned.z },
    target: { ...pose.target },
  };
}

/**
 * The camera for a clip's shot: front holds the turned front pose, at the
 * clip's elevation and zoom; orbit swings from there by `orbitAngle` (see
 * `stage3DOrbitAngle`); saved holds the camera stored on the clip, or the
 * front pose until one is stored. A saved camera ignores elevation and zoom:
 * it already has its own height and distance.
 */
export function stage3DCameraPose(
  stage: PostStage3D,
  base: StageBaseShot,
  orbitAngle: number
): StageCameraPose {
  if (stage.shot === "saved" && stage.camera) {
    return {
      position: { ...stage.camera.position },
      target: { ...stage.camera.target },
    };
  }
  const framed =
    stage.shot === "saved"
      ? stage3DFramedPose(base)
      : stage3DFramedPose(base, stage.elevation, stage.zoom);
  const front = turnStagePose(framed, STAGE_3D_FRONT_TURN_RAD);
  return stage.shot === "orbit" ? turnStagePose(front, orbitAngle) : front;
}

const MIN_SAVED_DISTANCE = 1.5;
const MAX_SAVED_DISTANCE = 40;
const MIN_POLAR = 0.05;
const MAX_POLAR = Math.PI / 2 - 0.02;

/**
 * A saved camera moved by a drag or a zoom: `turn` swings it around its target,
 * `tilt` raises or lowers it (radians), `zoom` scales its distance. It never
 * goes under the floor or straight overhead, as the 3D viewer's orbit does.
 */
export function orbitStagePose(
  pose: StageCameraPose,
  turn: number,
  tilt: number,
  zoom = 1
): StageCameraPose {
  const dx = pose.position.x - pose.target.x;
  const dy = pose.position.y - pose.target.y;
  const dz = pose.position.z - pose.target.z;
  const radius = Math.hypot(dx, dy, dz) || 1;
  const azimuth = Math.atan2(dx, dz) + turn;
  const polar = Math.min(
    MAX_POLAR,
    Math.max(MIN_POLAR, Math.acos(Math.max(-1, Math.min(1, dy / radius))) - tilt)
  );
  const distance = Math.min(
    MAX_SAVED_DISTANCE,
    Math.max(MIN_SAVED_DISTANCE, radius * zoom)
  );
  const flat = distance * Math.sin(polar);
  return {
    position: {
      x: pose.target.x + flat * Math.sin(azimuth),
      y: pose.target.y + distance * Math.cos(polar),
      z: pose.target.z + flat * Math.cos(azimuth),
    },
    target: { ...pose.target },
  };
}

/** A pose rounded for storing on the item, so saves don't churn on noise. */
export function roundStagePose(pose: StageCameraPose): StageCameraPose {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const point = (p: StagePoint): StagePoint => ({
    x: round(p.x),
    y: round(p.y),
    z: round(p.z),
  });
  return { position: point(pose.position), target: point(pose.target) };
}
