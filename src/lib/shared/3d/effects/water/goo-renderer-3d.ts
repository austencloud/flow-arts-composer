import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DynamicDrawUsage,
  EquirectangularReflectionMapping,
  FloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearSRGBColorSpace,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  RGBAFormat,
  SphereGeometry,
  Vector3,
} from "three";
import {
  isTrackedTip,
  type GooTipSource3D,
} from "../scene-effects/scene-effect-source-3d";
import { GooPuddleRenderer3D } from "./goo-puddle-renderer-3d";

const STRANDS = 48;
/** Most points one rope can hold; about 70 cm of hanging liquid. */
const NODES = 20;
/** Centerline samples per rope segment. */
const SUB = 3;
/** Rings in each rounded end. */
const CAP = 6;
const SAMPLES = (NODES - 1) * SUB + 1;
const RINGS = SAMPLES + CAP * 2;
const SIDES = 14;
const VERTICES = RINGS * SIDES;
const DROPS = 512;
/** Rest length a new rope point is laid at. */
const SEGMENT = 0.035;
const MIN_REST = 0.0015;
const SUBSTEP = 1 / 120;
const ITERATIONS = 5;
const TELEPORT_DISTANCE = 0.75;
/** Ropes and drops below this equivalent radius are spent. */
const SPENT_RADIUS = 0.0018;
const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);

const sphereVolume = (radius: number) => (4 / 3) * Math.PI * radius ** 3;
const sphereRadius = (volume: number) =>
  Math.cbrt((3 * Math.max(0, volume)) / (4 * Math.PI));
const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** What a body of liquid carries from its source into drops and puddles. */
interface Liquid {
  gravity: number;
  floorY: number;
  viscosity: number;
  tension: number;
  core: Color;
  puddle: Color;
  alpha: number;
  metalness: number;
  pools: boolean;
  /** 0-1: how readily a landing throws satellite droplets. */
  splashy: number;
}

function makeLiquid(): Liquid {
  return {
    gravity: -9.8,
    floorY: -Infinity,
    viscosity: 0,
    tension: 0.5,
    core: new Color(),
    puddle: new Color(),
    alpha: 1,
    metalness: 0,
    pools: true,
    splashy: 0.5,
  };
}

function copyLiquid(target: Liquid, source: Liquid): void {
  target.gravity = source.gravity;
  target.floorY = source.floorY;
  target.viscosity = source.viscosity;
  target.tension = source.tension;
  target.core.copy(source.core);
  target.puddle.copy(source.puddle);
  target.alpha = source.alpha;
  target.metalness = source.metalness;
  target.pools = source.pools;
  target.splashy = source.splashy;
}

/**
 * A rope of liquid: points joined by segments that each hold a volume, so a
 * segment's thickness follows from how far it has been stretched. Node 0 is
 * pinned to the prop tip while attached; the last node carries the bulb.
 */
interface Strand {
  active: boolean;
  sourceId: number;
  attached: boolean;
  seenFrame: number;
  age: number;
  count: number;
  maxNodes: number;
  /** Longest rope the tip can hold before its lower part lets go. */
  maxLength: number;
  pos: Float32Array;
  prev: Float32Array;
  rest: Float32Array;
  vol: Float32Array;
  bulb: number;
  nozzle: number;
  /** Neck radius at which the liquid breaks. */
  pinch: number;
  /** Largest bulb radius the neck can carry. */
  maxBulb: number;
  /** Rate liquid drains down the rope toward the bulb, 1/s. */
  flow: number;
  /** Rate a pulled segment yields and lengthens, 1/s. */
  yieldRate: number;
  /** Stretch stiffness: how hard the rope resists being pulled longer. */
  stiffness: number;
  /** Per-segment constraint impulse within one substep. */
  lambda: Float32Array;
  /** Rate surface tension draws the rope back together, 1/s. */
  shrink: number;
  rootFrom: Vector3;
  rootTo: Vector3;
  step: number;
  liquid: Liquid;
}

interface Drop {
  active: boolean;
  age: number;
  maxAge: number;
  radius: number;
  satellite: boolean;
  wobble: number;
  position: Vector3;
  velocity: Vector3;
  axis: Vector3;
  liquid: Liquid;
}

interface SourceState {
  accumulator: number;
  lastSeen: number;
  strand: number;
  last: Vector3;
}

// An owned night studio: a dim sky dome, two tall narrow softboxes that lay
// long highlight lines down the ropes, and one small hard key that leaves a
// bright glint. Everything else stays dark, so the liquid reads as glossy
// lines on a deep body instead of a uniformly lit blob. The floor version
// lifts the softboxes off the horizon: a pool seen at a low angle mirrors the
// horizon, and a light there would flood it white.
function createStudioMap(floor = false): DataTexture {
  const width = 256;
  const height = 128;
  const pixels = new Float32Array(width * height * 4);
  // Soft-edged box with super-Gaussian falloff.
  const box = (u: number, v: number, cu: number, cv: number, w: number, h: number) => {
    let du = Math.abs(u - cu);
    du = Math.min(du, 1 - du);
    return Math.exp(-Math.pow(du / w, 6)) * Math.exp(-Math.pow((v - cv) / h, 6));
  };
  for (let y = 0; y < height; y++) {
    // Row 0 is the bottom of the equirectangular map (v = 0 looks down).
    const v = (y + 0.5) / height;
    const dome = Math.pow(Math.max(0, (v - 0.5) / 0.5), 1.2);
    const horizon = Math.exp(-Math.pow((v - 0.52) / 0.03, 2));
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const warm = floor
        ? box(u, v, 0.26, 0.8, 0.018, 0.12)
        : box(u, v, 0.26, 0.68, 0.018, 0.24);
      const cool = floor
        ? box(u, v, 0.74, 0.8, 0.014, 0.11)
        : box(u, v, 0.74, 0.7, 0.014, 0.2);
      const key = box(u, v, 0.08, 0.8, 0.03, 0.04);
      const offset = (y * width + x) * 4;
      // A low, dim glow along the floor's horizon gives pools a wet sheen.
      const sheen = floor ? 0.22 * Math.exp(-Math.pow((v - 0.55) / 0.05, 2)) : 0;
      const ground = (v < 0.5 ? 0.008 : 0) + sheen;
      pixels[offset] = ground + 0.02 + 0.1 * dome + 0.05 * horizon + 7 * warm + 3.2 * cool + 14 * key;
      pixels[offset + 1] = ground + 0.024 + 0.12 * dome + 0.06 * horizon + 6.6 * warm + 3.8 * cool + 14 * key;
      pixels[offset + 2] = ground + 0.035 + 0.17 * dome + 0.08 * horizon + 6 * warm + 4.6 * cool + 13 * key;
      pixels[offset + 3] = 1;
    }
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat, FloatType);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = LinearSRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createWetMaterial(envMap: DataTexture): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.09,
    metalness: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    ior: 1.42,
    envMap,
    envMapIntensity: 1,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute float aAlpha;
         attribute float aMetalness;
         varying float vGooAlpha;
         varying float vGooMetalness;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vGooAlpha = aAlpha;
         vGooMetalness = aMetalness;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         varying float vGooAlpha;
         varying float vGooMetalness;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         diffuseColor.a *= vGooAlpha;`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
         metalnessFactor *= vGooMetalness;`
      )
      .replace(
        "#include <opaque_fragment>",
        `float gooFacing = saturate( dot( normal, geometryViewDir ) );
         #ifndef GOO_FLAT
           // A view ray crosses more liquid through a bead's middle than its rim.
           diffuseColor.a *= mix( 0.62, 1.0, gooFacing );
         #endif
         // Light skimming through thin liquid lights its edge in its own color.
         outgoingLight += diffuseColor.rgb * pow( 1.0 - gooFacing, 3.0 ) * 0.45 * ( 1.0 - vGooMetalness );
         // Reflections ride on the surface, so transparency must not dim them.
         outgoingLight += totalSpecular * ( 1.0 / max( diffuseColor.a, 0.35 ) - 1.0 );
         #ifdef GOO_FLAT
           // A metal pool is all mirror, so its reflections carry the look.
           outgoingLight += totalSpecular * vGooMetalness * 1.6;
           // A floor film mirrors lights at grazing angles; roll those glints
           // off softly so a pool shines without blooming into a white patch.
           outgoingLight = outgoingLight / ( 1.0 + outgoingLight * 0.9 );
         #endif
         #include <opaque_fragment>`
      );
  };
  return material;
}

function makeTubeGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(STRANDS * VERTICES * 3);
  const colors = new Float32Array(positions.length);
  const alphas = new Float32Array(STRANDS * VERTICES);
  const metalnesses = new Float32Array(STRANDS * VERTICES);
  const indices = new Uint16Array(STRANDS * (RINGS - 1) * SIDES * 6);
  let index = 0;
  for (let strand = 0; strand < STRANDS; strand++) {
    const base = strand * VERTICES;
    for (let ring = 0; ring < RINGS - 1; ring++) {
      for (let side = 0; side < SIDES; side++) {
        const a = base + ring * SIDES + side;
        const b = base + ring * SIDES + ((side + 1) % SIDES);
        const c = a + SIDES;
        const d = b + SIDES;
        indices[index++] = a;
        indices[index++] = b;
        indices[index++] = c;
        indices[index++] = b;
        indices[index++] = d;
        indices[index++] = c;
      }
    }
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  const dynamic = (array: Float32Array, size: number) =>
    new BufferAttribute(array, size).setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", dynamic(positions, 3));
  geometry.setAttribute("normal", dynamic(new Float32Array(positions.length), 3));
  geometry.setAttribute("color", dynamic(colors, 3));
  geometry.setAttribute("aAlpha", dynamic(alphas, 1));
  geometry.setAttribute("aMetalness", dynamic(metalnesses, 1));
  return geometry;
}

function makeStrand(): Strand {
  return {
    active: false,
    sourceId: -1,
    attached: false,
    seenFrame: -1,
    age: 0,
    count: 0,
    maxNodes: NODES,
    maxLength: 0.5,
    pos: new Float32Array(NODES * 3),
    prev: new Float32Array(NODES * 3),
    rest: new Float32Array(NODES),
    vol: new Float32Array(NODES),
    bulb: 0,
    nozzle: 0.02,
    pinch: 0.005,
    maxBulb: 0.04,
    flow: 4,
    yieldRate: 10,
    stiffness: 10,
    lambda: new Float32Array(NODES),
    shrink: 1,
    rootFrom: new Vector3(),
    rootTo: new Vector3(),
    step: SUBSTEP,
    liquid: makeLiquid(),
  };
}

export class GooRenderer3D {
  private readonly strands: Strand[] = Array.from({ length: STRANDS }, makeStrand);
  private readonly drops: Drop[] = Array.from({ length: DROPS }, () => ({
    active: false,
    age: 0,
    maxAge: 0,
    radius: 0,
    satellite: false,
    wobble: 0,
    position: new Vector3(),
    velocity: new Vector3(),
    axis: new Vector3(0, 1, 0),
    liquid: makeLiquid(),
  }));
  private readonly tubeGeometry = makeTubeGeometry();
  private readonly studioMap = createStudioMap();
  private readonly wetMaterial = createWetMaterial(this.studioMap);
  private readonly floorMap = createStudioMap(true);
  private readonly puddles = new GooPuddleRenderer3D(this.wetMaterial, this.floorMap);
  private readonly tubeMesh = new Mesh(this.tubeGeometry, this.wetMaterial);
  private readonly sphereGeometry = new SphereGeometry(1, 20, 14);
  private readonly dropAlphas = new InstancedBufferAttribute(
    new Float32Array(DROPS),
    1
  ).setUsage(DynamicDrawUsage);
  private readonly dropMetalnesses = new InstancedBufferAttribute(
    new Float32Array(DROPS),
    1
  ).setUsage(DynamicDrawUsage);
  private readonly dropMesh = new InstancedMesh(
    this.sphereGeometry,
    this.wetMaterial,
    DROPS
  );
  private readonly dropObject = new Object3D();
  private readonly sourceLiquid = makeLiquid();
  private readonly sources = new Map<number, SourceState>();
  private readonly strandDrawn = new Uint8Array(STRANDS);
  // Scratch space for one rope's rings.
  private readonly ringX = new Float32Array(RINGS);
  private readonly ringY = new Float32Array(RINGS);
  private readonly ringZ = new Float32Array(RINGS);
  private readonly ringR = new Float32Array(RINGS);
  private readonly tangent = new Vector3();
  private readonly side = new Vector3();
  private readonly binormal = new Vector3();
  private readonly radial = new Vector3();
  private readonly scratch = new Vector3();
  private readonly velocity = new Vector3();
  private frame = 0;
  private strandCursor = 0;
  private dropCursor = 0;
  private seed = 0x2f6b1d;
  private parent: Object3D | null = null;

  constructor() {
    // The shared material reads vertex colors even on the uncolored sphere.
    const colors = new Float32Array(
      this.sphereGeometry.getAttribute("position").count * 3
    );
    colors.fill(1);
    this.sphereGeometry.setAttribute("color", new BufferAttribute(colors, 3));
    this.sphereGeometry.setAttribute("aAlpha", this.dropAlphas);
    this.sphereGeometry.setAttribute("aMetalness", this.dropMetalnesses);
    this.tubeMesh.frustumCulled = false;
    this.dropMesh.frustumCulled = false;
    this.dropMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.dropMesh.count = 0;
    this.tubeMesh.visible = false;
    this.dropMesh.visible = false;
    this.tubeMesh.renderOrder = 102;
    this.dropMesh.renderOrder = 103;
  }

  initialize(parent: Object3D): void {
    if (this.parent === parent) return;
    this.parent?.remove(this.tubeMesh, this.dropMesh, this.puddles.mesh);
    this.parent = parent;
    parent.add(this.tubeMesh, this.dropMesh, this.puddles.mesh);
  }

  update(sources: readonly GooTipSource3D[], delta: number): void {
    const dt = Number.isFinite(delta)
      ? Math.min(Math.max(delta, 0), 1 / 15)
      : 0;
    this.frame++;
    for (const source of sources) {
      if (!isTrackedTip(source.params.trackingMode, source.tipIndex)) continue;
      let state = this.sources.get(source.sourceId);
      if (!state) {
        state = {
          accumulator: 0,
          lastSeen: this.frame,
          strand: -1,
          last: new Vector3(source.position.x, source.position.y, source.position.z),
        };
        this.sources.set(source.sourceId, state);
      }
      state.lastSeen = this.frame;
      this.advanceSource(source, state, dt);
      state.last.set(source.position.x, source.position.y, source.position.z);
    }
    for (const [id, state] of this.sources) {
      if (state.lastSeen !== this.frame) this.sources.delete(id);
    }
    for (const strand of this.strands) {
      // A rope whose tip vanished keeps falling on its own.
      if (strand.active && strand.attached && strand.seenFrame !== this.frame)
        this.detach(strand);
    }
    this.advanceStrands(dt);
    this.advanceDrops(dt);
    this.puddles.update(dt);
    this.writeStrands();
    this.writeDrops();
  }

