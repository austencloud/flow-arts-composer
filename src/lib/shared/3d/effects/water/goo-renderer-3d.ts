import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from "three";
import {
  isTrackedTip,
  type GooTipSource3D,
} from "../scene-effects/scene-effect-source-3d";

const STRANDS = 64;
const DROPS = 512;
const RINGS = 13;
const SIDES = 8;
const VERTICES = RINGS * SIDES;
const TELEPORT_DISTANCE = 0.75;
const UP = new Vector3(0, 1, 0);

interface Strand {
  active: boolean;
  sourceId: number;
  attached: boolean;
  age: number;
  maxAge: number;
  tension: number;
  radius: number;
  gravity: number;
  tail: Vector3;
  head: Vector3;
  velocity: Vector3;
  core: Color;
  edge: Color;
  highlight: Color;
  alpha: number;
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
}

// The highlight is directional even in dim scenes; the rim catches light as a
// curved liquid edge instead of reading as a flat translucent glow.
function createWetMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: UniformsUtils.merge([UniformsLib.fog]),
    vertexShader: `
    varying vec3 vNormal;
    varying vec3 vView;
    varying vec3 vColor;
    varying vec3 vHighlight;
    varying float vAlpha;
    attribute vec3 aHighlight;
    attribute float aAlpha;
    #include <fog_pars_vertex>
    void main() {
      vec4 localPosition = vec4(position, 1.0);
      vec3 localNormal = normal;
      vec3 tint = color;
      #ifdef USE_INSTANCING
        localPosition = instanceMatrix * localPosition;
        vec3 inverseScaleSq = vec3(
          1.0 / max(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), 0.000001),
          1.0 / max(dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz), 0.000001),
          1.0 / max(dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz), 0.000001)
        );
        localNormal = mat3(instanceMatrix) * (localNormal * inverseScaleSq);
      #endif
      #ifdef USE_INSTANCING_COLOR
        tint *= instanceColor;
      #endif
      vec4 worldPosition = modelMatrix * localPosition;
      vNormal = normalize(mat3(modelMatrix) * localNormal);
      vView = normalize(cameraPosition - worldPosition.xyz);
      vColor = tint;
      vHighlight = aHighlight;
      vAlpha = aAlpha;
      vec4 mvPosition = viewMatrix * worldPosition;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `,
    fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vView;
    varying vec3 vColor;
    varying vec3 vHighlight;
    varying float vAlpha;
    #include <common>
    #include <fog_pars_fragment>
    void main() {
      vec3 n = normalize(vNormal);
      vec3 view = normalize(vView);
      vec3 light = normalize(vec3(-0.45, 0.85, 0.65));
      float diffuse = 0.45 + 0.55 * max(dot(n, light), 0.0);
      float fresnel = pow(1.0 - max(dot(n, view), 0.0), 2.4);
      float glint = pow(max(dot(reflect(-light, n), view), 0.0), 28.0);
      float fineGlint = pow(max(dot(reflect(-light, n), view), 0.0), 100.0);
      vec3 body = vColor * diffuse;
      vec3 wet = vHighlight * (0.45 * fresnel + 0.65 * glint + 0.35 * fineGlint);
      gl_FragColor = vec4(body + wet, vAlpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }
  `,
  });
}

function makeTubeGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(STRANDS * VERTICES * 3);
  const colors = new Float32Array(positions.length);
  const highlights = new Float32Array(positions.length);
  const alphas = new Float32Array(STRANDS * VERTICES);
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
    age: 0,
    maxAge: 0,
    tension: 0,
    radius: 0,
    gravity: -9.8,
    tail: new Vector3(),
    head: new Vector3(),
    velocity: new Vector3(),
    core: new Color(),
    edge: new Color(),
    highlight: new Color(),
    alpha: 1,
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
  }));
  private readonly tubeGeometry = makeTubeGeometry();
  private readonly wetMaterial = createWetMaterial();
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
    this.tubeMesh.frustumCulled = false;
    this.dropMesh.frustumCulled = false;
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
    state.accumulator = Math.min(2, state.accumulator + dt * rate * styleRate);
    while (state.accumulator >= 1) {
      state.accumulator -= 1;
      if (p.spewStyle === "mist") {
        this.spawnDrop(
          source.position,
          source.velocity,
          p.baseRadius * 0.48,
          p.worldGravity * 0.35,
          p.resolvedPalette.edge,
          p.resolvedPalette.highlight,
          1 - p.clarity * 0.45,
          0.42
        );
      } else {
        this.spawnStrand(source);
      }
    }
  }

  private spawnStrand(source: GooTipSource3D): void {
    const p = source.params;
    const index = this.takeStrand();
    if (index < 0) return;
    const strand = this.strands[index]!;
    strand.active = true;
    strand.sourceId = source.sourceId;
    strand.attached = true;
    strand.age = 0;
    strand.tension = Math.min(1, Math.max(0, p.surfaceTension));
    strand.maxAge =
      (p.spewStyle === "flow" ? 0.36 : 0.18) + 0.22 * strand.tension;
    strand.radius =
      p.baseRadius *
      (0.7 + 0.5 * p.intensity) *
      (p.spewStyle === "flow" ? 1.25 : 0.9);
    strand.gravity = p.worldGravity;
    strand.tail.set(source.position.x, source.position.y, source.position.z);
    strand.head.copy(strand.tail);
    strand.velocity
      .set(source.velocity.x, source.velocity.y, source.velocity.z)
      .multiplyScalar(0.65);
    strand.velocity.y += p.spewStyle === "splash" ? 0.3 : -0.15;
    strand.core.set(p.resolvedPalette.core);
    strand.edge.set(p.resolvedPalette.edge);
    strand.highlight.set(p.resolvedPalette.highlight);
    strand.alpha = 1 - p.clarity * 0.45;
  }

  private advanceStrands(sources: readonly GooTipSource3D[], dt: number): void {
    for (const strand of this.strands) {
      if (!strand.active) continue;
      strand.age += dt;
      strand.velocity.y += strand.gravity * dt * (0.55 + 0.35 * strand.tension);
      strand.head.addScaledVector(strand.velocity, dt);
      if (strand.attached) {
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
          if (this.next.distanceTo(strand.tail) < TELEPORT_DISTANCE)
            strand.tail.copy(this.next);
          else strand.attached = false;
        } else strand.attached = false;
      }
      const reach = strand.head.distanceTo(strand.tail);
      const pinch = 0.22 + 0.34 * strand.tension;
      if (strand.age >= strand.maxAge || reach > pinch || !strand.attached) {
        if (strand.age > 0.045)
          this.spawnDrop(
            strand.head,
            strand.velocity,
            strand.radius * 1.15,
            strand.gravity,
            strand.edge,
            strand.highlight,
            strand.alpha,
            0.4
          );
        strand.active = false;
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
    for (let index = 0; index < STRANDS; index++) {
      const strand = this.strands[index]!;
      const base = index * VERTICES * 3;
      if (!strand.active) {
        positions.fill(0, base, base + VERTICES * 3);
        continue;
      }
      this.tangent.subVectors(strand.head, strand.tail);
      const length = this.tangent.length();
      if (length < 0.002) {
        positions.fill(0, base, base + VERTICES * 3);
        continue;
      }
      this.tangent.divideScalar(length);
      this.side.crossVectors(this.tangent, UP);
      if (this.side.lengthSq() < 0.01) this.side.set(1, 0, 0);
      this.side.normalize();
      this.binormal.crossVectors(this.tangent, this.side).normalize();
      const life = Math.min(1, strand.age / strand.maxAge);
      for (let ring = 0; ring < RINGS; ring++) {
        const t = ring / (RINGS - 1);
        this.center.copy(strand.tail).lerp(strand.head, t);
        this.center.y -=
          Math.sin(Math.PI * t) *
          Math.min(0.08, length * 0.17) *
          (1 - strand.tension * 0.45);
        const bulb = 1 + 0.8 * Math.exp(-Math.pow((t - 0.87) / 0.13, 2));
        const neck =
          1 -
          0.56 * Math.exp(-Math.pow((t - 0.63) / 0.15, 2)) * (0.4 + 0.6 * life);
        const end = Math.min(1, t * 9 + 0.06, (1 - t) * 10 + 0.08);
        const radius = strand.radius * bulb * neck * end * (1 - 0.45 * life);
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
            .lerp(strand.edge, 0.2 + 0.35 * (1 - Math.cos(angle)));
          colors[offset] = this.tint.r;
          colors[offset + 1] = this.tint.g;
          colors[offset + 2] = this.tint.b;
          highlights[offset] = strand.highlight.r;
          highlights[offset + 1] = strand.highlight.g;
          highlights[offset + 2] = strand.highlight.b;
          alphas[index * VERTICES + ring * SIDES + side] = strand.alpha;
        }
      }
    }
    this.tubeGeometry.getAttribute("position").needsUpdate = true;
    this.tubeGeometry.getAttribute("color").needsUpdate = true;
    this.tubeGeometry.getAttribute("aHighlight").needsUpdate = true;
    this.tubeGeometry.getAttribute("aAlpha").needsUpdate = true;
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
      this.dropScale.set(
        size,
        size * (1.05 + Math.min(0.8, drop.velocity.length() * 0.12)),
        size
      );
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
