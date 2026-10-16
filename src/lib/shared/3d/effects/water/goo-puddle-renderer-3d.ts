import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Mesh,
  MeshPhysicalMaterial,
  type Texture,
} from "three";

/** Pools on the floor at once; scattered drops each need their own. */
const CAPACITY = 400;
/** Grid vertices one pool may use when it is alone. */
const VERTICES = 288;
/** Vertex buffer size: a 16-bit index reaches 65536 vertices. */
const MAX_VERTICES = 96 * VERTICES;
/** Pools kept free so a crowded floor can fade spots out instead of popping them. */
const RESERVE = 48;
/** Seconds a spot crowded off the floor takes to fade. */
const FADE_OUT = 0.5;
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
  /** 1 while settled; falls to 0 once the pool is crowded off the floor. */
  fade: number;
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
  private readonly positions = new Float32Array(MAX_VERTICES * 3);
  private readonly colors = new Float32Array(MAX_VERTICES * 3);
  /** Opacity of the pool's body at each vertex, edge aside. */
  private readonly alphas = new Float32Array(MAX_VERTICES);
  /** Opacity of the damp film just past the rim. */
  private readonly wets = new Float32Array(MAX_VERTICES);
  /** Signed distance into the pool, m; the shader draws the rim where it is 0. */
  private readonly fields = new Float32Array(MAX_VERTICES);
  /**
   * Offset from the nearest pool's center in its own frame, its rim distance
   * that way, and the pool's tag. Offset and rim vary linearly across a cell,
   * so where a cell's corners share one pool the shader can measure a round
   * rim exactly instead of the chord the cell's field cuts.
   */
  private readonly rims = new Float32Array(MAX_VERTICES * 4);
  private readonly metalnesses = new Float32Array(MAX_VERTICES);
  private readonly glows = new Float32Array(MAX_VERTICES);
  private readonly normals = new Float32Array(MAX_VERTICES * 3);
  private readonly waveData = new Float32Array(4 * MAX_IMPACTS * 5);
  private readonly material: MeshPhysicalMaterial;
  private readonly order: number[] = [];
  private readonly parents = new Int32Array(CAPACITY);

  constructor(material: MeshPhysicalMaterial, envMap?: Texture) {
    const indices = new Uint16Array(MAX_VERTICES * 6);
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
      "aWet",
      new BufferAttribute(this.wets, 1).setUsage(DynamicDrawUsage)
    );
    this.geometry.setAttribute(
      "aField",
      new BufferAttribute(this.fields, 1).setUsage(DynamicDrawUsage)
    );
    this.geometry.setAttribute(
      "aRim",
      new BufferAttribute(this.rims, 4).setUsage(DynamicDrawUsage)
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
    // The rim is drawn per pixel from the signed distance: interpolating
    // opacity across grid cells would leave it a soft smear several
    // centimeters wide.
    this.material.onBeforeCompile = (shader, renderer) => {
      material.onBeforeCompile(shader, renderer);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           attribute float aWet;
           attribute float aField;
           attribute vec4 aRim;
           varying float vGooWet;
           varying float vGooField;
           varying vec4 vGooRim;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vGooWet = aWet;
           vGooField = aField;
           vGooRim = aRim;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           varying float vGooWet;
           varying float vGooField;
           varying vec4 vGooRim;`
        )
        .replace(
          "diffuseColor.a *= vGooAlpha;",
          `// The grid's field cuts each rim into chords; the nearest pool's own
           // distance rounds them back out where the cell has one pool.
           float gooField = vGooField;
           if ( fwidth( vGooRim.w ) < 1e-4 ) gooField = max( gooField, vGooRim.z - length( vGooRim.xy ) );
           float gooRim = smoothstep( -0.5, 0.5, gooField / max( fwidth( gooField ), 1e-6 ) );
           // Past the rim only a darker damp film remains.
           diffuseColor.rgb *= mix( 0.45, 1.0, gooRim );
           diffuseColor.a *= mix( vGooWet, vGooAlpha, gooRim );`
        )
        .replace(
          "#include <opaque_fragment>",
          `// The meniscus curls down to the floor and catches the light as a
           // thin bright line just inside the rim.
           float gooMeniscus = gooRim * ( 1.0 - smoothstep( 0.0, max( 0.0035, 1.5 * fwidth( gooField ) ), gooField ) );
           outgoingLight += vec3( 0.36, 0.4, 0.46 ) * gooMeniscus * ( 0.35 + 0.65 * ( 1.0 - vGooMetalness ) );
           #include <opaque_fragment>`
        );
    };
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
      if (Math.abs(puddle.floorY - floorY) > 0.01 || puddle.fade < 1) continue;
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
    // update() folds and fades pools to keep spare room; this only runs out
    // when one frame lands more new spots than that room holds.
    if (this.puddles.length >= CAPACITY) this.evict(true);
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
      fade: 1,
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
      if (puddle.fade < 1) puddle.fade -= dt / FADE_OUT;
      if (puddle.idle > 18 || puddle.fade <= 0) this.puddles.splice(i, 1);
    }
    if (this.puddles.length > CAPACITY - RESERVE) this.makeRoom();
    const groups = this.connectedGroups();
    if (this.puddles.length === 0) {
      this.mesh.visible = false;
      return;
    }
    this.positions.fill(0);
    this.alphas.fill(0);
    this.wets.fill(0);
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
      // A lone drop needs only a small grid, so a floor of scattered spots
      // still fits the vertex buffer.
      const columns = Math.min(256, Math.max(6, Math.ceil(width / cell) + 1));
      const rows = Math.min(
        Math.max(6, Math.floor(budget / columns)),
        Math.max(6, Math.ceil(depth / cell) + 1)
      );
      if (vertexStart + columns * rows > MAX_VERTICES) continue;
      const stepX = width / (columns - 1);
      const stepZ = depth / (rows - 1);
      const averageRadius =
        group.reduce((sum, puddle) => sum + puddle.radius, 0) / group.length;
      // A thin wet film darkens the floor just past the pool's rim.
      const halo = averageRadius * 0.22;
      const edge = Math.max(stepX, stepZ);
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
      const waves = this.liveWaves(impactSources, edge);
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
          0.005 + 0.004 * puddle.tension ** 6,
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
          let domeHeight = 0;
          let strongest = group[0]!;
          let strongestField = -Infinity;
          let rimX = 0;
          let rimZ = 0;
          let rimReach = 0;
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
            if (signed > strongestField) {
              strongestField = signed;
              strongest = puddle;
              rimX = localX;
              rimZ = localZ;
              rimReach = reach;
            }
            // Neighboring pools of different colors blend across their seam.
            const blend = reach * 0.2;
            if (signed > -blend) {
              const share = (signed + blend) ** 2;
              red += puddle.color.r * share;
              green += puddle.color.g * share;
              blue += puddle.color.b * share;
              glow += puddle.glow * share;
              domeHeight += puddle.domeHeight * share;
              weight += share;
            }
          }
          if (weight > 0) {
            red /= weight;
            green /= weight;
            blue /= weight;
            glow /= weight;
            domeHeight /= weight;
          } else {
            red = strongest.color.r;
            green = strongest.color.g;
            blue = strongest.color.b;
            glow = strongest.glow;
            domeHeight = strongest.domeHeight;
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
          // One level surface over the whole group, rising over a rounded rim a
          // few cells wide: merged pools read as one body of liquid, not a
          // cluster of bumps, and the grid can resolve the rim's curve.
          const rimWidth = Math.min(
            strongest.radius * 0.5,
            Math.max(2.5 * edge, domeHeight * 4)
          );
          const rise = Math.min(1, Math.max(0, field / rimWidth));
          const lift = domeHeight * rise * (2 - rise);
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
          this.colors[offset] = red;
          this.colors[offset + 1] = green;
          this.colors[offset + 2] = blue;
          this.glows[vertex] = glow;
          const fade =
            Math.min(1, Math.max(0, (18 - strongest.idle) / 3)) *
            Math.max(0, strongest.fade);
          // Clamped so cells far outside every pool still interpolate cleanly.
          this.fields[vertex] = Math.max(field, -averageRadius);
          const rim = vertex * 4;
          this.rims[rim] = rimX;
          this.rims[rim + 1] = rimZ;
          // A vertex no pool reaches must not round a rim out toward it.
          this.rims[rim + 2] = strongestField === -Infinity ? -averageRadius : rimReach;
          this.rims[rim + 3] = strongestField === -Infinity ? -1 : strongest.seed;
          // The pool thins toward its rim, so the floor shows through there,
          // but even the rim is deep enough to read as liquid, not a stain.
          const depth = Math.min(1, Math.max(0, field / (averageRadius * 0.35)));
          this.alphas[vertex] = strongest.alpha * fade * (0.86 + 0.14 * depth);
          // Metal does not wet the floor, so it leaves no damp rim.
          this.wets[vertex] =
            strongest.alpha * fade * 0.3 * wet * wet * (1 - strongest.metalness);
          this.metalnesses[vertex] = strongest.metalness;
        }
      }
      // A round rim bulges past the chord between two cells outside it.
      for (let row = 0; row < rows - 1; row++) {
        for (let column = 0; column < columns - 1; column++) {
          const a = vertexStart + row * columns + column;
          const b = a + 1;
          const c = a + columns;
          const d = c + 1;
          if (
            !this.covers(a, edge) &&
            !this.covers(b, edge) &&
            !this.covers(c, edge) &&
            !this.covers(d, edge)
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
    this.geometry.getAttribute("aWet").needsUpdate = true;
    this.geometry.getAttribute("aField").needsUpdate = true;
    this.geometry.getAttribute("aRim").needsUpdate = true;
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
  private liveWaves(sources: readonly Puddle[], cell: number): number {
    let count = 0;
    for (const puddle of sources) {
      // A ring narrower than two grid cells aliases into faceted spikes, so a
      // coarse grid gets a wider, lower ring carrying the same energy.
      const crisp = Math.max(0.03, puddle.radius * 0.23);
      const width = Math.max(crisp, 2 * cell);
      const scale = crisp / width;
      const speed = 0.28 + 0.25 * (1 - puddle.viscosity);
      const damping = 1.4 + 3.4 * puddle.viscosity;
      for (const impact of puddle.impacts) {
        const amplitude =
          impact.amplitude * scale * Math.exp(-damping * impact.age);
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
  /** Whether a vertex is near enough pool or damp film that its cells must be drawn. */
  private covers(vertex: number, edge: number): boolean {
    return (
      (this.fields[vertex]! > -edge && this.alphas[vertex]! > 0) ||
      this.wets[vertex]! > 0
    );
  }

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

  /** Pool indices sorted along x, so neighbor searches stop early. */
  private sweepOrder(): number[] {
    const order = this.order;
    order.length = this.puddles.length;
    for (let index = 0; index < order.length; index++) order[index] = index;
    return order.sort(
      (left, right) => this.puddles[left]!.x - this.puddles[right]!.x
    );
  }

  /**
   * A crowded floor first folds pools that are mostly covered by a bigger
   * neighbor into it, so a busy pool frees room and a lone splash elsewhere
   * stays where it landed. Only then does it fade out the smallest spots.
   */
  private makeRoom(): void {
    const target = CAPACITY - RESERVE;
    const order = this.sweepOrder();
    let maxRadius = 0;
    for (const puddle of this.puddles) maxRadius = Math.max(maxRadius, puddle.radius);
    const pairs: { buried: number; keep: Puddle; fold: Puddle }[] = [];
    for (let i = 0; i < order.length; i++) {
      const a = this.puddles[order[i]!]!;
      if (a.fade < 1) continue;
      for (let j = i + 1; j < order.length; j++) {
        const b = this.puddles[order[j]!]!;
        // Below 1.6 the smaller pool's middle lies inside the bigger one.
        if (b.x - a.x > 1.6 * Math.max(a.radius, maxRadius)) break;
        if (b.fade < 1 || Math.abs(a.floorY - b.floorY) > 0.01) continue;
        const aBigger = a.radius >= b.radius;
        const big = aBigger ? a : b;
        const small = aBigger ? b : a;
        const buried =
          (Math.hypot(a.x - b.x, a.z - b.z) + small.radius) / big.radius;
        if (buried < 1.6) pairs.push({ buried, keep: big, fold: small });
      }
    }
    pairs.sort((left, right) => left.buried - right.buried);
    const folded = new Set<Puddle>();
    let count = this.puddles.length;
    for (const { keep, fold } of pairs) {
      if (count <= target) break;
      if (folded.has(keep) || folded.has(fold)) continue;
      this.fold(keep, fold);
      folded.add(fold);
      count--;
    }
    if (folded.size > 0) {
      for (let index = this.puddles.length - 1; index >= 0; index--)
        if (folded.has(this.puddles[index]!)) this.puddles.splice(index, 1);
    }
    let fading = 0;
    for (const puddle of this.puddles) if (puddle.fade < 1) fading++;
    while (this.puddles.length - fading > target && this.evict(false)) fading++;
  }

  private fold(keep: Puddle, fold: Puddle): void {
    const share = fold.volume / (keep.volume + fold.volume);
    // The bigger pool takes the liquid and spreads with it.
    keep.volume = Math.min(MAX_VOLUME, keep.volume + fold.volume);
    keep.x += (fold.x - keep.x) * share * 0.5;
    keep.z += (fold.z - keep.z) * share * 0.5;
    keep.idle = Math.min(keep.idle, fold.idle);
    this.mix(keep, fold, share);
    keep.viscosity += (fold.viscosity - keep.viscosity) * share;
    keep.tension += (fold.tension - keep.tension) * share;
    for (const dye of fold.dyes)
      if (keep.dyes.length < MAX_DYES) keep.dyes.push(dye);
    for (const impact of fold.impacts)
      if (keep.impacts.length < MAX_IMPACTS) keep.impacts.push(impact);
  }

  /**
   * Start fading the smallest settled pool, not the newest. With `now`, a
   * floor out of room drops its faintest fading pool at once instead.
   */
  private evict(now: boolean): boolean {
    let victim = -1;
    let smallest = Infinity;
    let faintest = -1;
    for (let index = 0; index < this.puddles.length; index++) {
      const puddle = this.puddles[index]!;
      if (puddle.fade < 1) {
        if (faintest < 0 || puddle.fade < this.puddles[faintest]!.fade)
          faintest = index;
        continue;
      }
      const score = puddle.volume / (1 + puddle.idle);
      if (score < smallest) {
        smallest = score;
        victim = index;
      }
    }
    if (now) {
      const index = faintest >= 0 ? faintest : victim;
      if (index >= 0) this.puddles.splice(index, 1);
      return index >= 0;
    }
    if (victim < 0) return false;
    this.puddles[victim]!.fade = 0.999;
    return true;
  }

  private smoothMax(a: number, b: number, width: number): number {
    const overlap = Math.max(0, width - Math.abs(a - b)) / width;
    return Math.max(a, b) + overlap * overlap * width * 0.25;
  }

  private connectedGroups(): Puddle[][] {
    const count = this.puddles.length;
    const parent = this.parents;
    for (let index = 0; index < count; index++) parent[index] = index;
    const root = (index: number): number => {
      while (parent[index] !== index) {
        parent[index] = parent[parent[index]!]!;
        index = parent[index]!;
      }
      return index;
    };
    const order = this.sweepOrder();
    let maxRadius = 0;
    for (const puddle of this.puddles) maxRadius = Math.max(maxRadius, puddle.radius);
    for (let i = 0; i < count; i++) {
      const first = this.puddles[order[i]!]!;
      for (let j = i + 1; j < count; j++) {
        const second = this.puddles[order[j]!]!;
        if (second.x - first.x >= (first.radius + maxRadius) * 0.98) break;
        if (
          Math.abs(first.floorY - second.floorY) > 0.01 ||
          Math.hypot(first.x - second.x, first.z - second.z) >=
            (first.radius + second.radius) * 0.98
        )
          continue;
        parent[root(order[i]!)] = root(order[j]!);
      }
    }
    // Groups keep the pools' own order, so the first pool leads its group.
    const groups: Puddle[][] = [];
    const slot = new Map<number, Puddle[]>();
    for (let index = 0; index < count; index++) {
      const key = root(index);
      let group = slot.get(key);
      if (!group) {
        group = [];
        slot.set(key, group);
        groups.push(group);
      }
      group.push(this.puddles[index]!);
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
