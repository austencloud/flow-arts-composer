import { Vector3, type Object3D, type WebGLRenderer } from "three";
import { BubbleRenderer3D } from "../bubbles/bubble-renderer-3d";
import { PetalPoolRenderer3D } from "../petals/petal-pool-renderer-3d";
import {
  NEUTRAL_PETAL_ENVIRONMENT_PROFILE,
  type PetalEnvironmentProfile3D,
} from "../petals/petal-world-art-direction";
import { SparkleRenderer3D } from "../particles/sparkle-renderer-3d";
import { SmokePoolRenderer3D } from "../smoke/smoke-pool-renderer-3d";
import {
  SmokeFluidRenderer3D,
  type SmokeFluidDiagnostic3D,
} from "../smoke/smoke-fluid-renderer-3d";
import { QualityTier, TIER_CONFIGS } from "../types";
import { FireRenderer3D, type FireTipInput } from "../fire/fire-renderer-3d";
import { GooRenderer3D } from "../water/goo-renderer-3d";
import { InkRenderer3D } from "../ink/ink-renderer-3d";
import { SilkRenderer3D } from "../silk/silk-renderer-3d";
import { AnimalRenderer3D } from "../animal/animal-renderer-3d";
import { PulseRenderer3D } from "../pulse/pulse-renderer-3d";
import { BloomRenderer3D } from "../bloom/bloom-renderer-3d";
import {
  CharcoalRenderer3D,
  type CharcoalTipInput,
} from "../charcoal/charcoal-renderer-3d";
import { DynamicLightManager } from "../lighting/dynamic-light-manager";
import type {
  BubbleTipSource3D,
  GooTipSource3D,
  PetalTipSource3D,
  SceneEffectRigFrame3D,
  SmokeTipSource3D,
  SparkleTipSource3D,
  InkTipSource3D,
  SilkTipSource3D,
  AnimalTipSource3D,
  PulseTipSource3D,
  BloomTipSource3D,
  FireTipSource3D,
  CharcoalTipSource3D,
} from "./scene-effect-source-3d";
import { TIP_EFFECT_SLOTS_PER_RIG } from "../prop-tip-geometry-3d";

// Eight performers, each with every emitter on both props.
const MAX_SCENE_EFFECT_TIPS = 8 * TIP_EFFECT_SLOTS_PER_RIG;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

export interface SceneEffectsRigRegistration3D {
  /** Four consecutive IDs, one for each prop tip in canonical order. */
  sourceIdBase: number;
  dispose(): void;
}

/**
 * Owns one renderer per pooled visual effect for one Three.js scene.
 *
 * Orchestrators only publish stable tip inputs. This manager gathers every rig
 * after Threlte's main stage and advances each effect exactly once, so particle
 * count no longer multiplies draw calls or Svelte component work.
 */
export class SceneEffectsManager3D {
  private readonly rigs = new Set<SceneEffectRigFrame3D>();
  private readonly sparkles: SparkleTipSource3D[] = [];
  private readonly goo: GooTipSource3D[] = [];
  private readonly bubbles: BubbleTipSource3D[] = [];
  private readonly petals: PetalTipSource3D[] = [];
  private readonly smoke: SmokeTipSource3D[] = [];
  private readonly volumeSmoke: SmokeTipSource3D[] = [];
  private readonly fallbackSmoke: SmokeTipSource3D[] = [];
  private readonly ink: InkTipSource3D[] = [];
  private readonly silk: SilkTipSource3D[] = [];
  private readonly animal: AnimalTipSource3D[] = [];
  private readonly pulse: PulseTipSource3D[] = [];
  private readonly bloom: BloomTipSource3D[] = [];
  private readonly fire: FireTipSource3D[] = [];
  private readonly charcoal: CharcoalTipSource3D[] = [];
  private readonly fireInputs: FireTipInput[] = [];
  private readonly charcoalInputs: CharcoalTipInput[] = [];
  private readonly fireColors = new Map<
    string,
    { r: number; g: number; b: number }
  >();
  private sparkleRenderer: SparkleRenderer3D | null = null;
  private gooRenderer: GooRenderer3D | null = null;
  private bubbleRenderer: BubbleRenderer3D | null = null;
  private petalRenderer: PetalPoolRenderer3D | null = null;
  private smokeFallbackRenderer: SmokePoolRenderer3D | null = null;
  private smokeVolumeRenderer: SmokeFluidRenderer3D | null = null;
  private inkRenderer: InkRenderer3D | null = null;
  private silkRenderer: SilkRenderer3D | null = null;
  private animalRenderer: AnimalRenderer3D | null = null;
  private pulseRenderer: PulseRenderer3D | null = null;
  private bloomRenderer: BloomRenderer3D | null = null;
  private fireRenderer: FireRenderer3D | null = null;
  private charcoalRenderer: CharcoalRenderer3D | null = null;
  private dynamicLightManager: DynamicLightManager | null = null;
  private fireWasActive = false;
  private parent: Object3D | null = null;
  private nextSourceId = 1;
  private petalEnvironmentProfile = NEUTRAL_PETAL_ENVIRONMENT_PROFILE;