  /** Live liquid counts for labs and tests. */
  debugCounts(): { strands: number; drops: number; puddles: number } {
    return {
      strands: this.strands.filter((strand) => strand.active).length,
      drops: this.drops.filter((drop) => drop.active).length,
      puddles: this.puddles.count,
    };
  }

  clear(): void {
    for (const strand of this.strands) strand.active = false;
    for (const drop of this.drops) drop.active = false;
    this.sources.clear();
    this.puddles.clear();
    this.dropMesh.count = 0;
    this.dropMesh.visible = false;
    this.tubeMesh.visible = false;
    const positions = this.tubeGeometry.getAttribute("position") as BufferAttribute;
    (positions.array as Float32Array).fill(0);
    positions.needsUpdate = true;
    this.strandDrawn.fill(0);
  }

  dispose(): void {
    this.clear();
    this.parent?.remove(this.tubeMesh, this.dropMesh, this.puddles.mesh);
    this.parent = null;
    this.tubeGeometry.dispose();
    this.sphereGeometry.dispose();
    this.puddles.dispose();
    // This renderer owns the material shared by its ropes, drops and puddles.
    this.wetMaterial.dispose();
    this.studioMap.dispose();
    this.floorMap.dispose();
  }

  // ---------------------------------------------------------------- sources

  private advanceSource(
    source: GooTipSource3D,
    state: SourceState,
    dt: number
  ): void {
    const p = source.params;
    const speed =
      p.motionReferenceSpeed > 0
        ? Math.min(1, source.speed / p.motionReferenceSpeed)
        : 0;
    const rate = Math.max(
      0,
      p.ambientEmission * p.ambientSpawnRate +
        p.motionEmission * speed * p.motionSpawnRate
    );
    const liquid = this.sourceLiquid;
    this.readLiquid(liquid, source);
    if (p.spewStyle === "mist") {
      if (rate === 0) {
        state.accumulator = 0;
        return;
      }
      state.accumulator = Math.min(1, state.accumulator + dt * rate * 0.3);
      if (state.accumulator >= 1) {
        state.accumulator = 0;
        liquid.gravity = p.worldGravity * 0.35;
        const radius = p.baseRadius * 0.28;
        this.spawnDrop(
          source.position,
          source.velocity,
          radius,
          liquid,
          this.dropLifetime(
            source.position.y,
            source.collisionFloorY,
            source.velocity.y,
            liquid.gravity,
            0.34
          ),
          0,
          true
        );
      }
      return;
    }

    let strand =
      state.strand >= 0 ? this.strands[state.strand]! : undefined;
    if (
      strand &&
      (!strand.active || !strand.attached || strand.sourceId !== source.sourceId)
    ) {
      strand = undefined;
      state.strand = -1;
    }
    if (
      strand &&
      state.last.distanceTo(this.scratch.set(source.position.x, source.position.y, source.position.z)) >
        TELEPORT_DISTANCE
    ) {
      this.detach(strand);
      strand = undefined;
      state.strand = -1;
    }
    if (!strand && rate > 0) {
      const index = this.spawnStrand(source);
      if (index >= 0) {
        state.strand = index;
        strand = this.strands[index]!;
        state.last.set(source.position.x, source.position.y, source.position.z);
      }
    }
    if (!strand) return;

    strand.seenFrame = this.frame;
    copyLiquid(strand.liquid, liquid);
    this.tune(strand, source);
    strand.rootFrom.copy(state.last);
    strand.rootTo.set(source.position.x, source.position.y, source.position.z);
    // Liquid leaves the tip at the emission rate, measured in drips.
    const drips = Math.min(5, rate * (p.spewStyle === "splash" ? 0.45 : 0.32));
    const added = drips * sphereVolume(strand.nozzle * 1.45) * dt;
    if (strand.count >= 2) strand.vol[0] += added;
    else strand.bulb += added;
  }

  private readLiquid(liquid: Liquid, source: GooTipSource3D): void {
    const p = source.params;
    liquid.gravity = p.worldGravity;
    liquid.floorY = source.collisionFloorY;
    liquid.viscosity = clamp01(p.viscosity);
    liquid.tension = clamp01(p.surfaceTension);
    liquid.core.set(p.resolvedPalette.core);
    liquid.puddle.set(p.resolvedPalette.puddleTint).lerp(liquid.core, 0.35);
    liquid.metalness = p.palette === "mercury" ? 0.9 : 0;
    // Liquid metal is opaque however clear the setting is.
    liquid.alpha = Math.max(liquid.metalness, 0.97 - 0.22 * clamp01(p.clarity));
    liquid.pools = !p.resolvedPalette.suppressPuddles;
    liquid.splashy =
      p.spewStyle === "splash" ? 1 : p.spewStyle === "flow" ? 0.45 : 0.15;
  }

  /** Map the source's liquid controls onto the rope's physics. */
  private tune(strand: Strand, source: GooTipSource3D): void {
    const p = source.params;
    const viscosity = strand.liquid.viscosity;
    const tension = strand.liquid.tension;
    const splash = p.spewStyle === "splash";
    strand.nozzle =
      p.baseRadius * (0.45 + 0.35 * clamp01(p.intensity)) * (splash ? 0.7 : 0.82);
    strand.maxNodes = splash ? 8 : NODES;
    strand.maxLength = (splash ? 0.16 : 0.32) * (1 + 0.8 * viscosity + 0.4 * tension);
    strand.pinch = strand.nozzle * ((splash ? 0.5 : 0.42) - 0.17 * tension);
    strand.maxBulb = strand.nozzle * ((splash ? 1.45 : 1.75) + 0.9 * tension + 0.8 * viscosity);
    strand.flow = (1.4 + 5 * (1 - viscosity)) * (splash ? 1.6 : 1);
    strand.yieldRate = (3 + 12 * (1 - viscosity)) * (splash ? 1.4 : 1);
    strand.stiffness = (1.2 + 8 * viscosity ** 1.5 + 2.5 * tension) * (splash ? 0.7 : 1);
    // Surface tension draws a rope in at a speed set by tension over viscosity.
    strand.shrink = (0.25 + 1.1 * tension) * (1 - 0.8 * viscosity);
  }

  private spawnStrand(source: GooTipSource3D): number {
    const index = this.takeStrand();
    if (index < 0) return -1;
    const strand = this.strands[index]!;
    strand.active = true;
    strand.attached = true;
    strand.sourceId = source.sourceId;
    strand.seenFrame = this.frame;
    strand.age = 0;
    this.readLiquid(strand.liquid, source);
    this.tune(strand, source);
    const { x, y, z } = source.position;
    const v = source.velocity;
    strand.count = 2;
    strand.pos.set([x, y, z, x, y - 0.004, z]);
    strand.prev.set([
      x - v.x * SUBSTEP,
      y - v.y * SUBSTEP,
      z - v.z * SUBSTEP,
      x - v.x * SUBSTEP,
      y - 0.004 - v.y * SUBSTEP,
      z - v.z * SUBSTEP,
    ]);
    strand.rest[0] = 0.004;
    strand.vol[0] = Math.PI * strand.nozzle ** 2 * 0.004;
    strand.bulb = sphereVolume(strand.nozzle * 0.7);
    strand.rootFrom.set(x, y, z);
    strand.rootTo.set(x, y, z);
    strand.step = SUBSTEP;
    return index;
  }

