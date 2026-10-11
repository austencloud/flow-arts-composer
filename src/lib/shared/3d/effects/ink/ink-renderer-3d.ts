import {
  Mesh,
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
import {
  InkStrokeGeometry3D,
  type InkStrokeFrame3D,
} from "./ink-stroke-geometry-3d";
import { createInkStrokeMaterial3D } from "./ink-stroke-material-3d";

const DROPLET_CAPACITY = 1024;
const PATH_CAPACITY = 96;
const RING_CAPACITY = 4096;
const UP = new Vector3(0, 1, 0);

interface InkStrokeState extends InkStrokeFrame3D {
  path: BoundedSourcePath3D;
  params: Ink3DParams;
  lastSeen: number;
  seenEpoch: number;
  lastSpeed: number;
  dropletAccumulator: number;
}

export class InkRenderer3D {
  private readonly stroke = new InkStrokeGeometry3D();
  private readonly strokeMaterials = [
    createInkStrokeMaterial3D(),
    createInkStrokeMaterial3D(true),
  ];
  private readonly strokeMesh = new Mesh(
    this.stroke.geometry,
    this.strokeMaterials
  );
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
  private parent: Object3D | null = null;

  constructor() {
    this.strokeMesh.frustumCulled = false;
    this.strokeMesh.renderOrder = 104;
  }

  initialize(parent: Object3D): void {
    if (this.parent !== parent) {
      this.parent?.remove(this.strokeMesh);
      this.parent = parent;
      parent.add(this.strokeMesh);
    }
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
          headSideX: 0,
          headSideY: 0,
          headSideZ: 1,
          hasHeadSide: false,
        };
        this.states.set(source.sourceId, state);
      }
      state.params = source.params;
      state.lastSeen = this.clock;
      state.seenEpoch = this.epoch;
      if (state.path.count > 0) {
        const newest = state.path.indexFromNewest(0);
        if (
          Math.hypot(
            source.position.x - state.path.xAt(newest),
            source.position.y - state.path.yAt(newest),
            source.position.z - state.path.zAt(newest)
          ) > 1.25
        ) {
          state.path.clear();
          state.hasHeadSide = false;
        }
      }
      state.path.push(source.position, this.clock, source.speed, 0.018);
      this.emitDroplets(state, source, dt);
      state.lastSpeed = source.speed;
    }

    this.stroke.beginFrame();
    let activeCount = 0;
    for (const state of this.states.values()) {
      if (state.path.count >= 2) activeCount++;
    }
    const ringBudget = Math.max(
      4,
      Math.floor(RING_CAPACITY / Math.max(1, activeCount))
    );
    for (const [sourceId, state] of this.states) {
      state.path.trimBefore(this.clock - state.params.lifetimeSeconds);
      this.stroke.writeStroke(
        state.path,
        state.params,
        this.clock,
        ringBudget,
        state
      );
      if (
        state.seenEpoch !== this.epoch &&
        state.path.count === 0 &&
        this.clock - state.lastSeen > state.params.lifetimeSeconds
      ) {
        this.states.delete(sourceId);
      }
    }
    this.stroke.commit();
    this.strokeMesh.visible = this.stroke.drawCount > 0;
    this.updateDroplets(dt);
  }

  clear(): void {
    this.states.clear();
    this.active.fill(0);
    this.stroke.clear();
    this.strokeMesh.visible = false;
    this.dropletNormal.clear();
    this.dropletEmissive.clear();
  }

  dispose(): void {
    this.clear();
    this.parent?.remove(this.strokeMesh);
    this.parent = null;
    this.stroke.dispose();
    for (const material of this.strokeMaterials) material.dispose();
    this.dropletNormal.dispose();
    this.dropletEmissive.dispose();
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
      const spread = 0.08 + params.splatterIntensity * 0.28;
      this.active[slot] = 1;
      this.x[slot] = source.position.x;
      this.y[slot] = source.position.y;
      this.z[slot] = source.position.z;
      this.vx[slot] = source.velocity.x * 0.16 + (Math.random() - 0.5) * spread;
      this.vy[slot] =
        source.velocity.y * 0.16 + (Math.random() - 0.25) * spread;
      this.vz[slot] = source.velocity.z * 0.16 + (Math.random() - 0.5) * spread;
      this.age[slot] = 0;
      this.lifetime[slot] = 0.45 + Math.random() * 0.7;
      this.size[slot] = Math.min(
        0.017,
        params.strokeWidthMinWorld *
          (0.12 + Math.random() * 0.28) *
          (0.5 + params.intensity * 0.5)
      );
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
      this.direction.set(this.vx[index]!, this.vy[index]!, this.vz[index]!);
      const speed = this.direction.length();
      if (speed > 1e-5) {
        this.direction.multiplyScalar(1 / speed);
        this.orientation.setFromUnitVectors(UP, this.direction);
      } else this.orientation.identity();
      write.scaleX = this.size[index]! * 0.64;
      write.scaleY = this.size[index]! * Math.min(2.6, 1.3 + speed * 0.7);
      write.scaleZ = this.size[index]! * 0.64;
      write.quaternionX = this.orientation.x;
      write.quaternionY = this.orientation.y;
      write.quaternionZ = this.orientation.z;
      write.quaternionW = this.orientation.w;
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