  registerRig(frame: SceneEffectRigFrame3D): SceneEffectsRigRegistration3D {
    this.rigs.add(frame);
    const sourceIdBase = this.nextSourceId;
    this.nextSourceId += TIP_EFFECT_SLOTS_PER_RIG;
    let registered = true;
    return {
      sourceIdBase,
      dispose: () => {
        if (!registered) return;
        registered = false;
        this.rigs.delete(frame);
        if (this.rigs.size === 0) this.clear();
      },
    };
  }

  initialize(parent: Object3D, renderer?: WebGLRenderer): void {
    if (this.parent === parent) return;
    if (this.parent) this.disposeRenderers();
    this.parent = parent;
    this.dynamicLightManager = new DynamicLightManager(
      parent,
      TIER_CONFIGS[QualityTier.HIGH]
    );
    this.sparkleRenderer = new SparkleRenderer3D();
    this.gooRenderer = new GooRenderer3D();
    this.bubbleRenderer = new BubbleRenderer3D();
    this.petalRenderer = new PetalPoolRenderer3D();
    this.petalRenderer.setEnvironmentProfile(this.petalEnvironmentProfile);
    this.smokeFallbackRenderer = new SmokePoolRenderer3D();
    if (renderer?.capabilities.isWebGL2 === true)
      this.smokeVolumeRenderer = new SmokeFluidRenderer3D(renderer);
    this.inkRenderer = new InkRenderer3D();
    this.silkRenderer = new SilkRenderer3D();
    this.animalRenderer = new AnimalRenderer3D();
    this.pulseRenderer = new PulseRenderer3D();
    this.bloomRenderer = new BloomRenderer3D();
    this.charcoalRenderer = new CharcoalRenderer3D(
      QualityTier.HIGH,
      MAX_SCENE_EFFECT_TIPS
    );
    this.fireRenderer = new FireRenderer3D(QualityTier.HIGH, {
      // Eight performers × two props × every live emitter. One scene pool keeps the
      // shipped high-tier density without constructing eight renderers when
      // the Fire control is pressed.
      poolSize: TIER_CONFIGS[QualityTier.HIGH].maxParticles,
      maxDynamicLights: TIER_CONFIGS[QualityTier.HIGH].maxDynamicLights,
    });
    this.sparkleRenderer.initialize(parent);
    this.gooRenderer.initialize(parent);
    this.bubbleRenderer.initialize(parent);
    this.petalRenderer.initialize(parent);
    this.smokeFallbackRenderer.initialize(parent);
    this.smokeVolumeRenderer?.initialize(parent);
    this.inkRenderer.initialize(parent);
    this.silkRenderer.initialize(parent);
    this.animalRenderer.initialize(parent);
    this.pulseRenderer.initialize(parent);
    this.bloomRenderer.initialize(parent, this.dynamicLightManager);
    this.charcoalRenderer.initialize(parent);
    this.fireRenderer.initialize(parent);
    this.fireRenderer.primeGpuUpload();
  }