  private detach(strand: Strand): void {
    strand.attached = false;
    strand.sourceId = -1;
    strand.age = 0;
    strand.shrink = 3 + 7 * strand.liquid.tension;
  }

  // ---------------------------------------------------------------- ropes

  private advanceStrands(dt: number): void {
    if (dt <= 0) return;
    const steps = Math.max(1, Math.ceil(dt / SUBSTEP - 1e-6));
    const h = dt / steps;
    for (const strand of this.strands) {
      if (!strand.active) continue;
      strand.age += dt;
      strand.step = h;
      for (let step = 0; step < steps && strand.active; step++) {
        if (strand.attached) {
          const from = step / steps;
          const to = (step + 1) / steps;
          const a = strand.rootFrom;
          const b = strand.rootTo;
          strand.prev[0] = a.x + (b.x - a.x) * from;
          strand.prev[1] = a.y + (b.y - a.y) * from;
          strand.prev[2] = a.z + (b.z - a.z) * from;
          strand.pos[0] = a.x + (b.x - a.x) * to;
          strand.pos[1] = a.y + (b.y - a.y) * to;
          strand.pos[2] = a.z + (b.z - a.z) * to;
        }
        this.integrate(strand, h);
        strand.lambda.fill(0);
        for (let iteration = 0; iteration < ITERATIONS; iteration++)
          this.solve(strand, h);
        this.yieldSegments(strand, h);
        this.collide(strand);
      }
      if (!strand.active) continue;
      this.drain(strand, dt);
      this.resample(strand);
      this.breakNeck(strand);
      if (strand.active && !strand.attached) this.ballUp(strand);
      if (strand.active && this.totalVolume(strand) < sphereVolume(SPENT_RADIUS))
        strand.active = false;
    }
  }

  private integrate(strand: Strand, h: number): void {
    const gravity = strand.liquid.gravity * h * h;
    const drag = Math.exp(-0.35 * h);
    for (let node = strand.attached ? 1 : 0; node < strand.count; node++) {
      const o = node * 3;
      for (let axis = 0; axis < 3; axis++) {
        const current = strand.pos[o + axis]!;
        const moved = (current - strand.prev[o + axis]!) * drag;
        strand.prev[o + axis] = current;
        strand.pos[o + axis] = current + moved + (axis === 1 ? gravity : 0);
      }
    }
  }

  /**
   * Liquid under load stays stretched (the constraint is soft), and that
   * stretch flows into new length, so a heavy bulb or a fast spin draws the
   * rope out. Slack liquid draws together.
   */
  private yieldSegments(strand: Strand, h: number): void {
    const give = 1 - Math.exp(-strand.yieldRate * h);
    const gather = 1 - Math.exp(-8 * h);
    const shrink = Math.exp(-strand.shrink * h);
    for (let segment = 0; segment < strand.count - 1; segment++) {
      const length = this.distance(strand, segment, segment + 1);
      let rest = strand.rest[segment]!;
      rest += (length - rest) * (length > rest ? give : gather);
      strand.rest[segment] = Math.max(MIN_REST, rest * shrink);
    }
  }

  private mass(strand: Strand, node: number): number {
    let mass = 1e-9;
    if (node > 0) mass += 0.5 * strand.vol[node - 1]!;
    if (node < strand.count - 1) mass += 0.5 * strand.vol[node]!;
    else mass += strand.bulb;
    return mass;
  }

  /**
   * XPBD distance constraints. Compliance grows with length over cross
   * section, so a thin neck gives more than a thick one and keeps thinning.
   */
  private solve(strand: Strand, h: number): void {
    for (let segment = 0; segment < strand.count - 1; segment++) {
      const a = segment * 3;
      const b = a + 3;
      const wa = segment === 0 && strand.attached ? 0 : 1 / this.mass(strand, segment);
      const wb = 1 / this.mass(strand, segment + 1);
      const dx = strand.pos[b]! - strand.pos[a]!;
      const dy = strand.pos[b + 1]! - strand.pos[a + 1]!;
      const dz = strand.pos[b + 2]! - strand.pos[a + 2]!;
      const length = Math.hypot(dx, dy, dz);
      if (length < 1e-9) continue;
      const rest = strand.rest[segment]!;
      const area = Math.max(Math.PI * this.segmentRadius(strand, segment) ** 2, 1e-7);
      const compliance = rest / (strand.stiffness * area) / (h * h);
      const lambda = strand.lambda[segment]!;
      const delta =
        (length - rest + compliance * lambda) / (wa + wb + compliance);
      strand.lambda[segment] = lambda - delta;
      const correction = delta / length;
      strand.pos[a] = strand.pos[a]! + dx * correction * wa;
      strand.pos[a + 1] = strand.pos[a + 1]! + dy * correction * wa;
      strand.pos[a + 2] = strand.pos[a + 2]! + dz * correction * wa;
      strand.pos[b] = strand.pos[b]! - dx * correction * wb;
      strand.pos[b + 1] = strand.pos[b + 1]! - dy * correction * wb;
      strand.pos[b + 2] = strand.pos[b + 2]! - dz * correction * wb;
    }
  }

  private collide(strand: Strand): void {
    const floor = strand.liquid.floorY;
    if (!Number.isFinite(floor)) return;
    for (let node = strand.attached ? 1 : 0; node < strand.count; node++) {
      const o = node * 3;
      const radius = this.nodeRadius(strand, node);
      if (strand.pos[o + 1]! > floor + radius) continue;
      if (!strand.attached) {
        // A falling rope lands as a streak along its own length.
        this.depositStrand(strand);
        strand.active = false;
        return;
      }
      if (node === strand.count - 1) {
        const share = strand.count > 1 ? 0.5 * strand.vol[node - 1]! : 0;
        this.depositVolume(strand, node, strand.bulb + share);
        if (strand.count > 1) strand.vol[node - 1] = strand.vol[node - 1]! - share;
        strand.bulb = 0;
        strand.count--;
        if (strand.count < 2) this.regrow(strand);
        return;
      }
      // A rope lying on the floor rests on it and drags.
      strand.pos[o + 1] = floor + radius;
      strand.prev[o + 1] = floor + radius;
      strand.prev[o] = strand.prev[o]! + (strand.pos[o]! - strand.prev[o]!) * 0.5;
      strand.prev[o + 2] =
        strand.prev[o + 2]! + (strand.pos[o + 2]! - strand.prev[o + 2]!) * 0.5;
    }
  }

