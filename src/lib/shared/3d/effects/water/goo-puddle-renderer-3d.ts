import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Mesh,
  MeshPhysicalMaterial,
} from "three";

const CAPACITY = 64;
const SIDES = 32;
const RINGS = 9;
const VERTICES = SIDES * RINGS;
const MAX_VOLUME = 0.025;
const MAX_IMPACTS = 4;
const IMPACT_LIFETIME = 2.2;

interface Impact {
  x: number;
  z: number;
  age: number;
  amplitude: number;
}

interface Puddle {
  x: number;
  z: number;
  floorY: number;
  volume: number;
  radius: number;
  viscosity: number;
  tension: number;
  idle: number;
  color: Color;
  metalness: number;
  alpha: number;
  seed: number;
  impacts: Impact[];
}

/** One dynamic mesh keeps ground liquid glossy without a draw call per bead. */
export class GooPuddleRenderer3D {
  readonly geometry = new BufferGeometry();
  readonly mesh: Mesh;
  private readonly puddles: Puddle[] = [];
  private readonly positions = new Float32Array(CAPACITY * VERTICES * 3);
  private readonly colors = new Float32Array(CAPACITY * VERTICES * 3);
  private readonly alphas = new Float32Array(CAPACITY * VERTICES);
  private readonly metalnesses = new Float32Array(CAPACITY * VERTICES);
  private readonly material: MeshPhysicalMaterial;

