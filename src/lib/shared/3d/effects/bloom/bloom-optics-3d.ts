import type { Bloom3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import type { QualityTier } from "../types";
import { resolveBloomExposure } from "#lib/shared/effects/domain/bloom-optics.js";

export interface BloomOpticalFrame3D {
  energy: number;
  coreStrength: number;
  radiusWorld: number;
  stretch: number;
  streak: number;
  spikes: number;
}

const HISTORY_CAPACITY: Record<QualityTier, number> = {
  high: 72,
  medium: 44,
  low: 24,
};

export function resolveBloomOpticalFrame3D(
  params: Bloom3DParams,
  speed: number,
  timeSeconds: number,
  sourceNormalization: number
): BloomOpticalFrame3D {
  const motion = Math.min(
    1.5,
    Math.max(0, speed) / Math.max(0.001, params.motionReferenceSpeed)
  );
  const exposure = resolveBloomExposure(
    params.intensity,
    params.pulse,
    params.pulseRate,
    timeSeconds
  );

  const velocityStretch = 1 + params.streak * motion * 5.5;

  return {
    energy: exposure * Math.max(0, sourceNormalization),
    coreStrength: Math.min(1, Math.max(0, params.coreStrength)),
    radiusWorld: params.haloRadiusWorld,
    stretch: velocityStretch,
    streak: params.streak * Math.min(1, motion),
    spikes: params.spikes * (0.55 + Math.min(1, motion) * 0.45),
  };
}

/** Additive energy grows by perceived prop count, not by raw tip count. */
export function resolveBloomSourceNormalization(propCount: number): number {
  return 1 / Math.sqrt(Math.max(1, propCount));
}

export function resolveBloomHistoryCapacity(tier: QualityTier): number {
  return HISTORY_CAPACITY[tier];
}

export function resolveBloomFalloffCode(
  falloff: Bloom3DParams["falloff"]
): number {
  if (falloff === "sharp") return 1;
  // Older saved configurations can still contain `ring`. Rendering them as
  // Smooth removes the hollow target shape without breaking those saves.
  return 0;
}

export function shouldResetBloomHistory3D(
  previousStep: number,
  nextStep: number,
  distance: number
): boolean {
  return nextStep + 0.001 < previousStep || distance > 1.5;
}