  /** Liquid runs down the rope into its bulb, fastest where the rope hangs. */
  private drain(strand: Strand, dt: number): void {
    for (let segment = 0; segment < strand.count - 1; segment++) {
      // A short segment cannot hold more than a fat column; the rest runs on.
      const length = Math.max(strand.rest[segment]!, this.distance(strand, segment, segment + 1));
      const column = Math.PI * (strand.nozzle * 1.35) ** 2;
      let spill = strand.vol[segment]! - column * length;
      if (spill <= 0) continue;
      if (segment === 0 && strand.attached) {
        // Thick liquid leaving the tip extrudes as a column instead of running on.
        const extrude = spill * strand.liquid.viscosity;
        strand.rest[0] = strand.rest[0]! + extrude / column;
        spill -= extrude;
      }
      strand.vol[segment] = strand.vol[segment]! - spill;
      if (segment === strand.count - 2) strand.bulb += spill;
      else strand.vol[segment + 1] = strand.vol[segment + 1]! + spill;
    }
    // Surface tension squeezes a thread's thin spots into its fat ones, so a
    // stretched rope beads up and necks before it breaks.
    const bead = (0.6 + 4 * strand.liquid.tension) * (1 - 0.7 * strand.liquid.viscosity) * dt;
    for (let segment = 0; segment < strand.count - 2; segment++) {
      const thick = this.segmentRadius(strand, segment);
      const next = this.segmentRadius(strand, segment + 1);
      if (thick <= 0 || next <= 0) continue;
      const contrast = Math.abs(thick - next) / Math.max(thick, next);
      const from = thick < next ? segment : segment + 1;
      const to = thick < next ? segment + 1 : segment;
      const moved = strand.vol[from]! * Math.min(0.5, bead * contrast * 3);
      strand.vol[from] = strand.vol[from]! - moved;
      strand.vol[to] = strand.vol[to]! + moved;
    }
    for (let segment = strand.count - 2; segment >= 0; segment--) {
      const a = segment * 3;
      const length = Math.max(1e-6, this.distance(strand, segment, segment + 1));
      const downhill = (strand.pos[a + 1]! - strand.pos[a + 4]!) / length;
      const rate = strand.flow * (0.3 + 0.7 * Math.max(0, downhill));
      const moved = strand.vol[segment]! * (1 - Math.exp(-rate * dt));
      strand.vol[segment] = strand.vol[segment]! - moved;
      if (segment === strand.count - 2) strand.bulb += moved;
      else strand.vol[segment + 1] = strand.vol[segment + 1]! + moved;
    }
  }

  /** Lay new points at the tip as the rope lengthens and merge crowded ones. */
  private resample(strand: Strand): void {
    if (strand.attached) {
      while (strand.rest[0]! > SEGMENT * 1.5 && strand.count < strand.maxNodes)
        this.insertNode(strand, 0);
    }
    for (let segment = 0; segment < strand.count - 1; segment++) {
      if (strand.count >= strand.maxNodes) break;
      if (strand.rest[segment]! > SEGMENT * 2.4) this.insertNode(strand, segment);
    }
    for (let node = strand.count - 2; node >= 1; node--) {
      if (strand.count <= 2) break;
      if (strand.rest[node - 1]! + strand.rest[node]! < SEGMENT * 0.85)
        this.removeNode(strand, node);
    }
  }

  /** The thinnest neck below its breaking radius lets go. */
  private breakNeck(strand: Strand): void {
    if (strand.count < 2) return;
    let thinnest = -1;
    let thinnestRadius = Infinity;
    for (let segment = 0; segment < strand.count - 1; segment++) {
      const radius = this.segmentRadius(strand, segment);
      if (radius < thinnestRadius) {
        thinnestRadius = radius;
        thinnest = segment;
      }
    }
    let length = 0;
    for (let segment = 0; segment < strand.count - 1; segment++)
      length += strand.rest[segment]!;
    const crowded =
      strand.attached &&
      strand.count > 3 &&
      (length > strand.maxLength ||
        (strand.count >= strand.maxNodes && strand.rest[0]! > SEGMENT * 1.5));
    if (crowded) {
      // A rope at its point budget sheds its lower part at its thinnest neck.
      let neck = Math.floor(strand.count / 3);
      for (let segment = neck; segment < strand.count - 1; segment++) {
        if (this.segmentRadius(strand, segment) < this.segmentRadius(strand, neck))
          neck = segment;
      }
      this.split(strand, neck);
      return;
    }
    if (sphereRadius(strand.bulb) > strand.maxBulb) {
      this.split(strand, strand.count - 2);
      return;
    }
    const settled = strand.attached ? strand.age > 0.06 : true;
    if (settled && thinnestRadius < strand.pinch) this.split(strand, thinnest);
  }

  /** Break segment `at`: everything below it falls on its own. */
  private split(strand: Strand, at: number): void {
    const half = strand.vol[at]! * 0.5;
    const lowerCount = strand.count - at - 1;
    if (lowerCount >= 2) {
      const index = this.takeStrand();
      if (index >= 0) {
        const lower = this.strands[index]!;
        lower.active = true;
        lower.attached = false;
        lower.sourceId = -1;
        lower.seenFrame = this.frame;
        lower.age = 0;
        lower.count = lowerCount;
        lower.maxNodes = strand.maxNodes;
        lower.pos.set(strand.pos.subarray((at + 1) * 3, strand.count * 3));
        lower.prev.set(strand.prev.subarray((at + 1) * 3, strand.count * 3));
        lower.rest.set(strand.rest.subarray(at + 1, strand.count - 1));
        lower.vol.set(strand.vol.subarray(at + 1, strand.count - 1));
        lower.vol[0] = lower.vol[0]! + half;
        lower.bulb = strand.bulb;
        lower.nozzle = strand.nozzle;
        lower.pinch = strand.pinch;
        lower.maxBulb = strand.maxBulb * 1.4;
        lower.flow = strand.flow;
        lower.yieldRate = strand.yieldRate;
        lower.stiffness = strand.stiffness;
        lower.shrink = 3 + 7 * strand.liquid.tension;
        lower.step = strand.step;
        copyLiquid(lower.liquid, strand.liquid);
      } else {
        this.dropFromNodes(strand, at + 1, strand.count, half);
      }
    } else {
      this.dropFromNodes(strand, at + 1, strand.count, half);
    }
    strand.count = at + 1;
    strand.bulb = half;
    strand.vol[at] = 0;
    if (strand.count < 2) {
      if (strand.attached) this.regrow(strand);
      else this.ballUp(strand, true);
    }
  }

  /** An attached stub keeps a second point so it can hang and grow again. */
  private regrow(strand: Strand): void {
    if (!strand.attached) {
      this.ballUp(strand, true);
      return;
    }
    const volume = strand.bulb + (strand.count > 1 ? strand.vol[0]! : 0);
    strand.count = 2;
    for (let axis = 0; axis < 3; axis++) {
      strand.pos[3 + axis] = strand.pos[axis]! - (axis === 1 ? 0.003 : 0);
      strand.prev[3 + axis] = strand.prev[axis]! - (axis === 1 ? 0.003 : 0);
    }
    strand.rest[0] = 0.003;
    strand.vol[0] = volume * 0.4;
    strand.bulb = volume * 0.6;
  }

  /** A free rope that has drawn itself short becomes one wobbling drop. */
  private ballUp(strand: Strand, force = false): void {
    const volume = this.totalVolume(strand);
    const radius = sphereRadius(volume);
    let length = 0;
    for (let segment = 0; segment < strand.count - 1; segment++)
      length += strand.rest[segment]!;
    if (!force && strand.count > 1 && length > radius * 2.4 && strand.age < 1.2)
      return;
    this.dropFromNodes(strand, 0, strand.count, 0, length / Math.max(radius * 2, 1e-4));
    strand.active = false;
  }

