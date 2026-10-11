import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import type { VtgMode } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";
import type { SpinStyle } from "@vtg/domain";

export const THIRD_ORDER_COMPOSITION_VERSION = 2 as const;

export const THIRD_ORDER_FLOWER_RATIOS = [
  "1:1",
  "2:1",
  "1:2",
  "1:3",
  "2:3",
  "1:4",
  "1:5",
  "2:5",
] as const;

export type ThirdOrderFlowerRatio = (typeof THIRD_ORDER_FLOWER_RATIOS)[number];

export type ThirdOrderCarrierPathMode = "sequence" | "flower";

export type ThirdOrderCarrierLane = "left" | "right";

export type ThirdOrderOrientationMode =
  | "world"
  | "radial"
  | "tangent"
  | "carrier";

export type ThirdOrderTimingMode = "phrase" | "beats" | "independent";

export type ThirdOrderSourceTarget = "carrier" | "grid-blue" | "grid-red";

export interface ThirdOrderCarrierPathDraft {
  mode: ThirdOrderCarrierPathMode;
  ratio: ThirdOrderFlowerRatio;
  style: SpinStyle;
  /** 0..1 blend between a circular carrier and equal-radius orbit vectors. */
  strength: number;
  /** Secondary-vector offset in 45-degree compass eighths. */
  phase: number;
  relationship: VtgMode;
  showConstruction: boolean;
}

export interface ThirdOrderChildDraft {
  id: "grid-blue" | "grid-red";
  label: string;
  lane: ThirdOrderCarrierLane;
  sequence: SequenceData;
  orientationMode: ThirdOrderOrientationMode;
  timingMode: ThirdOrderTimingMode;
  rate: number;
  visible: boolean;
}

export interface ThirdOrderCompositionDraft {
  version: typeof THIRD_ORDER_COMPOSITION_VERSION;
  carrier: SequenceData;
  carrierPath: ThirdOrderCarrierPathDraft;
  children: ThirdOrderChildDraft[];
  bpm: number;
}

export interface ThirdOrderPoint {
  x: number;
  y: number;
}

export interface ThirdOrderFlowerDecomposition {
  origin: ThirdOrderPoint;
  pivot: ThirdOrderPoint;
  center: ThirdOrderPoint;
  primaryRadius: number;
  orbitRadius: number;
}

export interface ThirdOrderGridPose {
  centerX: number;
  centerY: number;
  rotation: number;
  scale: number;
}

export interface ThirdOrderSampledChild extends ThirdOrderChildDraft {
  props: {
    left: PropState;
    right: PropState;
  };
  step: number;
  totalSteps: number;
  pose: ThirdOrderGridPose;
  decomposition?: ThirdOrderFlowerDecomposition;
}

export interface ThirdOrderCompositionFrame {
  masterBeat: number;
  totalBeats: number;
  carrierProps: {
    left: PropState;
    right: PropState;
  };
  children: ThirdOrderSampledChild[];
}
