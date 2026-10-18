/**
 * FireRenderer3D - Lagrangian (particle) fire at prop tips.
 *
 * Real fire on a moving prop is not a shape that chases the tip - it is a
 * medium that is *born at the wick and left behind*. Each particle spawns at
 * the tip's current position carrying a little of the tip's velocity in its
 * wake, sheds that within a few hundredths of a second, rises, widens as it
 * mixes with air and glows until it has burned through. The numbers are the
 * shared wick flame in effects/domain/fire-physics.ts, which the 2D fluid fire
 * also uses. Because particles stay where they were born as the tip travels
 * on, the flame automatically streaks and curls along the path - motion
 * awareness is intrinsic to the model, not bolted on with a rotation. A hard
 * direction reversal leaves a dense knot of particles at the turnaround, so the
 * "poof" on a stall emerges for free from the physics.
 *
 * Pipeline reuse:
 *   - Zero-GC pre-allocated pool pattern from CharcoalRenderer3D.
 *   - Velocity-stretched instanced-billboard idiom from LedRenderer3D.
 *   - Divergence-free curl field from smoke/smoke-curl-field (SampledCurlGrid2D).
 *   - Blackbody presets from fire-color-curve-3d (getFireColors).
 *   - Point-sprite blackbody shader in fire-particle-material-3d.
 *
 * Coordinate space is rig-local world (the same space CharcoalRenderer3D and
 * the tip bridge use); particles are added to the parent passed to initialize().
 * The animation runs in the XY plane, so the curl field is sampled in XY.
 */

import type { Object3D } from "three";
import {
  Vector3,
  PlaneGeometry,
  InstancedMesh,
  InstancedBufferAttribute,
  PointLight,
  type ShaderMaterial,
} from "three";
import {
  fireColorsFromCurve,
  getFireColors,
  type FireColorPreset,
  type FireColorSet,
} from "./fire-color-curve-3d";
import {
  createFireParticleMaterial,
  applyFireParticleColors,
  setFireEmissive,
  setFireColorBlend,
} from "./fire-particle-material-3d";
import { SampledCurlGrid2D } from "../smoke/smoke-curl-field";
import {
  FIRE_PHYSICS,
  flameBurnTime,
  flameParcelRadius,
  flamePuffShare,
  stepFlameParcelVelocity,
} from "#lib/shared/effects/domain/fire-physics.js";
import { QualityTier } from "../types";
import type { Fire3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";

const DEFAULT_MAX_DYNAMIC_LIGHTS = 4;

/** Per-tier particle pool sizes (shared across all active tips). High density
 *  is what lets the soft faint blobs overlap into a continuous flame body. */
const POOL_SIZE: Record<QualityTier, number> = {
  [QualityTier.HIGH]: 7000,
  [QualityTier.MEDIUM]: 3000,
  [QualityTier.LOW]: 1000,
};

/** Continuous emission at the wick (particles/sec per tip) - the idle candle.
 *  High enough that even a stationary tip keeps the pool densely populated;
 *  density (overlapping particles) is what reads as a continuous flame instead
 *  of a few sparse blobs floating in a bloom halo. */
const EMIT_RATE: Record<QualityTier, number> = {
  [QualityTier.HIGH]: 900,
  [QualityTier.MEDIUM]: 520,
  [QualityTier.LOW]: 220,
};

/**
 * World-units between path-distributed spawns. Under motion the tip sweeps a
 * segment each frame; spawning one particle per this much arc keeps the trail
 * gapless even at high spin instead of dotting it.
 */
const PATH_SPACING: Record<QualityTier, number> = {
  [QualityTier.HIGH]: 0.022,
  [QualityTier.MEDIUM]: 0.04,
  [QualityTier.LOW]: 0.08,
};

/** Hard cap on spawns per tip per frame so a huge dt can't flood the pool. */
const MAX_SPAWN_PER_TIP = 90;

/** Air swirl speed at full turbulence (m/s); the gas follows the air. */
const SWIRL_SPEED = 0.55;

/** Spatial frequency multiplier feeding the curl field (higher = finer licks). */
const CURL_SCALE = 1.7;

/** Random velocity spread at birth (m/s): the wick's ragged surface. */
const SPREAD = 0.18;

/** Random positional jitter around the spawn point (tight core at the wick). */
const CORE_JITTER = 0.02;

/** Glow times vary this much either side of the wick's burn time. */
const LIFE_SPREAD = 0.3;

/** Puffing lengthens or shortens a still flame's tongues by up to this share. */
const PUFF_DEPTH = 0.45;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxLife: number;
  /** Width multiplier on the shared parcel radius (intensity and jitter). */
  size: number;
  seed: number;
  // Prop color this particle inherits at birth (0-1). Drives the Color-slider
  // tint in the shader; constant for the particle's life.
  pr: number;
  pg: number;
  pb: number;
  active: boolean;
}

