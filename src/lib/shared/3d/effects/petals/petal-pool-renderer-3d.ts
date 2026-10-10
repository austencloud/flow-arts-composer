import { Euler, Object3D, PlaneGeometry, Quaternion, Vector3 } from "three";
import {
  pickPetalSprite,
  pickPetalTint,
  resolvePetalOpacity,
  rollEmberFlag,
} from "#lib/shared/effects/domain/petal-palettes.js";
import {
  addPetalWake3D,
  resolvePetalAirflowPhrase,
  samplePetalAirflow3D,
  type PetalAirflow3D,
  type PetalWakeSource3D,
} from "#lib/shared/effects/domain/petal-airflow.js";
import {
  NEUTRAL_PETAL_ENVIRONMENT_PROFILE,
  resolveEmberWorldSpan,
  type PetalEnvironmentProfile3D,
  resolvePetalWorldSize,
} from "./petal-world-art-direction";
import {
  ParticleInstancePool3D,
  type ParticleInstanceWrite,
} from "../instancing/particle-instance-pool-3d";
import {
  setLinearRgbFromHex,
  type MutableRgb,
} from "../instancing/particle-color";
import {
  isTrackedTip,
  type PetalTipSource3D,
} from "../scene-effects/scene-effect-source-3d";
import {
  getPetalAtlasFrame,
  getPetalTextureAtlas,
} from "./petal-texture-atlas";
import { createPetalSurfaceGeometry } from "./petal-surface-geometry";
import { petalFlightWeight, settlePetalOrientation } from "./petal-orientation";

const CAPACITY = 2048;
const EMBER_MAX_AGE = 1.35;
const FADE_OUT_FRACTION = 0.2;
const FADE_IN_DURATION = 0.12;

export class PetalPoolRenderer3D {
  private readonly petalPool: ParticleInstancePool3D;
  private readonly emberPool: ParticleInstancePool3D;
  private readonly active = new Uint8Array(CAPACITY);
  private readonly x = new Float32Array(CAPACITY);
  private readonly y = new Float32Array(CAPACITY);
  private readonly z = new Float32Array(CAPACITY);
  private readonly vx = new Float32Array(CAPACITY);
  private readonly vy = new Float32Array(CAPACITY);
  private readonly vz = new Float32Array(CAPACITY);
  private readonly age = new Float32Array(CAPACITY);
  private readonly maxAge = new Float32Array(CAPACITY);
  private readonly size = new Float32Array(CAPACITY);
  private readonly rotationX = new Float32Array(CAPACITY);
  private readonly rotationY = new Float32Array(CAPACITY);
  private readonly rotationZ = new Float32Array(CAPACITY);
  private readonly rotationVelocityY = new Float32Array(CAPACITY);
  private readonly rotationVelocityZ = new Float32Array(CAPACITY);
  private readonly quaternionX = new Float32Array(CAPACITY);
  private readonly quaternionY = new Float32Array(CAPACITY);
  private readonly quaternionZ = new Float32Array(CAPACITY);
  private readonly quaternionW = new Float32Array(CAPACITY);
  private readonly flutterPhase = new Float32Array(CAPACITY);
  private readonly phase = new Float32Array(CAPACITY);
  private readonly swayFrequency = new Float32Array(CAPACITY);
  private readonly swaySpeed = new Float32Array(CAPACITY);
  private readonly fallVelocity = new Float32Array(CAPACITY);
  private readonly dragBase = new Float32Array(CAPACITY);
  private readonly maxOpacity = new Float32Array(CAPACITY);
  private readonly baseRotationX = new Float32Array(CAPACITY);
  private readonly right = new Float32Array(CAPACITY);
  private readonly green = new Float32Array(CAPACITY);
  private readonly left = new Float32Array(CAPACITY);
  private readonly ember = new Uint8Array(CAPACITY);
  private readonly emberRight = new Float32Array(CAPACITY);
  private readonly emberGreen = new Float32Array(CAPACITY);
  private readonly emberLeft = new Float32Array(CAPACITY);
  private readonly uvX = new Float32Array(CAPACITY);
  private readonly uvY = new Float32Array(CAPACITY);
  private readonly uvWidth = new Float32Array(CAPACITY);
  private readonly uvHeight = new Float32Array(CAPACITY);
  private readonly accumulators = new Map<number, number>();
  private readonly wakeSources: PetalWakeSource3D[] = [];
  private readonly euler = new Euler();
  private readonly quaternion = new Quaternion();
  private readonly flightQuaternion = new Quaternion();
  private readonly floatingQuaternion = new Quaternion();
  private readonly targetQuaternion = new Quaternion();
  private readonly twistQuaternion = new Quaternion();
  private readonly flightDirection = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly color: MutableRgb = { right: 1, green: 1, left: 1 };
  private readonly airflow: PetalAirflow3D = { x: 0, y: 0, z: 0, turn: 0 };
  private readonly writeState: ParticleInstanceWrite = {
    x: 0,
    y: 0,
    z: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    right: 1,
    green: 1,
    left: 1,
    alpha: 1,
  };
  private cursor = 0;
  private ambientAccumulator = 0;
  private clock = 0;
  private environmentProfile = NEUTRAL_PETAL_ENVIRONMENT_PROFILE;

