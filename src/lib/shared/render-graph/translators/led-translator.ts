/**
 * LedIntent → LedPassPayload translator.
 *
 * Pure function: takes the canonical LedIntent from EffectsConfig plus each
 * tip's shaft positions, color, and velocity, emits a backend-neutral
 * LedPassPayload. Per-LED color is decided upstream by the LED sampler from
 * the materialized strip pattern; this translator only shapes the payload.
 *
 * Brightness resolves to a prop flux budget here rather than to a multiplier,
 * because everything downstream divides that budget: per-LED flux, streak
 * density, and shutter normalization all read it.
 */

import type { LedIntent } from "#lib/shared/effects/domain/effects-config.js";
import { ledBrightnessToFloat } from "#lib/shared/animation-engine/domain/types/led-types.js";
import { PROP_REFERENCE_FLUX } from "#lib/shared/animation-engine/domain/led-photometry.js";
import type { LedPassPayload, LedTipState, LedSegment } from "../domain/led-pass";

const STREAK_VELOCITY_THRESHOLD = 0.01;

export interface LedTranslationContext {
  tips: Array<{
    tipId: string;
    /** Ordered positions along the prop shaft, base→tip, in NDC. */
    shaftPositions: Array<[number, number]>;
    /** RGB 0..1 for this tip's LEDs, sampled from the strip pattern. */
    color: [number, number, number];
    velocity: number;
  }>;
  elapsedSeconds: number;
  /** Pattern function: (segmentIndex, totalSegments, time, speed) → brightness 0..1 */
  patternFn: (index: number, total: number, time: number, speed: number) => number;
}

export function toLedPassPayload(
  intent: LedIntent,
  context: LedTranslationContext,
): LedPassPayload {
  const propFlux = PROP_REFERENCE_FLUX * ledBrightnessToFloat(intent.look.brightness);

  const tips: LedTipState[] = context.tips.map((tip) =>
    buildTip(tip, intent, context, propFlux),
  );

  return {
    tips,
    shutter: intent.look.shutter,
    glare: intent.look.glare,
  };
}

function buildTip(
  tip: LedTranslationContext["tips"][number],
  intent: LedIntent,
  ctx: LedTranslationContext,
  propFlux: number,
): LedTipState {
  const total = tip.shaftPositions.length;

  const segments: LedSegment[] = tip.shaftPositions.map((pos, i) => ({
    position: pos,
    color: tip.color,
    // Speed is expressed as loops per second, the inverse of cycleDuration.
    brightness: ctx.patternFn(
      i,
      total,
      ctx.elapsedSeconds,
      1 / Math.max(0.001, intent.cycleDuration),
    ),
  }));

  return {
    tipId: tip.tipId,
    segments,
    propFlux,
    motionStreak: tip.velocity > STREAK_VELOCITY_THRESHOLD,
  };
}