  constructor(material: MeshPhysicalMaterial) {
    const indices = new Uint16Array(CAPACITY * SIDES * (3 + (RINGS - 2) * 6));
    let cursor = 0;
    for (let pool = 0; pool < CAPACITY; pool++) {
      const base = pool * VERTICES;
      for (let ring = 0; ring < RINGS - 1; ring++) {
        for (let side = 0; side < SIDES; side++) {
          const a = base + ring * SIDES + side;
          const b = base + ring * SIDES + ((side + 1) % SIDES);
          const outer = a + SIDES;
          const nextOuter = b + SIDES;
          if (ring === 0) {
            indices[cursor++] = a;
            indices[cursor++] = nextOuter;
            indices[cursor++] = outer;
          } else {
            indices[cursor++] = a;
            indices[cursor++] = b;
            indices[cursor++] = outer;
            indices[cursor++] = b;
            indices[cursor++] = nextOuter;
            indices[cursor++] = outer;
          }
        }
      }
    }
    this.geometry.setIndex(new BufferAttribute(indices, 1));
    this.geometry.setAttribute(
      "position",
      new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage)
    );
    this.geometry.setAttribute(
      "color",
      new BufferAttribute(this.colors, 3).setUsage(DynamicDrawUsage)
    );
    this.geometry.setAttribute(
      "aAlpha",
      new BufferAttribute(this.alphas, 1).setUsage(DynamicDrawUsage)
    );
    this.geometry.setAttribute(
      "aMetalness",
      new BufferAttribute(this.metalnesses, 1).setUsage(DynamicDrawUsage)
    );
    this.geometry.setAttribute(
      "normal",
      new BufferAttribute(new Float32Array(this.positions.length), 3).setUsage(
        DynamicDrawUsage
      )
    );
    this.material = material.clone();
    // Three does not clone shader hooks. Keep the per-vertex opacity and metalness
    // used by the shared wet material while letting the liquid have its own shine.
    this.material.onBeforeCompile = material.onBeforeCompile;
    this.material.roughness = 0.11;
    this.material.clearcoat = 1;
    this.material.clearcoatRoughness = 0.07;
    this.material.envMapIntensity = 1.25;
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 101;
    this.mesh.visible = false;
  }

  deposit(
    x: number,
    z: number,
    floorY: number,
    beadRadius: number,
    viscosity: number,
    tension: number,
    color: Color,
    metalness: number,
    alpha: number,
    impactSpeed = 1
  ): void {
    if (![x, z, floorY, beadRadius].every(Number.isFinite) || beadRadius <= 0)
      return;
    viscosity = Number.isFinite(viscosity)
      ? Math.min(1, Math.max(0, viscosity))
      : 0;
    tension = Number.isFinite(tension)
      ? Math.min(1, Math.max(0, tension))
      : 0.5;
    const volume = Math.min(MAX_VOLUME, Math.max(0.000001, beadRadius ** 3));
    const incomingRadius = Math.cbrt(volume) * 1.8;
    let nearest: Puddle | undefined;
    let nearestDistance = Infinity;
    for (const puddle of this.puddles) {
      if (Math.abs(puddle.floorY - floorY) > 0.01) continue;
      const distance = Math.hypot(puddle.x - x, puddle.z - z);
      if (
        distance < (puddle.radius + incomingRadius) * 0.9 &&
        distance < nearestDistance
      ) {
        nearest = puddle;
        nearestDistance = distance;
      }
    }
    if (nearest) {
      const added = Math.min(volume, MAX_VOLUME - nearest.volume);
      const total = nearest.volume + added;
      if (added > 0) {
        nearest.x = (nearest.x * nearest.volume + x * added) / total;
        nearest.z = (nearest.z * nearest.volume + z * added) / total;
        nearest.color.lerp(color, added / total);
        nearest.viscosity += (viscosity - nearest.viscosity) * (added / total);
        nearest.tension += (tension - nearest.tension) * (added / total);
        nearest.volume = total;
      }
      nearest.radius = Math.max(
        nearest.radius,
        Math.cbrt(nearest.volume) * 1.25
      );
      nearest.idle = 0;
      nearest.alpha = alpha;
      nearest.metalness = metalness;
      this.addImpact(nearest, x, z, beadRadius, impactSpeed);
      return;
    }
    if (this.puddles.length === CAPACITY) this.puddles.shift();
    const puddle: Puddle = {
      x,
      z,
      floorY,
      volume,
      radius: incomingRadius * 0.68,
      viscosity,
      tension,
      idle: 0,
      color: color.clone(),
      metalness,
      alpha,
      seed: Math.sin(x * 12.9898 + z * 78.233 + floorY * 37.719),
      impacts: [],
    };
    this.addImpact(puddle, x, z, beadRadius, impactSpeed);
    this.puddles.push(puddle);
  }

  update(delta: number): void {
    const dt = Number.isFinite(delta) ? Math.max(delta, 0) : 0;
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const puddle = this.puddles[i]!;
      puddle.idle += dt;
      for (
        let impactIndex = puddle.impacts.length - 1;
        impactIndex >= 0;
        impactIndex--
      ) {
        const impact = puddle.impacts[impactIndex]!;
        impact.age += dt;
        if (impact.age >= IMPACT_LIFETIME)
          puddle.impacts.splice(impactIndex, 1);
      }
      const target =
        Math.cbrt(puddle.volume) * (1.8 + 0.35 * (1 - puddle.tension));
      puddle.radius +=
        (target - puddle.radius) *
        (1 - Math.exp(-(1.8 - 1.45 * puddle.viscosity) * dt));
      if (puddle.idle > 18) this.puddles.splice(i, 1);
    }
    this.coalesce();
    if (this.puddles.length === 0) {
      this.mesh.visible = false;
      return;
    }
    this.positions.fill(0);
    this.alphas.fill(0);
    for (let pool = 0; pool < this.puddles.length; pool++) {
      const puddle = this.puddles[pool]!;
      const height = Math.min(
        0.027,
        Math.max(0.008, (puddle.volume / (Math.PI * puddle.radius ** 2)) * 1.8)
      );
      for (let ring = 0; ring < RINGS; ring++) {
        const fraction = ring / (RINGS - 1);
        // The lip curls down to the floor while the center remains gently domed.
        const dome = Math.sqrt(Math.max(0, 1 - fraction ** 4));
        const lift = 0.0015 + height * dome * (0.85 + 0.15 * fraction);
        for (let side = 0; side < SIDES; side++) {
          const angle = (side * Math.PI * 2) / SIDES;
          const irregularity =
            1 +
            0.055 * Math.sin(angle * 3 + puddle.seed * 1.7) +
            0.035 * Math.sin(angle * 5 - puddle.seed * 0.9);
          const radial = puddle.radius * fraction * irregularity;
          const vx = puddle.x + Math.cos(angle) * radial;
          const vz = puddle.z + Math.sin(angle) * radial;
          const vertex = pool * VERTICES + ring * SIDES + side;
          const offset = vertex * 3;
          this.positions[offset] = vx;
          this.positions[offset + 1] =
            puddle.floorY +
            Math.max(0.0015, lift + this.waveHeight(puddle, vx, vz, fraction));
          this.positions[offset + 2] = vz;
          this.colors[offset] = puddle.color.r;
          this.colors[offset + 1] = puddle.color.g;
          this.colors[offset + 2] = puddle.color.b;
          const fade = Math.min(1, Math.max(0, (18 - puddle.idle) / 3));
          this.alphas[vertex] =
            puddle.alpha * fade * (ring === RINGS - 1 ? 0.94 : 1);
          this.metalnesses[vertex] = puddle.metalness;
        }
      }
    }
    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.getAttribute("color").needsUpdate = true;
    this.geometry.getAttribute("aAlpha").needsUpdate = true;
    this.geometry.getAttribute("aMetalness").needsUpdate = true;
    this.geometry.computeVertexNormals();
    const normals = this.geometry.getAttribute("normal") as BufferAttribute;
    for (let pool = 0; pool < this.puddles.length; pool++) {
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (let side = 0; side < SIDES; side++) {
        const vertex = pool * VERTICES + side;
        nx += normals.getX(vertex);
        ny += normals.getY(vertex);
        nz += normals.getZ(vertex);
      }
      const length = Math.hypot(nx, ny, nz) || 1;
      for (let side = 0; side < SIDES; side++) {
        normals.setXYZ(
          pool * VERTICES + side,
          nx / length,
          ny / length,
          nz / length
        );
      }
    }
    normals.needsUpdate = true;
    this.mesh.visible = true;
  }

  private addImpact(
    puddle: Puddle,
    x: number,
    z: number,
    radius: number,
    speed: number
  ): void {
    const limitedSpeed = Number.isFinite(speed)
      ? Math.min(8, Math.max(0, speed))
      : 0;
    if (limitedSpeed < 0.15) return;
    if (puddle.impacts.length === MAX_IMPACTS) puddle.impacts.shift();
    puddle.impacts.push({
      x,
      z,
      age: 0,
      amplitude: Math.min(
        0.012,
        Math.max(0.0045, radius * (0.07 + 0.035 * limitedSpeed))
      ),
    });
  }

  private waveHeight(
    puddle: Puddle,
    x: number,
    z: number,
    fraction: number
  ): number {
    if (fraction >= 1) return 0;
    let height = 0;
    for (const impact of puddle.impacts) {
      const distance = Math.hypot(x - impact.x, z - impact.z);
      const front = impact.age * (0.28 + 0.25 * (1 - puddle.viscosity));
      const width = Math.max(0.03, puddle.radius * 0.23);
      const phase = (distance - front) / width;
      const envelope = Math.exp(-1.1 * phase * phase);
      const decay = Math.exp(-(1.4 + 3.4 * puddle.viscosity) * impact.age);
      height += impact.amplitude * Math.cos(phase * Math.PI) * envelope * decay;
    }
    return (
      Math.min(0.012, Math.max(-0.012, height)) *
      Math.min(1, (1 - fraction) * 8)
    );
  }

  private coalesce(): void {
    for (let a = 0; a < this.puddles.length; a++) {
      const first = this.puddles[a]!;
      for (let b = a + 1; b < this.puddles.length; ) {
        const second = this.puddles[b]!;
        if (
          Math.abs(first.floorY - second.floorY) > 0.01 ||
          Math.hypot(first.x - second.x, first.z - second.z) >
            (first.radius + second.radius) * 0.82
        ) {
          b++;
          continue;
        }
        const combined = first.volume + second.volume;
        first.x =
          (first.x * first.volume + second.x * second.volume) / combined;
        first.z =
          (first.z * first.volume + second.z * second.volume) / combined;
        first.color.lerp(second.color, second.volume / combined);
        first.viscosity +=
          (second.viscosity - first.viscosity) * (second.volume / combined);
        first.tension +=
          (second.tension - first.tension) * (second.volume / combined);
        first.metalness +=
          (second.metalness - first.metalness) * (second.volume / combined);
        first.alpha +=
          (second.alpha - first.alpha) * (second.volume / combined);
        first.volume = Math.min(MAX_VOLUME, combined);
        first.radius = Math.max(
          first.radius,
          second.radius,
          Math.cbrt(first.volume) * 1.25
        );
        first.idle = Math.min(first.idle, second.idle);
        first.impacts = [...first.impacts, ...second.impacts]
          .sort((left, right) => right.age - left.age)
          .slice(-MAX_IMPACTS);
        this.puddles.splice(b, 1);
      }
    }
  }

  clear(): void {
    this.puddles.length = 0;
    this.mesh.visible = false;
    this.positions.fill(0);
    this.geometry.getAttribute("position").needsUpdate = true;
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
