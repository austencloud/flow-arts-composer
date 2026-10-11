/**
 * Two-draw 3D Coal renderer.
 *
 * Every tracked tip owns a persistent irregular coal head. Travel sheds
 * discrete ember bodies and brief directional sparks; it never draws a
 * continuous ribbon. Fixed pools keep the frame loop allocation-free.
 */

import type { Object3D, ShaderMaterial, Vector3 } from "three";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  Euler,
  Points,
  Quaternion,
  SRGBColorSpace,
  Vector3 as ThreeVector3,
} from "three";
import {
  createCharcoalMaterial,
  type CharcoalMaterialOptions,
  updateCharcoalMaterial,
} from "./charcoal-material-3d";
import { ParticleInstancePool3D } from "../instancing/particle-instance-pool-3d";
import { QualityTier } from "../types";
import type { Charcoal3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import type { CharcoalEmissionStyle } from "#lib/shared/effects/domain/effects-config.js";
import {
  resolveCharcoal3DMotionProfile,
  type Charcoal3DMotionProfile,
} from "#lib/shared/effects/translators/charcoal-3d-motion-profiles.js";

const SPARK_POOL_SIZE: Record<QualityTier, number> = {
  [QualityTier.HIGH]: 7200,
  [QualityTier.MEDIUM]: 3600,
  [QualityTier.LOW]: 1200,
};

const FRAGMENT_POOL_SIZE: Record<QualityTier, number> = {
  [QualityTier.HIGH]: 1800,
  [QualityTier.MEDIUM]: 900,
  [QualityTier.LOW]: 300,
};

const DEFAULT_MAX_TIPS = 4;
const MAX_SEGMENT_DISTANCE = 0.18;
const MAX_STEP_ADVANCE = 0.5;
const BURST_IMPULSE_THRESHOLD = 0.85;
const BURST_REARM_IMPULSE = 0.4;
const BURST_IMPULSE_RANGE = 4.5;
const BURST_COOLDOWN_SECONDS = 0.12;
const SPARK_DRAG = 0.76;
const FRAGMENT_DRAG = 0.68;

const DEFAULT_CORE: [number, number, number] = [255, 242, 210];
const DEFAULT_MID: [number, number, number] = [255, 150, 35];
const DEFAULT_COOL: [number, number, number] = [170, 45, 2];
const POINT_ATTRIBUTE_NAMES = [
  "position",
  "particleVelocity",
  "particleSize",
  "particleAlpha",
  "particleTemp",
  "particleKind",
  "particleSeed",
] as const;

const POINT_KIND_SPARK = 0;
const POINT_KIND_EMBER = 1;
const POINT_KIND_HEAD = 2;
const HEAD_POINTS_PER_TIP = 4;

interface SparkParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  heatScale: number;
  sourceId: number;
  emissionMode: SparkEmissionMode;
  spawnX: number;
  spawnY: number;
  spawnZ: number;
  emittedAt: number;
  groundClamped: boolean;
  seed: number;
  active: boolean;
}

interface FragmentParticle extends SparkParticle {
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  angularX: number;
  angularY: number;
  angularZ: number;
  aspect: number;
  haloStrength: number;
}

type SparkEmissionMode = "ambient" | "burst";
type FragmentEmissionMode = "ambient" | "burst";

interface TipRuntime {
  readonly previousPosition: ThreeVector3;
  readonly currentPosition: ThreeVector3;
  readonly previousVelocity: ThreeVector3;
  sourceId: number | null;
  hasPrevious: boolean;
  ambientAccumulator: number;
  ambientClusterTarget: number;
  ambientEmissionIndex: number;
  burstArmed: boolean;
  burstCooldown: number;
  present: boolean;
  seed: number;
}

interface ParticleBandAccumulator {
  count: number;
  yTotal: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  minSpawnX: number;
  maxSpawnX: number;
  minSpawnY: number;
  maxSpawnY: number;
  ageTotal: number;
  displacementTotal: number;
  velocityXTotal: number;
  velocityYTotal: number;
  velocityZTotal: number;
  ambientCount: number;
  burstCount: number;
  sparkCount: number;
  fragmentCount: number;
  groundClampedCount: number;
  sourceCounts: Map<number, number>;
}

interface MomentumShift {
  directionX: number;
  directionY: number;
  directionZ: number;
  incomingSpeed: number;
  impulse: number;
  severity: number;
}

interface BurstDebugSnapshot {
  impulse: number;
  severity: number;
  sparkCount: number;
  fragmentCount: number;
  sourceDirection: [number, number, number];
  averageSparkVelocity: [number, number, number];
}

export interface CharcoalParticleBandDebugSnapshot {
  count: number;
  yCenter: number;
  ySpan: number;
  xSpan: number;
  zSpan: number;
  spawnXSpan: number;
  spawnYSpan: number;
  meanAge: number;
  meanDisplacement: number;
  meanVelocity: [number, number, number];
  ambientCount: number;
  burstCount: number;
  sparkCount: number;
  fragmentCount: number;
  groundClampedCount: number;
  sourceCounts: Record<string, number>;
}

export interface CharcoalRenderer3DSpatialDebugSnapshot {
  instanceId: number;
  emissionStyle: CharcoalEmissionStyle;
  clock: number;
  activeSparkCount: number;
  activeFragmentCount: number;
  densestHorizontalBand: CharcoalParticleBandDebugSnapshot | null;
  tips: Array<{
    sourceId: number;
    position: [number, number, number];
    velocity: [number, number, number];
  }>;
}

export type CharcoalRenderer3DDiagnosticObserver = (
  snapshot: CharcoalRenderer3DSpatialDebugSnapshot
) => void;

export interface CharcoalTipInput {
  sourceId: number;
  position: Vector3;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  speed: number;
  jerk: number;
}

export interface CharcoalFrameContinuity {
  currentStep: number;
  totalSteps: number;
  collisionFloorY?: number | null;
}

export interface CharcoalRenderer3DDebugSnapshot {
  emissionStyle: CharcoalEmissionStyle;
  motionProfile: Readonly<Charcoal3DMotionProfile>;
  activeSparkCount: number;
  activeFragmentCount: number;
  activeTipCount: number;
  activePointCount: number;
  burstCount: number;
  emittedSparkCount: number;
  emittedFragmentCount: number;
  suppressedDiscontinuityCount: number;
  lastBurst: BurstDebugSnapshot | null;
  sparkCapacity: number;
  fragmentCapacity: number;
  physics: {
    particleLifetime: number;
    gravity: number;
    sparkSizeJitter: number;
  };
  palette: {
    core: [number, number, number];
    mid: [number, number, number];
    cool: [number, number, number];
  };
}