export interface FireTipInput {
  /** Stable across frames when one renderer serves multiple performer rigs. */
  sourceId?: number;
  position: { x: number; y: number; z: number };
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  speed: number;
  /** Optional jerk magnitude (units/s^2). Boosts the dynamic light on stalls. */
  jerk?: number;
  /** Prop color (0-1 RGB) for the Color-slider tint. Defaults to white if omitted. */
  propColor?: { r: number; g: number; b: number };
}

export interface FireRendererOptions {
  preset?: FireColorPreset;
  /** Override the fixed per-rig pool when one scene-level renderer is shared. */
  poolSize?: number;
  /** Cap expensive point lights independently from the number of fire tips. */
  maxDynamicLights?: number;
}

interface FireSourceState {
  accumulator: number;
  /** Puffing phase, so neighbouring flames don't pulse in step. */
  phase: number;
  previousPosition: Vector3;
  valid: boolean;
  lastSeenFrame: number;
}

export class FireRenderer3D {
  private particles: Particle[];
  private activeParticles: Particle[] = [];
  private poolSize: number;
  private qualityTier: QualityTier;
  private preset: FireColorPreset;
  /** Colors from the chosen look's curve; null until a config arrives. */
  private curveColors: FireColorSet | null = null;

  // Tunable params (seeded from the per-tier constants; overwritten by
  // updateConfig as the user drags the curated sliders). Mutated in place so a
  // live tune never reallocates the particle pool.
  private emitRate: number;
  private swirlSpeed = SWIRL_SPEED;
  private emissiveHot = 0.53;
  private lightIntensity = 0.302;
  // Intensity also scales particle SIZE so the slider visibly changes the
  // flame's VOLUME (small contained flame ↔ big fire), distinct from
  // brightness which only changes the per-particle glow.
  private sizeScale = 1.0;

  private mesh: InstancedMesh | null = null;
  private material: ShaderMaterial | null = null;
  private parent: Object3D | null = null;

  // Pre-allocated per-instance attribute arrays (packed front-dense each frame).
  private centers: Float32Array;
  private vels: Float32Array;
  private lives: Float32Array;
  private seeds: Float32Array;
  private instSizes: Float32Array;
  private propColors: Float32Array;

  // Divergence-free turbulence field, baked + bilinear-sampled.
  private curl = new SampledCurlGrid2D(64, 8, 1 / 4);

  private lights: PointLight[] = [];
  private lightEnabled: boolean;
  private maxDynamicLights: number;

  private time = 0;

  // Stable per-source emission state. A scene-level renderer receives a
  // variable set of tips as performers toggle effects; array position is not
  // identity and would draw a flame streak between two different performers.
  private sourceStates = new Map<number, FireSourceState>();
  private sourceFrame = 0;

  constructor(
    qualityTier: QualityTier = QualityTier.HIGH,
    options?: FireRendererOptions
  ) {
    this.qualityTier = qualityTier;
    this.preset = options?.preset ?? "classic";
    this.poolSize = options?.poolSize ?? POOL_SIZE[qualityTier];
    this.emitRate = EMIT_RATE[qualityTier];
    this.lightEnabled = qualityTier !== QualityTier.LOW;
    this.maxDynamicLights = Math.max(
      0,
      Math.floor(options?.maxDynamicLights ?? DEFAULT_MAX_DYNAMIC_LIGHTS)
    );

    this.particles = new Array(this.poolSize);
    for (let i = 0; i < this.poolSize; i++) {
      this.particles[i] = {
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxLife: 1,
        size: 0,
        seed: 0,
        pr: 1,
        pg: 1,
        pb: 1,
        active: false,
      };
    }

    this.centers = new Float32Array(this.poolSize * 3);
    this.vels = new Float32Array(this.poolSize * 3);
    this.lives = new Float32Array(this.poolSize);
    this.seeds = new Float32Array(this.poolSize);
    this.instSizes = new Float32Array(this.poolSize);
    this.propColors = new Float32Array(this.poolSize * 3);
  }