  setPetalEnvironmentProfile(profile: PetalEnvironmentProfile3D): void {
    if (profile === this.petalEnvironmentProfile) return;
    this.petalEnvironmentProfile = profile;
    this.petalRenderer?.setEnvironmentProfile(profile);
  }

  update(delta: number): void {
    if (!this.parent) return;
    this.sparkles.length = 0;
    this.goo.length = 0;
    this.bubbles.length = 0;
    this.petals.length = 0;
    this.smoke.length = 0;
    this.volumeSmoke.length = 0;
    this.fallbackSmoke.length = 0;
    this.ink.length = 0;
    this.silk.length = 0;
    this.animal.length = 0;
    this.pulse.length = 0;
    this.bloom.length = 0;
    this.fire.length = 0;
    this.charcoal.length = 0;
    let anyPlaying = false;
    let motionDelta: number | undefined;

    for (const rig of this.rigs) {
      if (rig.playing) {
        anyPlaying = true;
        motionDelta ??= rig.motionDelta;
      }
      for (const source of rig.sources) {
        if (source.effect === "bloom") {
          this.bloom.push(source);
          continue;
        }
        if (!rig.playing) continue;
        switch (source.effect) {
          case "sparkles":
            this.sparkles.push(source);
            break;
          case "goo":
            this.goo.push(source);
            break;
          case "bubbles":
            this.bubbles.push(source);
            break;
          case "petals":
            this.petals.push(source);
            break;
          case "smoke":
            this.smoke.push(source);
            break;
          case "ink":
            this.ink.push(source);
            break;
          case "silk":
            this.silk.push(source);
            break;
          case "animal":
            this.animal.push(source);
            break;
          case "pulse":
            this.pulse.push(source);
            break;
          case "fire":
            this.fire.push(source);
            break;
          case "charcoal":
            this.charcoal.push(source);
            break;
        }
      }
    }

    // Bloom pulse remains clock-driven while paused, matching its 2D contract.
    // Emission-based effects still freeze with the animation.
    this.bloomRenderer?.update(this.bloom, delta);
    if (!anyPlaying) return;
    // Emission effects step by the time the props moved, so velocities read
    // from tip displacement stay true across uneven frames.
    const step = motionDelta ?? delta;
    if (this.fire.length > 0 && this.fireRenderer) {
      this.fireRenderer.updateConfig(this.fire[0]!.params);
      for (let index = 0; index < this.fire.length; index++) {
        const source = this.fire[index]!;
        let input = this.fireInputs[index];
        if (!input) {
          input = {
            sourceId: source.sourceId,
            position: source.position,
            velocityX: 0,
            velocityY: 0,
            velocityZ: 0,
            speed: 0,
          };
          this.fireInputs[index] = input;
        }
        input.sourceId = source.sourceId;
        input.position = source.position;
        input.velocityX = source.velocity.x;
        input.velocityY = source.velocity.y;
        input.velocityZ = source.velocity.z;
        input.speed = source.speed;
        input.jerk = source.jerk;
        let color = this.fireColors.get(source.propColor);
        if (!color) {
          color = hexToRgb(source.propColor);
          this.fireColors.set(source.propColor, color);
        }
        input.propColor = color;
      }
      this.fireInputs.length = this.fire.length;
      this.fireRenderer.update(this.fireInputs, step);
      this.fireWasActive = true;
    } else if (this.fireWasActive) {
      this.fireRenderer?.reset();
      this.fireInputs.length = 0;
      this.fireWasActive = false;
    }
    if (this.charcoal.length > 0 && this.charcoalRenderer) {
      this.charcoalRenderer.updateConfig(this.charcoal[0]!.params);
      for (let index = 0; index < this.charcoal.length; index++) {
        const source = this.charcoal[index]!;
        let input = this.charcoalInputs[index];
        if (!input) {
          const created: CharcoalTipInput = {
            sourceId: source.sourceId,
            position: new Vector3(),
            velocityX: 0,
            velocityY: 0,
            velocityZ: 0,
            speed: 0,
            jerk: 0,
          };
          this.charcoalInputs[index] = created;
          input = created;
        }
        input.sourceId = source.sourceId;
        input.position.set(
          source.position.x,
          source.position.y,
          source.position.z
        );
        input.velocityX = source.velocity.x;
        input.velocityY = source.velocity.y;
        input.velocityZ = source.velocity.z;
        input.speed = source.speed;
        input.jerk = source.jerk;
      }
      this.charcoalInputs.length = this.charcoal.length;
      const continuity = this.charcoal[0]!;
      this.charcoalRenderer.update(this.charcoalInputs, step, {
        currentStep: continuity.currentStep,
        totalSteps: continuity.totalSteps,
        collisionFloorY: continuity.collisionFloorY,
      });
    } else {
      this.charcoalInputs.length = 0;
      this.charcoalRenderer?.reset();
    }
    this.sparkleRenderer?.update(this.sparkles, step);
    this.gooRenderer?.update(this.goo, step);
    this.bubbleRenderer?.update(this.bubbles, step);
    this.petalRenderer?.update(this.petals, step);
    if (this.smokeVolumeRenderer) {
      for (const source of this.smoke) {
        if (source.qualityTier === QualityTier.LOW)
          this.fallbackSmoke.push(source);
        else this.volumeSmoke.push(source);
      }
      // Performers past the fluid's budget fall back to sprites.
      for (const source of this.smokeVolumeRenderer.update(
        this.volumeSmoke,
        step
      ))
        this.fallbackSmoke.push(source);
      this.smokeFallbackRenderer?.update(this.fallbackSmoke, step);
    } else {
      this.smokeFallbackRenderer?.update(this.smoke, step);
    }
    this.inkRenderer?.update(this.ink, step);
    this.silkRenderer?.update(this.silk, step);
    this.animalRenderer?.update(this.animal, step);
    this.pulseRenderer?.update(this.pulse, step);
  }