  constructor() {
    const atlas = getPetalTextureAtlas();
    this.petalPool = new ParticleInstancePool3D({
      capacity: CAPACITY,
      geometry: createPetalSurfaceGeometry(),
      texture: atlas,
      renderOrder: 103,
      nearFadeStart: 2.2,
      nearFadeEnd: 3.8,
      farFadeStart: 5.2,
      farFadeEnd: 10.5,
      farFadeOpacity: 0.56,
      farSoftness: 0.62,
      fog: true,
      colorManaged: true,
      surfaceLighting: { strength: 0.72, floor: 0.24 },
      thinSurfaceLighting: true,
      contrastAdaptation: {
        backdropLuminance: NEUTRAL_PETAL_ENVIRONMENT_PROFILE.backdropLuminance,
        minimumSurfaceLuminance:
          NEUTRAL_PETAL_ENVIRONMENT_PROFILE.minimumSurfaceLuminance,
        maximumSurfaceLuminance:
          NEUTRAL_PETAL_ENVIRONMENT_PROFILE.maximumSurfaceLuminance,
        strength: NEUTRAL_PETAL_ENVIRONMENT_PROFILE.contrastStrength,
        edgeStrength: NEUTRAL_PETAL_ENVIRONMENT_PROFILE.edgeStrength,
      },
    });
    this.emberPool = new ParticleInstancePool3D({
      capacity: CAPACITY,
      geometry: new PlaneGeometry(1, 1),
      texture: atlas,
      additive: true,
      renderOrder: 104,
      nearFadeStart: 2.2,
      nearFadeEnd: 3.8,
      farFadeStart: 5.2,
      farFadeEnd: 10.5,
      farFadeOpacity: 0.7,
      farSoftness: 0.35,
      fog: true,
      colorManaged: true,
    });
  }

  initialize(parent: Object3D): void {
    this.petalPool.initialize(parent);
    this.emberPool.initialize(parent);
  }

  setEnvironmentProfile(profile: PetalEnvironmentProfile3D): void {
    this.environmentProfile = profile;
    this.petalPool.setContrastAdaptation({
      backdropLuminance: profile.backdropLuminance,
      minimumSurfaceLuminance: profile.minimumSurfaceLuminance,
      maximumSurfaceLuminance: profile.maximumSurfaceLuminance,
      strength: profile.contrastStrength,
      edgeStrength: profile.edgeStrength,
    });
  }

