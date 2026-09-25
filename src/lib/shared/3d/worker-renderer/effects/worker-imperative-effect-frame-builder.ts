import { Quaternion, Vector3 } from "three";
import {
  PROP_COLORS,
  type PropState3D,
} from "@austencloud/scene-3d/worker";
import { ledBrightnessToFloat } from "$lib/shared/animation-engine/domain/types/led-types";
import { LedPatternMaterializer } from "$lib/shared/animation-engine/services/led/led-pattern-materializer";
import { patternFrameIndex } from "$lib/shared/animation-engine/services/led-sampler";
import {
  getPixel,
  type StripPattern,
} from "$lib/shared/poi/domain/strip-pattern";
import {
  resolveTrailSources3D,
  TipPositionBridge3D,
} from "../../effects/tip-position-bridge-3d";
import { QualityTier, type TipPositionData3D } from "../../effects/types";
import type {
  Charcoal3DParams,
  Fire3DParams,
} from "$lib/shared/effects/translators/webgl3d-types";
import type { TrackingMode } from "$lib/shared/animation-engine/domain/types/trail-types";
import { MOON_FAN_LED_COUNT } from "../../effects/led/moon-fan-diffuser-renderer-3d";
import { shutterToPovPersistence } from "../../effects/poi/pov-strip-renderer-3d";
import type { SceneEffectTipSource3D } from "../../effects/scene-effects/scene-effect-source-3d";
import type {
  WorkerEffectQualityTier,
  WorkerImperativeEffectFrame,
  WorkerLedTipFrame,
  WorkerPerformerEffectIntent,
  WorkerPerformerPropType,
  WorkerQuaternion,
  WorkerSceneEffectsSnapshot,
  WorkerVector3,
} from "../domain/worker-renderer-protocol";

const LED_SUPERSAMPLE_BY_TIER = { high: 8, medium: 4, low: 1 } as const;
const QUALITY_TIER_BY_WORKER_TIER: Readonly<
  Record<WorkerEffectQualityTier, QualityTier>
> = {
  high: QualityTier.HIGH,
  medium: QualityTier.MEDIUM,
  low: QualityTier.LOW,
};

function toQualityTier(tier: WorkerEffectQualityTier): QualityTier {
  return QUALITY_TIER_BY_WORKER_TIER[tier];
}

export interface WorkerEffectPropFrameInput {
  state: PropState3D | null;
  propType: WorkerPerformerPropType;
  worldCenter: WorkerVector3;
  worldRotation: WorkerQuaternion;
}

export interface WorkerImperativeEffectFrameInput {
  performerId: string;
  sourceIdBase: number;
  deltaSeconds: number;
  staffHalfLength: number;
  collisionFloorY: number;
  intent: WorkerPerformerEffectIntent;
  left: WorkerEffectPropFrameInput;
  right: WorkerEffectPropFrameInput;
}

interface PerformerEffectState {
  readonly tipBridge: TipPositionBridge3D;
  readonly patternMaterializer: LedPatternMaterializer;
  readonly previousLedPositions: Map<string, Vector3>;
}

function performerState(): PerformerEffectState {
  return {
    tipBridge: new TipPositionBridge3D(),
    patternMaterializer: new LedPatternMaterializer(),
    previousLedPositions: new Map(),
  };
}

function stripColors(pattern: StripPattern, frameIndex: number) {
  return Array.from({ length: pattern.ledCount }, (_, index) => {
    const color = getPixel(pattern, frameIndex, index);
    return { r: color.r / 255, g: color.g / 255, b: color.b / 255 };
  });
}

function effectAt(
  intent: WorkerPerformerEffectIntent,
  propIndex: 0 | 1,
  tipIndex: 0 | 1
) {
  return (
    intent.tips.find(
      (entry) => entry.propIndex === propIndex && entry.tipIndex === tipIndex
    )?.effect ?? "none"
  );
}

