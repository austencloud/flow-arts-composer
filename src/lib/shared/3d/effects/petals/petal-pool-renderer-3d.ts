import {
  Euler,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Object3D,
} from "three";
import {
  pickPetalSprite,
  pickPetalTint,
  resolvePetalOpacity,
  rollEmberFlag,
} from "#lib/shared/effects/domain/petal-palettes.js";
import {
  createPetalBody,
  resolvePetalShape,
  stepPetalBody,
  type PetalBody,
} from "#lib/shared/effects/domain/petal-aero.js";
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
  type ParticleInstancePoolOptions,
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
import { petalGroundClearance } from "./petal-ground-contact";

const CAPACITY = 2048;
const EMBER_MAX_AGE = 1.35;
const FADE_IN_DURATION = 0.12;
const GROUND_FADE_DURATION = 1.8;
const GROUND_BLEND_DURATION = 0.28;
/** A petal still in the air this long has been blown somewhere unseen. */
const MAX_FLIGHT = 60;

export class PetalPoolRenderer3D {
  private readonly petalPool: ParticleInstancePool3D;
  private readonly groundPool: ParticleInstancePool3D;
  private readonly emberPool: ParticleInstancePool3D;
  private readonly active = new Uint8Array(CAPACITY);
  private readonly x = new Float32Array(CAPACITY);
  private readonly y = new Float32Array(CAPACITY);
  private readonly z = new Float32Array(CAPACITY);
  private readonly vx = new Float32Array(CAPACITY);
  private readonly vz = new Float32Array(CAPACITY);
  private readonly age = new Float32Array(CAPACITY);
  private readonly maxAge = new Float32Array(CAPACITY);
  private readonly groundAge = new Float32Array(CAPACITY);
  private readonly floorY = new Float32Array(CAPACITY);
  private readonly groundLayer = new Float32Array(CAPACITY);
  private readonly groundRock = new Float32Array(CAPACITY);
  private readonly size = new Float32Array(CAPACITY);
  /** Each airborne petal's flight through the air (shared with 2D). */
  private readonly bodies: (PetalBody | undefined)[] = new Array(CAPACITY);
  private readonly quaternionX = new Float32Array(CAPACITY);
  private readonly quaternionY = new Float32Array(CAPACITY);
  private readonly quaternionZ = new Float32Array(CAPACITY);
  private readonly quaternionW = new Float32Array(CAPACITY);
  /** The flat pose a landed petal settles into, keeping its heading. */
  private readonly restX = new Float32Array(CAPACITY);
  private readonly restY = new Float32Array(CAPACITY);
  private readonly restZ = new Float32Array(CAPACITY);
  private readonly restW = new Float32Array(CAPACITY);
  private readonly phase = new Float32Array(CAPACITY);
  private readonly maxOpacity = new Float32Array(CAPACITY);
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
  private readonly rockQuaternion = new Quaternion();
  private readonly targetQuaternion = new Quaternion();
  private readonly twistQuaternion = new Quaternion();
  private readonly direction = new Vector3();
  private readonly normal = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly color: MutableRgb = { right: 1, green: 1, left: 1 };
  private readonly airflow: PetalAirflow3D = { x: 0, y: 0, z: 0 };
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
    const petalOptions: ParticleInstancePoolOptions = {
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
    };
    this.petalPool = new ParticleInstancePool3D(petalOptions);
    this.groundPool = new ParticleInstancePool3D({
      ...petalOptions,
      geometry: createPetalSurfaceGeometry(),
      renderOrder: 102,
      nearFadeStart: 0,
      nearFadeEnd: 0.12,
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
    this.groundPool.initialize(parent);
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
    this.groundPool.setContrastAdaptation({
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
    this.groundPool.beginFrame();
    this.emberPool.beginFrame();
    for (let index = 0; index < CAPACITY; index++) {
      if (this.active[index] === 0) continue;
      if (this.active[index] === 1) {
        if (!this.updateAirborne(index, dt, sources)) continue;
      } else if (!this.updateGrounded(index, dt)) {
        continue;
      }

      const fadeIn =
        this.age[index]! < FADE_IN_DURATION
          ? this.age[index]! / FADE_IN_DURATION
          : 1;
      const fadeOut =
        this.active[index] === 2
          ? Math.min(
              1,
              (this.maxAge[index]! - this.groundAge[index]!) /
                GROUND_FADE_DURATION
            )
          : 1;
      const write = this.writeState;
      write.x = this.x[index]!;
      write.y = this.y[index]!;
      write.z = this.z[index]!;
      write.scaleX = this.size[index]! * 2;
      write.scaleY = this.size[index]! * 2;
      write.scaleZ = this.size[index]! * 2;
      write.quaternionX = this.quaternionX[index]!;
      write.quaternionY = this.quaternionY[index]!;
      write.quaternionZ = this.quaternionZ[index]!;
      write.quaternionW = this.quaternionW[index]!;
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
      if (this.active[index] === 2) {
        const groundShare = Math.min(
          1,
          this.groundAge[index]! / GROUND_BLEND_DURATION
        );
        const opacity = write.alpha;
        if (groundShare < 1) {
          write.alpha = opacity * (1 - groundShare);
          this.petalPool.write(write);
        }
        write.alpha = opacity * groundShare;
        this.groundPool.write(write);
      } else {
        this.petalPool.write(write);
      }

      if (
        this.active[index] === 1 &&
        this.ember[index] === 1 &&
        this.age[index]! < EMBER_MAX_AGE
      ) {
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
    this.groundPool.commit();
    this.emberPool.commit();
  }

  /** Flies one petal through the air; false once it has gone. */
  private updateAirborne(
    index: number,
    dt: number,
    sources: readonly PetalTipSource3D[]
  ): boolean {
    this.age[index]! += dt;
    const body = this.bodies[index];
    if (!body || this.age[index]! > MAX_FLIGHT) {
      this.active[index] = 0;
      return false;
    }
    const airflow = samplePetalAirflow3D(
      body.x,
      body.y,
      body.z,
      this.clock,
      this.airflow
    );
    for (const source of this.wakeSources)
      addPetalWake3D(airflow, body.x, body.y, body.z, source);
    stepPetalBody(body, airflow.x, airflow.y, airflow.z, dt);
    this.x[index] = body.x;
    this.y[index] = body.y;
    this.z[index] = body.z;
    this.quaternion.set(body.qx, body.qy, body.qz, body.qw);
    this.quaternionX[index] = body.qx;
    this.quaternionY[index] = body.qy;
    this.quaternionZ[index] = body.qz;
    this.quaternionW[index] = body.qw;

    const clearance = petalGroundClearance(this.size[index]!, this.quaternion);
    if (body.y > this.floorY[index]! + clearance) return true;
    // Landed: it lies down on whichever face met the floor, keeping its
    // heading, and slides a little with what is left of its speed.
    this.active[index] = 2;
    this.groundAge[index] = 0;
    this.groundRock[index] = Math.min(0.18, Math.abs(body.vy) * 0.12);
    this.vx[index] = Math.max(-0.34, Math.min(0.34, body.vx));
    this.vz[index] = Math.max(-0.34, Math.min(0.34, body.vz));
    this.normal.set(0, 0, 1).applyQuaternion(this.quaternion);
    this.direction.set(0, this.normal.y >= 0 ? 1 : -1, 0);
    this.targetQuaternion
      .setFromUnitVectors(this.normal, this.direction)
      .multiply(this.quaternion);
    this.restX[index] = this.targetQuaternion.x;
    this.restY[index] = this.targetQuaternion.y;
    this.restZ[index] = this.targetQuaternion.z;
    this.restW[index] = this.targetQuaternion.w;
    this.y[index] = this.floorY[index]! + clearance + this.groundLayer[index]!;
    this.limitGroundBed(
      Math.min(CAPACITY, sources[0]?.params.poolSize ?? CAPACITY)
    );
    return true;
  }

  private updateGrounded(index: number, dt: number): boolean {
    this.age[index]! += dt;
    this.groundAge[index]! += dt;
    if (this.groundAge[index]! >= this.maxAge[index]!) {
      this.active[index] = 0;
      return false;
    }
    const slide = Math.exp(-4.5 * dt);
    this.vx[index]! *= slide;
    this.vz[index]! *= slide;
    this.x[index]! += this.vx[index]! * dt;
    this.z[index]! += this.vz[index]! * dt;
    const rock =
      this.groundRock[index]! * Math.exp(-4 * this.groundAge[index]!);
    this.euler.set(
      Math.sin(this.groundAge[index]! * 11 + this.phase[index]!) * rock,
      0,
      Math.cos(this.groundAge[index]! * 9 + this.phase[index]!) * rock * 0.7
    );
    this.rockQuaternion.setFromEuler(this.euler);
    this.targetQuaternion
      .set(
        this.restX[index]!,
        this.restY[index]!,
        this.restZ[index]!,
        this.restW[index]!
      )
      .premultiply(this.rockQuaternion);
    this.quaternion.set(
      this.quaternionX[index]!,
      this.quaternionY[index]!,
      this.quaternionZ[index]!,
      this.quaternionW[index]!
    );
    this.quaternion.slerp(this.targetQuaternion, 1 - Math.exp(-10 * dt));
    this.quaternionX[index] = this.quaternion.x;
    this.quaternionY[index] = this.quaternion.y;
    this.quaternionZ[index] = this.quaternion.z;
    this.quaternionW[index] = this.quaternion.w;
    this.y[index] =
      this.floorY[index]! +
      petalGroundClearance(this.size[index]!, this.quaternion) +
      this.groundLayer[index]!;
    return true;
  }

  private limitGroundBed(limit: number): void {
    const budget = Math.min(640, Math.max(1, Math.floor(limit * 0.58)));
    let resting = 0;
    let oldest = -1;
    let oldestAge = -1;
    for (let index = 0; index < limit; index++) {
      if (
        this.active[index] !== 2 ||
        this.groundAge[index]! >= this.maxAge[index]! - GROUND_FADE_DURATION
      )
        continue;
      resting++;
      if (this.groundAge[index]! > oldestAge) {
        oldest = index;
        oldestAge = this.groundAge[index]!;
      }
    }
    if (resting > budget && oldest >= 0) {
      this.groundAge[oldest] = this.maxAge[oldest]! - GROUND_FADE_DURATION;
    }
  }

  clear(): void {
    this.active.fill(0);
    this.accumulators.clear();
    this.wakeSources.length = 0;
    this.ambientAccumulator = 0;
    this.petalPool.clear();
    this.groundPool.clear();
    this.emberPool.clear();
  }

  dispose(): void {
    this.petalPool.dispose();
    this.groundPool.dispose();
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
      ) {
        accumulator = 1;
        break;
      }
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
      if (!this.spawn(source, x, y, z, true)) {
        this.ambientAccumulator = 1;
        break;
      }
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
    this.active[slot] = 1;
    this.age[slot] = 0;
    this.groundAge[slot] = 0;
    this.maxAge[slot] = 45 + Math.random() * 15;
    this.floorY[slot] = source.collisionFloorY;
    this.size[slot] = resolvePetalWorldSize(
      params.baseSize,
      params.intensity,
      shape,
      ambient
    );
    this.groundLayer[slot] = this.size[slot]! * (0.08 + Math.random() * 0.24);
    this.groundRock[slot] = 0;
    this.phase[slot] = Math.random() * Math.PI * 2;

    const fall = params.fallBaseSpeed * (0.3 + 0.7 * params.fallSpeed);
    const body = createPetalBody(
      resolvePetalShape(
        shape,
        this.size[slot]!,
        {
          fallSpeed: fall,
          sway: params.swayAmplitude,
          streak: params.streakLength,
        },
        Math.random
      )
    );
    this.bodies[slot] = body;
    if (ambient) {
      // Drifting down from above: already falling, at any angle.
      body.x = x;
      body.y = y;
      body.z = z;
      body.vx = (Math.random() - 0.5) * 0.14;
      body.vy = -fall * (0.6 + Math.random() * 0.4);
      body.vz = (Math.random() - 0.5) * 0.14;
      this.direction.set(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      );
      if (this.direction.lengthSq() < 1e-6) this.direction.set(1, 0, 0);
      this.direction.normalize();
      this.quaternion.setFromAxisAngle(
        this.direction,
        Math.random() * Math.PI * 2
      );
    } else {
      // Thrown off the tip: it leaves edge-on along the throw, the way it
      // was lying against the prop, and the air turns it from there.
      body.x = x + (Math.random() - 0.5) * 0.08;
      body.y = y + (Math.random() - 0.5) * 0.06;
      body.z = z + (Math.random() - 0.5) * 0.08;
      body.vx = source.velocity.x * params.carry + (Math.random() - 0.5) * 0.22;
      body.vy = source.velocity.y * params.carry;
      body.vz = source.velocity.z * params.carry + (Math.random() - 0.5) * 0.22;
      this.direction.set(body.vx, body.vy, body.vz);
      if (this.direction.lengthSq() > 1e-6) {
        this.quaternion.setFromUnitVectors(this.up, this.direction.normalize());
      } else {
        this.quaternion.identity();
      }
      this.twistQuaternion.setFromAxisAngle(
        this.up,
        Math.random() * Math.PI * 2
      );
      this.quaternion.multiply(this.twistQuaternion);
    }
    body.qx = this.quaternion.x;
    body.qy = this.quaternion.y;
    body.qz = this.quaternion.z;
    body.qw = this.quaternion.w;
    this.x[slot] = body.x;
    this.y[slot] = body.y;
    this.z[slot] = body.z;
    this.quaternionX[slot] = body.qx;
    this.quaternionY[slot] = body.qy;
    this.quaternionZ[slot] = body.qz;
    this.quaternionW[slot] = body.qw;
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
    let oldestGrounded = -1;
    let oldestAge = -1;
    for (let offset = 0; offset < limit; offset++) {
      const index = (this.cursor + offset) % limit;
      if (this.active[index] === 0) {
        this.cursor = (index + 1) % limit;
        return index;
      }
      if (this.active[index] === 2 && this.groundAge[index]! > oldestAge) {
        oldestGrounded = index;
        oldestAge = this.groundAge[index]!;
      }
    }
    if (oldestGrounded >= 0) this.cursor = (oldestGrounded + 1) % limit;
    return oldestGrounded;
  }
}
