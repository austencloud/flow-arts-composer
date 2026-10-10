import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Mesh,
  MeshPhysicalMaterial,
} from "three";

const CAPACITY = 64;
const VERTICES = 288;
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
    const indices = new Uint16Array(CAPACITY * VERTICES * 6);
    this.geometry.setIndex(
      new BufferAttribute(indices, 1).setUsage(DynamicDrawUsage)
    );
    this.geometry.setDrawRange(0, 0);
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
      // Drops inside an existing pool feed it; landings near its rim keep a
      // lobe of their own so the liquid can spread without moving the old one.
      if (distance < puddle.radius * 0.85 && distance < nearestDistance) {
        nearest = puddle;
        nearestDistance = distance;
      }
    }
    if (nearest) {
      const added = Math.min(volume, MAX_VOLUME - nearest.volume);
      const total = nearest.volume + added;
      if (added > 0) {
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
    const groups = this.connectedGroups();
    if (this.puddles.length === 0) {
      this.mesh.visible = false;
      return;
    }
    this.positions.fill(0);
    this.alphas.fill(0);
    const index = this.geometry.getIndex() as BufferAttribute;
    const triangles = index.array as Uint16Array;
    let vertexStart = 0;
    let indexCount = 0;
    for (const group of groups) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const puddle of group) {
        const reach = puddle.radius * 1.12;
        minX = Math.min(minX, puddle.x - reach);
        maxX = Math.max(maxX, puddle.x + reach);
        minZ = Math.min(minZ, puddle.z - reach);
        maxZ = Math.max(maxZ, puddle.z + reach);
      }
      const width = maxX - minX;
      const depth = maxZ - minZ;
      const budget = group.length * VERTICES;
      const columns = Math.min(
        256,
        Math.max(8, Math.floor(Math.sqrt((budget * width) / depth)))
      );
      const rows = Math.max(8, Math.floor(budget / columns));
      const stepX = width / (columns - 1);
      const stepZ = depth / (rows - 1);
      const edgeWidth = Math.max(stepX, stepZ);
      const averageRadius =
        group.reduce((sum, puddle) => sum + puddle.radius, 0) / group.length;
      const binCount = Math.min(
        columns,
        Math.max(1, Math.ceil(width / averageRadius))
      );
      const bins: Puddle[][] = Array.from({ length: binCount }, () => []);
      const impactSources = group
        .filter((puddle) => puddle.impacts.length > 0)
        .sort(
          (left, right) =>
            left.impacts[left.impacts.length - 1]!.age -
            right.impacts[right.impacts.length - 1]!.age
        )
        .slice(0, 4);
      for (const puddle of group) {
        const first = Math.max(
          0,
          Math.floor(
            ((puddle.x - puddle.radius * 1.2 - minX) / width) * binCount
          )
        );
        const last = Math.min(
          binCount - 1,
          Math.floor(
            ((puddle.x + puddle.radius * 1.2 - minX) / width) * binCount
          )
        );
        for (let bin = first; bin <= last; bin++) bins[bin]!.push(puddle);
      }
      for (let row = 0; row < rows; row++) {
        const vz = minZ + row * stepZ;
        for (let column = 0; column < columns; column++) {
          const vx = minX + column * stepX;
          const candidates =
            bins[
              Math.min(
                binCount - 1,
                Math.floor((column / (columns - 1)) * binCount)
              )
            ]!;
          const vertex = vertexStart + row * columns + column;
          const offset = vertex * 3;
          let field = -Infinity;
          let lift = 0;
          let strongest = group[0]!;
          let strongestField = -Infinity;
          for (const puddle of candidates) {
            const localX = vx - puddle.x;
            const localZ = vz - puddle.z;
            if (
              Math.abs(localX) > puddle.radius * 1.2 ||
              Math.abs(localZ) > puddle.radius * 1.2
            )
              continue;
            const angle = Math.atan2(localZ, localX);
            const reach =
              puddle.radius *
              (1 +
                0.055 * Math.sin(angle * 3 + puddle.seed * 1.7) +
                0.035 * Math.sin(angle * 5 - puddle.seed * 0.9));
            const local = Math.hypot(localX, localZ) / reach;
            const signed = reach * (1 - local);
            field =
              field === -Infinity
                ? signed
                : this.smoothMax(
                    field,
                    signed,
                    Math.min(reach, puddle.radius) * 0.12
                  );
            const dome = Math.sqrt(Math.max(0, 1 - local ** 4));
            const height = Math.min(
              0.027,
              Math.max(
                0.008,
                (puddle.volume / (Math.PI * puddle.radius ** 2)) * 1.8
              )
            );
            const localLift =
              height * dome * (0.85 + 0.15 * Math.min(1, local));
            lift = this.smoothMax(lift, localLift, 0.002);
            if (signed > strongestField) {
              strongestField = signed;
              strongest = puddle;
            }
          }
          this.positions[offset] = vx;
          let wave = 0;
          if (field > 0) {
            const edgeFade = Math.min(1, field / (averageRadius * 0.125));
            for (const puddle of impactSources)
              wave += this.waveHeight(puddle, vx, vz, edgeFade);
          }
          this.positions[offset + 1] =
            group[0]!.floorY +
            Math.max(
              0.0015,
              0.0015 + lift + Math.min(0.012, Math.max(-0.012, wave))
            );
          this.positions[offset + 2] = vz;
          this.colors[offset] = strongest.color.r;
          this.colors[offset + 1] = strongest.color.g;
          this.colors[offset + 2] = strongest.color.b;
          const fade = Math.min(1, Math.max(0, (18 - strongest.idle) / 3));
          this.alphas[vertex] =
            strongest.alpha *
            fade *
            Math.min(1, Math.max(0, field / edgeWidth));
          this.metalnesses[vertex] = strongest.metalness;
        }
      }
      for (let row = 0; row < rows - 1; row++) {
        for (let column = 0; column < columns - 1; column++) {
          const a = vertexStart + row * columns + column;
          const b = a + 1;
          const c = a + columns;
          const d = c + 1;
          if (
            this.alphas[a] === 0 &&
            this.alphas[b] === 0 &&
            this.alphas[c] === 0 &&
            this.alphas[d] === 0
          )
            continue;
          triangles[indexCount++] = a;
          triangles[indexCount++] = c;
          triangles[indexCount++] = b;
          triangles[indexCount++] = b;
          triangles[indexCount++] = c;
          triangles[indexCount++] = d;
        }
      }
      vertexStart += columns * rows;
    }
    this.geometry.setDrawRange(0, indexCount);
    index.count = indexCount;
    index.needsUpdate = true;
    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.getAttribute("color").needsUpdate = true;
    this.geometry.getAttribute("aAlpha").needsUpdate = true;
    this.geometry.getAttribute("aMetalness").needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.getAttribute("normal").needsUpdate = true;
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
    edgeFade: number
  ): number {
    if (edgeFade <= 0) return 0;
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
    return Math.min(0.012, Math.max(-0.012, height)) * edgeFade;
  }

  private smoothMax(a: number, b: number, width: number): number {
    const overlap = Math.max(0, width - Math.abs(a - b)) / width;
    return Math.max(a, b) + overlap * overlap * width * 0.25;
  }

  private connectedGroups(): Puddle[][] {
    const groups: Puddle[][] = [];
    const visited = new Uint8Array(this.puddles.length);
    for (let start = 0; start < this.puddles.length; start++) {
      if (visited[start]) continue;
      visited[start] = 1;
      const group = [this.puddles[start]!];
      for (let cursor = 0; cursor < group.length; cursor++) {
        const first = group[cursor]!;
        for (let index = 0; index < this.puddles.length; index++) {
          if (visited[index]) continue;
          const second = this.puddles[index]!;
          if (
            Math.abs(first.floorY - second.floorY) > 0.01 ||
            Math.hypot(first.x - second.x, first.z - second.z) >=
              (first.radius + second.radius) * 0.98
          )
            continue;
          visited[index] = 1;
          group.push(second);
        }
      }
      groups.push(group);
    }
    return groups;
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