function pooledSource(
  input: WorkerImperativeEffectFrameInput,
  propIndex: 0 | 1,
  tip: TipPositionData3D
): SceneEffectTipSource3D | null {
  const effect = effectAt(input.intent, propIndex, tip.tipIndex);
  if (
    effect === "none" ||
    effect === "trails" ||
    effect === "led" ||
    effect === "zap" ||
    effect === "ghost" ||
    effect === "frost"
  )
    return null;
  const params = input.intent.pooled[effect];
  if (!params)
    throw new Error(`Missing resolved ${effect} parameters for worker effect`);
  const base = {
    sourceId: input.sourceIdBase + propIndex * 2 + tip.tipIndex,
    propIndex,
    tipIndex: tip.tipIndex,
    position: { ...tip.position },
    velocity: { ...tip.velocity },
    speed: tip.speed,
    currentStep: input.intent.currentStep,
    totalSteps: input.intent.totalSteps,
    seamlesslyLoopable: input.intent.seamlesslyLoopable,
    propColor: propIndex === 0 ? PROP_COLORS.blue.main : PROP_COLORS.red.main,
  };
  switch (effect) {
    case "sparkles":
    case "goo":
    case "petals":
    case "ink":
    case "silk":
    case "animal":
    case "pulse":
      return { ...base, effect, params } as SceneEffectTipSource3D;
    case "bubbles":
    case "smoke":
    case "bloom":
      return {
        ...base,
        effect,
        params,
        qualityTier: input.intent.qualityTier,
      } as SceneEffectTipSource3D;
    case "fire":
      return {
        ...base,
        effect,
        params: params as Fire3DParams,
        qualityTier: toQualityTier(input.intent.qualityTier),
        jerk: Math.hypot(tip.jerk.x, tip.jerk.y, tip.jerk.z),
      };
    case "charcoal":
      return {
        ...base,
        effect,
        params: params as Charcoal3DParams,
        qualityTier: toQualityTier(input.intent.qualityTier),
        jerk: Math.hypot(tip.jerk.x, tip.jerk.y, tip.jerk.z),
        totalSteps: input.intent.totalSteps,
        collisionFloorY: input.collisionFloorY,
      };
  }
}

/**
 * Turns application-owned effect choices into renderer frames using the exact
 * prop centers and rotations the worker performer just rendered.
 */
export class WorkerImperativeEffectFrameBuilder {
  private readonly performers = new Map<string, PerformerEffectState>();
  private sampleSequence = 0;

  build(input: WorkerImperativeEffectFrameInput): WorkerSceneEffectsSnapshot {
    const state = this.getPerformer(input.performerId);
    if (!input.intent.playing) {
      state.tipBridge.reset();
      state.previousLedPositions.clear();
    }

    const sequence = ++this.sampleSequence;
    const imperative: WorkerImperativeEffectFrame[] = [];
    const sources: SceneEffectTipSource3D[] = [];
    const led = input.intent.led;
    const ledCount = Math.max(1, Math.round(led.device.ledCount));
    const ledPattern = state.patternMaterializer.resolve(led.pattern, ledCount);
    const ledFrame = ledPattern
      ? patternFrameIndex(
          input.intent.sampledAtMs,
          led.cycleDuration,
          ledPattern.frameCount
        )
      : 0;
    const moonPattern = state.patternMaterializer.resolve(
      led.pattern,
      MOON_FAN_LED_COUNT
    );
    const moonFrame = moonPattern
      ? patternFrameIndex(
          input.intent.sampledAtMs,
          led.cycleDuration,
          moonPattern.frameCount
        )
      : 0;
    const brightness = ledBrightnessToFloat(led.look.brightness);

    const props = [input.left, input.right] as const;
    for (const [rawIndex, prop] of props.entries()) {
      const propIndex = rawIndex as 0 | 1;
      if (!prop.state) continue;
      const center = new Vector3().fromArray(prop.worldCenter);
      const effectState: PropState3D = {
        ...prop.state,
        worldPosition: center,
        worldRotation: new Quaternion().fromArray(prop.worldRotation),
      };
      const tipFrame = state.tipBridge.update(
        propIndex,
        effectState,
        center,
        input.staffHalfLength,
        Math.min(input.deltaSeconds, 1 / 15),
        prop.propType,
        input.intent.propBuild
      );
      for (const tip of tipFrame.tips) {
        const pooled = pooledSource(input, propIndex, tip);
        if (pooled) sources.push(pooled);
      }

      for (const source of resolveTrailSources3D(
        input.intent.trails.trackingMode as TrackingMode,
        tipFrame.tips,
        center
      )) {
        if (
          effectAt(input.intent, propIndex, source.effectTipIndex) !== "trails"
        )
          continue;
        imperative.push({
          renderer: "trail",
          sourceId: `${input.performerId}:${propIndex}:${source.sourceId}`,
          sampleSequence: sequence,
          enabled: input.intent.playing,
          position: [source.position.x, source.position.y, source.position.z],
          config: {
            maxPoints: input.intent.trails.maxPoints,
            width: input.intent.trails.tubeRadius,
            color: input.intent.trails.rainbow
              ? "rainbow"
              : propIndex === 0
                ? input.intent.trails.leftColor
                : input.intent.trails.rightColor,
            opacity: input.intent.trails.brightness,
            rainbow: input.intent.trails.rainbow,
            qualityTier: input.intent.qualityTier,
            mode: "fade",
            fadeDuration: 2,
            emissiveStrength:
              input.intent.trails.emissive *
              (input.intent.qualityTier === "high"
                ? 1.6
                : input.intent.qualityTier === "medium"
                  ? 1.3
                  : 1),
          },
        });
      }

      const ledAssigned = tipFrame.tips.some(
        (tip) => effectAt(input.intent, propIndex, tip.tipIndex) === "led"
      );
      if (!ledAssigned) continue;
      const isMoonFan =
        input.intent.propBuild.fanBuild === "moon" &&
        (prop.propType === "fan" || prop.propType === "bigfan");
      if (isMoonFan && moonPattern) {
        imperative.push({
          renderer: "moon-fan",
          sourceId: `${input.performerId}:${propIndex}:moon-fan`,
          sampleSequence: sequence,
          enabled: input.intent.playing,
          worldCenter: prop.worldCenter,
          worldRotation: prop.worldRotation,
          ledColors: stripColors(moonPattern, moonFrame),
          brightness,
          scale: prop.propType === "bigfan" ? 1.4 : 1,
        });
        continue;
      }
      if (led.device.kind === "pixel-staff" && ledPattern) {
        this.pushPovFrame(
          imperative,
          input,
          propIndex,
          tipFrame.tips,
          center,
          ledPattern,
          ledFrame,
          ledCount,
          brightness,
          sequence
        );
        continue;
      }
      if (!ledPattern) continue;
      const tips: WorkerLedTipFrame[] = [];
      for (const tip of tipFrame.tips) {
        if (effectAt(input.intent, propIndex, tip.tipIndex) !== "led") continue;
        const color = getPixel(
          ledPattern,
          ledFrame,
          tip.tipIndex % ledPattern.ledCount
        );
        this.pushLedSamples(
          tips,
          state,
          `${propIndex}-${tip.tipIndex}`,
          tip,
          color,
          brightness,
          LED_SUPERSAMPLE_BY_TIER[input.intent.qualityTier]
        );
      }
      imperative.push({
        renderer: "led",
        sourceId: `${input.performerId}:${propIndex}:led`,
        sampleSequence: sequence,
        enabled: input.intent.playing,
        qualityTier: input.intent.qualityTier,
        sampledAtSeconds: input.intent.sampledAtMs / 1000,
        tips,
      });
    }

    return { playing: input.intent.playing, sources, imperative };
  }