  initialize(parent: Object3D): void {
    if (this.mesh) return;
    this.parent = parent;

    // Unit quad; the vertex shader billboards + stretches it per instance.
    const geometry = new PlaneGeometry(1, 1);
    // DYNAMIC_DRAW (35048): we rewrite these arrays every frame.
    geometry.setAttribute(
      "aCenter",
      new InstancedBufferAttribute(this.centers, 3).setUsage(35048)
    );
    geometry.setAttribute(
      "aVel",
      new InstancedBufferAttribute(this.vels, 3).setUsage(35048)
    );
    geometry.setAttribute(
      "aLife",
      new InstancedBufferAttribute(this.lives, 1).setUsage(35048)
    );
    geometry.setAttribute(
      "aSeed",
      new InstancedBufferAttribute(this.seeds, 1).setUsage(35048)
    );
    geometry.setAttribute(
      "aSize",
      new InstancedBufferAttribute(this.instSizes, 1).setUsage(35048)
    );
    geometry.setAttribute(
      "aPropColor",
      new InstancedBufferAttribute(this.propColors, 3).setUsage(35048)
    );

    this.material = createFireParticleMaterial({
      colors: this.curveColors ?? getFireColors(this.preset),
      emissiveHot: this.emissiveHot,
    });
    this.mesh = new InstancedMesh(geometry, this.material, this.poolSize);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 100;
    this.mesh.count = 0;
    parent.add(this.mesh);

    if (this.lightEnabled) {
      for (let i = 0; i < this.maxDynamicLights; i++) {
        const light = new PointLight(
          (this.curveColors ?? getFireColors(this.preset)).warm,
          0,
          3.2,
          2.0
        );
        // Keep the lights in Three's program signature from startup onward.
        // Toggling visibility changes NUM_POINT_LIGHTS and recompiles every lit
        // material in the scene on the first Fire click; zero intensity is the
        // visually inert state without a shader-variant swap.
        light.visible = true;
        parent.add(light);
        this.lights.push(light);
      }
    }
  }

  /**
   * Make the renderer participate in the scene's hidden startup frames before
   * a performer asks for Fire. A zero-sized instance is visually inert, but it
   * forces Three.js to create the instanced attribute buffers and compile the
   * material while the loading curtain is still opaque.
   */
  primeGpuUpload(): void {
    if (!this.mesh) return;
    this.instSizes[0] = 0;
    this.mesh.count = 1;
    for (const name of [
      "aCenter",
      "aVel",
      "aLife",
      "aSeed",
      "aSize",
      "aPropColor",
    ]) {
      (
        this.mesh.geometry.getAttribute(name) as InstancedBufferAttribute
      ).needsUpdate = true;
    }
  }