  update(sources: readonly PetalTipSource3D[], delta: number): void {
    const dt = Math.min(Math.max(delta, 0), 1 / 15);
    this.clock += dt;
    let wakeSourceCount = 0;
    for (const source of sources) {
      if (isTrackedTip(source.params.trackingMode, source.tipIndex)) {
        this.emitMotion(source, dt);
        const wakeSource = this.wakeSources[wakeSourceCount] ?? {
          x: 0,
          y: 0,
          z: 0,
          velocityX: 0,
          velocityY: 0,
          velocityZ: 0,
        };
        wakeSource.x = source.position.x;
        wakeSource.y = source.position.y;
        wakeSource.z = source.position.z;
        wakeSource.velocityX = source.velocity.x;
        wakeSource.velocityY = source.velocity.y;
        wakeSource.velocityZ = source.velocity.z;
        this.wakeSources[wakeSourceCount] = wakeSource;
        wakeSourceCount++;
      }
    }
    this.wakeSources.length = wakeSourceCount;
    if (sources.length > 0) this.emitAmbient(sources, dt);

    this.petalPool.beginFrame();
    this.emberPool.beginFrame();
    for (let index = 0; index < CAPACITY; index++) {
      if (this.active[index] === 0) continue;
      this.age[index]! += dt;
      if (this.age[index]! >= this.maxAge[index]!) {
        this.active[index] = 0;
        continue;
      }
      const oscillation = this.clock * this.swayFrequency[index]! * Math.PI * 2;
      const swayX =
        Math.sin(this.phase[index]! + oscillation) * this.swaySpeed[index]!;
      const swayZ =
        Math.cos(this.phase[index]! * 1.3 + oscillation) *
        this.swaySpeed[index]! *
        0.5;
      const airflow = samplePetalAirflow3D(
        this.x[index]!,
        this.y[index]!,
        this.z[index]!,
        this.clock,
        this.airflow
      );
      for (const source of this.wakeSources) {
        addPetalWake3D(
          airflow,
          this.x[index]!,
          this.y[index]!,
          this.z[index]!,
          source
        );
      }
      const drag = Math.pow(this.dragBase[index]!, dt);
      const fallEase = 1 - Math.pow(0.2, dt);
      this.vx[index]! *= drag;
      this.vz[index]! *= drag;
      this.vy[index]! +=
        (this.fallVelocity[index]! - this.vy[index]!) * fallEase;
      this.x[index]! += (this.vx[index]! + airflow.x + swayX * 0.24) * dt;
      this.y[index]! += (this.vy[index]! + airflow.y) * dt;
      this.z[index]! += (this.vz[index]! + airflow.z + swayZ * 0.24) * dt;
      const flutter = this.flutterPhase[index]! + oscillation * 1.17;
      this.rotationX[index] =
        this.baseRotationX[index]! + Math.sin(flutter) * 0.72;
      this.rotationY[index]! +=
        (this.rotationVelocityY[index]! + airflow.turn * 0.16) * dt;
      this.rotationZ[index]! +=
        (this.rotationVelocityZ[index]! + Math.cos(flutter * 0.71) * 0.32) * dt;
      this.euler.set(
        this.rotationX[index]!,
        this.rotationY[index]!,
        this.rotationZ[index]!
      );
      this.floatingQuaternion.setFromEuler(this.euler);

      const motionX = this.vx[index]! + airflow.x + swayX * 0.24;
      const motionY = this.vy[index]! + airflow.y;
      const motionZ = this.vz[index]! + airflow.z + swayZ * 0.24;
      const motionLength = Math.hypot(motionX, motionY, motionZ);
      if (motionLength > 0.0001) {
        this.flightDirection.set(
          motionX / motionLength,
          motionY / motionLength,
          motionZ / motionLength
        );
        this.flightQuaternion.setFromUnitVectors(this.up, this.flightDirection);
        this.twistQuaternion.setFromAxisAngle(
          this.up,
          this.flutterPhase[index]! + Math.sin(flutter) * 0.24
        );
        this.flightQuaternion.multiply(this.twistQuaternion);
      } else {
        this.flightQuaternion.copy(this.floatingQuaternion);
      }
      this.quaternion.set(
        this.quaternionX[index]!,
        this.quaternionY[index]!,
        this.quaternionZ[index]!,
        this.quaternionW[index]!
      );
      settlePetalOrientation(
        this.quaternion,
        this.flightQuaternion,
        this.floatingQuaternion,
        petalFlightWeight(
          this.vx[index]!,
          this.vy[index]!,
          this.vz[index]!,
          this.fallVelocity[index]!
        ),
        dt,
        this.targetQuaternion
      );
      this.quaternionX[index] = this.quaternion.x;
      this.quaternionY[index] = this.quaternion.y;
      this.quaternionZ[index] = this.quaternion.z;
      this.quaternionW[index] = this.quaternion.w;

      const life = this.age[index]! / this.maxAge[index]!;
      const fadeIn =
        this.age[index]! < FADE_IN_DURATION
          ? this.age[index]! / FADE_IN_DURATION
          : 1;
      const fadeOut =
        life > 1 - FADE_OUT_FRACTION ? (1 - life) / FADE_OUT_FRACTION : 1;
      const write = this.writeState;
      write.x = this.x[index]!;
      write.y = this.y[index]!;
      write.z = this.z[index]!;
      write.scaleX = this.size[index]! * 2;
      write.scaleY = this.size[index]! * 2;
      write.scaleZ = this.size[index]! * 2;
      write.quaternionX = this.quaternion.x;
      write.quaternionY = this.quaternion.y;
      write.quaternionZ = this.quaternion.z;
      write.quaternionW = this.quaternion.w;
      write.right = this.right[index]!;
      write.green = this.green[index]!;
      write.left = this.left[index]!;
      write.alpha = Math.min(
        1,
        Math.max(
          0,
          fadeIn *
            fadeOut *
            this.maxOpacity[index]! *
            this.environmentProfile.opacityScale
        )
      );
      write.uvX = this.uvX[index]!;
      write.uvY = this.uvY[index]!;
      write.uvWidth = this.uvWidth[index]!;
      write.uvHeight = this.uvHeight[index]!;
      this.petalPool.write(write);

      if (this.ember[index] === 1 && this.age[index]! < EMBER_MAX_AGE) {
        write.scaleX = resolveEmberWorldSpan(this.size[index]!);
        write.scaleY = resolveEmberWorldSpan(this.size[index]!);
        write.right = this.emberRight[index]!;
        write.green = this.emberGreen[index]!;
        write.left = this.emberLeft[index]!;
        write.alpha = Math.min(
          1.05,
          (1 - this.age[index]! / EMBER_MAX_AGE) *
            (0.58 + this.maxOpacity[index]! * 0.42) *
            this.environmentProfile.opacityScale
        );
        this.emberPool.write(write);
      }
    }
    this.petalPool.commit();
    this.emberPool.commit();
  }

