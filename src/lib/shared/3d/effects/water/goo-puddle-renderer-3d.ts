import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Mesh,
  MeshPhysicalMaterial,
  type Texture,
} from "three";

const CAPACITY = 96;
const VERTICES = 288;
const MAX_VOLUME = 0.025;
const MAX_IMPACTS = 4;
const IMPACT_LIFETIME = 2.2;
/** Grid vertices one frame may rebuild across every pool. */
const FRAME_VERTICES = 6000;
const MAX_DYES = 6;
/** Seconds a landing's color takes to spread through its pool. */
const DYE_LIFETIME = 4;

interface Impact {
  x: number;
  z: number;
  age: number;
  amplitude: number;
}

/** Liquid of another color that has landed in a pool and not yet mixed in. */
interface Dye {
  x: number;
  z: number;
  radius: number;
  age: number;
  /** Share of the pool's color this liquid takes once fully mixed. */
  share: number;
  color: Color;
  glow: number;
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
  glow: number;
  dyes: Dye[];
  seed: number;
  /** Length along the travel direction over width; relaxes toward 1. */
  stretch: number;
  dirX: number;
  dirZ: number;
  impacts: Impact[];
  // Per-frame caches for the vertex loop.
  bound: number;
  lobeCos3: number;
  lobeSin3: number;
  lobeCos5: number;
  lobeSin5: number;
  domeHeight: number;
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
  private readonly glows = new Float32Array(CAPACITY * VERTICES);
  private readonly normals = new Float32Array(CAPACITY * VERTICES * 3);
  private readonly waveData = new Float32Array(4 * MAX_IMPACTS * 5);
  private readonly material: MeshPhysicalMaterial;

