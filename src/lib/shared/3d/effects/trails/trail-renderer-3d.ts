import type { ShaderMaterial } from "three";
import { Vector3, BufferGeometry, BufferAttribute, Mesh, Color } from "three";
import { createTrailMaterial } from "./trail-material-3d";
import type { QualityTier } from "../types";
import {
  FADE_EXPONENT,
  MIN_TAIL_WIDTH_RATIO,
} from "#lib/shared/render-graph/math/trail-mesh.js";

/**
 * Ribbon is widened by this factor so the in-shader halo has room to fall off
 * outside the solid core. Matches the 2D GLOW_RATIO. The shader's uCoreFrac
 * (= 1 / TRAIL_GLOW_RATIO) keeps the solid core at the authored line width.
 */
const TRAIL_GLOW_RATIO = 2.5;

/**
 * Upper bound on Catmull-Rom subsamples per segment. Buffers are sized for this
 * so the per-frame adaptive count (which rises when there are few control
 * points) never overruns. 150/pointCount clamped to [4, MAX] matches the 2D
 * trail's ~150 total-interpolated-point target, killing the faceting that the
 * old fixed `subdivisions: 4` showed on tight arcs.
 */
const MAX_SUBDIVISIONS = 12;
const TARGET_TOTAL_INTERPOLATED = 150;

export class TrailRingBuffer {
  private buffer: Vector3[];
  private timestamps: Float64Array;
  private head = 0;
  private count = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.timestamps = new Float64Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.buffer[i] = new Vector3();
    }
  }

  get length(): number {
    return this.count;
  }

  push(point: Vector3, timestamp?: number): void {
    this.buffer[this.head]!.copy(point);
    this.timestamps[this.head] = timestamp ?? performance.now() / 1000;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  toOrderedArray(): Vector3[] {
    if (this.count === 0) return [];
    const result: Vector3[] = [];
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      result.push(this.buffer[idx]!.clone());
    }
    return result;
  }

  getPoint(orderedIndex: number): Vector3 {
    const start = this.count < this.capacity ? 0 : this.head;
    const idx = (start + orderedIndex) % this.capacity;
    return this.buffer[idx]!;
  }

  getTimestamp(orderedIndex: number): number {
    const start = this.count < this.capacity ? 0 : this.head;
    const idx = (start + orderedIndex) % this.capacity;
    return this.timestamps[idx]!;
  }
}

