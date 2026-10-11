import {
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
  type Camera,
} from "three";
import type { SpatialCameraFrame } from "#lib/shared/motion-composition/domain/motion-composition-types.js";
import { interpolateVector3 } from "#lib/shared/motion-composition/domain/motion-composition-transform.js";
import type {
  ProjectedTrajectoryPoint,
  ProjectedTrajectorySet,
  TrajectoryProjectionSpec,
  WorldCameraSample,
  WorldTrajectorySample3D,
  WorldTrajectorySet3D,
} from "../domain/trajectory-types";

function interpolateProjection(
  from: SpatialCameraFrame["projection"],
  to: SpatialCameraFrame["projection"],
  progress: number
): SpatialCameraFrame["projection"] {
  const mix = (a: number, b: number): number => a + (b - a) * progress;
  if (from.kind === "perspective" && to.kind === "perspective") {
    return {
      kind: "perspective",
      fovDegrees: mix(from.fovDegrees, to.fovDegrees),
      aspect: mix(from.aspect, to.aspect),
      near: mix(from.near, to.near),
      far: mix(from.far, to.far),
    };
  }
  if (from.kind === "orthographic" && to.kind === "orthographic") {
    return {
      kind: "orthographic",
      left: mix(from.left, to.left),
      right: mix(from.right, to.right),
      top: mix(from.top, to.top),
      bottom: mix(from.bottom, to.bottom),
      near: mix(from.near, to.near),
      far: mix(from.far, to.far),
    };
  }
  return progress < 1 ? from : to;
}

function cameraAtBeat(
  samples: readonly WorldCameraSample[],
  beat: number
): SpatialCameraFrame {
  if (samples.length === 0) {
    throw new Error("Authored-camera projection requires baked camera samples");
  }
  if (beat <= samples[0]!.beat) return samples[0]!.camera;
  const last = samples[samples.length - 1]!;
  if (beat >= last.beat) return last.camera;

  for (let index = 1; index < samples.length; index += 1) {
    const to = samples[index]!;
    if (beat <= to.beat) {
      const from = samples[index - 1]!;
      const span = to.beat - from.beat;
      const progress = span <= 0 ? 0 : (beat - from.beat) / span;
      return {
        position: interpolateVector3(
          from.camera.position,
          to.camera.position,
          progress
        ),
        target: interpolateVector3(
          from.camera.target,
          to.camera.target,
          progress
        ),
        up: interpolateVector3(from.camera.up, to.camera.up, progress),
        projection: interpolateProjection(
          from.camera.projection,
          to.camera.projection,
          progress
        ),
      };
    }
  }
  return last.camera;
}

function buildCamera(frame: SpatialCameraFrame): Camera {
  const projection = frame.projection;
  const camera =
    projection.kind === "perspective"
      ? new PerspectiveCamera(
          projection.fovDegrees,
          projection.aspect,
          projection.near,
          projection.far
        )
      : new OrthographicCamera(
          projection.left,
          projection.right,
          projection.top,
          projection.bottom,
          projection.near,
          projection.far
        );
  camera.position.set(...frame.position);
  camera.up.set(...frame.up);
  camera.lookAt(new Vector3(...frame.target));
  camera.updateMatrixWorld(true);
  return camera;
}

function projectWithCamera(
  sample: WorldTrajectorySample3D,
  camera: Camera
): ProjectedTrajectoryPoint {
  const point = new Vector3(sample.x, sample.y, sample.z).project(camera);
  return { x: point.x, y: point.y };
}

function projectSample(
  sample: WorldTrajectorySample3D,
  projection: TrajectoryProjectionSpec,
  cameraForBeat: (beat: number) => Camera
): ProjectedTrajectoryPoint {
  if (projection.kind === "world-front") {
    return { x: sample.x, y: sample.y };
  }
  if (projection.kind === "world-top") {
    return { x: sample.x, y: sample.z };
  }
  return projectWithCamera(sample, cameraForBeat(sample.beat));
}

export function projectWorldTrajectories(
  world: WorldTrajectorySet3D,
  projection: TrajectoryProjectionSpec
): ProjectedTrajectorySet {
  const cameraCache = new Map<number, Camera>();
  const fixedCamera =
    projection.kind === "fixed-camera" ? buildCamera(projection.camera) : null;
  const cameraForBeat = (beat: number): Camera => {
    if (fixedCamera) return fixedCamera;
    const cached = cameraCache.get(beat);
    if (cached) return cached;
    const camera = buildCamera(cameraAtBeat(world.cameraSamples, beat));
    cameraCache.set(beat, camera);
    return camera;
  };

  return {
    durationBeats: world.durationBeats,
    projection,
    layers: world.layers.map((layer) => ({
      id: layer.id,
      streamId: layer.streamId,
      tipId: layer.tipId,
      color: layer.color,
      points: layer.samples.map((sample) => ({
        ...projectSample(sample, projection, cameraForBeat),
        beat: sample.beat,
        ...(sample.breakBefore ? { breakBefore: true } : {}),
      })),
    })),
  };
}
