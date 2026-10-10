import type {
  Bubbles3DParams,
  Goo3DParams,
  Petals3DParams,
  Smoke3DParams,
  Sparkles3DParams,
  Ink3DParams,
  Silk3DParams,
  Animal3DParams,
  Pulse3DParams,
  Bloom3DParams,
  Fire3DParams,
  Charcoal3DParams,
} from "#lib/shared/effects/translators/webgl3d-types.js";
import type { QualityTier } from "../types";

export interface SceneEffectVector3 {
  x: number;
  y: number;
  z: number;
}

interface SceneEffectTipBase3D {
  /** Stable for the lifetime of one orchestrator tip. */
  sourceId: number;
  propIndex: 0 | 1;
  tipIndex: 0 | 1;
  position: SceneEffectVector3;
  /** Metres per second, already scaled by the real frame delta. */
  velocity: SceneEffectVector3;
  speed: number;
  /** Fractional animation step, used by beat-triggered scene effects. */
  currentStep: number;
  /** Step count and seam contract for effects that retain motion history. */
  totalSteps?: number;
  seamlesslyLoopable?: boolean;
  /** Canonical prop tint for prop-matched color modes. */
  propColor: string;
}

export interface SparkleTipSource3D extends SceneEffectTipBase3D {
  effect: "sparkles";
  params: Sparkles3DParams;
}

export interface GooTipSource3D extends SceneEffectTipBase3D {
  effect: "goo";
  params: Goo3DParams;
  /** World-space supporting surface below this performer. */
  collisionFloorY: number;
}

export interface BubbleTipSource3D extends SceneEffectTipBase3D {
  effect: "bubbles";
  params: Bubbles3DParams;
  qualityTier: QualityTier;
}

export interface PetalTipSource3D extends SceneEffectTipBase3D {
  effect: "petals";
  params: Petals3DParams;
}

export interface SmokeTipSource3D extends SceneEffectTipBase3D {
  effect: "smoke";
  params: Smoke3DParams;
  qualityTier: QualityTier;
}

export interface InkTipSource3D extends SceneEffectTipBase3D {
  effect: "ink";
  params: Ink3DParams;
}

export interface SilkTipSource3D extends SceneEffectTipBase3D {
  effect: "silk";
  params: Silk3DParams;
}

export interface AnimalTipSource3D extends SceneEffectTipBase3D {
  effect: "animal";
  params: Animal3DParams;
  totalSteps: number;
  seamlesslyLoopable: boolean;
}

export interface PulseTipSource3D extends SceneEffectTipBase3D {
  effect: "pulse";
  params: Pulse3DParams;
}

export interface BloomTipSource3D extends SceneEffectTipBase3D {
  effect: "bloom";
  params: Bloom3DParams;
  qualityTier: QualityTier;
}

export interface FireTipSource3D extends SceneEffectTipBase3D {
  effect: "fire";
  params: Fire3DParams;
  qualityTier: QualityTier;
  /** Scalar jerk magnitude used for the brightest local-light stalls. */
  jerk: number;
}

export interface CharcoalTipSource3D extends SceneEffectTipBase3D {
  effect: "charcoal";
  params: Charcoal3DParams;
  qualityTier: QualityTier;
  jerk: number;
  totalSteps: number;
  /** World-space stage floor used by falling ember fragments. */
  collisionFloorY: number;
}

export type SceneEffectTipSource3D =
  | SparkleTipSource3D
  | GooTipSource3D
  | BubbleTipSource3D
  | PetalTipSource3D
  | SmokeTipSource3D
  | InkTipSource3D
  | SilkTipSource3D
  | AnimalTipSource3D
  | PulseTipSource3D
  | BloomTipSource3D
  | FireTipSource3D
  | CharcoalTipSource3D;

export interface SceneEffectRigFrame3D {
  playing: boolean;
  sources: SceneEffectTipSource3D[];
}

export function isTrackedTip(
  trackingMode: "left_end" | "right_end" | "both_ends",
  tipIndex: 0 | 1
): boolean {
  return (
    trackingMode === "both_ends" ||
    (trackingMode === "left_end" && tipIndex === 0) ||
    (trackingMode === "right_end" && tipIndex === 1)
  );
}