  /** Turn nodes [from, to) into one drop at their center of mass. */
  private dropFromNodes(
    strand: Strand,
    from: number,
    to: number,
    extra: number,
    elongation = 1.3
  ): void {
    let volume = extra;
    const center = this.scratch.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    for (let node = from; node < to; node++) {
      const share =
        (node === to - 1 ? strand.bulb : 0) +
        (node < strand.count - 1 && node < to - 1 ? strand.vol[node]! : 0) +
        1e-12;
      const o = node * 3;
      center.x += strand.pos[o]! * share;
      center.y += strand.pos[o + 1]! * share;
      center.z += strand.pos[o + 2]! * share;
      this.velocity.x += ((strand.pos[o]! - strand.prev[o]!) / strand.step) * share;
      this.velocity.y += ((strand.pos[o + 1]! - strand.prev[o + 1]!) / strand.step) * share;
      this.velocity.z += ((strand.pos[o + 2]! - strand.prev[o + 2]!) / strand.step) * share;
      volume += share;
    }
    const weight = volume - extra;
    if (weight <= 0) return;
    center.divideScalar(weight);
    this.velocity.divideScalar(weight);
    const radius = sphereRadius(volume);
    if (radius < SPENT_RADIUS) return;
    const liquid = strand.liquid;
    this.spawnDrop(
      center,
      this.velocity,
      radius,
      liquid,
      this.dropLifetime(center.y, liquid.floorY, this.velocity.y, liquid.gravity, 0.4),
      Math.min(0.45, 0.12 + 0.18 * (elongation - 1)),
      false
    );
  }

  private insertNode(strand: Strand, segment: number): void {
    const at = segment + 1;
    for (let node = strand.count; node > at; node--) {
      strand.pos.copyWithin(node * 3, (node - 1) * 3, node * 3);
      strand.prev.copyWithin(node * 3, (node - 1) * 3, node * 3);
    }
    for (let index = strand.count - 1; index > segment; index--) {
      strand.rest[index] = strand.rest[index - 1]!;
      strand.vol[index] = strand.vol[index - 1]!;
    }
    const a = segment * 3;
    const b = (segment + 2) * 3;
    for (let axis = 0; axis < 3; axis++) {
      strand.pos[at * 3 + axis] = (strand.pos[a + axis]! + strand.pos[b + axis]!) / 2;
      strand.prev[at * 3 + axis] = (strand.prev[a + axis]! + strand.prev[b + axis]!) / 2;
    }
    strand.rest[segment] = strand.rest[segment]! / 2;
    strand.rest[segment + 1] = strand.rest[segment]!;
    strand.vol[segment] = strand.vol[segment]! / 2;
    strand.vol[segment + 1] = strand.vol[segment]!;
    strand.count++;
  }

  private removeNode(strand: Strand, node: number): void {
    strand.rest[node - 1] = strand.rest[node - 1]! + strand.rest[node]!;
    strand.vol[node - 1] = strand.vol[node - 1]! + strand.vol[node]!;
    strand.pos.copyWithin(node * 3, (node + 1) * 3, strand.count * 3);
    strand.prev.copyWithin(node * 3, (node + 1) * 3, strand.count * 3);
    strand.rest.copyWithin(node, node + 1, strand.count - 1);
    strand.vol.copyWithin(node, node + 1, strand.count - 1);
    strand.count--;
  }

  private distance(strand: Strand, a: number, b: number): number {
    const i = a * 3;
    const j = b * 3;
    return Math.hypot(
      strand.pos[j]! - strand.pos[i]!,
      strand.pos[j + 1]! - strand.pos[i + 1]!,
      strand.pos[j + 2]! - strand.pos[i + 2]!
    );
  }

  /** A segment's radius follows from its volume spread over its length. */
  private segmentRadius(strand: Strand, segment: number): number {
    const length = Math.max(strand.rest[segment]!, this.distance(strand, segment, segment + 1), 1e-4);
    return Math.min(
      strand.nozzle * 1.35,
      Math.sqrt(strand.vol[segment]! / (Math.PI * length))
    );
  }

  private nodeRadius(strand: Strand, node: number): number {
    if (node === strand.count - 1)
      return Math.max(sphereRadius(strand.bulb), node > 0 ? this.segmentRadius(strand, node - 1) : 0);
    const below = this.segmentRadius(strand, node);
    return node > 0 ? (below + this.segmentRadius(strand, node - 1)) / 2 : below;
  }

  private totalVolume(strand: Strand): number {
    let volume = strand.bulb;
    for (let segment = 0; segment < strand.count - 1; segment++)
      volume += strand.vol[segment]!;
    return volume;
  }

  private depositVolume(strand: Strand, node: number, volume: number): void {
    const liquid = strand.liquid;
    const radius = sphereRadius(volume);
    if (!liquid.pools || radius < SPENT_RADIUS) return;
    const o = node * 3;
    const h = strand.step;
    this.puddles.deposit(
      strand.pos[o]!,
      strand.pos[o + 2]!,
      liquid.floorY,
      radius,
      liquid.viscosity,
      liquid.tension,
      liquid.puddle,
      liquid.metalness,
      liquid.alpha,
      Math.abs((strand.pos[o + 1]! - strand.prev[o + 1]!) / h),
      (strand.pos[o]! - strand.prev[o]!) / h,
      (strand.pos[o + 2]! - strand.prev[o + 2]!) / h
    );
  }

  private depositStrand(strand: Strand): void {
    let carried = 0;
    for (let node = 0; node < strand.count; node++) {
      carried += node === strand.count - 1 ? strand.bulb : 0;
      if (node > 0) carried += 0.5 * strand.vol[node - 1]!;
      if (node < strand.count - 1) carried += 0.5 * strand.vol[node]!;
      // Thin stretches pool their liquid into the next landing spot.
      if (sphereRadius(carried) < 0.006 && node < strand.count - 1) continue;
      this.depositVolume(strand, node, carried);
      carried = 0;
    }
  }

  // ---------------------------------------------------------------- drops

  private spawnDrop(
    position: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
    radius: number,
    liquid: Liquid,
    maxAge: number,
    wobble: number,
    satellite: boolean
  ): void {
    const index = this.takeDrop();
    if (index < 0) return;
    const drop = this.drops[index]!;
    drop.active = true;
    drop.age = 0;
    drop.maxAge = maxAge;
    drop.radius = radius;
    drop.satellite = satellite;
    drop.wobble = wobble;
    drop.position.set(position.x, position.y, position.z);
    drop.velocity.set(velocity.x, velocity.y, velocity.z);
    drop.axis.copy(drop.velocity);
    if (drop.axis.lengthSq() < 1e-6) drop.axis.copy(UP);
    drop.axis.normalize();
    copyLiquid(drop.liquid, liquid);
  }

  private advanceDrops(dt: number): void {
    if (dt <= 0) return;
    for (const drop of this.drops) {
      if (!drop.active) continue;
      drop.age += dt;
      const previousY = drop.position.y;
      drop.velocity.y += drop.liquid.gravity * dt;
      drop.position.addScaledVector(drop.velocity, dt);
      const floor = drop.liquid.floorY;
      const contact = floor + drop.radius;
      if (Number.isFinite(floor) && drop.position.y <= contact) {
        const crossing = this.groundCrossing(previousY, drop.position.y, contact);
        drop.position.addScaledVector(drop.velocity, -dt * (1 - crossing));
        drop.active = false;
        this.land(drop);
      } else if (drop.age >= drop.maxAge) {
        drop.active = false;
      }
    }
  }

