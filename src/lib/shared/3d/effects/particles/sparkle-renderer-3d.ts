import { Object3D, PlaneGeometry } from "three";
import {
  ParticleInstancePool3D,
  type ParticleInstanceWrite,
} from "../instancing/particle-instance-pool-3d";
import {
  setRgbFromHex,
  setRgbFromHsl,
  type MutableRgb,
} from "../instancing/particle-color";
import type { SparkleTipSource3D } from "../scene-effects/scene-effect-source-3d";
import {
  createSparkleTextureAtlas3D,
  SPARKLE_UV,
} from "./sparkle-texture-atlas-3d";

const CAPACITY = 2048;
const BASE_SPAWN_RATE = 24;
const TAU = Math.PI * 2;

export class SparkleRenderer3D {
  private readonly texture = createSparkleTextureAtlas3D();
  private readonly glints = new ParticleInstancePool3D({
    capacity: CAPACITY,
    geometry: new PlaneGeometry(1, 1),
    billboard: true,
    texture: this.texture,
    additive: true,
    renderOrder: 110,
  });
  private readonly cores = new ParticleInstancePool3D({
    capacity: CAPACITY,
    geometry: new PlaneGeometry(1, 1),
    billboard: true,
    texture: this.texture,
    additive: true,
    renderOrder: 111,
  });
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
  private readonly gravity = new Float32Array(CAPACITY);
  private readonly right = new Float32Array(CAPACITY);
  private readonly green = new Float32Array(CAPACITY);
  private readonly left = new Float32Array(CAPACITY);
  private readonly rainbow = new Uint8Array(CAPACITY);
  private readonly hueOffset = new Float32Array(CAPACITY);
  private readonly hero = new Uint8Array(CAPACITY);
  private readonly diagonal = new Uint8Array(CAPACITY);
  private readonly phase = new Float32Array(CAPACITY);
  private readonly frequency = new Float32Array(CAPACITY);
  private readonly accumulators = new Map<number, number>();
  private readonly previous = new Map<
    number,
    { x: number; y: number; z: number }
  >();
  private readonly seenSources = new Set<number>();
  private readonly color: MutableRgb = { right: 1, green: 1, left: 1 };
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
  private clock = 0;

  initialize(parent: Object3D): void {
    this.glints.initialize(parent);
    this.cores.initialize(parent);
  }

  update(sources: readonly SparkleTipSource3D[], delta: number): void {
    const dt = Math.min(Math.max(delta, 0), 1 / 15);
    this.clock += dt;
    this.seenSources.clear();
    for (const source of sources) {
      this.seenSources.add(source.sourceId);
      this.emit(source, dt);
    }
    for (const sourceId of this.previous.keys()) {
      if (!this.seenSources.has(sourceId)) {
        this.previous.delete(sourceId);
        this.accumulators.delete(sourceId);
      }
    }
    this.glints.beginFrame();
    this.cores.beginFrame();
    for (let index = 0; index < CAPACITY; index++) {
      if (this.active[index] === 0) continue;
      this.age[index]! += dt;
      if (this.age[index]! >= this.maxAge[index]!) {
        this.active[index] = 0;
        continue;
      }
      this.vy[index]! -= this.gravity[index]! * dt;
      this.x[index]! += this.vx[index]! * dt;
      this.y[index]! += this.vy[index]! * dt;
      this.z[index]! += this.vz[index]! * dt;
      const life = this.age[index]! / this.maxAge[index]!;
      const envelope =
        Math.min(1, (1 - life) * 5) * Math.min(1, (life + 0.02) * 12);
      const twinkle =
        0.64 +
        0.36 *
          Math.sin(this.clock * this.frequency[index]! + this.phase[index]!);
      const isHero = this.hero[index] === 1;
      // A broad, transparent sprite holds a much smaller luminous center.
      const size =
        this.size[index]! * (isHero ? 4.1 : 1.8) * (0.8 + 0.2 * twinkle);
      if (this.rainbow[index] === 1) {
        setRgbFromHsl(
          this.color,
          this.clock * 60 + this.hueOffset[index]!,
          0.8,
          0.6
        );
      } else {
        this.color.right = this.right[index]!;
        this.color.green = this.green[index]!;
        this.color.left = this.left[index]!;
      }
      const write = this.writeState;
      write.x = this.x[index]!;
      write.y = this.y[index]!;
      write.z = this.z[index]!;
      write.scaleX = size;
      write.scaleY = size;
      write.scaleZ = 1;
      write.right = this.color.right;
      write.green = this.color.green;
      write.left = this.color.left;
      write.alpha = envelope * (isHero ? 1.1 : 0.8) * twinkle;
      const uv = SPARKLE_UV[isHero ? this.diagonal[index]! : 2]!;
      write.uvX = uv[0];
      write.uvY = uv[1];
      write.uvWidth = 0.5;
      write.uvHeight = 0.5;
      this.glints.write(write);
      if (isHero) {
        write.right = 1;
        write.green = 1;
        write.left = 1;
        write.alpha = envelope * Math.max(0, (twinkle - 0.35) * 2);
        write.uvX = SPARKLE_UV[3][0];
        write.uvY = SPARKLE_UV[3][1];
        this.cores.write(write);
      }
    }
    this.glints.commit();
    this.cores.commit();
  }