  update(tips: FireTipInput[], dt: number): void {
    if (!this.mesh || !this.material) return;

    const safeDt = Math.min(dt, 1 / 15);
    this.time += safeDt;
    this.material.uniforms.uTime!.value = this.time;
    this.sourceFrame++;

    // -- Emit from each active tip --
    for (let i = 0; i < tips.length; i++) {
      const tip = tips[i]!;
      const sourceId = tip.sourceId ?? i;
      let sourceState = this.sourceStates.get(sourceId);
      if (!sourceState) {
        sourceState = {
          accumulator: 0,
          phase: Math.random() * Math.PI * 2,
          previousPosition: new Vector3(),
          valid: false,
          lastSeenFrame: this.sourceFrame,
        };
        this.sourceStates.set(sourceId, sourceState);
      }
      sourceState.lastSeenFrame = this.sourceFrame;
      this.emitFromTip(sourceState, tip, safeDt);
    }
    for (const sourceState of this.sourceStates.values()) {
      if (sourceState.lastSeenFrame === this.sourceFrame) continue;
      sourceState.valid = false;
      sourceState.accumulator = 0;
    }

    let visibleCount = 0;

    let activeIndex = 0;
    while (activeIndex < this.activeParticles.length) {
      const p = this.activeParticles[activeIndex]!;
      p.age += safeDt;
      if (p.age >= p.maxLife) {
        p.active = false;
        const last = this.activeParticles.pop()!;
        if (activeIndex < this.activeParticles.length) {
          this.activeParticles[activeIndex] = last;
        }
        continue;
      }

      // The air swirls (a divergence-free curl field in XY); the gas sheds its
      // wake speed and follows that air, rising as it goes.
      const swirl = this.curl.sample(
        p.x * CURL_SCALE,
        p.y * CURL_SCALE,
        this.time
      );
      stepFlameParcelVelocity(
        p,
        swirl.vx * this.swirlSpeed,
        swirl.vy * this.swirlSpeed,
        0,
        safeDt
      );

      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;
      p.z += p.vz * safeDt;

      const i3 = visibleCount * 3;
      this.centers[i3] = p.x;
      this.centers[i3 + 1] = p.y;
      this.centers[i3 + 2] = p.z;
      this.vels[i3] = p.vx;
      this.vels[i3 + 1] = p.vy;
      this.vels[i3 + 2] = p.vz;
      this.lives[visibleCount] = p.age / p.maxLife;
      this.seeds[visibleCount] = p.seed;
      this.instSizes[visibleCount] = flameParcelRadius(p.age) * p.size;
      this.propColors[i3] = p.pr;
      this.propColors[i3 + 1] = p.pg;
      this.propColors[i3 + 2] = p.pb;
      visibleCount++;
      activeIndex++;
    }

    const geo = this.mesh.geometry;
    (geo.getAttribute("aCenter") as InstancedBufferAttribute).needsUpdate =
      true;
    (geo.getAttribute("aVel") as InstancedBufferAttribute).needsUpdate = true;
    (geo.getAttribute("aLife") as InstancedBufferAttribute).needsUpdate = true;
    (geo.getAttribute("aSeed") as InstancedBufferAttribute).needsUpdate = true;
    (geo.getAttribute("aSize") as InstancedBufferAttribute).needsUpdate = true;
    (geo.getAttribute("aPropColor") as InstancedBufferAttribute).needsUpdate =
      true;
    this.mesh.count = visibleCount;

    if (this.lightEnabled) {
      for (let i = 0; i < this.lights.length; i++) {
        const light = this.lights[i]!;
        if (i < tips.length) {
          const tip = tips[i]!;
          light.position.set(
            tip.position.x,
            tip.position.y + 0.25,
            tip.position.z
          );
          const jerkBoost = Math.min((tip.jerk ?? 0) / 60, 1) * 0.12;
          let motionScale = 0.75 + Math.min(tip.speed * 0.08, 0.18) + jerkBoost;
          if (this.qualityTier === QualityTier.HIGH) {
            motionScale +=
              Math.sin(this.time * 8.3 + i * 2.1) * 0.18 +
              Math.sin(this.time * 13.7 + i * 5.3) * 0.06 +
              Math.sin(this.time * 23.1 + i * 1.7) * 0.03;
          }
          light.intensity = Math.max(this.lightIntensity * motionScale, 0.04);
        } else {
          light.intensity = 0;
        }
      }
    }
  }

  /** Spawn particles for one tip: continuous at the wick + along the path. */
  private emitFromTip(
    sourceState: FireSourceState,
    tip: FireTipInput,
    safeDt: number
  ): void {
    const prev = sourceState.previousPosition;
    const cur = tip.position;

    let segLen = 0;
    if (sourceState.valid) {
      segLen = Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z);
    }

    // Combined demand: idle stream (time-rate) + gapless path coverage.
    // A source's first frame may inherit a large frame-gate delta even though
    // no visible flame existed during that interval. Start at one 60 Hz slice
    // so activation produces an immediate core instead of a one-frame burst;
    // normal density fills in on the following frames.
    const emissionDt = sourceState.valid ? safeDt : Math.min(safeDt, 1 / 60);
    sourceState.accumulator +=
      this.emitRate * emissionDt + segLen / PATH_SPACING[this.qualityTier];
    let count = Math.floor(sourceState.accumulator);
    if (count > MAX_SPAWN_PER_TIP) count = MAX_SPAWN_PER_TIP;
    sourceState.accumulator -= count;

    // Faster wicks burn their gas sooner; a still flame's tongues puff.
    const burnTime = flameBurnTime(tip.speed);
    const puff =
      1 +
      PUFF_DEPTH *
        flamePuffShare(tip.speed) *
        Math.sin(this.time * Math.PI * 2 * FIRE_PHYSICS.puffHz + sourceState.phase);

