import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  PlaneGeometry,
  Vector3,
  type Object3D,
} from "three";
import { createBloomMaterial3D } from "./bloom-material-3d";
import {
  resolveBloomFalloffCode,
  resolveBloomHistoryCapacity,
  resolveBloomOpticalFrame3D,
  resolveBloomSourceNormalization,
  shouldResetBloomHistory3D,
} from "./bloom-optics-3d";
import { BoundedSourcePath3D } from "../scene-effects/bounded-source-path-3d";
import type { Bloom3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import type { BloomTipSource3D } from "../scene-effects/scene-effect-source-3d";
import {
  DynamicLightManager,
  type LightHandle,
} from "../lighting/dynamic-light-manager";
import { QualityTier, TIER_CONFIGS } from "../types";

const PATH_CAPACITY = 72;
const INSTANCE_CAPACITY = 4096;
const LIVE_RENDER_ORDER = 119;

interface BloomSourceState {
  path: BoundedSourcePath3D;
  right: Float32Array;
  green: Float32Array;
  left: Float32Array;
  velocityX: Float32Array;
  velocityY: Float32Array;
  velocityZ: Float32Array;
  energy: Float32Array;
  params: Bloom3DParams;
  qualityTier: QualityTier;
  seenEpoch: number;
  lastStep: number;
  currentX: number;
  currentY: number;
  currentZ: number;
  axisX: number;
  axisY: number;
  axisZ: number;
}

interface BloomInstanceWrite {
  x: number;
  y: number;
  z: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  right: number;
  green: number;
  left: number;
  energy: number;
  radius: number;
  stretch: number;
  streak: number;
  spikes: number;
  falloff: number;
  history: number;
  coreStrength: number;
  seed: number;
}

/**
 * One optical draw for every Bloom source in a scene. Live tips and their
 * fading exposure history share the same material, so mirrored formations add
 * instances without multiplying Svelte components or draw calls.
 */
export class BloomRenderer3D {
  readonly object3D: InstancedMesh;

  private readonly states = new Map<number, BloomSourceState>();
  private readonly centers = new Float32Array(INSTANCE_CAPACITY * 3);
  private readonly velocitySeeds = new Float32Array(INSTANCE_CAPACITY * 4);
  private readonly colors = new Float32Array(INSTANCE_CAPACITY * 3);
  private readonly optics = new Float32Array(INSTANCE_CAPACITY * 4);
  private readonly lenses = new Float32Array(INSTANCE_CAPACITY * 3);
  private readonly coreStrengths = new Float32Array(INSTANCE_CAPACITY);
  private readonly attributes: readonly InstancedBufferAttribute[];
  private readonly material = createBloomMaterial3D();
  private readonly color = new Color();
  private readonly opticalAxis = new Vector3();
  private readonly selectedLightSources: BloomTipSource3D[] = [];
  private readonly lightHandles: Array<LightHandle | null> = [];
  private parent: Object3D | null = null;
  private lightManager: DynamicLightManager | null = null;
  private lightTier: QualityTier | null = null;
  private ownsLightManager = false;
  private clock = 0;
  private epoch = 0;
  private visibleCount = 0;

  constructor() {
    const geometry = new PlaneGeometry(2, 2, 1, 1);
    const centerAttribute = this.attribute(this.centers, 3);
    const velocitySeedAttribute = this.attribute(this.velocitySeeds, 4);
    const colorAttribute = this.attribute(this.colors, 3);
    const opticsAttribute = this.attribute(this.optics, 4);
    const lensAttribute = this.attribute(this.lenses, 3);
    const coreStrengthAttribute = this.attribute(this.coreStrengths, 1);
    this.attributes = [
      centerAttribute,
      velocitySeedAttribute,
      colorAttribute,
      opticsAttribute,
      lensAttribute,
      coreStrengthAttribute,
    ];

    geometry.setAttribute("aCenter", centerAttribute);
    geometry.setAttribute("aVelocitySeed", velocitySeedAttribute);
    geometry.setAttribute("aColor", colorAttribute);
    geometry.setAttribute("aOptics", opticsAttribute);
    geometry.setAttribute("aLens", lensAttribute);
    geometry.setAttribute("aCoreStrength", coreStrengthAttribute);

    this.object3D = new InstancedMesh(
      geometry,
      this.material,
      INSTANCE_CAPACITY
    );
    this.object3D.count = 0;
    this.object3D.frustumCulled = false;
    this.object3D.renderOrder = LIVE_RENDER_ORDER;
  }

  initialize(
    parent: Object3D,
    sharedLightManager?: DynamicLightManager | null
  ): void {
    if (
      this.parent === parent &&
      (!sharedLightManager || this.lightManager === sharedLightManager)
    )
      return;
    this.parent?.remove(this.object3D);
    this.disposeLights();
    this.parent = parent;
    if (sharedLightManager) {
      this.lightManager = sharedLightManager;
      this.lightTier = QualityTier.HIGH;
      this.ownsLightManager = false;
    }
    parent.add(this.object3D);
  }

  update(sources: readonly BloomTipSource3D[], delta: number): void {
    const dt = Math.min(Math.max(delta, 0), 1 / 15);
    this.clock += dt;
    this.epoch++;

    const propCount = this.countProps(sources);
    const normalization = resolveBloomSourceNormalization(propCount);
    let maxEmissive = 1;

    for (const source of sources) {
      const state = this.updateSourceState(source, normalization);
      maxEmissive = Math.max(maxEmissive, state.params.emissiveStrength);
    }

    for (const [sourceId, state] of this.states) {
      if (state.seenEpoch !== this.epoch) this.states.delete(sourceId);
    }

    this.visibleCount = 0;
    for (const source of sources) {
      const frame = resolveBloomOpticalFrame3D(
        source.params,
        source.speed,
        this.clock,
        normalization
      );
      const opticalAxis = this.resolveOpticalAxis(source);
      this.resolveColor(source);
      this.write({
        x: source.position.x,
        y: source.position.y,
        z: source.position.z,
        velocityX: opticalAxis.x,
        velocityY: opticalAxis.y,
        velocityZ: opticalAxis.z,
        right: this.color.r,
        green: this.color.g,
        left: this.color.b,
        energy: frame.energy,
        radius: frame.radiusWorld,
        stretch: frame.stretch,
        streak: frame.streak,
        spikes: frame.spikes,
        falloff: resolveBloomFalloffCode(source.params.falloff),
        history: 0,
        coreStrength: frame.coreStrength,
        seed: (source.sourceId % 17) / 17,
      });
    }

    for (const state of this.states.values()) this.writeHistory(state);

    this.material.uniforms.uEmissiveStrength!.value = maxEmissive;
    this.commit();
    this.updateLights(sources, normalization);
  }

  clear(): void {
    this.states.clear();
    this.visibleCount = 0;
    this.object3D.count = 0;
    this.releaseLights();
  }

  dispose(): void {
    this.clear();
    this.parent?.remove(this.object3D);
    this.parent = null;
    this.object3D.geometry.dispose();
    this.material.dispose();
    this.disposeLights();
  }

  private updateSourceState(
    source: BloomTipSource3D,
    normalization: number
  ): BloomSourceState {
    let state = this.states.get(source.sourceId);
    if (!state) {
      state = {
        path: new BoundedSourcePath3D(PATH_CAPACITY),
        right: new Float32Array(PATH_CAPACITY),
        green: new Float32Array(PATH_CAPACITY),
        left: new Float32Array(PATH_CAPACITY),
        velocityX: new Float32Array(PATH_CAPACITY),
        velocityY: new Float32Array(PATH_CAPACITY),
        velocityZ: new Float32Array(PATH_CAPACITY),
        energy: new Float32Array(PATH_CAPACITY),
        params: source.params,
        qualityTier: source.qualityTier,
        seenEpoch: this.epoch,
        lastStep: source.currentStep,
        currentX: source.position.x,
        currentY: source.position.y,
        currentZ: source.position.z,
        axisX: 0,
        axisY: 0,
        axisZ: 0,
      };
      this.states.set(source.sourceId, state);
    }

    const distance = Math.hypot(
      source.position.x - state.currentX,
      source.position.y - state.currentY,
      source.position.z - state.currentZ
    );
    if (
      shouldResetBloomHistory3D(state.lastStep, source.currentStep, distance)
    ) {
      state.path.clear();
    }

    state.params = source.params;
    state.qualityTier = source.qualityTier;
    state.seenEpoch = this.epoch;
    state.lastStep = source.currentStep;
    state.currentX = source.position.x;
    state.currentY = source.position.y;
    state.currentZ = source.position.z;

    if (source.params.historyLifetimeSeconds <= 0) {
      state.path.clear();
      return state;
    }

    state.path.trimBefore(this.clock - source.params.historyLifetimeSeconds);
    this.resolveColor(source);
    const frame = resolveBloomOpticalFrame3D(
      source.params,
      source.speed,
      this.clock,
      normalization
    );
    const retained = state.path.push(
      source.position,
      this.clock,
      source.speed,
      source.params.historySampleDistanceWorld
    );
    if (retained) {
      const index = state.path.indexFromNewest(0);
      state.right[index] = this.color.r;
      state.green[index] = this.color.g;
      state.left[index] = this.color.b;
      state.velocityX[index] = source.velocity.x;
      state.velocityY[index] = source.velocity.y;
      state.velocityZ[index] = source.velocity.z;
      state.energy[index] = frame.energy;
    }
    return state;
  }

  private writeHistory(state: BloomSourceState): void {
    const lifetime = state.params.historyLifetimeSeconds;
    if (lifetime <= 0 || state.path.count < 2) return;
    const capacity = resolveBloomHistoryCapacity(state.qualityTier);
    const count = Math.min(capacity, state.path.count - 1);
    for (let offset = 1; offset <= count; offset++) {
      const index = state.path.indexFromNewest(offset);
      const progress = Math.min(
        1,
        Math.max(0, (this.clock - state.path.birthAt(index)) / lifetime)
      );
      const fade = Math.pow(1 - progress, 2) * state.params.afterglow * 0.72;
      if (fade < 0.002) continue;
      const motion = Math.min(
        1.5,
        state.path.speedAt(index) / state.params.motionReferenceSpeed
      );
      this.write({
        x: state.path.xAt(index),
        y: state.path.yAt(index),
        z: state.path.zAt(index),
        velocityX: state.velocityX[index]!,
        velocityY: state.velocityY[index]!,
        velocityZ: state.velocityZ[index]!,
        right: state.right[index]!,
        green: state.green[index]!,
        left: state.left[index]!,
        energy: state.energy[index]! * fade,
        radius: state.params.haloRadiusWorld * (0.58 - progress * 0.3),
        stretch: 1 + state.params.streak * motion * 4.2,
        streak:
          state.params.streak * Math.min(1, motion) * (1 - progress * 0.35),
        spikes: 0,
        falloff: resolveBloomFalloffCode(state.params.falloff),
        history: 1,
        coreStrength: 0,
        seed: ((index + offset) % 19) / 19,
      });
    }
  }

  private resolveColor(source: BloomTipSource3D): void {
    const params = source.params;
    if (params.colorMode === "rainbow") {
      const hue = (this.clock * 0.12 + ((source.sourceId - 1) % 4) * 0.23) % 1;
      this.color.setHSL(hue, 0.9, 0.62);
    } else if (params.colorMode === "prop-matched") {
      this.color.set(source.propColor);
    } else if (params.colorMode === "palette" && params.palette.length > 0) {
      this.color.set(
        params.palette[(source.sourceId - 1) % params.palette.length]!
      );
    } else {
      this.color.set(params.color);
    }
  }

  private countProps(sources: readonly BloomTipSource3D[]): number {
    const propIds = new Set<number>();
    for (const source of sources) {
      propIds.add(Math.floor((source.sourceId - 1) / 2));
    }
    return propIds.size;
  }

  /** Both velocity blades and spectral trails point along real tip movement. */
  private resolveOpticalAxis(source: BloomTipSource3D): Vector3 {
    this.opticalAxis.set(
      source.velocity.x,
      source.velocity.y,
      source.velocity.z
    );
    const state = this.states.get(source.sourceId);
    if (this.opticalAxis.lengthSq() > 0.000001) {
      this.opticalAxis.normalize();
      if (state) {
        state.axisX = this.opticalAxis.x;
        state.axisY = this.opticalAxis.y;
        state.axisZ = this.opticalAxis.z;
      }
      return this.opticalAxis;
    }

    if (state && Math.hypot(state.axisX, state.axisY, state.axisZ) > 0.001) {
      return this.opticalAxis.set(state.axisX, state.axisY, state.axisZ);
    }

    const stableAngle = (source.sourceId * 2.399963229728653) % (Math.PI * 2);
    this.opticalAxis.set(Math.cos(stableAngle), Math.sin(stableAngle), 0);
    if (state) {
      state.axisX = this.opticalAxis.x;
      state.axisY = this.opticalAxis.y;
      state.axisZ = 0;
    }
    return this.opticalAxis;
  }

  private updateLights(
    sources: readonly BloomTipSource3D[],
    normalization: number
  ): void {
    if (!this.parent || sources.length === 0) {
      this.releaseLights();
      return;
    }
    const tier = sources[0]!.qualityTier;
    if (tier === QualityTier.LOW) {
      this.releaseLights();
      return;
    }
    if (!this.lightManager || this.lightTier !== tier) {
      if (this.ownsLightManager) this.disposeLights();
      if (this.lightManager) {
        // A scene-shared pool is deliberately sized once at startup. Runtime
        // quality changes reduce usage without changing the scene's light
        // count and forcing a new shader program.
        this.lightTier = tier;
      } else {
        this.lightManager = new DynamicLightManager(
          this.parent,
          TIER_CONFIGS[tier]
        );
        this.lightTier = tier;
        this.ownsLightManager = true;
      }
    }

    const lightSources = this.selectLightSources(
      sources,
      this.lightManager.capacity
    );
    // The cap shader supplies the visible glow. Share one physical-light budget
    // across the selected tips so more performers never brighten the whole set.
    const intensityScale = 1 / Math.max(1, lightSources.length);

    for (let slot = 0; slot < lightSources.length; slot++) {
      const source = lightSources[slot]!;
      const frame = resolveBloomOpticalFrame3D(
        source.params,
        source.speed,
        this.clock,
        normalization
      );
      this.resolveColor(source);
      this.colorPosition.set(
        source.position.x,
        source.position.y,
        source.position.z
      );
      const intensity = Math.min(
        1.4,
        source.params.lightIntensity *
          (0.35 + frame.energy * 1.65) *
          intensityScale
      );
      const handle = this.lightHandles[slot];
      if (handle) {
        this.lightManager.updateLight(
          handle,
          this.colorPosition,
          intensity,
          this.color,
          source.params.lightRange
        );
      } else {
        this.lightHandles[slot] = this.lightManager.requestLight(
          this.colorPosition,
          this.color,
          intensity,
          source.params.lightRange
        );
      }
    }

    for (
      let slot = lightSources.length;
      slot < this.lightHandles.length;
      slot++
    ) {
      const handle = this.lightHandles[slot];
      if (handle) this.lightManager.releaseLight(handle);
    }
    this.lightHandles.length = lightSources.length;
  }

  private readonly colorPosition = new Vector3();

  /**
   * Dynamic lights are scarce, especially in formations. Every allocated light
   * stays on a real visible tip; evenly spaced source IDs spread the available
   * illumination across performers without inventing a midpoint in empty air.
   */
  private selectLightSources(
    sources: readonly BloomTipSource3D[],
    capacity: number
  ): readonly BloomTipSource3D[] {
    this.selectedLightSources.length = 0;
    if (capacity <= 0 || sources.length === 0) {
      return this.selectedLightSources;
    }
    if (sources.length <= capacity) {
      this.selectedLightSources.push(...sources);
      return this.selectedLightSources;
    }
    if (capacity === 1) {
      this.selectedLightSources.push(
        sources[Math.floor((sources.length - 1) / 2)]!
      );
      return this.selectedLightSources;
    }

    for (let slot = 0; slot < capacity; slot++) {
      const sourceIndex = Math.round(
        (slot * (sources.length - 1)) / (capacity - 1)
      );
      this.selectedLightSources.push(sources[sourceIndex]!);
    }
    return this.selectedLightSources;
  }

  private releaseLights(): void {
    if (!this.lightManager) return;
    for (let index = 0; index < this.lightHandles.length; index++) {
      const handle = this.lightHandles[index];
      if (handle) this.lightManager.releaseLight(handle);
      this.lightHandles[index] = null;
    }
  }

  private disposeLights(): void {
    this.releaseLights();
    if (this.ownsLightManager) this.lightManager?.dispose();
    this.lightManager = null;
    this.lightTier = null;
    this.ownsLightManager = false;
    this.lightHandles.length = 0;
  }

  private write(instance: BloomInstanceWrite): void {
    const index = this.visibleCount;
    if (index >= INSTANCE_CAPACITY) return;
    const i3 = index * 3;
    const i4 = index * 4;
    this.centers[i3] = instance.x;
    this.centers[i3 + 1] = instance.y;
    this.centers[i3 + 2] = instance.z;
    this.velocitySeeds[i4] = instance.velocityX;
    this.velocitySeeds[i4 + 1] = instance.velocityY;
    this.velocitySeeds[i4 + 2] = instance.velocityZ;
    this.velocitySeeds[i4 + 3] = instance.seed;
    this.colors[i3] = instance.right;
    this.colors[i3 + 1] = instance.green;
    this.colors[i3 + 2] = instance.left;
    this.optics[i4] = instance.energy;
    this.optics[i4 + 1] = instance.radius;
    this.optics[i4 + 2] = instance.stretch;
    this.optics[i4 + 3] = instance.streak;
    this.lenses[i3] = instance.spikes;
    this.lenses[i3 + 1] = instance.falloff;
    this.lenses[i3 + 2] = instance.history;
    this.coreStrengths[index] = instance.coreStrength;
    this.visibleCount++;
  }

  private commit(): void {
    if (this.visibleCount > 0) {
      for (const attribute of this.attributes) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, this.visibleCount * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    }
    this.object3D.count = this.visibleCount;
  }

  private attribute(
    array: Float32Array,
    itemSize: number
  ): InstancedBufferAttribute {
    return new InstancedBufferAttribute(array, itemSize).setUsage(
      DynamicDrawUsage
    );
  }
}
