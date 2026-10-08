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
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  RGBAFormat,
  LinearSRGBColorSpace,
  SphereGeometry,
  Vector3,
} from "three";
import {
  isTrackedTip,
  type GooTipSource3D,
} from "../scene-effects/scene-effect-source-3d";

const STRANDS = 64;
const DROPS = 512;
const RINGS = 25;
const CAP_RINGS = 7;
const SIDES = 12;
const PINCH_TIME = 0.075;
const RETRACT_TIME = 0.11;
const VERTICES = RINGS * SIDES;
const TELEPORT_DISTANCE = 0.75;
const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);

interface Strand {
  active: boolean;
  sourceId: number;
  attached: boolean;
  releaseAge: number;
  dropReleased: boolean;
  age: number;
  maxAge: number;
  tension: number;
  radius: number;
  gravity: number;
  tail: Vector3;
  bend: Vector3;
  head: Vector3;
  velocity: Vector3;
  core: Color;
  edge: Color;
  highlight: Color;
  alpha: number;
  metalness: number;
}

interface Drop {
  active: boolean;
  age: number;
  maxAge: number;
  radius: number;
  gravity: number;
  position: Vector3;
  velocity: Vector3;
  color: Color;
  highlight: Color;
  alpha: number;
  metalness: number;
}

// A tiny owned studio map gives the liquid broad reflections even in a dim
// scene. The dark surroundings preserve the resolved palette's body color.
function createStudioMap(): DataTexture {
  const width = 128;
  const height = 64;
  const pixels = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;
      const key =
        Math.exp(-Math.pow((u - 0.3) / 0.065, 4)) *
        Math.exp(-Math.pow((v - 0.38) / 0.24, 4));
      const fill =
        Math.exp(-Math.pow((u - 0.7) / 0.11, 4)) *
        Math.exp(-Math.pow((v - 0.54) / 0.16, 4));
      const light = 0.025 + 14 * key + 4 * fill;
      const offset = (y * width + x) * 4;
      pixels[offset] = light;
      pixels[offset + 1] = light;
      pixels[offset + 2] = light;
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
    roughness: 0.12,
    metalness: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMap,
    envMapIntensity: 1.5,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute vec3 aHighlight;
         attribute float aAlpha;
         attribute float aMetalness;
         varying vec3 vGooHighlight;
         varying float vGooAlpha;
         varying float vGooMetalness;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vGooHighlight = aHighlight;
         vGooAlpha = aAlpha;
         vGooMetalness = aMetalness;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vGooHighlight;
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
        `outgoingLight += vGooHighlight * 0.025;
         #include <opaque_fragment>`
      );
  };
  return material;
}

function makeTubeGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(STRANDS * VERTICES * 3);
  const colors = new Float32Array(positions.length);
  const highlights = new Float32Array(positions.length);
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
  geometry.setAttribute(
    "position",
    new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage)
  );
  geometry.setAttribute(
    "color",
    new BufferAttribute(colors, 3).setUsage(DynamicDrawUsage)
  );
  geometry.setAttribute(
    "aHighlight",
    new BufferAttribute(highlights, 3).setUsage(DynamicDrawUsage)
  );
  geometry.setAttribute(
    "aAlpha",
    new BufferAttribute(alphas, 1).setUsage(DynamicDrawUsage)
  );
  geometry.setAttribute(
    "aMetalness",
    new BufferAttribute(metalnesses, 1).setUsage(DynamicDrawUsage)
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array(positions.length), 3).setUsage(
      DynamicDrawUsage
    )
  );
  return geometry;
}