  clear(): void {
    this.active.fill(0);
    this.accumulators.clear();
    this.previous.clear();
    this.seenSources.clear();
    this.glints.clear();
    this.cores.clear();
  }

  dispose(): void {
    this.glints.dispose();
    this.cores.dispose();
    this.texture.dispose();
  }

  private emit(source: SparkleTipSource3D, dt: number): void {
    const params = source.params;
    const rateScale = source.tipIndex === 0 ? 1 : 0.7;
    const start = this.previous.get(source.sourceId) ?? source.position;
    const distanceMoved = Math.hypot(
      source.position.x - start.x,
      source.position.y - start.y,
      source.position.z - start.z
    );
    const interpolate = distanceMoved < Math.max(0.5, params.worldSpread * 5);
    const initial = this.accumulators.get(source.sourceId) ?? 0;
    const added = dt * BASE_SPAWN_RATE * params.rate * rateScale;
    let accumulator = initial + added;
    let emitted = 0;
    while (accumulator >= 1) {
      const slot = this.takeSlot();
      if (slot < 0) {
        accumulator = Math.min(accumulator, 1);
        break;
      }
      const fraction =
        added > 0
          ? Math.max(0, Math.min(1, (1 - initial + emitted) / added))
          : 1;
      const originX = interpolate
        ? start.x + (source.position.x - start.x) * fraction
        : source.position.x;
      const originY = interpolate
        ? start.y + (source.position.y - start.y) * fraction
        : source.position.y;
      const originZ = interpolate
        ? start.z + (source.position.z - start.z) * fraction
        : source.position.z;
      const theta = Math.random() * TAU;
      const phi = Math.acos(2 * Math.random() - 1);
      const distance = Math.random() * params.worldSpread;
      const dx = distance * Math.sin(phi) * Math.cos(theta);
      const dy = distance * Math.sin(phi) * Math.sin(theta);
      const dz = distance * Math.cos(phi);
      const length = Math.hypot(dx, dy, dz) || 1;
      const speed =
        (params.worldSpread / params.lifetime) * (1 + Math.random());
      this.active[slot] = 1;
      this.x[slot] = originX + dx;
      this.y[slot] = originY + dy;
      this.z[slot] = originZ + dz;
      this.vx[slot] = (dx / length) * speed;
      this.vy[slot] = (dy / length) * speed + speed * 0.5;
      this.vz[slot] = (dz / length) * speed;
      this.age[slot] = 0;
      this.maxAge[slot] = params.lifetime * (0.6 + Math.random() * 0.8);
      this.hero[slot] = Math.random() < 0.28 ? 1 : 0;
      this.diagonal[slot] = Math.random() < 0.5 ? 1 : 0;
      this.size[slot] =
        params.baseRadius *
        (this.hero[slot]
          ? 0.65 + Math.random() * 0.6
          : 0.35 + Math.random() * 0.5);
      this.gravity[slot] = params.worldGravity;
      this.phase[slot] = Math.random() * TAU;
      this.frequency[slot] = 8 + Math.random() * 14;
      this.rainbow[slot] = params.colorMode === "rainbow" ? 1 : 0;
      this.hueOffset[slot] =
        source.propIndex * 180 + source.tipIndex * 90 + Math.random() * 40;
      const paletteColor =
        params.colorMode === "palette" && params.palette.length > 0
          ? params.palette[Math.floor(Math.random() * params.palette.length)]!
          : params.color;
      setRgbFromHex(this.color, paletteColor);
      this.right[slot] = this.color.right;
      this.green[slot] = this.color.green;
      this.left[slot] = this.color.left;
      accumulator -= 1;
      emitted++;
    }
    this.accumulators.set(source.sourceId, accumulator);
    this.previous.set(source.sourceId, { ...source.position });
  }

  private takeSlot(): number {
    for (let offset = 0; offset < CAPACITY; offset++) {
      const index = (this.cursor + offset) % CAPACITY;
      if (this.active[index] === 0) {
        this.cursor = (index + 1) % CAPACITY;
        return index;
      }
    }
    return -1;
  }
}