  clear(): void {
    this.active.fill(0);
    this.accumulators.clear();
    this.wakeSources.length = 0;
    this.ambientAccumulator = 0;
    this.petalPool.clear();
    this.emberPool.clear();
  }

  dispose(): void {
    this.petalPool.dispose();
    this.emberPool.dispose();
  }

  private emitMotion(source: PetalTipSource3D, dt: number): void {
    const params = source.params;
    const speedScalar =
      params.motionReferenceSpeed > 0
        ? Math.min(1, source.speed / params.motionReferenceSpeed)
        : 0;
    const rate =
      params.motionEmission *
      speedScalar *
      params.motionTipRate *
      this.environmentProfile.motionEmissionScale *
      (0.92 + resolvePetalAirflowPhrase(this.clock) * 0.08);
    let accumulator = (this.accumulators.get(source.sourceId) ?? 0) + dt * rate;
    while (accumulator >= 1) {
      if (
        !this.spawn(
          source,
          source.position.x,
          source.position.y,
          source.position.z,
          false
        )
      )
        break;
      accumulator -= 1;
    }
    this.accumulators.set(source.sourceId, accumulator);
  }

  private emitAmbient(sources: readonly PetalTipSource3D[], dt: number): void {
    const params = sources[0]!.params;
    this.ambientAccumulator +=
      dt *
      params.ambientEmission *
      params.ambientAboveRate *
      this.environmentProfile.ambientEmissionScale *
      resolvePetalAirflowPhrase(this.clock);
    let centerX = 0;
    let centerY = 0;
    let centerZ = 0;
    for (const source of sources) {
      centerX += source.position.x;
      centerY += source.position.y;
      centerZ += source.position.z;
    }
    centerX /= sources.length;
    centerY /= sources.length;
    centerZ /= sources.length;
    while (this.ambientAccumulator >= 1) {
      const source = sources[0]!;
      const x = centerX + (Math.random() - 0.5) * 3.2;
      const y = centerY + 2.4 + Math.random() * 0.8;
      const depthBand = Math.random();
      const z =
        centerZ +
        (depthBand < 0.2
          ? -1.35 + Math.random() * 0.65
          : depthBand < 0.74
            ? -0.7 + Math.random() * 1.4
            : 0.82 + Math.random() * 1.48);
      if (!this.spawn(source, x, y, z, true)) break;
      this.ambientAccumulator -= 1;
    }
  }

