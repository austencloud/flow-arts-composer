/**
 * FireIntent → FirePassPayload translator.
 *
 * Pure function: takes the canonical FireIntent from EffectsConfig
 * plus each tip's current position/velocity, emits a backend-neutral
 * FirePassPayload. The fluid-sim math lives inside the backend
 * so this translator stays format-neutral.
 */

import type { FireIntent } from "#lib/shared/effects/domain/effects-config.js";
import type {
  FirePassPayload,
  FireSourcePoint,
  FireColorStop,
} from "../domain/fire-pass";

export interface FireTranslationContext {
  /** Per-tip positions in NDC. */
  tips: Array<{
    tipId: string;
    position: [number, number];
    velocity: [number, number];
  }>;
  elapsedSeconds: number;
}

const DEFAULT_FIRE_CURVE: FireColorStop[] = [
  { t: 0.0, color: [0.05, 0.0, 0.0] },
  { t: 0.3, color: [0.8, 0.1, 0.0] },
  { t: 0.6, color: [1.0, 0.6, 0.0] },
  { t: 1.0, color: [1.0, 0.95, 0.8] },
];

const SPLAT_RADIUS_NDC = 0.05;

export function toFirePassPayload(
  intent: FireIntent,
  context: FireTranslationContext,
): FirePassPayload {
  const sources: FireSourcePoint[] = context.tips.map((tip) =>
    buildSource(tip, intent),
  );

  const colorCurve = intent.colorCurve
    ? curveFromIntent(intent.colorCurve)
    : DEFAULT_FIRE_CURVE;

  return {
    sources,
    intensity: intent.intensity,
    turbulence: intent.turbulence,
    buoyancy: 0.5 + intent.intensity * 0.5,
    colorCurve,
  };
}

function buildSource(
  tip: FireTranslationContext["tips"][number],
  intent: FireIntent,
): FireSourcePoint {
  return {
    position: tip.position,
    velocity: [
      tip.velocity[0] * intent.intensity,
      tip.velocity[1] * intent.intensity,
    ],
    temperature: intent.intensity,
    density: intent.intensity * 0.8,
    radius: SPLAT_RADIUS_NDC,
  };
}

function curveFromIntent(
  curve: NonNullable<FireIntent["colorCurve"]>,
): FireColorStop[] {
  return [
    { t: 0.0, color: curve.coldColor },
    { t: 0.3, color: curve.midColor },
    { t: 0.6, color: curve.hotColor },
    { t: 1.0, color: curve.coreColor },
  ];
}