export class GooRenderer3D {
  private readonly strands: Strand[] = Array.from({ length: STRANDS }, () => ({
    active: false,
    sourceId: -1,
    attached: false,
    releaseAge: -1,
    dropReleased: false,
    age: 0,
    maxAge: 0,
    tension: 0,
    radius: 0,
    gravity: -9.8,
    tail: new Vector3(),
    bend: new Vector3(),
    head: new Vector3(),
    velocity: new Vector3(),
    core: new Color(),
    edge: new Color(),
    highlight: new Color(),
    alpha: 1,
    metalness: 0.08,
  }));
  private readonly drops: Drop[] = Array.from({ length: DROPS }, () => ({
    active: false,
    age: 0,
    maxAge: 0,
    radius: 0,
    gravity: -9.8,
    position: new Vector3(),
    velocity: new Vector3(),
    color: new Color(),
    highlight: new Color(),
    alpha: 1,
    metalness: 0.08,
  }));
  private readonly tubeGeometry = makeTubeGeometry();
  private readonly studioMap = createStudioMap();
  private readonly wetMaterial = createWetMaterial(this.studioMap);
  private readonly tubeMesh = new Mesh(this.tubeGeometry, this.wetMaterial);
  private readonly sphereGeometry = new SphereGeometry(1, 12, 8);
  private readonly dropHighlights = new InstancedBufferAttribute(
    new Float32Array(DROPS * 3),
    3
  ).setUsage(DynamicDrawUsage);
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
  private readonly dropScale = new Vector3();
  private readonly tangent = new Vector3();
  private readonly side = new Vector3();
  private readonly binormal = new Vector3();
  private readonly center = new Vector3();
  private readonly next = new Vector3();
  private readonly tint = new Color();
  private readonly sources = new Map<
    number,
    { accumulator: number; lastSeen: number }
  >();
  private frame = 0;
  private strandCursor = 0;
  private dropCursor = 0;
  private parent: Object3D | null = null;