  private spawn(
    source: PetalTipSource3D,
    x: number,
    y: number,
    z: number,
    ambient: boolean
  ): boolean {
    const params = source.params;
    const slot = this.takeSlot(Math.min(CAPACITY, params.poolSize));
    if (slot < 0) return false;
    const palette = params.resolvedPalette;
    const shape = pickPetalSprite(palette);
    const frame = getPetalAtlasFrame(shape);
    const fall = params.fallBaseSpeed * (0.3 + 0.7 * params.fallSpeed);
    const fallTarget = -fall * (0.82 + Math.random() * 0.32);
    const spread = ambient ? 0.14 : 0.22;
    this.active[slot] = 1;
    this.x[slot] = ambient ? x : x + (Math.random() - 0.5) * 0.08;
    this.y[slot] = ambient ? y : y + (Math.random() - 0.5) * 0.06;
    this.z[slot] = ambient ? z : z + (Math.random() - 0.5) * 0.08;
    this.vx[slot] = ambient
      ? (Math.random() - 0.5) * spread
      : source.velocity.x * params.carry + (Math.random() - 0.5) * spread;
    this.vy[slot] = ambient
      ? fallTarget
      : source.velocity.y * params.carry - fall * 0.12;
    this.vz[slot] = ambient
      ? (Math.random() - 0.5) * spread
      : source.velocity.z * params.carry + (Math.random() - 0.5) * spread;
    this.age[slot] = 0;
    this.maxAge[slot] =
      params.lifetime *
      (ambient ? 0.75 + Math.random() * 0.2 : 0.52 + Math.random() * 0.24);
    this.size[slot] = resolvePetalWorldSize(
      params.baseSize,
      params.intensity,
      shape,
      ambient
    );
    this.rotationVelocityY[slot] = (Math.random() - 0.5) * 0.7;
    this.rotationVelocityZ[slot] = (Math.random() - 0.5) * 0.55;
    this.rotationX[slot] = (Math.random() - 0.5) * 0.9;
    this.baseRotationX[slot] = this.rotationX[slot]!;
    this.rotationY[slot] = Math.random() * Math.PI * 2;
    this.rotationZ[slot] = Math.random() * Math.PI * 2;
    this.phase[slot] = Math.random() * Math.PI * 2;
    this.flutterPhase[slot] = Math.random() * Math.PI * 2;
    this.quaternionX[slot] = 0;
    this.quaternionY[slot] = 0;
    this.quaternionZ[slot] = 0;
    this.quaternionW[slot] = 1;
    this.swayFrequency[slot] =
      params.swayFrequency * (0.65 + Math.random() * 0.7);
    this.swaySpeed[slot] =
      params.swayBaseSpeed *
      params.swayAmplitude *
      (0.55 + Math.random() * 0.65);
    this.fallVelocity[slot] = fallTarget;
    this.dragBase[slot] = ambient ? 0.72 : 0.03 + params.streakLength * 0.5;
    this.maxOpacity[slot] = resolvePetalOpacity(shape, ambient);
    setLinearRgbFromHex(this.color, pickPetalTint(palette));
    this.right[slot] = this.color.right;
    this.green[slot] = this.color.green;
    this.left[slot] = this.color.left;
    this.ember[slot] = rollEmberFlag(palette) ? 1 : 0;
    setLinearRgbFromHex(this.color, palette.emberEdge?.color ?? "#ff6020");
    this.emberRight[slot] = this.color.right;
    this.emberGreen[slot] = this.color.green;
    this.emberLeft[slot] = this.color.left;
    this.uvX[slot] = frame.x;
    this.uvY[slot] = frame.y;
    this.uvWidth[slot] = frame.width;
    this.uvHeight[slot] = frame.height;
    return true;
  }

  private takeSlot(limit: number): number {
    for (let offset = 0; offset < limit; offset++) {
      const index = (this.cursor + offset) % limit;
      if (this.active[index] === 0) {
        this.cursor = (index + 1) % limit;
        return index;
      }
    }
    return -1;
  }
}