function catmullRom(
  p0: Vector3,
  p1: Vector3,
  p2: Vector3,
  p3: Vector3,
  t: number,
  out: Vector3
): Vector3 {
  const t2 = t * t;
  const t3 = t2 * t;
  out.x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.y =
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  out.z =
    0.5 *
    (2 * p1.z +
      (-p0.z + p2.z) * t +
      (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
      (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
  return out;
}

export type TrailMode = "fade" | "loop_clear" | "persistent";

export interface TrailRendererConfig {
  maxPoints: number;
  width: number;
  color: string;
  opacity: number;
  rainbow: boolean;
  qualityTier: QualityTier;
  mode: TrailMode;
  fadeDuration: number;
  /** HDR core multiplier passed to the material; >1 so scene bloom catches it. */
  emissiveStrength: number;
}

const DEFAULT_CONFIG: TrailRendererConfig = {
  maxPoints: 120,
  width: 0.08,
  color: "#3b82f6",
  opacity: 1.0,
  rainbow: false,
  qualityTier: "medium" as QualityTier,
  mode: "fade",
  fadeDuration: 2.0,
  emissiveStrength: 2.5,
};

export class TrailRenderer3D {
  private ringBuffer: TrailRingBuffer;
  private geometry: BufferGeometry;
  private mesh: Mesh;
  private config: TrailRendererConfig;
  private positions: Float32Array;
  private alphas: Float32Array;
  private colors: Float32Array;
  private edges: Float32Array;
  private indices: Uint32Array;
  private maxVertices: number;
  private readonly tempVec = new Vector3();
  private readonly tempTangent = new Vector3();
  private readonly tempNormal = new Vector3();
  private readonly tempCR = new Vector3();
  private readonly tempColor = new Color();
  private sampleCounter = 0;
  private sampleRate: number;

  constructor(config: Partial<TrailRendererConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sampleRate = this.config.qualityTier === "low" ? 2 : 1;

    const effectiveMaxPoints =
      this.config.qualityTier === "low"
        ? Math.floor(this.config.maxPoints / 2)
        : this.config.maxPoints;

    this.ringBuffer = new TrailRingBuffer(effectiveMaxPoints);

    const maxInterpolated = (effectiveMaxPoints - 1) * MAX_SUBDIVISIONS + 1;
    this.maxVertices = maxInterpolated * 2;

    this.positions = new Float32Array(this.maxVertices * 3);
    this.alphas = new Float32Array(this.maxVertices);
    this.colors = new Float32Array(this.maxVertices * 3);
    this.edges = new Float32Array(this.maxVertices);

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new BufferAttribute(this.positions, 3)
    );
    this.geometry.setAttribute("alpha", new BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute(
      "instanceColor",
      new BufferAttribute(this.colors, 3)
    );
    // Edge sign is fixed by vertex parity (even = left = -1, odd = right = +1)
    // and never changes, so fill it once. The shader reads |edge| for the
    // cross-ribbon halo profile.
    for (let v = 0; v < this.maxVertices; v++) {
      this.edges[v] = v % 2 === 0 ? -1 : 1;
    }
    this.geometry.setAttribute("edge", new BufferAttribute(this.edges, 1));

    // Stitch the left/right vertex pairs into a continuous triangle strip via
    // an index buffer. Without this, an un-indexed mesh draws every 3 verts as
    // one isolated triangle (L0,R0,L1)(R1,L2,R2)... leaving gaps - the "teeny
    // triangles with holes" look. Two triangles per quad between consecutive
    // interpolated points (k → 2k=left, 2k+1=right). The index topology is
    // fixed by vertex layout, so build it once; update() only moves drawRange.
    const maxQuads = maxInterpolated - 1;
    this.indices = new Uint32Array(maxQuads * 6);
    for (let k = 0; k < maxQuads; k++) {
      const a = 2 * k; // left  of point k
      const b = 2 * k + 1; // right of point k
      const c = 2 * k + 2; // left  of point k+1
      const d = 2 * k + 3; // right of point k+1
      const o = k * 6;
      this.indices[o] = a;
      this.indices[o + 1] = b;
      this.indices[o + 2] = c;
      this.indices[o + 3] = b;
      this.indices[o + 4] = d;
      this.indices[o + 5] = c;
    }
    this.geometry.setIndex(new BufferAttribute(this.indices, 1));

    const material = createTrailMaterial({
      color: this.config.color,
      opacity: this.config.opacity,
      rainbow: this.config.rainbow,
      // Solid core stays at the authored line width inside the widened ribbon.
      coreFrac: 1 / TRAIL_GLOW_RATIO,
      emissiveStrength: this.config.emissiveStrength,
    });

    this.mesh = new Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
  }

  get object3D(): Mesh {
    return this.mesh;
  }

  /**
   * Live-apply tuned config. width/rainbow are read by update() each frame, so
   * they take effect on the next frame; opacity/color/emissive are material
   * uniforms set immediately. Buffer-sizing fields (maxPoints/qualityTier) are
   * not live-updatable and are ignored here.
   */
  updateConfig(partial: Partial<TrailRendererConfig>): void {
    this.config = { ...this.config, ...partial };
    const mat = this.mesh.material as ShaderMaterial;
    if (partial.opacity !== undefined)
      mat.uniforms.uOpacity!.value = partial.opacity;
    if (partial.emissiveStrength !== undefined)
      mat.uniforms.uEmissiveStrength!.value = partial.emissiveStrength;
    if (partial.color !== undefined) {
      (mat.uniforms.uBaseColor!.value as Color).set(
        partial.color === "rainbow" ? "#ffffff" : partial.color
      );
    }
  }

  /**
   * Apply the play/visibility envelope without overwriting the brightness the
   * user chose in trail settings. Fully hidden ribbons also leave the render
   * list, so a paused Coven does not spend GPU time blending invisible trails.
   */
  setVisibilityAlpha(alpha: number): void {
    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    const mat = this.mesh.material as ShaderMaterial;
    mat.uniforms.uVisibility!.value = clampedAlpha;
    this.mesh.visible = clampedAlpha > 0;
  }

  addPoint(position: Vector3): void {
    this.sampleCounter++;
    if (this.sampleCounter % this.sampleRate !== 0) return;
    this.ringBuffer.push(position);
  }

  clear(): void {
    this.ringBuffer.clear();
  }

  update(cameraPosition: Vector3): void {
    const pointCount = this.ringBuffer.length;
    if (pointCount < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    let vertexIndex = 0;
    // Adaptive subdivision: aim for ~150 interpolated points across the whole
    // spline. Few control points (early trail / tight arc) get more subsamples
    // so the ribbon never facets; a long trail needs fewer per segment.
    const subdivisions = Math.max(
      4,
      Math.min(
        MAX_SUBDIVISIONS,
        Math.round(TARGET_TOTAL_INTERPOLATED / Math.max(2, pointCount))
      )
    );
    const totalSegments = pointCount - 1;
    const totalInterpolatedPoints = totalSegments * subdivisions + 1;

    for (let seg = 0; seg < totalSegments; seg++) {
      const numSubdivs =
        seg === totalSegments - 1 ? subdivisions + 1 : subdivisions;

      for (let sub = 0; sub < numSubdivs; sub++) {
        const t = sub / subdivisions;

        const i0 = Math.max(0, seg - 1);
        const i1 = seg;
        const i2 = Math.min(pointCount - 1, seg + 1);
        const i3 = Math.min(pointCount - 1, seg + 2);

        const p0 = this.ringBuffer.getPoint(i0);
        const p1 = this.ringBuffer.getPoint(i1);
        const p2 = this.ringBuffer.getPoint(i2);
        const p3 = this.ringBuffer.getPoint(i3);

        catmullRom(p0, p1, p2, p3, t, this.tempVec);

        const tNext = Math.min(t + 0.01, 1);
        catmullRom(p0, p1, p2, p3, tNext, this.tempCR);
        this.tempTangent.subVectors(this.tempCR, this.tempVec).normalize();

        const toCamera = this.tempNormal
          .subVectors(cameraPosition, this.tempVec)
          .normalize();
        const normal = this.tempNormal
          .crossVectors(this.tempTangent, toCamera)
          .normalize();

        // progress: 0 at the tail (oldest), 1 at the head (current tip).
        const progress =
          (seg * subdivisions + sub) / (totalInterpolatedPoints - 1);
        // Head fat, tail thin — matches the 2D MIN_TAIL_WIDTH_RATIO ramp.
        const taper =
          MIN_TAIL_WIDTH_RATIO + (1 - MIN_TAIL_WIDTH_RATIO) * progress;
        // Widen by the glow ratio so the shader halo falls off outside the
        // solid core (which the shader keeps at the authored line width).
        const halfWidth = this.config.width * 0.5 * taper * TRAIL_GLOW_RATIO;

        // Position fade: bright head → transparent tail (2D FADE_EXPONENT curve).
        const positionAlpha = 1 - Math.pow(1 - progress, FADE_EXPONENT);
        let alpha = positionAlpha;
        if (this.config.mode === "fade") {
          // Multiply by per-point age so a stopped prop's trail keeps receding
          // instead of freezing at full length.
          const now = performance.now() / 1000;
          const pointTime = this.ringBuffer.getTimestamp(
            Math.min(seg, pointCount - 1)
          );
          const age = now - pointTime;
          const ageAlpha = Math.max(0, 1.0 - age / this.config.fadeDuration);
          alpha = positionAlpha * ageAlpha;
        }

        const li = vertexIndex * 3;
        this.positions[li] = this.tempVec.x + normal.x * halfWidth;
        this.positions[li + 1] = this.tempVec.y + normal.y * halfWidth;
        this.positions[li + 2] = this.tempVec.z + normal.z * halfWidth;
        this.alphas[vertexIndex] = alpha;

        if (this.config.rainbow) {
          const hue = progress * 360;
          this.tempColor.setHSL(hue / 360, 1, 0.5);
          this.colors[li] = this.tempColor.r;
          this.colors[li + 1] = this.tempColor.g;
          this.colors[li + 2] = this.tempColor.b;
        }

        vertexIndex++;

        const ri = vertexIndex * 3;
        this.positions[ri] = this.tempVec.x - normal.x * halfWidth;
        this.positions[ri + 1] = this.tempVec.y - normal.y * halfWidth;
        this.positions[ri + 2] = this.tempVec.z - normal.z * halfWidth;
        this.alphas[vertexIndex] = alpha;

        if (this.config.rainbow) {
          this.colors[ri] = this.colors[li]!;
          this.colors[ri + 1] = this.colors[li + 1]!;
          this.colors[ri + 2] = this.colors[li + 2]!;
        }

        vertexIndex++;
      }
    }

    // Upload only the vertices this frame wrote. Marking an attribute dirty
    // with no update range makes three.js re-upload the ENTIRE backing array
    // (WebGLAttributes.updateBuffer falls back to a full bufferSubData when
    // updateRanges is empty), so a short live trail still paid for the full
    // maxVertices capacity every frame. setDrawRange already bounds the draw,
    // so the untouched tail is never read.
    const positionAttribute = this.geometry.attributes
      .position as BufferAttribute;
    positionAttribute.clearUpdateRanges();
    positionAttribute.addUpdateRange(0, vertexIndex * 3);
    positionAttribute.needsUpdate = true;

    const alphaAttribute = this.geometry.attributes.alpha as BufferAttribute;
    alphaAttribute.clearUpdateRanges();
    alphaAttribute.addUpdateRange(0, vertexIndex);
    alphaAttribute.needsUpdate = true;

    if (this.config.rainbow) {
      const colorAttribute = this.geometry.attributes
        .instanceColor as BufferAttribute;
      colorAttribute.clearUpdateRanges();
      colorAttribute.addUpdateRange(0, vertexIndex * 3);
      colorAttribute.needsUpdate = true;
    }

    // Indexed draw: range is in index count, not vertex count. vertexIndex is
    // the number of emitted verts (2 per interpolated point), so the strip has
    // vertexIndex/2 points → (points - 1) quads → ×6 indices.
    const emittedPoints = vertexIndex / 2;
    const indexCount = Math.max(0, emittedPoints - 1) * 6;
    this.geometry.setDrawRange(0, indexCount);
  }

  onLoopReset(): void {
    if (this.config.mode === "loop_clear") {
      this.clear();
    }
  }

  dispose(): void {
    this.geometry.dispose();
    const material = this.mesh.material as ShaderMaterial;
    material.dispose();
  }
}
