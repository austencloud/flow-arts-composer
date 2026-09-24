import type { PropBuild } from "@austencloud/scene-3d";

import {
  resolveEffect,
  type TipEffectMap,
} from "$lib/shared/animation-engine/domain/types/tip-effect-types";
import type { TrackingMode } from "$lib/shared/animation-engine/domain/types/trail-types";
import { resolvePropTipAnchors3D } from "$lib/shared/3d/effects/prop-tip-geometry-3d";
import type { EffectsConfig } from "$lib/shared/effects/domain/effects-config";
import {
  resolveAnimal3D,
  resolveBloom3D,
  resolveBubbles3D,
  resolveCharcoal3D,
  resolveFire3D,
  resolveGoo3D,
  resolveInk3D,
  resolveLed3D,
  resolvePetals3D,
  resolvePulse3D,
  resolveSilk3D,
  resolveSmoke3D,
  resolveSparkles3D,
  resolveTrails3D,
} from "$lib/shared/effects/translators/webgl3d-translator";

import type {
  WorkerEffectQualityTier,
  WorkerPerformerEffectIntent,
  WorkerPooledEffectConfigs,
  WorkerTipEffectDecision,
} from "../domain/worker-renderer-protocol";
import type { WorkerPropBuild } from "../worlds/props/worker-prop-factory-types";

export interface WorkerPerformerEffectIntentInput {
  playing: boolean;
  sampledAtMs: number;
  currentStep: number;
  totalSteps: number;
  seamlesslyLoopable: boolean;
  qualityTier: WorkerEffectQualityTier;
  propBuild: PropBuild;
  leftPropType: string | undefined;
  rightPropType: string | undefined;
  staffHalfLength: number;
  tipEffectMap?: TipEffectMap;
  globalTipEffectMap?: TipEffectMap;
  /** Detached output from the canonical effects state owner. */
  effectsConfig: EffectsConfig;
  /** The trail source owner is animation settings, not EffectsConfig. */
  trailTrackingMode: TrackingMode;
}

/**
 * Resolve the same final effect decisions as EffectOrchestrator3D without
 * moving user settings, Choreo timing, or effect precedence into the worker.
 */
export function createWorkerPerformerEffectIntent(
  input: WorkerPerformerEffectIntentInput
): WorkerPerformerEffectIntent {
  const propBuild: WorkerPropBuild = {
    finish: input.propBuild.finish,
    fanBuild: input.propBuild.fanBuild,
    fanFrameColor: input.propBuild.fanFrameColor,
    fanCover: input.propBuild.fanCover,
    triangleGrip: input.propBuild.triangleGrip,
  };
  const decisionsFor = (
    propIndex: 0 | 1,
    propType: string | undefined
  ): WorkerTipEffectDecision[] =>
    resolvePropTipAnchors3D(propType, input.staffHalfLength, propBuild).map(
      ({ effectTipIndex }) => ({
        propIndex,
        tipIndex: effectTipIndex,
        effect: resolveEffect(
          propIndex,
          effectTipIndex,
          input.tipEffectMap,
          input.globalTipEffectMap ?? {}
        ),
      })
    );

  // Preserve anchor order and duplicates. Multi-prong props intentionally map
  // several physical emitters to the same logical effect slot.
  const tips = [
    ...decisionsFor(0, input.leftPropType),
    ...decisionsFor(1, input.rightPropType),
  ];
  const active = new Set(tips.map(({ effect }) => effect));
  const pooled = {
    ...(active.has("sparkles")
      ? { sparkles: resolveSparkles3D(input.effectsConfig.sparkles) }
      : {}),
    ...(active.has("goo")
      ? { goo: resolveGoo3D(input.effectsConfig.goo) }
      : {}),
    ...(active.has("bubbles")
      ? { bubbles: resolveBubbles3D(input.effectsConfig.bubbles) }
      : {}),
    ...(active.has("petals")
      ? { petals: resolvePetals3D(input.effectsConfig.petals) }
      : {}),
    ...(active.has("smoke")
      ? { smoke: resolveSmoke3D(input.effectsConfig.smoke) }
      : {}),
    ...(active.has("ink")
      ? { ink: resolveInk3D(input.effectsConfig.ink) }
      : {}),
    ...(active.has("silk")
      ? { silk: resolveSilk3D(input.effectsConfig.silk) }
      : {}),
    ...(active.has("animal")
      ? { animal: resolveAnimal3D(input.effectsConfig.animal) }
      : {}),
    ...(active.has("pulse")
      ? { pulse: resolvePulse3D(input.effectsConfig.pulse) }
      : {}),
    ...(active.has("bloom")
      ? { bloom: resolveBloom3D(input.effectsConfig.bloom) }
      : {}),
    ...(active.has("fire")
      ? { fire: resolveFire3D(input.effectsConfig.fire) }
      : {}),
    ...(active.has("charcoal")
      ? { charcoal: resolveCharcoal3D(input.effectsConfig.charcoal) }
      : {}),
  } satisfies WorkerPooledEffectConfigs;

  return {
    playing: input.playing,
    sampledAtMs: input.sampledAtMs,
    currentStep: input.currentStep,
    totalSteps: input.totalSteps,
    seamlesslyLoopable: input.seamlesslyLoopable,
    qualityTier: input.qualityTier,
    propBuild,
    tips,
    trails: resolveTrails3D(input.effectsConfig.trails, {
      trackingMode: input.trailTrackingMode,
    }),
    led: resolveLed3D(input.effectsConfig.led),
    pooled,
  };
}