  constructor() {
    // ShaderMaterial expects a vertex color even on the uncolored unit sphere.
    const colors = new Float32Array(
      this.sphereGeometry.getAttribute("position").count * 3
    );
    colors.fill(1);
    this.sphereGeometry.setAttribute("color", new BufferAttribute(colors, 3));
    this.sphereGeometry.setAttribute("aHighlight", this.dropHighlights);
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
    this.parent?.remove(this.tubeMesh, this.dropMesh);
    this.parent = parent;
    parent.add(this.tubeMesh, this.dropMesh);
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
        state = { accumulator: 0, lastSeen: this.frame };
        this.sources.set(source.sourceId, state);
      }
      state.lastSeen = this.frame;
      this.advanceSource(source, state, dt);
    }
    for (const [id, state] of this.sources) {
      if (state.lastSeen !== this.frame) this.sources.delete(id);
    }
    this.advanceStrands(sources, dt);
    this.advanceDrops(dt);
    if (!this.hasActiveStrands() && !this.hasActiveDrops()) {
      this.tubeMesh.visible = false;
      this.dropMesh.visible = false;
      this.dropMesh.count = 0;
      return;
    }
    this.writeStrands();
    this.writeDrops();
  }

  clear(): void {
    for (const strand of this.strands) strand.active = false;
    for (const drop of this.drops) drop.active = false;
    this.sources.clear();
    this.dropMesh.count = 0;
    this.dropMesh.visible = false;
    this.tubeMesh.visible = false;
    const positions = this.tubeGeometry.getAttribute(
      "position"
    ) as BufferAttribute;
    (positions.array as Float32Array).fill(0);
    positions.needsUpdate = true;
  }

  dispose(): void {
    this.clear();
    this.parent?.remove(this.tubeMesh, this.dropMesh);
    this.parent = null;
    this.tubeGeometry.dispose();
    this.sphereGeometry.dispose();
    // Each renderer owns the material lifetime, even though both meshes share it.
    this.wetMaterial.dispose();
    this.studioMap.dispose();
  }

  private advanceSource(
    source: GooTipSource3D,
    state: { accumulator: number; lastSeen: number },
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
    if (rate === 0) {
      state.accumulator = 0;
      return;
    }
    const styleRate =
      p.spewStyle === "flow" ? 1 : p.spewStyle === "splash" ? 0.7 : 0.3;
    state.accumulator = Math.min(1, state.accumulator + dt * rate * styleRate);
    if (p.spewStyle === "mist") {
      if (state.accumulator >= 1) {
        state.accumulator = 0;
        this.spawnDrop(
          source.position,
          source.velocity,
          p.baseRadius * 0.28,
          p.worldGravity * 0.35,
          p.resolvedPalette.edge,
          p.resolvedPalette.highlight,
          p.palette === "mercury" ? 0.88 : 0.08,
          0.94 - p.clarity * 0.12,
          0.34
        );
      }
    } else if (
      state.accumulator >= 1 &&
      !this.hasSourceStrand(source.sourceId)
    ) {
      if (this.spawnStrand(source)) state.accumulator = 0;
    }
  }

  private spawnStrand(source: GooTipSource3D): boolean {
    const p = source.params;
    const index = this.takeStrand();
    if (index < 0) return false;
    const strand = this.strands[index]!;
    strand.active = true;
    strand.sourceId = source.sourceId;
    strand.attached = true;
    strand.releaseAge = -1;
    strand.dropReleased = false;
    strand.age = 0;
    strand.tension = Math.min(1, Math.max(0, p.surfaceTension));
    strand.maxAge =
      (p.spewStyle === "flow" ? 0.68 : 0.4) + 0.3 * strand.tension;
    strand.radius =
      p.baseRadius *
      (0.55 + 0.35 * p.intensity) *
      (p.spewStyle === "flow" ? 0.86 : 0.7);
    strand.gravity = p.worldGravity;
    strand.tail.set(source.position.x, source.position.y, source.position.z);
    strand.bend.copy(strand.tail);
    strand.head.copy(strand.tail);
    strand.velocity
      .set(source.velocity.x, source.velocity.y, source.velocity.z)
      .multiplyScalar(0.25);
    strand.velocity.y += p.spewStyle === "splash" ? 0.3 : -0.15;
    strand.core.set(p.resolvedPalette.core);
    strand.edge.set(p.resolvedPalette.edge);
    strand.highlight.set(p.resolvedPalette.highlight);
    strand.metalness = p.palette === "mercury" ? 0.88 : 0.08;
    strand.alpha = 0.98 - p.clarity * 0.05;
    return true;
  }

  private advanceStrands(sources: readonly GooTipSource3D[], dt: number): void {
    for (const strand of this.strands) {
      if (!strand.active) continue;
      strand.age += dt;
      strand.velocity.y += strand.gravity * dt * 0.46;
      strand.head.addScaledVector(strand.velocity, dt);
      if (strand.attached && strand.releaseAge < 0) {
        const source = sources.find(
          (item) =>
            item.sourceId === strand.sourceId &&
            isTrackedTip(item.params.trackingMode, item.tipIndex)
        );
        if (source) {
          this.next.set(
            source.position.x,
            source.position.y,
            source.position.z
          );
          if (this.next.distanceTo(strand.tail) < TELEPORT_DISTANCE) {
            strand.tail.copy(this.next);
            strand.bend.lerp(this.next, Math.min(1, dt * 4.5));
          } else strand.attached = false;
        } else strand.attached = false;
      }
      const reach = strand.head.distanceTo(strand.tail);
      const pinch = 0.52 + 0.38 * strand.tension;
      if (
        strand.releaseAge < 0 &&
        (strand.age >= strand.maxAge || reach > pinch || !strand.attached)
      ) {
        strand.releaseAge = 0;
        strand.attached = false;
      }
      if (strand.releaseAge >= 0) {
        strand.releaseAge += dt;
        if (!strand.dropReleased && strand.releaseAge >= PINCH_TIME) {
          strand.dropReleased = true;
          const length = strand.head.distanceTo(strand.tail);
          if (strand.age > 0.045 && length > 0.002) {
            const bulbRadius = Math.min(
              strand.radius *
                (1.38 + 0.1 * Math.min(1, strand.age / strand.maxAge)),
              length * 0.32
            );
            const bulbT = 1 - bulbRadius / length;
            const oneMinusT = 1 - bulbT;
            this.next
              .copy(strand.tail)
              .multiplyScalar(oneMinusT * oneMinusT)
              .addScaledVector(strand.bend, 2 * oneMinusT * bulbT)
              .addScaledVector(strand.head, bulbT * bulbT);
            this.spawnDrop(
              this.next,
              strand.velocity,
              bulbRadius,
              strand.gravity,
              strand.edge,
              strand.highlight,
              strand.metalness,
              strand.alpha,
              0.32
            );
            // The bead takes the old bulb's place; only its neck remains.
            strand.head.copy(this.next);
          }
        }
        if (strand.dropReleased) {
          strand.tail.lerp(strand.head, Math.min(1, dt * 13));
          strand.bend.lerp(strand.head, Math.min(1, dt * 16));
          if (strand.releaseAge >= PINCH_TIME + RETRACT_TIME)
            strand.active = false;
        }
      }
    }
  }

  private spawnDrop(
    position: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
    radius: number,
    gravity: number,
    color: string | Color,
    highlight: string | Color,
    metalness: number,
    alpha: number,
    maxAge: number
  ): void {
    const index = this.takeDrop();
    if (index < 0) return;
    const drop = this.drops[index]!;
    drop.active = true;
    drop.age = 0;
    drop.maxAge = maxAge;
    drop.radius = radius;
    drop.gravity = gravity;
    drop.position.set(position.x, position.y, position.z);
    drop.velocity.set(velocity.x, velocity.y, velocity.z);
    drop.color.set(color);
    drop.highlight.set(highlight);
    drop.metalness = metalness;
    drop.alpha = alpha;
  }

  private advanceDrops(dt: number): void {
    for (const drop of this.drops) {
      if (!drop.active) continue;
      drop.age += dt;
      if (drop.age >= drop.maxAge) {
        drop.active = false;
        continue;
      }
      drop.velocity.y += drop.gravity * dt;
      drop.position.addScaledVector(drop.velocity, dt);
    }
  }

  private writeStrands(): void {
    if (!this.hasActiveStrands()) {
      this.tubeMesh.visible = false;
      return;
    }
    this.tubeMesh.visible = true;
    const positions = (
      this.tubeGeometry.getAttribute("position") as BufferAttribute
    ).array as Float32Array;
    const colors = (this.tubeGeometry.getAttribute("color") as BufferAttribute)
      .array as Float32Array;
    const highlights = (
      this.tubeGeometry.getAttribute("aHighlight") as BufferAttribute
    ).array as Float32Array;
    const alphas = (this.tubeGeometry.getAttribute("aAlpha") as BufferAttribute)
      .array as Float32Array;
    const metalnesses = (
      this.tubeGeometry.getAttribute("aMetalness") as BufferAttribute
    ).array as Float32Array;
    for (let index = 0; index < STRANDS; index++) {
      const strand = this.strands[index]!;
      const base = index * VERTICES * 3;
      if (!strand.active) {
        positions.fill(0, base, base + VERTICES * 3);
        continue;
      }
      const length = strand.head.distanceTo(strand.tail);
      if (length < 0.002) {
        positions.fill(0, base, base + VERTICES * 3);
        continue;
      }
      const life = Math.min(1, strand.age / strand.maxAge);
      const stretch = Math.min(
        1,
        Math.max(life, length / (0.42 + 0.3 * strand.tension))
      );
      const bulbRadius = Math.min(
        strand.radius * (1.38 + 0.1 * life),
        length * 0.32
      );
      const capArc = bulbRadius / length;
      const capStart = 1 - capArc;
      const retraction = strand.dropReleased
        ? Math.max(0.04, 1 - (strand.releaseAge - PINCH_TIME) / RETRACT_TIME)
        : 1;
      const pinch =
        strand.releaseAge < 0 ? 0 : Math.min(1, strand.releaseAge / PINCH_TIME);
      const shaftEnd = RINGS - CAP_RINGS - 1;
      for (let ring = 0; ring < RINGS; ring++) {
        // Reserve seven intervals for the hemisphere regardless of strand
        // length, so a long strand cannot turn its rounded tip into a cone.
        const t = strand.dropReleased
          ? ring / (RINGS - 1)
          : ring <= shaftEnd
            ? (capStart * ring) / shaftEnd
            : capStart + (capArc * (ring - shaftEnd)) / CAP_RINGS;
        const oneMinusT = 1 - t;
        this.center
          .copy(strand.tail)
          .multiplyScalar(oneMinusT * oneMinusT)
          .addScaledVector(strand.bend, 2 * oneMinusT * t)
          .addScaledVector(strand.head, t * t);
        this.tangent
          .subVectors(strand.bend, strand.tail)
          .multiplyScalar(2 * oneMinusT);
        this.next.subVectors(strand.head, strand.bend);
        this.tangent.addScaledVector(this.next, 2 * t);
        if (this.tangent.lengthSq() < 1e-10) {
          this.tangent.subVectors(strand.head, strand.tail);
        }
        this.tangent.normalize();
        if (ring === 0) {
          this.side.crossVectors(
            this.tangent,
            Math.abs(this.tangent.y) < 0.85 ? UP : RIGHT
          );
        } else {
          // Carry the preceding ring frame along the curve. A fresh cross with
          // UP changes sign as the tangent passes through vertical.
          this.side.addScaledVector(this.tangent, -this.side.dot(this.tangent));
        }
        if (this.side.lengthSq() < 1e-10) {
          this.side.crossVectors(
            this.tangent,
            Math.abs(this.tangent.y) < 0.85 ? UP : RIGHT
          );
        }
        this.side.normalize();
        this.binormal.crossVectors(this.tangent, this.side).normalize();
        const rise = Math.max(0, Math.min(1, (t - capStart + 0.24) / 0.24));
        const roundedRise = rise * rise * (3 - 2 * rise);
        const neck =
          1 -
          (0.27 * stretch + 0.66 * pinch) *
            Math.exp(-Math.pow((t - capStart + 0.24) / 0.075, 2));
        const pulsePosition = 0.28 + 0.46 * life;
        const pulse =
          0.13 *
          Math.exp(-Math.pow((t - pulsePosition) / 0.14, 2)) *
          Math.min(1, strand.age / 0.09);
        const shaft =
          strand.radius *
          (0.62 + 0.1 * t + pulse) *
          neck *
          Math.min(1, t / 0.055);
        const neckEnd = Math.max(0, Math.min(1, (t - 0.72) / 0.28));
        const radius = strand.dropReleased
          ? shaft * (1 - neckEnd * neckEnd * (3 - 2 * neckEnd)) * retraction
          : t < capStart
            ? shaft * (1 - roundedRise) + bulbRadius * roundedRise
            : bulbRadius *
              Math.sqrt(Math.max(0, 1 - Math.pow((t - capStart) / capArc, 2)));
        for (let side = 0; side < SIDES; side++) {
          const angle = (side * Math.PI * 2) / SIDES;
          const offset = base + (ring * SIDES + side) * 3;
          const c = Math.cos(angle) * radius;
          const s = Math.sin(angle) * radius;
          positions[offset] =
            this.center.x + this.side.x * c + this.binormal.x * s;
          positions[offset + 1] =
            this.center.y + this.side.y * c + this.binormal.y * s;
          positions[offset + 2] =
            this.center.z + this.side.z * c + this.binormal.z * s;
          this.tint
            .copy(strand.core)
            .lerp(strand.edge, 0.08 + 0.16 * (1 - Math.cos(angle)));
          colors[offset] = this.tint.r;
          colors[offset + 1] = this.tint.g;
          colors[offset + 2] = this.tint.b;
          highlights[offset] = strand.highlight.r;
          highlights[offset + 1] = strand.highlight.g;
          highlights[offset + 2] = strand.highlight.b;
          alphas[index * VERTICES + ring * SIDES + side] = strand.alpha;
          metalnesses[index * VERTICES + ring * SIDES + side] =
            strand.metalness;
        }
      }
    }
    this.tubeGeometry.getAttribute("position").needsUpdate = true;
    this.tubeGeometry.getAttribute("color").needsUpdate = true;
    this.tubeGeometry.getAttribute("aHighlight").needsUpdate = true;
    this.tubeGeometry.getAttribute("aAlpha").needsUpdate = true;
    this.tubeGeometry.getAttribute("aMetalness").needsUpdate = true;
    this.tubeGeometry.computeVertexNormals();
  }

  private writeDrops(): void {
    let count = 0;
    for (const drop of this.drops) {
      if (!drop.active) continue;
      const life = drop.age / drop.maxAge;
      const size =
        drop.radius * (life > 0.78 ? Math.max(0.05, (1 - life) / 0.22) : 1);
      this.dropObject.position.copy(drop.position);
      const stretch =
        1 +
        Math.min(0.42, drop.velocity.length() * 0.08) *
          Math.exp(-drop.age * 18);
      const width = size / Math.sqrt(stretch);
      this.dropScale.set(width, size * stretch, width);
      this.dropObject.scale.copy(this.dropScale);
      this.tangent.copy(drop.velocity);
      if (this.tangent.lengthSq() > 0.0001)
        this.dropObject.quaternion.setFromUnitVectors(
          UP,
          this.tangent.normalize()
        );
      else this.dropObject.quaternion.identity();
      this.dropObject.updateMatrix();
      this.dropMesh.setMatrixAt(count, this.dropObject.matrix);
      this.dropMesh.setColorAt(count, drop.color);
      this.dropHighlights.setXYZ(
        count,
        drop.highlight.r,
        drop.highlight.g,
        drop.highlight.b
      );
      this.dropAlphas.setX(count, drop.alpha);
      this.dropMetalnesses.setX(count, drop.metalness);
      count++;
    }
    this.dropMesh.count = count;
    this.dropMesh.visible = count > 0;
    if (count > 0) {
      this.dropMesh.instanceMatrix.needsUpdate = true;
      if (this.dropMesh.instanceColor)
        this.dropMesh.instanceColor.needsUpdate = true;
      this.dropHighlights.needsUpdate = true;
      this.dropAlphas.needsUpdate = true;
      this.dropMetalnesses.needsUpdate = true;
    }
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

  private hasActiveStrands(): boolean {
    for (const strand of this.strands) if (strand.active) return true;
    return false;
  }

  private hasSourceStrand(sourceId: number): boolean {
    for (const strand of this.strands) {
      if (strand.active && strand.sourceId === sourceId) return true;
    }
    return false;
  }

  private hasActiveDrops(): boolean {
    for (const drop of this.drops) if (drop.active) return true;
    return false;
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