  constructor(material: MeshPhysicalMaterial, envMap?: Texture) {
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
      "aGlow",
      new BufferAttribute(this.glows, 1).setUsage(DynamicDrawUsage)
    );
    this.geometry.setAttribute(
      "normal",
      new BufferAttribute(this.normals, 3).setUsage(
        DynamicDrawUsage
      )
    );
    this.material = material.clone();
    // Three does not clone shader hooks. Keep the per-vertex opacity and metalness
    // used by the shared wet material while letting the liquid have its own shine.
    this.material.onBeforeCompile = material.onBeforeCompile;
    this.material.roughness = 0.05;
    this.material.clearcoat = 1;
    this.material.clearcoatRoughness = 0.07;
    // A floor film sees the softboxes at grazing angles; keep them as lines,
    // not a pool-wide glare.
    this.material.envMapIntensity = 0.6;
    if (envMap) this.material.envMap = envMap;
    // A flat film has no thick middle, so skip the bead thickness falloff.
    this.material.defines = { ...this.material.defines, GOO_FLAT: "" };
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 101;
    this.mesh.visible = false;
  }

  get count(): number {
    return this.puddles.length;
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
    impactSpeed = 1,
    velocityX = 0,
    velocityZ = 0,
    glow = 0
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
      // Drops inside an existing pool feed it; a comparable landing near its
      // rim keeps a lobe of their own so the liquid can spread without moving
      // the old one. A small bead at the rim just runs into the pool.
      const reach =
        incomingRadius < puddle.radius * 0.6
          ? puddle.radius + incomingRadius * 0.5
          : puddle.radius * 0.85;
      if (distance < reach && distance < nearestDistance) {
        nearest = puddle;
        nearestDistance = distance;
      }
    }
    if (nearest) {
      const added = Math.min(volume, MAX_VOLUME - nearest.volume);
      const total = nearest.volume + added;
      if (added > 0) {
        // The pool's middle drifts a little toward where the liquid arrived.
        const pull = (added / total) * 0.5;
        nearest.x += (x - nearest.x) * pull;
        nearest.z += (z - nearest.z) * pull;
        nearest.volume = total;
      }
      nearest.radius = Math.max(
        nearest.radius,
        Math.cbrt(nearest.volume) * 1.25
      );
      nearest.idle = 0;
      // New liquid keeps mixing in after a pool stops growing: it takes the
      // share of the surface it lands on, so a long run of a new color turns
      // the whole pool.
      const share = Math.min(
        0.4,
        Math.max(added / total, 2.5 * (incomingRadius / nearest.radius) ** 2)
      );
      nearest.viscosity += (viscosity - nearest.viscosity) * share;
      nearest.tension += (tension - nearest.tension) * share;
      nearest.alpha += (alpha - nearest.alpha) * share;
      nearest.metalness += (metalness - nearest.metalness) * share;
      this.addDye(nearest, x, z, incomingRadius, color, glow, share);
      this.addImpact(nearest, x, z, beadRadius, impactSpeed);
      return;
    }
    if (this.puddles.length === CAPACITY) this.evict();
    // Liquid landing on the move smears forward along its travel.
    const travel = Math.hypot(velocityX, velocityZ);
    const stretch = Number.isFinite(travel)
      ? 1 + Math.min(1.2, travel * 0.35) * (1 - 0.5 * viscosity)
      : 1;
    const dirX = travel > 1e-4 ? velocityX / travel : 1;
    const dirZ = travel > 1e-4 ? velocityZ / travel : 0;
    const radius = incomingRadius * 0.68;
    const shift = (stretch - 1) * radius * 0.5;
    const puddle: Puddle = {
      x: x + dirX * shift,
      z: z + dirZ * shift,
      floorY,
      volume,
      radius,
      viscosity,
      tension,
      idle: 0,
      color: color.clone(),
      metalness,
      alpha,
      glow,
      dyes: [],
      seed: Math.sin(x * 12.9898 + z * 78.233 + floorY * 37.719),
      stretch,
      dirX,
      dirZ,
      impacts: [],
      bound: 0,
      lobeCos3: 1,
      lobeSin3: 0,
      lobeCos5: 1,
      lobeSin5: 0,
      domeHeight: 0,
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
      for (let dyeIndex = puddle.dyes.length - 1; dyeIndex >= 0; dyeIndex--) {
        const dye = puddle.dyes[dyeIndex]!;
        const step = Math.min(dt, DYE_LIFETIME - dye.age);
        this.mix(puddle, dye, (dye.share * step) / DYE_LIFETIME);
        dye.age += dt;
        if (dye.age >= DYE_LIFETIME) puddle.dyes.splice(dyeIndex, 1);
      }
      // Liquid that refuses to wet the floor (mercury) gathers into beads.
      const beading = puddle.tension ** 6;
      const target =
        Math.cbrt(puddle.volume) *
        (2.3 + 0.6 * (1 - puddle.tension) - 0.9 * beading);
      const spread = 1 - Math.exp(-(1.8 - 1.45 * puddle.viscosity) * dt);
      puddle.radius += (target - puddle.radius) * spread;
      // Surface tension slowly pulls a smear back toward round.
      puddle.stretch += (1 - puddle.stretch) * spread * 0.25 * (0.5 + puddle.tension);
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
    // One frame's grid shares a vertex budget: a crowded floor gets coarser
    // cells instead of a slower frame.
    let floorArea = 0;
    for (const group of groups) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const puddle of group) {
        const reach = this.reach(puddle);
        minX = Math.min(minX, puddle.x - reach);
        maxX = Math.max(maxX, puddle.x + reach);
        minZ = Math.min(minZ, puddle.z - reach);
        maxZ = Math.max(maxZ, puddle.z + reach);
      }
      floorArea += (maxX - minX) * (maxZ - minZ);
    }
    const sharedCell = Math.sqrt(floorArea / FRAME_VERTICES);
    for (const group of groups) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const puddle of group) {
        const reach = this.reach(puddle);
        minX = Math.min(minX, puddle.x - reach);
        maxX = Math.max(maxX, puddle.x + reach);
        minZ = Math.min(minZ, puddle.z - reach);
        maxZ = Math.max(maxZ, puddle.z + reach);
      }
      const width = maxX - minX;
      const depth = maxZ - minZ;
      const budget = group.length * VERTICES;
      // Size cells to the pools, not their count: a long streak of many
      // overlapping pools needs no more grid than one pool of its area.
      const meanRadius =
        group.reduce((sum, puddle) => sum + puddle.radius, 0) / group.length;
      const cell = Math.max(
        meanRadius / 6,
        0.006,
        sharedCell,
        Math.sqrt((width * depth) / budget)
      );
      const columns = Math.min(256, Math.max(8, Math.ceil(width / cell) + 1));
      const rows = Math.min(
        Math.max(8, Math.floor(budget / columns)),
        Math.max(8, Math.ceil(depth / cell) + 1)
      );
      const stepX = width / (columns - 1);
      const stepZ = depth / (rows - 1);
      const edgeWidth = Math.max(stepX, stepZ);
      const averageRadius =
        group.reduce((sum, puddle) => sum + puddle.radius, 0) / group.length;
      // A thin wet film darkens the floor just past the pool's rim.
      const halo = averageRadius * 0.22;
      // Bin pools on a coarse 2D grid so each vertex tests only its neighbors.
      const binSize = Math.max(averageRadius, Math.sqrt((width * depth) / 1024));
      const binsX = Math.max(1, Math.min(columns, Math.ceil(width / binSize)));
      const binsZ = Math.max(1, Math.min(rows, Math.ceil(depth / binSize)));
      const bins: Puddle[][] = Array.from({ length: binsX * binsZ }, () => []);
      const impactSources = group
        .filter((puddle) => puddle.impacts.length > 0)
        .sort(
          (left, right) =>
            left.impacts[left.impacts.length - 1]!.age -
            right.impacts[right.impacts.length - 1]!.age
        )
        .slice(0, 4);
      const waves = this.liveWaves(impactSources);
      const binOf = (value: number, min: number, span: number, count: number) =>
        Math.max(0, Math.min(count - 1, Math.floor(((value - min) / span) * count)));
      for (const puddle of group) {
        const reach = this.reach(puddle);
        const x0 = binOf(puddle.x - reach, minX, width, binsX);
        const x1 = binOf(puddle.x + reach, minX, width, binsX);
        const z0 = binOf(puddle.z - reach, minZ, depth, binsZ);
        const z1 = binOf(puddle.z + reach, minZ, depth, binsZ);
        for (let bz = z0; bz <= z1; bz++)
          for (let bx = x0; bx <= x1; bx++) bins[bz * binsX + bx]!.push(puddle);
        // Cache the per-pool constants the vertex loop needs.
        puddle.bound = reach;
        puddle.lobeCos3 = Math.cos(puddle.seed * 1.7);
        puddle.lobeSin3 = Math.sin(puddle.seed * 1.7);
        puddle.lobeCos5 = Math.cos(puddle.seed * 0.9);
        puddle.lobeSin5 = Math.sin(puddle.seed * 0.9);
        puddle.domeHeight = Math.min(
          // Liquid on a floor settles a few millimetres deep, so a pool reads
          // as a flat glossy film with a soft meniscus, not a dome.
          0.009 + 0.01 * puddle.tension ** 6,
          Math.max(0.0025, (puddle.volume / (Math.PI * puddle.radius ** 2)) * 1.5)
        );
      }
      for (let row = 0; row < rows; row++) {
        const vz = minZ + row * stepZ;
        const binRow = binOf(vz, minZ, depth, binsZ) * binsX;
        for (let column = 0; column < columns; column++) {
          const vx = minX + column * stepX;
          const candidates = bins[binRow + binOf(vx, minX, width, binsX)]!;
          const vertex = vertexStart + row * columns + column;
          const offset = vertex * 3;
          let field = -Infinity;
          let lift = 0;
          let strongest = group[0]!;
          let strongestField = -Infinity;
          let red = 0;
          let green = 0;
          let blue = 0;
          let glow = 0;
          let weight = 0;
          for (const puddle of candidates) {
            const offsetX = vx - puddle.x;
            const offsetZ = vz - puddle.z;
            const bound = puddle.bound;
            if (Math.abs(offsetX) > bound || Math.abs(offsetZ) > bound)
              continue;
            // Measure in the smear's frame: squeezed along travel, so the
            // same round field reaches further forward and back.
            const along =
              (offsetX * puddle.dirX + offsetZ * puddle.dirZ) / puddle.stretch;
            const across = offsetZ * puddle.dirX - offsetX * puddle.dirZ;
            const localX = along * puddle.dirX - across * puddle.dirZ;
            const localZ = along * puddle.dirZ + across * puddle.dirX;
            // Irregular rim: sin(3a + p) and sin(5a - q) from the direction's
            // cosine and sine, without an atan2 per vertex.
            const distance = Math.hypot(localX, localZ);
            const c = distance > 1e-9 ? localX / distance : 1;
            const s = distance > 1e-9 ? localZ / distance : 0;
            const sin3 = 3 * s - 4 * s * s * s;
            const cos3 = 4 * c * c * c - 3 * c;
            const s2 = s * s;
            const c2 = c * c;
            const sin5 = s * (16 * s2 * s2 - 20 * s2 + 5);
            const cos5 = c * (16 * c2 * c2 - 20 * c2 + 5);
            const reach =
              puddle.radius *
              (1 +
                0.055 * (sin3 * puddle.lobeCos3 + cos3 * puddle.lobeSin3) +
                0.035 * (sin5 * puddle.lobeCos5 - cos5 * puddle.lobeSin5));
            const local = distance / reach;
            const signed = reach * (1 - local);
            field =
              field === -Infinity
                ? signed
                : this.smoothMax(
                    field,
                    signed,
                    Math.min(reach, puddle.radius) * 0.12
                  );
            const local2 = local * local;
            const dome = Math.sqrt(Math.max(0, 1 - local2 * local2));
            const localLift =
              puddle.domeHeight * dome * (0.85 + 0.15 * Math.min(1, local));
            lift = this.smoothMax(lift, localLift, 0.002);
            if (signed > strongestField) {
              strongestField = signed;
              strongest = puddle;
            }
            // Neighboring pools of different colors blend across their seam.
            const blend = reach * 0.2;
            if (signed > -blend) {
              const share = (signed + blend) ** 2;
              red += puddle.color.r * share;
              green += puddle.color.g * share;
              blue += puddle.color.b * share;
              glow += puddle.glow * share;
              weight += share;
            }
          }
          if (weight > 0) {
            red /= weight;
            green /= weight;
            blue /= weight;
            glow /= weight;
          } else {
            red = strongest.color.r;
            green = strongest.color.g;
            blue = strongest.color.b;
            glow = strongest.glow;
          }
          // Fresh liquid shows where it landed, fading as it spreads and mixes.
          for (const puddle of candidates) {
            for (const dye of puddle.dyes) {
              const life = dye.age / DYE_LIFETIME;
              const spread =
                dye.radius *
                (1 + (2.4 - 1.6 * puddle.viscosity) * Math.sqrt(life));
              const d2 =
                ((vx - dye.x) ** 2 + (vz - dye.z) ** 2) / (spread * spread);
              if (d2 >= 1) continue;
              const k = 0.9 * (1 - d2) * (1 - life);
              red += (dye.color.r - red) * k;
              green += (dye.color.g - green) * k;
              blue += (dye.color.b - blue) * k;
              glow += (dye.glow - glow) * k;
            }
          }
          this.positions[offset] = vx;
          let wave = 0;
          if (field > 0) {
            const edgeFade = Math.min(1, field / (averageRadius * 0.125));
            if (waves > 0) wave = this.waveHeight(waves, vx, vz, edgeFade);
          }
          const wet = field > 0 ? 0 : Math.max(0, 1 + field / halo);
          this.positions[offset + 1] =
            group[0]!.floorY +
            (field > 0
              ? Math.max(
                  0.0015,
                  0.0015 + lift + Math.min(0.012, Math.max(-0.012, wave))
                )
              : 0.0012);
          this.positions[offset + 2] = vz;
          const shade = field > 0 ? 1 : 0.45;
          this.colors[offset] = red * shade;
          this.colors[offset + 1] = green * shade;
          this.colors[offset + 2] = blue * shade;
          this.glows[vertex] = glow * shade;
          const fade = Math.min(1, Math.max(0, (18 - strongest.idle) / 3));
          // The pool thins toward its rim, so the floor shows through there.
          const depth = Math.min(1, Math.max(0, field / (averageRadius * 0.35)));
          const body =
            Math.min(1, Math.max(0, field / edgeWidth)) * (0.45 + 0.55 * depth);
          this.alphas[vertex] =
            strongest.alpha *
            fade *
            // Metal does not wet the floor, so it leaves no damp rim.
            Math.max(body, 0.3 * wet * wet * (1 - strongest.metalness));
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
      this.writeNormals(vertexStart, columns, rows, stepX, stepZ);
      vertexStart += columns * rows;
    }
    this.geometry.setDrawRange(0, indexCount);
    // three's types mark count readonly; at runtime it is a plain field.
    (index as { count: number }).count = indexCount;
    index.needsUpdate = true;
    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.getAttribute("color").needsUpdate = true;
    this.geometry.getAttribute("aAlpha").needsUpdate = true;
    this.geometry.getAttribute("aMetalness").needsUpdate = true;
    this.geometry.getAttribute("aGlow").needsUpdate = true;
    this.geometry.getAttribute("normal").needsUpdate = true;
    this.mesh.visible = true;
  }

  private addDye(
    puddle: Puddle,
    x: number,
    z: number,
    radius: number,
    color: Color,
    glow: number,
    share: number
  ): void {
    const difference =
      Math.abs(color.r - puddle.color.r) +
      Math.abs(color.g - puddle.color.g) +
      Math.abs(color.b - puddle.color.b) +
      Math.abs(glow - puddle.glow);
    if (difference < 0.03) {
      // The same liquid: no spot to show, only the small drift to absorb.
      this.mix(puddle, { color, glow }, share);
      return;
    }
    if (puddle.dyes.length === MAX_DYES) {
      // Make room by mixing the oldest spot in at once.
      const oldest = puddle.dyes.shift()!;
      this.mix(puddle, oldest, oldest.share * (1 - oldest.age / DYE_LIFETIME));
    }
    puddle.dyes.push({ x, z, radius, age: 0, share, color: color.clone(), glow });
  }

  private mix(
    puddle: Puddle,
    liquid: Pick<Dye, "color" | "glow">,
    amount: number
  ): void {
    if (amount <= 0) return;
    puddle.color.lerp(liquid.color, amount);
    puddle.glow += (liquid.glow - puddle.glow) * amount;
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

  /** Flatten this frame's visible ripples: x, z, front, width, amplitude. */
  private liveWaves(sources: readonly Puddle[]): number {
    let count = 0;
    for (const puddle of sources) {
      const width = Math.max(0.03, puddle.radius * 0.23);
      const speed = 0.28 + 0.25 * (1 - puddle.viscosity);
      const damping = 1.4 + 3.4 * puddle.viscosity;
      for (const impact of puddle.impacts) {
        const amplitude = impact.amplitude * Math.exp(-damping * impact.age);
        if (amplitude < 0.0002) continue;
        const offset = count * 5;
        this.waveData[offset] = impact.x;
        this.waveData[offset + 1] = impact.z;
        this.waveData[offset + 2] = impact.age * speed;
        this.waveData[offset + 3] = width;
        this.waveData[offset + 4] = amplitude;
        count++;
      }
    }
    return count;
  }

  private waveHeight(
    waves: number,
    x: number,
    z: number,
    edgeFade: number
  ): number {
    if (edgeFade <= 0) return 0;
    const data = this.waveData;
    let height = 0;
    for (let wave = 0; wave < waves; wave++) {
      const offset = wave * 5;
      const width = data[offset + 3]!;
      const phase =
        (Math.hypot(x - data[offset]!, z - data[offset + 1]!) - data[offset + 2]!) / width;
      if (phase > 3 || phase < -3) continue;
      height +=
        data[offset + 4]! * Math.cos(phase * Math.PI) * Math.exp(-1.1 * phase * phase);
    }
    return Math.min(0.012, Math.max(-0.012, height)) * edgeFade;
  }

  /** Grid normals from height differences; no per-triangle pass needed. */
  private writeNormals(
    start: number,
    columns: number,
    rows: number,
    stepX: number,
    stepZ: number
  ): void {
    const positions = this.positions;
    const normals = this.normals;
    for (let row = 0; row < rows; row++) {
      const up = Math.max(0, row - 1);
      const down = Math.min(rows - 1, row + 1);
      for (let column = 0; column < columns; column++) {
        const left = Math.max(0, column - 1);
        const right = Math.min(columns - 1, column + 1);
        const slopeX =
          (positions[(start + row * columns + right) * 3 + 1]! -
            positions[(start + row * columns + left) * 3 + 1]!) /
          ((right - left) * stepX);
        const slopeZ =
          (positions[(start + down * columns + column) * 3 + 1]! -
            positions[(start + up * columns + column) * 3 + 1]!) /
          ((down - up) * stepZ);
        const length = Math.hypot(slopeX, 1, slopeZ);
        const offset = (start + row * columns + column) * 3;
        normals[offset] = -slopeX / length;
        normals[offset + 1] = 1 / length;
        normals[offset + 2] = -slopeZ / length;
      }
    }
  }

  /** Half-width of the box a pool and its wet rim can touch. */
  private reach(puddle: Puddle): number {
    return puddle.radius * puddle.stretch * 1.35;
  }

  /** A full floor drops its smallest settled pool, not its newest. */
  private evict(): void {
    let victim = 0;
    let smallest = Infinity;
    for (let index = 0; index < this.puddles.length; index++) {
      const puddle = this.puddles[index]!;
      const score = puddle.volume / (1 + puddle.idle);
      if (score < smallest) {
        smallest = score;
        victim = index;
      }
    }
    this.puddles.splice(victim, 1);
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