  removePerformer(performerId: string): void {
    const state = this.performers.get(performerId);
    state?.tipBridge.reset();
    state?.patternMaterializer.reset();
    state?.previousLedPositions.clear();
    this.performers.delete(performerId);
  }

  reset(): void {
    for (const performerId of this.performers.keys())
      this.removePerformer(performerId);
    this.sampleSequence = 0;
  }

  private getPerformer(performerId: string): PerformerEffectState {
    let state = this.performers.get(performerId);
    if (!state) {
      state = performerState();
      this.performers.set(performerId, state);
    }
    return state;
  }

  private pushPovFrame(
    output: WorkerImperativeEffectFrame[],
    input: WorkerImperativeEffectFrameInput,
    propIndex: 0 | 1,
    tips: readonly TipPositionData3D[],
    center: Vector3,
    pattern: StripPattern,
    frameIndex: number,
    ledCount: number,
    brightness: number,
    sequence: number
  ): void {
    const leftTip = tips.find((tip) => tip.tipIndex === 0);
    const rightTip = tips.find((tip) => tip.tipIndex === 1);
    const first = leftTip?.position ?? center;
    const last = rightTip?.position ?? leftTip?.position;
    if (!last) return;
    const firstPoint = new Vector3(first.x, first.y, first.z);
    const lastPoint = new Vector3(last.x, last.y, last.z);
    const axis = lastPoint.clone().sub(firstPoint);
    const span = axis.length();
    if (span < 1e-6) return;
    output.push({
      renderer: "pov",
      sourceId: `${input.performerId}:${propIndex}:pov`,
      sampleSequence: sequence,
      enabled: input.intent.playing,
      qualityTier: input.intent.qualityTier,
      ledCount,
      staffAxis: axis.normalize().toArray(),
      staffCenter: firstPoint.add(lastPoint).multiplyScalar(0.5).toArray(),
      staffHalfLength: span / 2,
      frameIndex,
      pattern,
      sampledAtSeconds: input.intent.sampledAtMs / 1000,
      brightness,
      persistenceDuration: shutterToPovPersistence(
        input.intent.led.look.shutter
      ),
    });
  }

  private pushLedSamples(
    output: WorkerLedTipFrame[],
    state: PerformerEffectState,
    key: string,
    tip: TipPositionData3D,
    color: { r: number; g: number; b: number },
    brightness: number,
    sampleCount: number
  ): void {
    const current = new Vector3(tip.position.x, tip.position.y, tip.position.z);
    const previous = state.previousLedPositions.get(key);
    const count = previous ? sampleCount : 1;
    for (let index = 1; index <= count; index++) {
      const position = previous
        ? previous.clone().lerp(current, index / count)
        : current.clone();
      output.push({
        position: position.toArray(),
        r: color.r / 255,
        g: color.g / 255,
        b: color.b / 255,
        brightness,
        velocity: [tip.velocity.x, tip.velocity.y, tip.velocity.z],
        speed: tip.speed,
      });
    }
    if (previous) previous.copy(current);
    else state.previousLedPositions.set(key, current);
  }
}