  clear(): void {
    this.sparkleRenderer?.clear();
    this.gooRenderer?.clear();
    this.bubbleRenderer?.clear();
    this.petalRenderer?.clear();
    this.smokeFallbackRenderer?.clear();
    this.smokeVolumeRenderer?.clear();
    this.inkRenderer?.clear();
    this.silkRenderer?.clear();
    this.animalRenderer?.clear();
    this.pulseRenderer?.clear();
    this.bloomRenderer?.clear();
    this.fireRenderer?.reset();
    this.charcoalRenderer?.reset();
    this.fireInputs.length = 0;
    this.charcoalInputs.length = 0;
    this.fireWasActive = false;
  }

  dispose(): void {
    this.rigs.clear();
    this.disposeRenderers();
    this.parent = null;
  }

  private disposeRenderers(): void {
    this.sparkleRenderer?.dispose();
    this.gooRenderer?.dispose();
    this.bubbleRenderer?.dispose();
    this.petalRenderer?.dispose();
    this.smokeFallbackRenderer?.dispose();
    this.smokeVolumeRenderer?.dispose();
    this.inkRenderer?.dispose();
    this.silkRenderer?.dispose();
    this.animalRenderer?.dispose();
    this.pulseRenderer?.dispose();
    this.bloomRenderer?.dispose();
    this.fireRenderer?.dispose();
    this.charcoalRenderer?.dispose();
    this.dynamicLightManager?.dispose();
    this.sparkleRenderer = null;
    this.gooRenderer = null;
    this.bubbleRenderer = null;
    this.petalRenderer = null;
    this.smokeFallbackRenderer = null;
    this.smokeVolumeRenderer = null;
    this.inkRenderer = null;
    this.silkRenderer = null;
    this.animalRenderer = null;
    this.pulseRenderer = null;
    this.bloomRenderer = null;
    this.fireRenderer = null;
    this.charcoalRenderer = null;
    this.dynamicLightManager = null;
    this.fireWasActive = false;
  }

  getSmokeDebugSnapshot(): SmokeFluidDiagnostic3D | null {
    return this.smokeVolumeRenderer?.getDebugSnapshot() ?? null;
  }

  getDynamicLightManager(): DynamicLightManager | null {
    return this.dynamicLightManager;
  }
}
