import {
  CylinderGeometry,
  type Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import {
  ParticleInstancePool3D,
  type ParticleInstanceWrite,
} from "../instancing/particle-instance-pool-3d";
import { setRgbFromHex, type MutableRgb } from "../instancing/particle-color";
import { BoundedSourcePath3D } from "../scene-effects/bounded-source-path-3d";
import {
  isTrackedTip,
  type InkTipSource3D,
} from "../scene-effects/scene-effect-source-3d";
import type { Ink3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";

const SEGMENT_CAPACITY = 4096;
const DROPLET_CAPACITY = 1024;
const PATH_CAPACITY = 96;
const UP = new Vector3(0, 1, 0);

interface InkStrokeState {
  path: BoundedSourcePath3D;
  params: Ink3DParams;
  lastSeen: number;
  seenEpoch: number;
  lastSpeed: number;
  dropletAccumulator: number;
}

export class InkRenderer3D {
  private readonly segmentNormal = new ParticleInstancePool3D({
    capacity: SEGMENT_CAPACITY,
    geometry: new CylinderGeometry(1, 1, 1, 8, 1),
    renderOrder: 104,
  });
  private readonly segmentEmissive = new ParticleInstancePool3D({
    capacity: SEGMENT_CAPACITY,
    geometry: new CylinderGeometry(1, 1, 1, 8, 1),
    additive: true,
    renderOrder: 105,
  });
  private readonly dropletNormal = new ParticleInstancePool3D({
    capacity: DROPLET_CAPACITY,
    geometry: new SphereGeometry(1, 7, 6),
    renderOrder: 106,
  });
  private readonly dropletEmissive = new ParticleInstancePool3D({
    capacity: DROPLET_CAPACITY,
    geometry: new SphereGeometry(1, 7, 6),
    additive: true,
    renderOrder: 107,
  });
  private readonly states = new Map<number, InkStrokeState>();
  private readonly active = new Uint8Array(DROPLET_CAPACITY);
  private readonly x = new Float32Array(DROPLET_CAPACITY);
  private readonly y = new Float32Array(DROPLET_CAPACITY);
  private readonly z = new Float32Array(DROPLET_CAPACITY);
  private readonly vx = new Float32Array(DROPLET_CAPACITY);
  private readonly vy = new Float32Array(DROPLET_CAPACITY);
  private readonly vz = new Float32Array(DROPLET_CAPACITY);
  private readonly age = new Float32Array(DROPLET_CAPACITY);
  private readonly lifetime = new Float32Array(DROPLET_CAPACITY);
  private readonly size = new Float32Array(DROPLET_CAPACITY);
  private readonly right = new Float32Array(DROPLET_CAPACITY);
  private readonly green = new Float32Array(DROPLET_CAPACITY);
  private readonly left = new Float32Array(DROPLET_CAPACITY);
  private readonly emissive = new Uint8Array(DROPLET_CAPACITY);
  private readonly direction = new Vector3();
  private readonly orientation = new Quaternion();
  private readonly pigment: MutableRgb = { right: 1, green: 1, left: 1 };
  private readonly edge: MutableRgb = { right: 1, green: 1, left: 1 };
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
  private clock = 0;
  private epoch = 0;
  private cursor = 0;

  initialize(parent: Object3D): void {
    this.segmentNormal.initialize(parent);
    this.segmentEmissive.initialize(parent);
    this.dropletNormal.initialize(parent);
    this.dropletEmissive.initialize(parent);
  }

  update(sources: readonly InkTipSource3D[], delta: number): void {
    const dt = Math.min(Math.max(delta, 0), 1 / 15);
    this.clock += dt;
    this.epoch++;

    for (const source of sources) {
      if (!isTrackedTip(source.params.trackingMode, source.tipIndex)) continue;
      let state = this.states.get(source.sourceId);
      if (!state) {
        state = {
          path: new BoundedSourcePath3D(PATH_CAPACITY),
          params: source.params,
          lastSeen: this.clock,
          seenEpoch: this.epoch,
          lastSpeed: source.speed,
          dropletAccumulator: 0,
        };
        this.states.set(source.sourceId, state);
      }
      state.params = source.params;
      state.lastSeen = this.clock;
      state.seenEpoch = this.epoch;
      state.path.push(source.position, this.clock, source.speed, 0.018);
      this.emitDroplets(state, source, dt);
      state.lastSpeed = source.speed;
    }

    this.segmentNormal.beginFrame();
    this.segmentEmissive.beginFrame();
    for (const [sourceId, state] of this.states) {
      state.path.trimBefore(this.clock - state.params.lifetimeSeconds);
      this.writeStroke(sourceId, state);
      if (
        state.seenEpoch !== this.epoch &&
        state.path.count === 0 &&
        this.clock - state.lastSeen > state.params.lifetimeSeconds
      ) {
        this.states.delete(sourceId);
      }
    }
    this.segmentNormal.commit();
    this.segmentEmissive.commit();
    this.updateDroplets(dt);
  }

  clear(): void {
    this.states.clear();
    this.active.fill(0);
    this.segmentNormal.clear();
    this.segmentEmissive.clear();
    this.dropletNormal.clear();
    this.dropletEmissive.clear();
  }

  dispose(): void {
    this.segmentNormal.dispose();
    this.segmentEmissive.dispose();
    this.dropletNormal.dispose();
    this.dropletEmissive.dispose();
  }

  private writeStroke(sourceId: number, state: InkStrokeState): void {
    const { path, params } = state;
    if (path.count < 2) return;
    setRgbFromHex(this.pigment, params.resolvedPalette.pigment);
    setRgbFromHex(this.edge, params.resolvedPalette.edge);
    const pool = params.emissiveMaterial
      ? this.segmentEmissive
      : this.segmentNormal;
    const maxSegments = Math.min(path.count - 1, params.maxPointsPerTip - 1);

    for (let offset = 0; offset < maxSegments; offset++) {
      const newer = path.indexFromNewest(offset);
      const older = path.indexFromNewest(offset + 1);
      const age = this.clock - path.birthAt(newer);
      const life = Math.min(1, age / params.lifetimeSeconds);
      const speedScale = Math.min(
        1,
        path.speedAt(newer) / params.motionReferenceSpeed
      );
      const breakup = params.viscosity * speedScale;
      const hash = Math.abs(Math.sin(sourceId * 12.9898 + offset * 78.233));
      if (breakup > 0.35 && hash < (breakup - 0.35) * 0.32) continue;

      const radius =
        (params.strokeWidthMaxWorld +
          (params.strokeWidthMinWorld - params.strokeWidthMaxWorld) *
            speedScale) *
        (0.45 + params.intensity * 0.55);
      const alpha =
        params.opacityMax *
        params.intensity *
        Math.pow(1 - life, params.resolvedPalette.watercolor ? 1.45 : 0.7);
      this.writeSegment(
        pool,
        path.xAt(older),
        path.yAt(older),
        path.zAt(older),
        path.xAt(newer),
        path.yAt(newer),
        path.zAt(newer),
        radius * 1.34,
        this.edge,
        alpha * 0.32
      );
      this.writeSegment(
        pool,
        path.xAt(older),
        path.yAt(older),
        path.zAt(older),
        path.xAt(newer),
        path.yAt(newer),
        path.zAt(newer),
        radius,
        this.pigment,
        alpha
      );
    }
  }

  private writeSegment(
    pool: ParticleInstancePool3D,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    radius: number,
    color: MutableRgb,
    alpha: number
  ): void {
    this.direction.set(bx - ax, by - ay, bz - az);
    const length = this.direction.length();
    if (length < 1e-5 || alpha < 0.004) return;
    this.direction.multiplyScalar(1 / length);
    this.orientation.setFromUnitVectors(UP, this.direction);
    const write = this.writeState;
    write.x = (ax + bx) * 0.5;
    write.y = (ay + by) * 0.5;
    write.z = (az + bz) * 0.5;
    write.scaleX = radius;
    write.scaleY = length;
    write.scaleZ = radius;
    write.quaternionX = this.orientation.x;
    write.quaternionY = this.orientation.y;
    write.quaternionZ = this.orientation.z;
    write.quaternionW = this.orientation.w;
    write.right = color.right;
    write.green = color.green;
    write.left = color.left;
    write.alpha = alpha;
    pool.write(write);
  }

  private emitDroplets(
    state: InkStrokeState,
    source: InkTipSource3D,
    dt: number
  ): void {
    const params = source.params;
    const speedEnergy = Math.min(1, source.speed / params.motionReferenceSpeed);
    const acceleration = Math.min(
      1,
      Math.abs(source.speed - state.lastSpeed) / Math.max(dt * 12, 0.001)
    );
    const rate =
      params.effectiveAmbient * 2 +
      params.motionEmission * speedEnergy * params.viscosity * 7 +
      params.splatterIntensity * acceleration * 18;
    state.dropletAccumulator += rate * dt;
    while (state.dropletAccumulator >= 1) {
      const slot = this.takeDropletSlot();
      if (slot < 0) return;
      const spread = 0.18 + params.splatterIntensity * 0.75;
      this.active[slot] = 1;
      this.x[slot] = source.position.x;
      this.y[slot] = source.position.y;
      this.z[slot] = source.position.z;
      this.vx[slot] = source.velocity.x * 0.22 + (Math.random() - 0.5) * spread;
      this.vy[slot] =
        source.velocity.y * 0.22 + (Math.random() - 0.25) * spread;
      this.vz[slot] = source.velocity.z * 0.22 + (Math.random() - 0.5) * spread;
      this.age[slot] = 0;
      this.lifetime[slot] = 0.45 + Math.random() * 0.7;
      this.size[slot] =
        params.strokeWidthMinWorld *
        (0.8 + Math.random() * 2.6) *
        (0.5 + params.intensity * 0.5);
      setRgbFromHex(this.pigment, params.resolvedPalette.splatterTint);
      this.right[slot] = this.pigment.right;
      this.green[slot] = this.pigment.green;
      this.left[slot] = this.pigment.left;
      this.emissive[slot] = params.emissiveMaterial ? 1 : 0;
      state.dropletAccumulator -= 1;
    }
  }

  private updateDroplets(dt: number): void {
    this.dropletNormal.beginFrame();
    this.dropletEmissive.beginFrame();
    for (let index = 0; index < DROPLET_CAPACITY; index++) {
      if (this.active[index] === 0) continue;
      this.age[index]! += dt;
      if (this.age[index]! >= this.lifetime[index]!) {
        this.active[index] = 0;
        continue;
      }
      this.vy[index]! -= 1.2 * dt;
      this.x[index]! += this.vx[index]! * dt;
      this.y[index]! += this.vy[index]! * dt;
      this.z[index]! += this.vz[index]! * dt;
      const life = this.age[index]! / this.lifetime[index]!;
      const write = this.writeState;
      write.x = this.x[index]!;
      write.y = this.y[index]!;
      write.z = this.z[index]!;
      write.scaleX = this.size[index]!;
      write.scaleY = this.size[index]!;
      write.scaleZ = this.size[index]!;
      write.quaternionX = 0;
      write.quaternionY = 0;
      write.quaternionZ = 0;
      write.quaternionW = 1;
      write.right = this.right[index]!;
      write.green = this.green[index]!;
      write.left = this.left[index]!;
      write.alpha = Math.pow(1 - life, 1.4) * 0.9;
      (this.emissive[index] === 1
        ? this.dropletEmissive
        : this.dropletNormal
      ).write(write);
    }
    this.dropletNormal.commit();
    this.dropletEmissive.commit();
  }

  private takeDropletSlot(): number {
    for (let offset = 0; offset < DROPLET_CAPACITY; offset++) {
      const index = (this.cursor + offset) % DROPLET_CAPACITY;
      if (this.active[index] === 0) {
        this.cursor = (index + 1) % DROPLET_CAPACITY;
        return index;
      }
    }
    return -1;
  }
}
