import { computeChoreographerShot } from "#lib/shared/sequence-viewer/camera-choreography/presets/shots.js";
import type { PerformerShotSubject } from "#lib/shared/sequence-viewer/camera-choreography/presets/shots.js";
import { getViewerFrontStageCameraZ } from "#lib/shared/3d/domain/viewer-formation-facing.js";
import { rotateEyeAboutTarget } from "#lib/shared/3d/camera/viewer-camera-framing.js";
import type { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
import type { PostStage3D } from "../item-kinds";

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
): StageCameraPose {
  const shot = computeChoreographerShot(subjects, groundY, aspect);
  const eyeZ = getViewerFrontStageCameraZ(
    shot.target.z,
    shot.eye.z - shot.target.z,
    environmentId
  );
  return {
    position: { x: shot.eye.x, y: shot.eye.y, z: eyeZ },
    target: { x: shot.target.x, y: shot.target.y, z: shot.target.z },
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
 * The camera for a clip's shot: front holds the turned front pose; orbit
 * swings from there by `orbitAngle` (see `stage3DOrbitAngle`); saved holds
 * the camera stored on the clip, or the front pose until one is stored.
 */
export function stage3DCameraPose(
  stage: PostStage3D,
  base: StageCameraPose,
  orbitAngle: number
): StageCameraPose {
  if (stage.shot === "saved" && stage.camera) {
    return {
      position: { ...stage.camera.position },
      target: { ...stage.camera.target },
    };
  }
  const front = turnStagePose(base, STAGE_3D_FRONT_TURN_RAD);
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