    for (let k = 0; k < count; k++) {
      const particle = this.nextSlot();

      // Distribute along the swept segment (at rest segLen ~ 0 => all at tip).
      const t = count > 1 ? k / (count - 1) : 1;
      const px = prev.x + (cur.x - prev.x) * t;
      const py = prev.y + (cur.y - prev.y) * t;
      const pz = prev.z + (cur.z - prev.z) * t;

      particle.x = px + (Math.random() - 0.5) * CORE_JITTER;
      particle.y = py + (Math.random() - 0.5) * CORE_JITTER;
      particle.z = pz + (Math.random() - 0.5) * CORE_JITTER;

      const carry = FIRE_PHYSICS.wakeCarry;
      particle.vx = tip.velocityX * carry + (Math.random() - 0.5) * SPREAD;
      particle.vy = tip.velocityY * carry + (Math.random() - 0.5) * SPREAD;
      particle.vz = tip.velocityZ * carry + (Math.random() - 0.5) * SPREAD;

      particle.maxLife =
        burnTime * puff * (1 + (Math.random() * 2 - 1) * LIFE_SPREAD);
      // Gas born earlier in this frame's sweep has already been burning.
      particle.age = (1 - t) * safeDt;
      // sizeScale (from intensity) sets the flame VOLUME; brightness is separate.
      particle.size = (0.75 + Math.random() * 0.5) * this.sizeScale;
      particle.seed = Math.random();
      const pc = tip.propColor;
      particle.pr = pc ? pc.r : 1;
      particle.pg = pc ? pc.g : 1;
      particle.pb = pc ? pc.b : 1;
      particle.active = true;
    }

    prev.set(cur.x, cur.y, cur.z);
    sourceState.valid = true;
  }

  /**
   * Ring-buffer slot allocation. Particles spawn and die in roughly FIFO order,
   * so the slot at the cursor is almost always already dead. When the pool is
   * under pressure this overwrites the oldest particle, which for fire is the
   * correct recycle (the coolest, faintest wisp) and keeps the body gapless.
   */
  private cursor = 0;
  private nextSlot(): Particle {
    const p = this.particles[this.cursor]!;
    this.cursor++;
    if (this.cursor >= this.poolSize) this.cursor = 0;
    if (!p.active) {
      p.active = true;
      this.activeParticles.push(p);
    }
    return p;
  }

  /**
   * Apply tuned params from the curated FX panel. Mutates instance fields the
   * physics loop reads each frame (no pool realloc) plus the material uniforms.
   *
   *   intensity  → emission rate AND particle size (the flame's VOLUME — how
   *                much / how big the fire is). Distinct from brightness.
   *   brightness → emissiveHot, the per-particle HDR glow / bloom lever (how
   *                HOT each particle reads). Set on the material.
   *   turbulence → curl swirl strength.
   *   colorBlend → Color slider; tints the natural fire hue toward the prop
   *                color in the shader (0 = pure fire, 1 = strongly prop-colored).
   */
  updateConfig(params: Fire3DParams): void {
    this.emitRate =
      EMIT_RATE[this.qualityTier] * (0.4 + params.intensity * 1.0);
    this.sizeScale = 0.55 + params.intensity * 0.9;
    this.swirlSpeed = SWIRL_SPEED * (0.4 + params.turbulence * 1.6);
    this.emissiveHot = params.emissiveHot;
    this.lightIntensity = params.lightIntensity;
    this.curveColors = params.colorCurve
      ? fireColorsFromCurve(params.colorCurve)
      : null;
    if (this.material) {
      applyFireParticleColors(
        this.material,
        this.curveColors ?? getFireColors(this.preset)
      );
    }
    // The light the flame throws on skin and props takes the flame's body color.
    const lightColor = (this.curveColors ?? getFireColors(this.preset)).warm;
    for (const light of this.lights) light.color.copy(lightColor);
    if (this.material) {
      setFireEmissive(this.material, this.emissiveHot);
      setFireColorBlend(this.material, params.colorBlend);
    }
  }

  setPreset(preset: FireColorPreset): void {
    this.preset = preset;
    if (this.material) {
      applyFireParticleColors(this.material, getFireColors(preset));
    }
  }

  reset(): void {
    for (const p of this.activeParticles) {
      p.active = false;
    }
    this.activeParticles.length = 0;
    this.sourceStates.clear();
    for (const light of this.lights) {
      light.intensity = 0;
      light.visible = true;
    }
    if (this.mesh) {
      this.mesh.count = 0;
    }
    this.time = 0;
  }

  dispose(): void {
    if (this.mesh) {
      this.parent?.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.material?.dispose();
      this.mesh = null;
      this.material = null;
    }
    for (const light of this.lights) {
      this.parent?.remove(light);
      light.dispose();
    }
    this.lights = [];
    this.parent = null;
  }
}
