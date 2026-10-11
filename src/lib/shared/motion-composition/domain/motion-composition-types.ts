import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export const MOTION_COMPOSITION_VERSION = 3 as const;

export type Vector3Tuple = readonly [number, number, number];
export type QuaternionTuple = readonly [number, number, number, number];
export type Matrix4Tuple = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface SpatialTransform {
  translation: Vector3Tuple;
  rotation: QuaternionTuple;
  scale: Vector3Tuple;
}

export interface SpatialTransformKeyframe {
  beat: number;
  transform: SpatialTransform;
}

export interface IdentityTransformTrack {
  kind: "identity";
  durationBeats: number;
}

export interface KeyframeTransformTrack {
  kind: "keyframes";
  durationBeats: number;
  keyframes: readonly SpatialTransformKeyframe[];
}

export interface MotionSegment {
  kind: "linear" | "arc" | "circle";
  durationBeats: number;
  distance?: number;
  radius?: number;
  arcRadians?: number;
  amount?: number;
  plane: "xy" | "xz" | "yz";
  bend: -1 | 1;
}

export interface MotionSegmentsTransformTrack {
  kind: "motion-segments";
  durationBeats: number;
  segments: readonly MotionSegment[];
}

export interface FlowerTransformTrack {
  kind: "flower";
  durationBeats: number;
  primaryTurns: number;
  orbitTurns: number;
  primaryDirection: -1 | 1;
  orbitDirection: -1 | 1;
  radius: number;
  strength: number;
  phaseRadians: number;
  plane: "xy" | "xz" | "yz";
}

export interface SequenceHandTransformTrack {
  kind: "sequence-hand";
  durationBeats: number;
  clipId: string;
  channelId: string;
}

export type SpatialTransformTrack =
  | IdentityTransformTrack
  | KeyframeTransformTrack
  | MotionSegmentsTransformTrack
  | FlowerTransformTrack
  | SequenceHandTransformTrack;

export interface SpatialEndpoint {
  id: string;
  position: Vector3Tuple;
}

export interface SpatialPropKeyframe {
  beat: number;
  transform: SpatialTransform;
  endpoints: readonly SpatialEndpoint[];
}

export interface SpatialPropChannel {
  id: string;
  keyframes: readonly SpatialPropKeyframe[];
}

export type MotionClip =
  | {
      kind: "fac-sequence";
      durationBeats: number;
      sequence: SequenceData;
    }
  | {
      kind: "spatial-keyframes";
      durationBeats: number;
      channels: readonly SpatialPropChannel[];
    };

export interface TimeMapping {
  offsetBeats: number;
  rate: number;
  completion: "hold" | "loop" | "stretch";
  stretchToBeats?: number;
}

export type CoordinateOrientationMode =
  | "position-only"
  | "rigid"
  | "world"
  | "radial"
  | "tangent";

export interface CoordinateNode {
  id: string;
  parentId: string | null;
  childNodeIds: readonly string[];
  streamIds: readonly string[];
  transform: SpatialTransformTrack;
  time: TimeMapping;
  orientationMode: CoordinateOrientationMode;
}

export interface PropStreamStyle {
  color: string;
  propType?: string;
  visible?: boolean;
}

export interface PropStream {
  id: string;
  nodeId: string;
  clipId: string;
  channelId: string;
  time: TimeMapping;
  style: PropStreamStyle;
}

export interface MotionRelationship {
  id: string;
  nodeIds: readonly [string, string];
  timing: "together" | "split" | "quarter";
  direction: "same" | "opposite";
  phase: number;
  status: "authored" | "derived" | "stale";
}

export type SpatialCameraProjection =
  | {
      kind: "perspective";
      fovDegrees: number;
      aspect: number;
      near: number;
      far: number;
    }
  | {
      kind: "orthographic";
      left: number;
      right: number;
      top: number;
      bottom: number;
      near: number;
      far: number;
    };

export interface SpatialCameraFrame {
  position: Vector3Tuple;
  target: Vector3Tuple;
  up: Vector3Tuple;
  projection: SpatialCameraProjection;
}

export interface SpatialCameraKeyframe extends SpatialCameraFrame {
  beat: number;
}

export interface SpatialCameraTrack {
  durationBeats: number;
  time: TimeMapping;
  keyframes: readonly SpatialCameraKeyframe[];
}

export interface CompositionLoopPolicy {
  kind: "closed" | "duration" | "freeform";
  durationBeats: number;
}

export interface ImportProvenance {
  source: string;
  sourceVersion?: string | number;
  decoderCommit?: string;
  originalUrl?: string;
  payloadHash?: string;
  decodedSource?: unknown;
}

export interface MotionCompositionV3 {
  version: typeof MOTION_COMPOSITION_VERSION;
  id: string;
  name: string;
  bpm: number;
  rootNodeId: string;
  clips: Readonly<Record<string, MotionClip>>;
  nodes: Readonly<Record<string, CoordinateNode>>;
  streams: Readonly<Record<string, PropStream>>;
  relationships: readonly MotionRelationship[];
  camera?: SpatialCameraTrack;
  loop: CompositionLoopPolicy;
  provenance?: ImportProvenance;
}

export interface LocalPropFrame {
  transform: SpatialTransform;
  endpoints: readonly SpatialEndpoint[];
}

export interface SampledCoordinateNode {
  id: string;
  localBeat: number;
  localTransform: SpatialTransform;
  worldTransform: Matrix4Tuple;
}

export interface SampledPropStream {
  id: string;
  nodeId: string;
  localBeat: number;
  center: Vector3Tuple;
  rotation: QuaternionTuple;
  scale: Vector3Tuple;
  endpoints: readonly SpatialEndpoint[];
  style: PropStreamStyle;
  /** Lift the pen when a source jumps to a different pose. */
  breakBefore?: boolean;
}

export interface MotionCompositionFrame {
  beat: number;
  nodes: Readonly<Record<string, SampledCoordinateNode>>;
  streams: Readonly<Record<string, SampledPropStream>>;
  camera?: SpatialCameraFrame;
}

export type TransformTrackSampler = (
  track: SpatialTransformTrack,
  localBeat: number
) => SpatialTransform | undefined;

export type MotionClipSampler = (
  clip: MotionClip,
  stream: PropStream,
  localBeat: number
) => LocalPropFrame | undefined;

export interface MotionCompositionSamplingAdapters {
  sampleTransformTrack?: TransformTrackSampler;
  sampleClip?: MotionClipSampler;
}