function createSparkParticle(): SparkParticle {
  return {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
    maxLife: 1,
    size: 0,
    heatScale: 0,
    sourceId: -1,
    emissionMode: "ambient",
    spawnX: 0,
    spawnY: 0,
    spawnZ: 0,
    emittedAt: 0,
    groundClamped: false,
    seed: 0,
    active: false,
  };
}

function createFragmentParticle(): FragmentParticle {
  return {
    ...createSparkParticle(),
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    angularX: 0,
    angularY: 0,
    angularZ: 0,
    aspect: 1,
    haloStrength: 0,
  };
}

function mixChannel(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function resolveStepPhase(frame: CharcoalFrameContinuity): number {
  if (frame.totalSteps <= 0) return frame.currentStep;
  return (
    ((frame.currentStep % frame.totalSteps) + frame.totalSteps) %
    frame.totalSteps
  );
}

function shouldResetMotionHistory(
  previousPhase: number | null,
  nextPhase: number
): boolean {
  if (previousPhase === null) return false;
  const advance = nextPhase - previousPhase;
  return advance < -0.001 || advance > MAX_STEP_ADVANCE;
}

function resolveMomentumShift(
  previousVelocity: ThreeVector3,
  tip: CharcoalTipInput
): MomentumShift {
  const incomingSpeed = previousVelocity.length();
  if (incomingSpeed <= 0.0001) {
    return {
      directionX: 0,
      directionY: 1,
      directionZ: 0,
      incomingSpeed: 0,
      impulse: 0,
      severity: 0,
    };
  }

  const deltaX = tip.velocityX - previousVelocity.x;
  const deltaY = tip.velocityY - previousVelocity.y;
  const deltaZ = tip.velocityZ - previousVelocity.z;
  const velocityChange = Math.sqrt(
    deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ
  );
  const speedWeight = Math.min(1, incomingSpeed / 3);
  const impulse = velocityChange * speedWeight;

  return {
    directionX: previousVelocity.x / incomingSpeed,
    directionY: previousVelocity.y / incomingSpeed,
    directionZ: previousVelocity.z / incomingSpeed,
    incomingSpeed,
    impulse,
    severity: Math.max(
      0,
      Math.min(1, (impulse - BURST_IMPULSE_THRESHOLD) / BURST_IMPULSE_RANGE)
    ),
  };
}

export class CharcoalRenderer3D {
  private static nextDiagnosticInstanceId = 1;
  private static readonly diagnosticObservers =
    new Set<CharcoalRenderer3DDiagnosticObserver>();

  static observeDiagnostics(
    observer: CharcoalRenderer3DDiagnosticObserver
  ): () => void {
    CharcoalRenderer3D.diagnosticObservers.add(observer);
    return () => CharcoalRenderer3D.diagnosticObservers.delete(observer);
  }

  private readonly diagnosticInstanceId =
    CharcoalRenderer3D.nextDiagnosticInstanceId++;
  private readonly qualityTier: QualityTier;
  private readonly sparkCapacity: number;
  private readonly fragmentCapacity: number;
  private readonly pointCapacity: number;
  private readonly sparks: SparkParticle[];
  private readonly fragments: FragmentParticle[];
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly temperatures: Float32Array;
  private readonly kinds: Float32Array;
  private readonly seeds: Float32Array;
  private readonly tipStates: TipRuntime[];
  private readonly fragmentEuler = new Euler();
  private readonly fragmentQuaternion = new Quaternion();
  private readonly fragmentColor = new Color();

  private points: Points | null = null;
  private geometry: BufferGeometry | null = null;
  private material: ShaderMaterial | null = null;
  private fragmentPool: ParticleInstancePool3D | null = null;
  private parent: Object3D | null = null;
  private sparkCursor = 0;
  private fragmentCursor = 0;
  private previousStepPhase: number | null = null;
  private clock = 0;
  private diagnosticAccumulator = 0;

  private intensity = 0.5;
  private spread = 0.5;
  private glow = 0.5;
  private particleLifetime = 0.55;
  private gravity = 6;
  private sparkSizeJitter = 0.4;
  private emissionStyle: CharcoalEmissionStyle = "steel-wool";
  private motionProfile = resolveCharcoal3DMotionProfile("steel-wool");
  private coreColor: [number, number, number] = [...DEFAULT_CORE];
  private midColor: [number, number, number] = [...DEFAULT_MID];
  private coolColor: [number, number, number] = [...DEFAULT_COOL];
  private configInitialized = false;

  private activeSparkCount = 0;
  private activeFragmentCount = 0;
  private activeTipCount = 0;
  private activePointCount = 0;
  private burstCount = 0;
  private emittedSparkCount = 0;
  private emittedFragmentCount = 0;
  private suppressedDiscontinuityCount = 0;
  private lastBurst: BurstDebugSnapshot | null = null;

  constructor(
    qualityTier: QualityTier = QualityTier.HIGH,
    maxTips = DEFAULT_MAX_TIPS
  ) {
    this.qualityTier = qualityTier;
    this.sparkCapacity = SPARK_POOL_SIZE[qualityTier];
    this.fragmentCapacity = FRAGMENT_POOL_SIZE[qualityTier];
    this.pointCapacity =
      this.sparkCapacity +
      this.fragmentCapacity +
      maxTips * HEAD_POINTS_PER_TIP;
    this.sparks = Array.from(
      { length: this.sparkCapacity },
      createSparkParticle
    );
    this.fragments = Array.from(
      { length: this.fragmentCapacity },
      createFragmentParticle
    );
    this.positions = new Float32Array(this.pointCapacity * 3);
    this.velocities = new Float32Array(this.pointCapacity * 3);
    this.sizes = new Float32Array(this.pointCapacity);
    this.alphas = new Float32Array(this.pointCapacity);
    this.temperatures = new Float32Array(this.pointCapacity);
    this.kinds = new Float32Array(this.pointCapacity);
    this.seeds = new Float32Array(this.pointCapacity);
    this.tipStates = Array.from(
      { length: Math.max(1, Math.floor(maxTips)) },
      (_, index) => ({
        previousPosition: new ThreeVector3(),
        currentPosition: new ThreeVector3(),
        previousVelocity: new ThreeVector3(),
        sourceId: null,
        hasPrevious: false,
        ambientAccumulator: 0,
        ambientClusterTarget: this.motionProfile.packetMin,
        ambientEmissionIndex: 0,
        burstArmed: true,
        burstCooldown: 0,
        present: false,
        seed: (index + 1) * 0.173,
      })
    );
  }

  initialize(
    parent: Object3D,
    materialOptions: CharcoalMaterialOptions = {}
  ): void {
    if (this.points) return;
    this.parent = parent;

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new BufferAttribute(this.positions, 3).setUsage(35048)
    );
    this.geometry.setAttribute(
      "particleVelocity",
      new BufferAttribute(this.velocities, 3).setUsage(35048)
    );
    this.geometry.setAttribute(
      "particleSize",
      new BufferAttribute(this.sizes, 1).setUsage(35048)
    );
    this.geometry.setAttribute(
      "particleAlpha",
      new BufferAttribute(this.alphas, 1).setUsage(35048)
    );
    this.geometry.setAttribute(
      "particleTemp",
      new BufferAttribute(this.temperatures, 1).setUsage(35048)
    );
    this.geometry.setAttribute(
      "particleKind",
      new BufferAttribute(this.kinds, 1).setUsage(35048)
    );
    this.geometry.setAttribute(
      "particleSeed",
      new BufferAttribute(this.seeds, 1).setUsage(35048)
    );

    this.material = createCharcoalMaterial({
      coreColor: materialOptions.coreColor ?? this.coreColor,
      midColor: materialOptions.midColor ?? this.midColor,
      coolColor: materialOptions.coolColor ?? this.coolColor,
      emissiveStrength: materialOptions.emissiveStrength ?? 1.7,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 102;
    parent.add(this.points);

    this.fragmentPool = new ParticleInstancePool3D({
      capacity: this.fragmentCapacity,
      geometry: new DodecahedronGeometry(1, 0),
      billboard: false,
      additive: false,
      renderOrder: 101,
      colorManaged: true,
      surfaceLighting: { strength: 0.42, floor: 0.32 },
    });
    this.fragmentPool.initialize(parent);
  }

  update(
    tips: CharcoalTipInput[],
    dt: number,
    frame?: CharcoalFrameContinuity
  ): void {
    if (!this.geometry || !this.fragmentPool) return;
    const safeDt = Math.min(Math.max(dt, 0), 1 / 15);
    this.clock += safeDt;
    const collisionFloorY =
      frame?.collisionFloorY != null && Number.isFinite(frame.collisionFloorY)
        ? frame.collisionFloorY
        : null;
    const nextStepPhase = frame ? resolveStepPhase(frame) : null;
    const resetMotionHistory =
      nextStepPhase !== null &&
      shouldResetMotionHistory(this.previousStepPhase, nextStepPhase);
    if (nextStepPhase !== null) this.previousStepPhase = nextStepPhase;

    for (const state of this.tipStates) state.present = false;

    const tipCount = Math.min(tips.length, this.tipStates.length);
    for (let index = 0; index < tipCount; index++) {
      const tip = tips[index]!;
      const state = this.claimTipState(tip.sourceId, tips, tipCount);
      if (!state) continue;
      state.present = true;
      state.currentPosition.copy(tip.position);
      state.burstCooldown = Math.max(0, state.burstCooldown - safeDt);
      const discontinuous = this.updateTipPath(state, tip, resetMotionHistory);
      if (!discontinuous) {
        this.updateTipBurst(state, tip);
        this.updateTipAmbient(state, tip, safeDt);
      }
      state.previousPosition.copy(tip.position);
      state.previousVelocity.set(tip.velocityX, tip.velocityY, tip.velocityZ);
    }

    for (const state of this.tipStates) {
      if (!state.present && state.hasPrevious) this.clearTipState(state);
    }

    this.updateFragments(safeDt, collisionFloorY);
    this.updatePoints(safeDt);
    if (CharcoalRenderer3D.diagnosticObservers.size > 0) {
      this.diagnosticAccumulator += safeDt;
      if (this.diagnosticAccumulator >= 1 / 15) {
        this.diagnosticAccumulator %= 1 / 15;
        const snapshot = this.createSpatialDebugSnapshot();
        for (const observer of CharcoalRenderer3D.diagnosticObservers) {
          observer(snapshot);
        }
      }
    }
  }

  private claimTipState(
    sourceId: number,
    tips: CharcoalTipInput[],
    tipCount: number
  ): TipRuntime | null {
    for (const state of this.tipStates) {
      if (state.sourceId === sourceId) return state;
    }

    for (const state of this.tipStates) {
      if (state.sourceId !== null || state.present) continue;
      state.sourceId = sourceId;
      return state;
    }

    for (const state of this.tipStates) {
      if (state.present || state.sourceId === null) continue;
      let stillActive = false;
      for (let index = 0; index < tipCount; index++) {
        if (tips[index]!.sourceId === state.sourceId) {
          stillActive = true;
          break;
        }
      }
      if (stillActive) continue;
      this.clearTipState(state);
      state.sourceId = sourceId;
      return state;
    }

    return null;
  }

  private updateTipPath(
    state: TipRuntime,
    tip: CharcoalTipInput,
    resetMotionHistory: boolean
  ): boolean {
    if (!state.hasPrevious) {
      state.previousPosition.copy(tip.position);
      state.previousVelocity.set(tip.velocityX, tip.velocityY, tip.velocityZ);
      state.hasPrevious = true;
      return false;
    }

    const distance = state.previousPosition.distanceTo(tip.position);
    if (resetMotionHistory || distance > MAX_SEGMENT_DISTANCE) {
      state.ambientAccumulator = 0;
      state.ambientClusterTarget = this.motionProfile.packetMin;
      state.burstArmed = true;
      state.burstCooldown = 0;
      this.suppressedDiscontinuityCount++;
      return true;
    }
    return false;
  }

  private updateTipBurst(state: TipRuntime, tip: CharcoalTipInput): void {
    const shift = resolveMomentumShift(state.previousVelocity, tip);
    if (shift.impulse < BURST_REARM_IMPULSE) state.burstArmed = true;
    const burstThreshold =
      BURST_IMPULSE_THRESHOLD * this.motionProfile.burstThresholdScale;
    if (
      shift.impulse < burstThreshold ||
      !state.burstArmed ||
      state.burstCooldown > 0
    ) {
      return;
    }

    const burstShift: MomentumShift = {
      ...shift,
      severity: Math.max(
        0,
        Math.min(1, (shift.impulse - burstThreshold) / BURST_IMPULSE_RANGE)
      ),
    };

    const requestedSparkCount = Math.max(
      1,
      Math.round(
        (8 + burstShift.severity * 112) *
          (0.65 + this.intensity * 0.95) *
          this.motionProfile.burstSparkScale
      )
    );
    const requestedFragmentCount = Math.max(
      1,
      Math.round(
        (4 + burstShift.severity * 34) *
          (0.55 + this.intensity * 0.65) *
          this.motionProfile.burstFragmentScale
      )
    );
    let sparkCount = 0;
    let fragmentCount = 0;
    let velocityX = 0;
    let velocityY = 0;
    let velocityZ = 0;
    for (let index = 0; index < requestedSparkCount; index++) {
      const spark = this.emitSpark(
        tip.position,
        burstShift,
        "burst",
        tip.sourceId
      );
      if (!spark) continue;
      sparkCount++;
      velocityX += spark.vx;
      velocityY += spark.vy;
      velocityZ += spark.vz;
    }
    for (let index = 0; index < requestedFragmentCount; index++) {
      if (this.emitFragment(tip, tip.position, "burst", burstShift)) {
        fragmentCount++;
      }
    }
    const velocityDivisor = Math.max(1, sparkCount);
    this.lastBurst = {
      impulse: shift.impulse,
      severity: burstShift.severity,
      sparkCount,
      fragmentCount,
      sourceDirection: [shift.directionX, shift.directionY, shift.directionZ],
      averageSparkVelocity: [
        velocityX / velocityDivisor,
        velocityY / velocityDivisor,
        velocityZ / velocityDivisor,
      ],
    };
    state.burstArmed = false;
    state.burstCooldown = BURST_COOLDOWN_SECONDS;
    this.burstCount++;
  }

  private updateTipAmbient(
    state: TipRuntime,
    tip: CharcoalTipInput,
    dt: number
  ): void {
    // Match the dense 2D steel-wool envelope without interpolating between
    // sampled positions. Real charcoal sheds in irregular packets rather than
    // drawing every sample of the prop path as a continuous luminous stroke.
    const baseRate = 56 + this.intensity * 174;
    const motionFactor =
      0.22 * this.motionProfile.idleEmissionScale +
      Math.min(1.25, tip.speed / 2.8) * this.motionProfile.motionEmissionScale;
    const heatFactor = 0.8 + this.glow * 0.35;
    const rate = baseRate * motionFactor * heatFactor;
    state.ambientAccumulator += rate * dt;
    if (state.ambientAccumulator < state.ambientClusterTarget) return;

    const emissionCount = Math.min(24, Math.floor(state.ambientAccumulator));
    state.ambientAccumulator -= emissionCount;
    const fragmentStride = this.motionProfile.ambientFragmentStride;
    for (let emission = 0; emission < emissionCount; emission++) {
      const shift = this.resolveAmbientMomentum(tip);
      this.emitSpark(tip.position, shift, "ambient", tip.sourceId);
      state.ambientEmissionIndex++;
      if (state.ambientEmissionIndex % fragmentStride === 0) {
        this.emitFragment(tip, tip.position, "ambient");
      }
    }
    state.ambientClusterTarget =
      this.motionProfile.packetMin +
      ((state.ambientEmissionIndex * 7 + Math.round(state.seed * 1000)) %
        Math.max(1, this.motionProfile.packetRange));
  }

  private resolveAmbientMomentum(tip: CharcoalTipInput): MomentumShift {
    if (tip.speed > 0.08) {
      const inverseSpeed = 1 / tip.speed;
      return {
        directionX: tip.velocityX * inverseSpeed,
        directionY: tip.velocityY * inverseSpeed,
        directionZ: tip.velocityZ * inverseSpeed,
        incomingSpeed: tip.speed,
        impulse: 0,
        severity: Math.min(1, tip.speed / 4.5),
      };
    }

    const azimuth = Math.random() * Math.PI * 2;
    const vertical = 0.2 + Math.random() * 0.45;
    const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    return {
      directionX: Math.cos(azimuth) * radial,
      directionY: vertical,
      directionZ: Math.sin(azimuth) * radial,
      incomingSpeed: 0,
      impulse: 0,
      severity: 0,
    };
  }

  private emitSpark(
    position: Vector3,
    shift: MomentumShift,
    mode: SparkEmissionMode,
    sourceId: number
  ): SparkParticle | null {
    const particle = this.claimSpark();
    if (!particle) return null;

    const burst = mode === "burst";
    const originScatter =
      (burst ? 0.085 : 0.115) *
      Math.max(0.45, Math.min(1.7, this.motionProfile.coneScale));
    particle.x = position.x + (Math.random() - 0.5) * originScatter;
    particle.y = position.y + (Math.random() - 0.5) * originScatter;
    particle.z = position.z + (Math.random() - 0.5) * originScatter;
    particle.spawnX = particle.x;
    particle.spawnY = particle.y;
    particle.spawnZ = particle.z;
    particle.sourceId = sourceId;
    particle.emissionMode = mode;
    particle.emittedAt = this.clock;
    particle.groundClamped = false;
    if (!burst && shift.incomingSpeed <= 0.08) {
      const drift =
        (0.18 + Math.random() * 0.52) * this.motionProfile.velocityScale;
      particle.vx = shift.directionX * drift;
      particle.vy = shift.directionY * drift;
      particle.vz = shift.directionZ * drift;
    } else if (burst) {
      this.setMomentumVelocity(particle, shift, 0.4, 1.25, 0.28, 2.2);
    } else {
      this.setMomentumVelocity(particle, shift, 0.35, 1.4, 0.15, 2.05);
    }
    particle.maxLife =
      this.particleLifetime *
      (burst
        ? (0.38 + Math.random() * 0.3) * (0.82 + shift.severity * 0.18)
        : 0.72 + Math.random() * 0.58) *
      this.motionProfile.sparkLifetimeScale;
    particle.life = particle.maxLife;
    const jitter = 1 + (Math.random() - 0.5) * this.sparkSizeJitter;
    particle.size =
      (burst
        ? 0.045 + shift.severity * 0.035 + Math.random() * 0.02
        : 0.035 + this.glow * 0.025 + Math.random() * 0.02) *
      jitter *
      this.motionProfile.sparkSizeScale;
    particle.heatScale = burst
      ? 0.9 + Math.random() * 0.1
      : 0.42 + Math.random() * 0.28;
    particle.seed = Math.random();
    particle.active = true;
    this.emittedSparkCount++;
    return particle;
  }

  private emitFragment(
    tip: CharcoalTipInput,
    position: Vector3,
    mode: FragmentEmissionMode,
    shift?: MomentumShift
  ): FragmentParticle | null {
    const particle = this.claimFragment();
    if (!particle) return null;

    const burst = mode === "burst";
    const speed = Math.max(0.001, tip.speed);
    const originScatter =
      (burst ? 0.075 : 0.09) *
      Math.max(0.45, Math.min(1.7, this.motionProfile.coneScale));
    particle.x = position.x + (Math.random() - 0.5) * originScatter;
    particle.y = position.y + (Math.random() - 0.5) * originScatter;
    particle.z = position.z + (Math.random() - 0.5) * originScatter;
    particle.spawnX = particle.x;
    particle.spawnY = particle.y;
    particle.spawnZ = particle.z;
    particle.sourceId = tip.sourceId;
    particle.emissionMode = mode;
    particle.emittedAt = this.clock;
    particle.groundClamped = false;
    if (burst && shift) {
      this.setMomentumVelocity(particle, shift, 0.28, 0.95, 0.38, 1.45);
    } else {
      const scatter =
        0.5 *
        (0.45 + this.spread) *
        this.motionProfile.coneScale *
        this.motionProfile.velocityScale;
      const inheritance = Math.min(0.2, 0.12 + 0.1 / speed);
      particle.vx =
        tip.velocityX * inheritance * this.motionProfile.velocityScale +
        (Math.random() - 0.5) * scatter;
      particle.vy =
        tip.velocityY * inheritance * this.motionProfile.velocityScale +
        Math.random() * scatter * 0.48;
      particle.vz =
        tip.velocityZ * inheritance * this.motionProfile.velocityScale +
        (Math.random() - 0.5) * scatter;
    }
    particle.maxLife =
      this.particleLifetime *
      (burst ? 1.35 + Math.random() * 0.8 : 0.62 + Math.random() * 0.55) *
      this.motionProfile.fragmentLifetimeScale;
    particle.life = particle.maxLife;
    particle.size =
      (burst ? 0.025 + Math.random() * 0.03 : 0.018 + Math.random() * 0.018) *
      (1 + (Math.random() - 0.5) * this.sparkSizeJitter) *
      this.motionProfile.fragmentSizeScale;
    particle.heatScale = burst
      ? 0.84 + Math.random() * 0.16
      : 0.32 + Math.random() * 0.28;
    particle.seed = Math.random();
    particle.rotationX = Math.random() * Math.PI * 2;
    particle.rotationY = Math.random() * Math.PI * 2;
    particle.rotationZ = Math.random() * Math.PI * 2;
    particle.angularX = (Math.random() - 0.5) * 8;
    particle.angularY = (Math.random() - 0.5) * 8;
    particle.angularZ = (Math.random() - 0.5) * 8;
    particle.aspect = 0.62 + Math.random() * 0.7;
    particle.haloStrength = mode === "burst" ? 1.2 : 0.98;
    particle.active = true;
    this.emittedFragmentCount++;
    return particle;
  }

  private setMomentumVelocity(
    particle: SparkParticle,
    shift: MomentumShift,
    scatterMin: number,
    scatterMax: number,
    inheritance: number,
    coneScale: number
  ): void {
    let tangentX: number;
    let tangentY: number;
    let tangentZ: number;
    if (Math.abs(shift.directionY) < 0.9) {
      const inverseLength =
        1 / Math.max(0.0001, Math.hypot(shift.directionX, shift.directionZ));
      tangentX = -shift.directionZ * inverseLength;
      tangentY = 0;
      tangentZ = shift.directionX * inverseLength;
    } else {
      const inverseLength =
        1 / Math.max(0.0001, Math.hypot(shift.directionY, shift.directionZ));
      tangentX = 0;
      tangentY = shift.directionZ * inverseLength;
      tangentZ = -shift.directionY * inverseLength;
    }

    const bitangentX =
      shift.directionY * tangentZ - shift.directionZ * tangentY;
    const bitangentY =
      shift.directionZ * tangentX - shift.directionX * tangentZ;
    const bitangentZ =
      shift.directionX * tangentY - shift.directionY * tangentX;
    const azimuth = Math.random() * Math.PI * 2;
    const maxAngle =
      (0.12 + this.spread * 0.62) *
      (0.78 + shift.severity * 0.42) *
      coneScale *
      this.motionProfile.coneScale;
    const cosTheta = 1 - Math.random() * (1 - Math.cos(maxAngle));
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const radialX =
      tangentX * Math.cos(azimuth) + bitangentX * Math.sin(azimuth);
    const radialY =
      tangentY * Math.cos(azimuth) + bitangentY * Math.sin(azimuth);
    const radialZ =
      tangentZ * Math.cos(azimuth) + bitangentZ * Math.sin(azimuth);
    const coneX = shift.directionX * cosTheta + radialX * sinTheta;
    const coneY = shift.directionY * cosTheta + radialY * sinTheta;
    const coneZ = shift.directionZ * cosTheta + radialZ * sinTheta;
    const scatterSpeed =
      (scatterMin + Math.random() * (scatterMax - scatterMin)) *
      (0.72 + this.spread * 0.5) *
      (0.48 + shift.severity * 0.92) *
      this.motionProfile.velocityScale;
    const inheritedSpeed = Math.min(
      shift.incomingSpeed * inheritance,
      scatterSpeed * (0.72 + shift.severity * 0.38)
    );

    particle.vx = shift.directionX * inheritedSpeed + coneX * scatterSpeed;
    particle.vy = shift.directionY * inheritedSpeed + coneY * scatterSpeed;
    particle.vz = shift.directionZ * inheritedSpeed + coneZ * scatterSpeed;
  }

  private claimSpark(): SparkParticle | null {
    for (let offset = 0; offset < this.sparkCapacity; offset++) {
      const index = (this.sparkCursor + offset) % this.sparkCapacity;
      const particle = this.sparks[index]!;
      if (particle.active) continue;
      this.sparkCursor = (index + 1) % this.sparkCapacity;
      return particle;
    }
    return null;
  }

  private claimFragment(): FragmentParticle | null {
    for (let offset = 0; offset < this.fragmentCapacity; offset++) {
      const index = (this.fragmentCursor + offset) % this.fragmentCapacity;
      const particle = this.fragments[index]!;
      if (particle.active) continue;
      this.fragmentCursor = (index + 1) % this.fragmentCapacity;
      return particle;
    }
    return null;
  }

  private updateFragments(dt: number, collisionFloorY: number | null): void {
    this.fragmentPool!.beginFrame();
    const drag = Math.pow(FRAGMENT_DRAG, dt);
    let visibleCount = 0;

    for (const particle of this.fragments) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }

      particle.vy -= this.gravity * 0.82 * dt;
      particle.vx *= drag;
      particle.vy *= drag;
      particle.vz *= drag;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.rotationX += particle.angularX * dt;
      particle.rotationY += particle.angularY * dt;
      particle.rotationZ += particle.angularZ * dt;

      if (
        this.qualityTier === QualityTier.HIGH &&
        collisionFloorY !== null &&
        particle.y < collisionFloorY
      ) {
        if (!particle.groundClamped) {
          const impactAngle = particle.seed * Math.PI * 2;
          const impactScatter = 0.14 + this.spread * 0.18;
          particle.vx += Math.cos(impactAngle) * impactScatter;
          particle.vz += Math.sin(impactAngle) * impactScatter;
          particle.life = Math.min(particle.life, 0.2 + particle.seed * 0.18);
          particle.heatScale *= 0.72;
        }
        // The fragment origin is its center, so rest it above the surface
        // instead of slicing every ember through one mathematically flat row.
        particle.y = collisionFloorY + particle.size * 0.45;
        particle.groundClamped = true;
        particle.vy = Math.abs(particle.vy) * 0.18;
        particle.vx *= 0.78;
        particle.vz *= 0.78;
      }

      const lifeRatio = particle.life / particle.maxLife;
      const heat = Math.pow(lifeRatio, 1.35) * particle.heatScale;
      this.setFragmentColor(heat);
      this.fragmentEuler.set(
        particle.rotationX,
        particle.rotationY,
        particle.rotationZ
      );
      this.fragmentQuaternion.setFromEuler(this.fragmentEuler);
      const size = particle.size * (0.72 + lifeRatio * 0.28);
      this.fragmentPool!.write({
        x: particle.x,
        y: particle.y,
        z: particle.z,
        scaleX: size * particle.aspect,
        scaleY: size,
        scaleZ: size * (1.32 - particle.aspect * 0.24),
        quaternionX: this.fragmentQuaternion.x,
        quaternionY: this.fragmentQuaternion.y,
        quaternionZ: this.fragmentQuaternion.z,
        quaternionW: this.fragmentQuaternion.w,
        right: this.fragmentColor.r,
        green: this.fragmentColor.g,
        left: this.fragmentColor.b,
        alpha: Math.min(1, lifeRatio * 3),
      });
      visibleCount++;
    }

    this.fragmentPool!.commit();
    this.activeFragmentCount = visibleCount;
    this.activeTipCount = this.tipStates.reduce(
      (count, state) => count + (state.present ? 1 : 0),
      0
    );
  }

  private updatePoints(dt: number): void {
    let visibleCount = 0;
    const drag = Math.pow(SPARK_DRAG, dt);

    for (const particle of this.sparks) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }

      particle.vy -= this.gravity * dt;
      particle.vx *= drag;
      particle.vy *= drag;
      particle.vz *= drag;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;

      const lifeRatio = particle.life / particle.maxLife;
      const velocity = Math.sqrt(
        particle.vx * particle.vx +
          particle.vy * particle.vy +
          particle.vz * particle.vz
      );
      this.writePoint(
        visibleCount++,
        particle.x,
        particle.y,
        particle.z,
        particle.vx,
        particle.vy,
        particle.vz,
        particle.size *
          (0.6 + Math.min(0.95, velocity * 0.13)) *
          (0.62 + lifeRatio * 0.38),
        Math.min(1, lifeRatio * 3),
        Math.pow(lifeRatio, 0.7) * particle.heatScale,
        POINT_KIND_SPARK,
        particle.seed
      );
    }
    this.activeSparkCount = visibleCount;

    for (const particle of this.fragments) {
      if (
        !particle.active ||
        particle.haloStrength <= 0 ||
        visibleCount >= this.pointCapacity
      ) {
        continue;
      }
      const lifeRatio = particle.life / particle.maxLife;
      this.writePoint(
        visibleCount++,
        particle.x,
        particle.y,
        particle.z,
        particle.vx,
        particle.vy,
        particle.vz,
        particle.size * (4.4 + this.glow * 1.5),
        Math.min(0.94, lifeRatio * 2.7) * particle.haloStrength,
        Math.pow(lifeRatio, 1.18) * particle.heatScale,
        POINT_KIND_EMBER,
        particle.seed
      );
    }

    for (const state of this.tipStates) {
      if (
        !state.present ||
        visibleCount + HEAD_POINTS_PER_TIP > this.pointCapacity
      ) {
        continue;
      }
      for (let point = 0; point < HEAD_POINTS_PER_TIP; point++) {
        const main = point === 0;
        const angle = state.seed * 37 + point * 2.399963;
        const radius = main ? 0 : 0.017 + point * 0.004;
        this.writePoint(
          visibleCount++,
          state.currentPosition.x + Math.cos(angle) * radius,
          state.currentPosition.y + (main ? 0 : Math.sin(angle * 1.3) * radius),
          state.currentPosition.z + Math.sin(angle) * radius,
          0,
          1,
          0,
          main
            ? 0.15 + this.glow * 0.035
            : 0.048 + this.glow * 0.014 + point * 0.003,
          main ? 0.82 + this.glow * 0.1 : 0.38 + this.glow * 0.12,
          main ? 0.92 + this.glow * 0.08 : 0.62 + this.glow * 0.18,
          main ? POINT_KIND_HEAD : POINT_KIND_EMBER,
          state.seed + point * 0.271
        );
      }
    }

    for (const name of POINT_ATTRIBUTE_NAMES) {
      (this.geometry!.getAttribute(name) as BufferAttribute).needsUpdate = true;
    }
    this.geometry!.setDrawRange(0, visibleCount);
    this.activePointCount = visibleCount;
  }

  private writePoint(
    index: number,
    x: number,
    y: number,
    z: number,
    velocityX: number,
    velocityY: number,
    velocityZ: number,
    size: number,
    alpha: number,
    temperature: number,
    kind: number,
    seed: number
  ): void {
    const i3 = index * 3;
    this.positions[i3] = x;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = z;
    this.velocities[i3] = velocityX;
    this.velocities[i3 + 1] = velocityY;
    this.velocities[i3 + 2] = velocityZ;
    this.sizes[index] = size;
    this.alphas[index] = alpha;
    this.temperatures[index] = temperature;
    this.kinds[index] = kind;
    this.seeds[index] = seed;
  }

  private setFragmentColor(heat: number): void {
    const temperature = Math.max(0, Math.min(1, heat));
    // The physical chip stays recognizably charcoal while its point-sprite
    // halo supplies the blown-out center. Sending the rock itself to white
    // erases its dark facets and makes it read like a light bulb.
    const amount = Math.pow(temperature, 0.72);
    const brightness = 0.2 + temperature * 0.66;
    this.fragmentColor.setRGB(
      (mixChannel(this.coolColor[0], this.midColor[0], amount) / 255) *
        brightness,
      (mixChannel(this.coolColor[1], this.midColor[1], amount) / 255) *
        brightness,
      (mixChannel(this.coolColor[2], this.midColor[2], amount) / 255) *
        brightness,
      SRGBColorSpace
    );
  }

  updateConfig(params: Charcoal3DParams): void {
    const nextCore = params.coreColor ?? DEFAULT_CORE;
    const nextMid = params.midColor ?? DEFAULT_MID;
    const nextCool = params.coolColor ?? DEFAULT_COOL;
    if (
      this.configInitialized &&
      this.intensity === params.intensity &&
      this.spread === params.spread &&
      this.glow === params.glow &&
      this.particleLifetime === params.particleLifetime &&
      this.gravity === params.gravity &&
      this.sparkSizeJitter === params.sparkSizeJitter &&
      this.emissionStyle === params.emissionStyle &&
      this.coreColor[0] === nextCore[0] &&
      this.coreColor[1] === nextCore[1] &&
      this.coreColor[2] === nextCore[2] &&
      this.midColor[0] === nextMid[0] &&
      this.midColor[1] === nextMid[1] &&
      this.midColor[2] === nextMid[2] &&
      this.coolColor[0] === nextCool[0] &&
      this.coolColor[1] === nextCool[1] &&
      this.coolColor[2] === nextCool[2]
    ) {
      return;
    }

    const emissionStyleChanged =
      this.configInitialized && this.emissionStyle !== params.emissionStyle;
    this.intensity = Math.max(0, Math.min(1, params.intensity));
    this.spread = Math.max(0, Math.min(1, params.spread));
    this.glow = Math.max(0, Math.min(1, params.glow));
    this.particleLifetime = Math.max(0.12, params.particleLifetime);
    this.gravity = Math.max(0, params.gravity);
    this.sparkSizeJitter = Math.max(0, Math.min(1, params.sparkSizeJitter));
    this.emissionStyle = params.emissionStyle;
    this.motionProfile = params.motionProfile;
    this.coreColor[0] = nextCore[0];
    this.coreColor[1] = nextCore[1];
    this.coreColor[2] = nextCore[2];
    this.midColor[0] = nextMid[0];
    this.midColor[1] = nextMid[1];
    this.midColor[2] = nextMid[2];
    this.coolColor[0] = nextCool[0];
    this.coolColor[1] = nextCool[1];
    this.coolColor[2] = nextCool[2];
    this.configInitialized = true;

    if (emissionStyleChanged) this.reset();

    if (this.material) {
      updateCharcoalMaterial(this.material, {
        coreColor: this.coreColor,
        midColor: this.midColor,
        coolColor: this.coolColor,
        emissiveStrength: 1.75 + this.intensity * 0.75 + this.glow * 0.65,
      });
    }
  }

  private createSpatialDebugSnapshot(): CharcoalRenderer3DSpatialDebugSnapshot {
    const bandHeight = 0.08;
    const bands = new Map<number, ParticleBandAccumulator>();

    const addParticle = (
      particle: SparkParticle,
      kind: "spark" | "fragment"
    ): void => {
      if (!particle.active) return;
      const bandIndex = Math.floor(particle.y / bandHeight);
      let band = bands.get(bandIndex);
      if (!band) {
        band = {
          count: 0,
          yTotal: 0,
          minX: Number.POSITIVE_INFINITY,
          maxX: Number.NEGATIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
          maxY: Number.NEGATIVE_INFINITY,
          minZ: Number.POSITIVE_INFINITY,
          maxZ: Number.NEGATIVE_INFINITY,
          minSpawnX: Number.POSITIVE_INFINITY,
          maxSpawnX: Number.NEGATIVE_INFINITY,
          minSpawnY: Number.POSITIVE_INFINITY,
          maxSpawnY: Number.NEGATIVE_INFINITY,
          ageTotal: 0,
          displacementTotal: 0,
          velocityXTotal: 0,
          velocityYTotal: 0,
          velocityZTotal: 0,
          ambientCount: 0,
          burstCount: 0,
          sparkCount: 0,
          fragmentCount: 0,
          groundClampedCount: 0,
          sourceCounts: new Map(),
        };
        bands.set(bandIndex, band);
      }

      band.count++;
      band.yTotal += particle.y;
      band.minX = Math.min(band.minX, particle.x);
      band.maxX = Math.max(band.maxX, particle.x);
      band.minY = Math.min(band.minY, particle.y);
      band.maxY = Math.max(band.maxY, particle.y);
      band.minZ = Math.min(band.minZ, particle.z);
      band.maxZ = Math.max(band.maxZ, particle.z);
      band.minSpawnX = Math.min(band.minSpawnX, particle.spawnX);
      band.maxSpawnX = Math.max(band.maxSpawnX, particle.spawnX);
      band.minSpawnY = Math.min(band.minSpawnY, particle.spawnY);
      band.maxSpawnY = Math.max(band.maxSpawnY, particle.spawnY);
      band.ageTotal += Math.max(0, this.clock - particle.emittedAt);
      band.displacementTotal += Math.hypot(
        particle.x - particle.spawnX,
        particle.y - particle.spawnY,
        particle.z - particle.spawnZ
      );
      band.velocityXTotal += particle.vx;
      band.velocityYTotal += particle.vy;
      band.velocityZTotal += particle.vz;
      if (particle.emissionMode === "burst") band.burstCount++;
      else band.ambientCount++;
      if (kind === "spark") band.sparkCount++;
      else band.fragmentCount++;
      if (particle.groundClamped) band.groundClampedCount++;
      band.sourceCounts.set(
        particle.sourceId,
        (band.sourceCounts.get(particle.sourceId) ?? 0) + 1
      );
    };

    for (const particle of this.sparks) addParticle(particle, "spark");
    for (const particle of this.fragments) addParticle(particle, "fragment");

    let strongestBand: ParticleBandAccumulator | null = null;
    let strongestScore = 0;
    for (const band of bands.values()) {
      const xSpan = band.maxX - band.minX;
      if (band.count < 8 || xSpan < 0.35) continue;
      const score =
        (band.count * xSpan) / Math.max(0.02, band.maxY - band.minY);
      if (score <= strongestScore) continue;
      strongestBand = band;
      strongestScore = score;
    }

    const densestHorizontalBand = strongestBand
      ? {
          count: strongestBand.count,
          yCenter: strongestBand.yTotal / strongestBand.count,
          ySpan: strongestBand.maxY - strongestBand.minY,
          xSpan: strongestBand.maxX - strongestBand.minX,
          zSpan: strongestBand.maxZ - strongestBand.minZ,
          spawnXSpan: strongestBand.maxSpawnX - strongestBand.minSpawnX,
          spawnYSpan: strongestBand.maxSpawnY - strongestBand.minSpawnY,
          meanAge: strongestBand.ageTotal / strongestBand.count,
          meanDisplacement:
            strongestBand.displacementTotal / strongestBand.count,
          meanVelocity: [
            strongestBand.velocityXTotal / strongestBand.count,
            strongestBand.velocityYTotal / strongestBand.count,
            strongestBand.velocityZTotal / strongestBand.count,
          ] as [number, number, number],
          ambientCount: strongestBand.ambientCount,
          burstCount: strongestBand.burstCount,
          sparkCount: strongestBand.sparkCount,
          fragmentCount: strongestBand.fragmentCount,
          groundClampedCount: strongestBand.groundClampedCount,
          sourceCounts: Object.fromEntries(
            [...strongestBand.sourceCounts].map(([sourceId, count]) => [
              String(sourceId),
              count,
            ])
          ),
        }
      : null;

    return {
      instanceId: this.diagnosticInstanceId,
      emissionStyle: this.emissionStyle,
      clock: this.clock,
      activeSparkCount: this.activeSparkCount,
      activeFragmentCount: this.activeFragmentCount,
      densestHorizontalBand,
      tips: this.tipStates.flatMap((state) =>
        state.present && state.sourceId !== null
          ? [
              {
                sourceId: state.sourceId,
                position: state.currentPosition.toArray() as [
                  number,
                  number,
                  number,
                ],
                velocity: state.previousVelocity.toArray() as [
                  number,
                  number,
                  number,
                ],
              },
            ]
          : []
      ),
    };
  }

  getDebugSnapshot(): CharcoalRenderer3DDebugSnapshot {
    return {
      emissionStyle: this.emissionStyle,
      motionProfile: { ...this.motionProfile },
      activeSparkCount: this.activeSparkCount,
      activeFragmentCount: this.activeFragmentCount,
      activeTipCount: this.activeTipCount,
      activePointCount: this.activePointCount,
      burstCount: this.burstCount,
      emittedSparkCount: this.emittedSparkCount,
      emittedFragmentCount: this.emittedFragmentCount,
      suppressedDiscontinuityCount: this.suppressedDiscontinuityCount,
      lastBurst: this.lastBurst
        ? {
            ...this.lastBurst,
            sourceDirection: [...this.lastBurst.sourceDirection],
            averageSparkVelocity: [...this.lastBurst.averageSparkVelocity],
          }
        : null,
      sparkCapacity: this.sparkCapacity,
      fragmentCapacity: this.fragmentCapacity,
      physics: {
        particleLifetime: this.particleLifetime,
        gravity: this.gravity,
        sparkSizeJitter: this.sparkSizeJitter,
      },
      palette: {
        core: [...this.coreColor],
        mid: [...this.midColor],
        cool: [...this.coolColor],
      },
    };
  }

  reset(): void {
    for (const particle of this.sparks) particle.active = false;
    for (const particle of this.fragments) particle.active = false;
    for (const state of this.tipStates) this.clearTipState(state);
    this.sparkCursor = 0;
    this.fragmentCursor = 0;
    this.previousStepPhase = null;
    this.clock = 0;
    this.diagnosticAccumulator = 0;
    this.activeSparkCount = 0;
    this.activeFragmentCount = 0;
    this.activeTipCount = 0;
    this.activePointCount = 0;
    this.lastBurst = null;
    this.geometry?.setDrawRange(0, 0);
    this.fragmentPool?.clear();
  }

  private clearTipState(state: TipRuntime): void {
    state.sourceId = null;
    state.hasPrevious = false;
    state.ambientAccumulator = 0;
    state.ambientClusterTarget = this.motionProfile.packetMin;
    state.ambientEmissionIndex = 0;
    state.burstArmed = true;
    state.burstCooldown = 0;
    state.present = false;
    state.previousVelocity.set(0, 0, 0);
  }

  dispose(): void {
    if (this.points) {
      this.parent?.remove(this.points);
      this.geometry?.dispose();
      this.material?.dispose();
      this.points = null;
      this.geometry = null;
      this.material = null;
    }
    this.fragmentPool?.dispose();
    this.fragmentPool = null;
    this.parent = null;
  }
}
