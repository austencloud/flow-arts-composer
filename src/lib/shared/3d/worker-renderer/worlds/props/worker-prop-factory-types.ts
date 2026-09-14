import type { Group, Object3D, Quaternion } from "three";

export const CANONICAL_PROP_TYPE = {
  STAFF: "staff",
  SIMPLESTAFF: "simple_staff",
  BIGSTAFF: "bigstaff",
  STAFF2: "staff_v2",
  CLUB: "club",
  BIGCLUB: "bigclub",
  FAN: "fan",
  BIGFAN: "bigfan",
  TRIAD: "triad",
  BIGTRIAD: "bigtriad",
  MINIHOOP: "minihoop",
  BIGHOOP: "bighoop",
  BUUGENG: "buugeng",
  BIGBUUGENG: "bigbuugeng",
  FRACTALGENG: "fractalgeng",
  TRIGENG: "trigeng",
  HAND: "hand",
  TRIQUETRA: "triquetra",
  TRIQUETRA2: "triquetra2",
  SWORD: "sword",
  // Retired from the app enum 2026-09-06, like FRACTALGENG before it. The
  // scene package still enumerates both, and the worker factory contract is to
  // construct every type that package lists, so the entry stays. Nothing in the
  // app can select it any more.
  SICKLES: "sickles",
  CHICKEN: "chicken",
  BIGCHICKEN: "bigchicken",
  GUITAR: "guitar",
  UKULELE: "ukulele",
  DOUBLESTAR: "doublestar",
  BIGDOUBLESTAR: "bigdoublestar",
  EIGHTRINGS: "eightrings",
  BIGEIGHTRINGS: "bigeightrings",
  CONTACTBALL: "contactball",
  BIGCONTACTBALL: "bigcontactball",
  DOUBLECONTACTBALL: "doublecontactball",
  BIGDOUBLECONTACTBALL: "bigdoublecontactball",
  QUIAD: "quiad",
  CAPSULE_BATON: "capsule_baton",
  FIRE_DOUBLE_STAFF: "fire_double_staff",
  TORCH: "torch",
  BIGTORCH: "bigtorch",
  POI: "poi",
} as const;

export type CanonicalWorkerPropType =
  (typeof CANONICAL_PROP_TYPE)[keyof typeof CANONICAL_PROP_TYPE];

export interface WorkerPropBuild {
  finish: "fire" | "day";
  fanBuild: "pictograph" | "fire" | "lotus" | "day" | "moon" | "flat-grip";
  fanFrameColor: "black" | "white";
  fanCover: "bare" | "covered";
}

export type WorkerPropColor = "blue" | "red";

export type WorkerPropModelLoader = (modelUrl: string) => Promise<Object3D>;

export interface WorkerPropFactoryOptions {
  propType: string;
  color: WorkerPropColor;
  /** The resolved performer staff length in scene metres. */
  length: number;
  /** The resolved performer staff radius in scene metres. */
  thickness: number;
  build: WorkerPropBuild;
  layer?: number;
  loadModel?: WorkerPropModelLoader;
}

export type WorkerPropVisualSource =
  | "staff"
  | "hand"
  | "registry-gltf"
  | "fan-gltf"
  | "procedural";

export interface WorkerPropVisual {
  root: Group;
  source: WorkerPropVisualSource;
  setState(state: { worldRotation: Quaternion }): void;
  dispose(): void;
}

export type WorkerPropFactoryFailureReason =
  | "unsupported-prop-type"
  | "model-loader-required";

export type WorkerPropFactoryResult =
  | { ok: true; visual: WorkerPropVisual }
  | {
      ok: false;
      propType: string;
      reason: WorkerPropFactoryFailureReason;
      detail: string;
    };
