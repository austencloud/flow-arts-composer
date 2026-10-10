import type { SpatialCameraFrame } from "#lib/shared/motion-composition/domain/motion-composition-types.js";

export interface WorldTrajectorySample3D {
  beat: number;
  x: number;
  y: number;
  z: number;
  breakBefore?: boolean;
}

export interface WorldTrajectoryLayer3D {
  id: string;
  streamId: string;
  tipId: string;
  color: string;
  samples: readonly WorldTrajectorySample3D[];
}

export interface WorldCameraSample {
  beat: number;
  camera: SpatialCameraFrame;
}

export interface WorldTrajectorySet3D {
  durationBeats: number;
  samplesPerBeat: number;
  layers: readonly WorldTrajectoryLayer3D[];
  cameraSamples: readonly WorldCameraSample[];
}

export type TrajectoryProjectionSpec =
  | { kind: "world-front" }
  | { kind: "world-top" }
  | { kind: "fixed-camera"; camera: SpatialCameraFrame }
  | { kind: "authored-camera" };

export interface ProjectedTrajectoryPoint {
  x: number;
  y: number;
  beat?: number;
  breakBefore?: boolean;
}

export interface ProjectedTrajectoryLayer {
  id: string;
  streamId: string;
  tipId: string;
  color: string;
  points: readonly ProjectedTrajectoryPoint[];
}

export interface ProjectedTrajectorySet {
  durationBeats: number;
  projection: TrajectoryProjectionSpec;
  layers: readonly ProjectedTrajectoryLayer[];
}