  /** A landing feeds a puddle and, when it hits hard, throws satellites. */
  private land(drop: Drop): void {
    const liquid = drop.liquid;
    const impact = Math.abs(drop.velocity.y);
    let volume = sphereVolume(drop.radius);
    const throws =
      drop.satellite || impact < 1.6 || drop.radius < 0.008
        ? 0
        : Math.min(
            5,
            Math.floor(
              (0.3 + 4.5 * liquid.splashy ** 2) *
                Math.min(1.2, impact / 4.5) *
                (1 - 0.6 * liquid.viscosity) +
                this.random() * 0.8
            )
          );
    if (throws > 0) {
      const thrown = volume * (0.18 + 0.14 * liquid.splashy);
      const radius = sphereRadius(thrown / throws);
      volume -= thrown;
      const reach = impact * (1 - 0.55 * liquid.viscosity);
      for (let index = 0; index < throws; index++) {
        const angle = ((index + this.random() * 0.8) / throws) * Math.PI * 2;
        const out = reach * (0.14 + 0.12 * this.random());
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        this.spawnDrop(
          this.scratch.set(
            drop.position.x + cos * drop.radius * 0.7,
            liquid.floorY + radius * 1.1,
            drop.position.z + sin * drop.radius * 0.7
          ),
          this.velocity.set(
            cos * out + drop.velocity.x * 0.3,
            reach * (0.12 + 0.12 * this.random()),
            sin * out + drop.velocity.z * 0.3
          ),
          radius,
          liquid,
          1.2,
          0.25,
          true
        );
      }
    }
    // The finest spray soaks in without a pool of its own.
    if (!liquid.pools || (drop.satellite && drop.radius < 0.005)) return;
    this.puddles.deposit(
      drop.position.x,
      drop.position.z,
      liquid.floorY,
      sphereRadius(volume),
      liquid.viscosity,
      liquid.tension,
      liquid.puddle,
      liquid.metalness,
      liquid.alpha,
      impact,
      drop.velocity.x,
      drop.velocity.z
    );
  }

  private dropLifetime(
    startY: number,
    floorY: number,
    launchVelocityY: number,
    gravity: number,
    minimum: number
  ): number {
    if (!Number.isFinite(floorY)) return minimum;
    const fall = Math.max(0, startY - floorY);
    const fallTime =
      gravity < 0
        ? (launchVelocityY +
            Math.sqrt(launchVelocityY ** 2 + 2 * -gravity * fall)) /
          -gravity
        : launchVelocityY < 0
          ? fall / -launchVelocityY
          : 0;
    return Math.min(6, Math.max(minimum, fallTime + 0.8));
  }

  private groundCrossing(
    previousY: number,
    currentY: number,
    contactY: number
  ): number {
    if (previousY <= contactY || previousY === currentY) return 0;
    return Math.max(
      0,
      Math.min(1, (previousY - contactY) / (previousY - currentY))
    );
  }

  // ---------------------------------------------------------------- geometry

  private writeStrands(): void {
    let any = false;
    for (const strand of this.strands) if (strand.active) any = true;
    if (!any && !this.strandDrawn.some(Boolean)) {
      this.tubeMesh.visible = false;
      return;
    }
    const positions = (this.tubeGeometry.getAttribute("position") as BufferAttribute)
      .array as Float32Array;
    const normals = (this.tubeGeometry.getAttribute("normal") as BufferAttribute)
      .array as Float32Array;
    const colors = (this.tubeGeometry.getAttribute("color") as BufferAttribute)
      .array as Float32Array;
    const alphas = (this.tubeGeometry.getAttribute("aAlpha") as BufferAttribute)
      .array as Float32Array;
    const metalnesses = (this.tubeGeometry.getAttribute("aMetalness") as BufferAttribute)
      .array as Float32Array;
    for (let index = 0; index < STRANDS; index++) {
      const strand = this.strands[index]!;
      const base = index * VERTICES;
      if (!strand.active || strand.count < 1) {
        if (this.strandDrawn[index]) {
          positions.fill(0, base * 3, (base + VERTICES) * 3);
          this.strandDrawn[index] = 0;
        }
        continue;
      }
      this.strandDrawn[index] = 1;
      const rings = this.buildRings(strand);
      this.writeRings(rings, base, positions, normals);
      const { r, g, b } = strand.liquid.core;
      for (let vertex = base; vertex < base + VERTICES; vertex++) {
        colors[vertex * 3] = r;
        colors[vertex * 3 + 1] = g;
        colors[vertex * 3 + 2] = b;
        alphas[vertex] = strand.liquid.alpha;
        metalnesses[vertex] = strand.liquid.metalness;
      }
    }
    this.tubeMesh.visible = any;
    for (const name of ["position", "normal", "color", "aAlpha", "aMetalness"])
      this.tubeGeometry.getAttribute(name).needsUpdate = true;
  }

  /**
   * Fill the ring scratch arrays: a rounded root, the rope's centerline as a
   * Catmull-Rom curve whose radius follows each segment's volume, the bulb
   * blended in as a sphere, and a rounded end. Returns rings used.
   */
  private buildRings(strand: Strand): number {
    const n = strand.count;
    const { ringX: X, ringY: Y, ringZ: Z, ringR: R } = this;
    const bulb = sphereRadius(strand.bulb);
    const glob = strand.attached ? strand.nozzle * 0.75 : 0;
    let ring = CAP;
    const p = strand.pos;
    const point = (node: number, axis: number) => {
      if (node < 0) return 2 * p[axis]! - p[3 + axis]!;
      if (node >= n) return 2 * p[(n - 1) * 3 + axis]! - p[(n - 2) * 3 + axis]!;
      return p[node * 3 + axis]!;
    };
    const nodeRadius = (node: number) => this.nodeRadius(strand, node);
    const blend = (radius: number, x: number, y: number, z: number) => {
      const o = (n - 1) * 3;
      const toBulb = Math.hypot(x - p[o]!, y - p[o + 1]!, z - p[o + 2]!);
      const toRoot = Math.hypot(x - p[0]!, y - p[1]!, z - p[2]!);
      radius = this.smoothMax(radius, Math.sqrt(Math.max(0, bulb * bulb - toBulb * toBulb)), bulb * 0.35);
      if (glob > 0)
        radius = this.smoothMax(radius, Math.sqrt(Math.max(0, glob * glob - toRoot * toRoot)), glob * 0.35);
      return radius;
    };
    if (n === 1) {
      X[ring] = p[0]!;
      Y[ring] = p[1]!;
      Z[ring] = p[2]!;
      R[ring] = Math.max(bulb, glob);
      ring++;
    } else {
      for (let segment = 0; segment < n - 1; segment++) {
        const thread = this.segmentRadius(strand, segment);
        const start = nodeRadius(segment);
        const end = segment + 1 === n - 1 ? thread : nodeRadius(segment + 1);
        for (let sample = 0; sample < SUB; sample++) {
          const t = sample / SUB;
          const t2 = t * t;
          const t3 = t2 * t;
          for (let axis = 0; axis < 3; axis++) {
            const p0 = point(segment - 1, axis);
            const p1 = point(segment, axis);
            const p2 = point(segment + 1, axis);
            const p3 = point(segment + 2, axis);
            const value =
              0.5 *
              (2 * p1 +
                (p2 - p0) * t +
                (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                (3 * p1 - p0 - 3 * p2 + p3) * t3);
            (axis === 0 ? X : axis === 1 ? Y : Z)[ring] = value;
          }
          const radius =
            (1 - t) * (1 - t) * start + 2 * t * (1 - t) * thread + t * t * end;
          R[ring] = blend(radius, X[ring]!, Y[ring]!, Z[ring]!);
          ring++;
        }
      }
      const o = (n - 1) * 3;
      X[ring] = p[o]!;
      Y[ring] = p[o + 1]!;
      Z[ring] = p[o + 2]!;
      R[ring] = Math.max(bulb, this.segmentRadius(strand, n - 2));
      ring++;
    }
    const last = ring - 1;
    // Rounded ends: hemispheres along the curve's end tangents.
    this.endTangent(CAP, last, false);
    const rootRadius = R[CAP]!;
    for (let cap = 0; cap < CAP; cap++) {
      const angle = (Math.PI / 2) * (1 - cap / CAP);
      X[cap] = X[CAP]! - this.tangent.x * rootRadius * Math.sin(angle);
      Y[cap] = Y[CAP]! - this.tangent.y * rootRadius * Math.sin(angle);
      Z[cap] = Z[CAP]! - this.tangent.z * rootRadius * Math.sin(angle);
      R[cap] = rootRadius * Math.cos(angle);
    }
    this.endTangent(CAP, last, true);
    const endRadius = R[last]!;
    for (let cap = 1; cap <= CAP; cap++) {
      const angle = (Math.PI / 2) * (cap / CAP);
      X[ring] = X[last]! + this.tangent.x * endRadius * Math.sin(angle);
      Y[ring] = Y[last]! + this.tangent.y * endRadius * Math.sin(angle);
      Z[ring] = Z[last]! + this.tangent.z * endRadius * Math.sin(angle);
      R[ring] = cap === CAP ? 0 : endRadius * Math.cos(angle);
      ring++;
    }
    R[0] = 0;
    // Unused rings collapse onto the far pole.
    for (let extra = ring; extra < RINGS; extra++) {
      X[extra] = X[ring - 1]!;
      Y[extra] = Y[ring - 1]!;
      Z[extra] = Z[ring - 1]!;
      R[extra] = 0;
    }
    return ring;
  }

  /** Unit tangent at the root (pointing into the rope) or at the far end. */
  private endTangent(first: number, last: number, far: boolean): void {
    const { ringX: X, ringY: Y, ringZ: Z } = this;
    if (last > first) {
      const a = far ? last - 1 : first;
      const b = far ? last : first + 1;
      this.tangent.set(X[b]! - X[a]!, Y[b]! - Y[a]!, Z[b]! - Z[a]!);
    } else this.tangent.set(0, 0, 0);
    if (this.tangent.lengthSq() < 1e-14) this.tangent.set(0, -1, 0);
    this.tangent.normalize();
  }

  private writeRings(
    used: number,
    base: number,
    positions: Float32Array,
    normals: Float32Array
  ): void {
    const { ringX: X, ringY: Y, ringZ: Z, ringR: R } = this;
    for (let ring = 0; ring < RINGS; ring++) {
      const a = Math.max(0, Math.min(ring - 1, used - 2));
      const b = Math.min(used - 1, Math.max(ring + 1, 1));
      this.tangent.set(X[b]! - X[a]!, Y[b]! - Y[a]!, Z[b]! - Z[a]!);
      const span = this.tangent.length();
      if (span < 1e-9) this.tangent.set(0, -1, 0);
      else this.tangent.divideScalar(span);
      if (ring === 0) {
        this.side.crossVectors(this.tangent, Math.abs(this.tangent.y) < 0.85 ? UP : RIGHT);
      } else {
        // Carry the previous ring's frame so it never flips through vertical.
        this.side.addScaledVector(this.tangent, -this.side.dot(this.tangent));
      }
      if (this.side.lengthSq() < 1e-10)
        this.side.crossVectors(this.tangent, Math.abs(this.tangent.y) < 0.85 ? UP : RIGHT);
      this.side.normalize();
      this.binormal.crossVectors(this.tangent, this.side).normalize();
      // The surface leans toward the narrowing end, so its normal does too.
      const slope = span > 1e-9 ? (R[a]! - R[b]!) / span : 0;
      for (let side = 0; side < SIDES; side++) {
        const angle = (side * Math.PI * 2) / SIDES;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        this.radial
          .copy(this.side)
          .multiplyScalar(cos)
          .addScaledVector(this.binormal, sin);
        const offset = (base + ring * SIDES + side) * 3;
        positions[offset] = X[ring]! + this.radial.x * R[ring]!;
        positions[offset + 1] = Y[ring]! + this.radial.y * R[ring]!;
        positions[offset + 2] = Z[ring]! + this.radial.z * R[ring]!;
        this.radial.addScaledVector(this.tangent, slope).normalize();
        normals[offset] = this.radial.x;
        normals[offset + 1] = this.radial.y;
        normals[offset + 2] = this.radial.z;
      }
    }
  }

  private writeDrops(): void {
    let count = 0;
    for (const drop of this.drops) {
      if (!drop.active) continue;
      const life = drop.age / drop.maxAge;
      const size =
        drop.radius * (life > 0.85 ? Math.max(0.05, (1 - life) / 0.15) : 1);
      // Surface tension rings a fresh drop between long and flat.
      const omega =
        2 * Math.PI * (7 + 9 * drop.liquid.tension) *
        Math.sqrt(0.02 / Math.max(drop.radius, 0.003));
      const ring =
        drop.wobble *
        Math.exp(-drop.age * (5 + 12 * drop.liquid.viscosity)) *
        Math.cos(drop.age * omega);
      const speed = drop.velocity.length();
      const stretch = Math.max(0.6, 1 + ring + Math.min(0.22, speed * 0.035));
      this.tangent.copy(speed > 0.05 ? drop.velocity : drop.axis).normalize();
      this.dropObject.position.copy(drop.position);
      this.dropObject.scale.set(
        size / Math.sqrt(stretch),
        size * stretch,
        size / Math.sqrt(stretch)
      );
      this.dropObject.quaternion.setFromUnitVectors(UP, this.tangent);
      this.dropObject.updateMatrix();
      this.dropMesh.setMatrixAt(count, this.dropObject.matrix);
      this.dropMesh.setColorAt(count, drop.liquid.core);
      this.dropAlphas.setX(count, drop.liquid.alpha);
      this.dropMetalnesses.setX(count, drop.liquid.metalness);
      count++;
    }
    const wasVisible = this.dropMesh.visible;
    this.dropMesh.count = count;
    this.dropMesh.visible = count > 0;
    if (count > 0 || wasVisible) {
      this.dropMesh.instanceMatrix.needsUpdate = true;
      if (this.dropMesh.instanceColor)
        this.dropMesh.instanceColor.needsUpdate = true;
      this.dropAlphas.needsUpdate = true;
      this.dropMetalnesses.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- pools

  private smoothMax(a: number, b: number, width: number): number {
    if (width <= 0) return Math.max(a, b);
    const overlap = Math.max(0, width - Math.abs(a - b)) / width;
    return Math.max(a, b) + overlap * overlap * width * 0.25;
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private takeStrand(): number {
    for (let offset = 0; offset < STRANDS; offset++) {
      const index = (this.strandCursor + offset) % STRANDS;
      if (!this.strands[index]!.active) {
        this.strandCursor = (index + 1) % STRANDS;
        return index;
      }
    }
    return -1;
  }

  private takeDrop(): number {
    for (let offset = 0; offset < DROPS; offset++) {
      const index = (this.dropCursor + offset) % DROPS;
      if (!this.drops[index]!.active) {
        this.dropCursor = (index + 1) % DROPS;
        return index;
      }
    }
    return -1;
  }
}
