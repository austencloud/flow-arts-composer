import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from "three";
import type { Ink3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import { setRgbFromHex, type MutableRgb } from "../instancing/particle-color";
import type { BoundedSourcePath3D } from "../scene-effects/bounded-source-path-3d";

const SIDES = 8;
const SUBDIVISIONS = 3;
const EPSILON = 1e-7;
const MAX_PATH_POINTS = 96;
const MAX_RINGS = 4096;

export interface InkStrokeFrame3D {
  headSideX: number;
  headSideY: number;
  headSideZ: number;
  hasHeadSide: boolean;
}

function catmull(
  a: number,
  b: number,
  c: number,
  d: number,
  t: number
): number {
  return (
    b +
    0.5 *
      t *
      (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)))
  );
}

/** A single connected, narrow brush volume for each tracked tip. */
export class InkStrokeGeometry3D {
  readonly geometry = new BufferGeometry();
  private readonly positions = new Float32Array(MAX_RINGS * SIDES * 3);
  private readonly normals = new Float32Array(MAX_RINGS * SIDES * 3);
  private readonly pigments = new Float32Array(MAX_RINGS * SIDES * 3);
  private readonly edges = new Float32Array(MAX_RINGS * SIDES * 3);
  private readonly alphas = new Float32Array(MAX_RINGS * SIDES);
  private readonly wetness = new Float32Array(MAX_RINGS * SIDES);
  private readonly indices = new Uint32Array(MAX_RINGS * SIDES * 6);
  private readonly centers = new Float32Array(MAX_PATH_POINTS * 3);
  private readonly births = new Float32Array(MAX_PATH_POINTS);
  private readonly speeds = new Float32Array(MAX_PATH_POINTS);
  private readonly pigment: MutableRgb = { right: 1, green: 1, left: 1 };
  private readonly edge: MutableRgb = { right: 1, green: 1, left: 1 };
  private ringCursor = 0;
  private indexCursor = 0;
  private committedIndices = 0;

  constructor() {
    this.attribute("position", this.positions, 3);
    this.attribute("normal", this.normals, 3);
    this.attribute("pigment", this.pigments, 3);
    this.attribute("edge", this.edges, 3);
    this.attribute("alpha", this.alphas, 1);
    this.attribute("wetness", this.wetness, 1);
    this.geometry.setIndex(
      new BufferAttribute(this.indices, 1).setUsage(DynamicDrawUsage)
    );
    this.geometry.setDrawRange(0, 0);
  }

  get drawCount(): number {
    return this.committedIndices;
  }

  beginFrame(): void {
    this.ringCursor = 0;
    this.indexCursor = 0;
    this.geometry.clearGroups();
  }

  writeStroke(
    path: BoundedSourcePath3D,
    params: Ink3DParams,
    now: number,
    ringBudget: number,
    frame?: InkStrokeFrame3D
  ): void {
    const count = Math.min(
      path.count,
      params.maxPointsPerTip,
      MAX_PATH_POINTS,
      Math.floor(
        Math.min(ringBudget, MAX_RINGS - this.ringCursor - 1) / SUBDIVISIONS
      ) + 1
    );
    if (count < 2) return;
    for (let i = 0; i < count; i++) {
      const at = path.indexFromNewest(i);
      this.centers[i * 3] = path.xAt(at);
      this.centers[i * 3 + 1] = path.yAt(at);
      this.centers[i * 3 + 2] = path.zAt(at);
      this.births[i] = path.birthAt(at);
      this.speeds[i] = path.speedAt(at);
    }
    setRgbFromHex(this.pigment, params.resolvedPalette.pigment);
    setRgbFromHex(this.edge, params.resolvedPalette.edge);
    const groupStart = this.indexCursor;

    // The first normal is chosen against the tangent, then carried from ring
    // to ring. A camera-facing ribbon would twist whenever the viewer moves.
    let sideX = frame?.hasHeadSide ? frame.headSideX : 0,
      sideY = frame?.hasHeadSide ? frame.headSideY : 0,
      sideZ = frame?.hasHeadSide ? frame.headSideZ : 1;
    let previousTangentX = 0,
      previousTangentY = 0,
      previousTangentZ = 0;
    let previousRing = -1;
    const total = (count - 1) * SUBDIVISIONS;
    for (let sample = 0; sample <= total; sample++) {
      if (this.ringCursor >= MAX_RINGS) break;
      const segment = Math.min(count - 2, Math.floor(sample / SUBDIVISIONS));
      const t = sample === total ? 1 : (sample % SUBDIVISIONS) / SUBDIVISIONS;
      const point = (index: number, axis: number): number =>
        this.centers[Math.max(0, Math.min(count - 1, index)) * 3 + axis]!;
      const x = catmull(
        point(segment - 1, 0),
        point(segment, 0),
        point(segment + 1, 0),
        point(segment + 2, 0),
        t
      );
      const y = catmull(
        point(segment - 1, 1),
        point(segment, 1),
        point(segment + 1, 1),
        point(segment + 2, 1),
        t
      );
      const z = catmull(
        point(segment - 1, 2),
        point(segment, 2),
        point(segment + 1, 2),
        point(segment + 2, 2),
        t
      );
      const aheadT = Math.min(1, t + 0.01);
      const behindT = Math.max(0, t - 0.01);
      let tx =
        catmull(
          point(segment - 1, 0),
          point(segment, 0),
          point(segment + 1, 0),
          point(segment + 2, 0),
          aheadT
        ) -
        catmull(
          point(segment - 1, 0),
          point(segment, 0),
          point(segment + 1, 0),
          point(segment + 2, 0),
          behindT
        );
      let ty =
        catmull(
          point(segment - 1, 1),
          point(segment, 1),
          point(segment + 1, 1),
          point(segment + 2, 1),
          aheadT
        ) -
        catmull(
          point(segment - 1, 1),
          point(segment, 1),
          point(segment + 1, 1),
          point(segment + 2, 1),
          behindT
        );
      let tz =
        catmull(
          point(segment - 1, 2),
          point(segment, 2),
          point(segment + 1, 2),
          point(segment + 2, 2),
          aheadT
        ) -
        catmull(
          point(segment - 1, 2),
          point(segment, 2),
          point(segment + 1, 2),
          point(segment + 2, 2),
          behindT
        );
      let length = Math.hypot(tx, ty, tz);
      if (length < EPSILON) {
        tx = previousTangentX;
        ty = previousTangentY;
        tz = previousTangentZ;
        length = Math.hypot(tx, ty, tz);
      }
      if (length < EPSILON) continue;
      tx /= length;
      ty /= length;
      tz /= length;
      if (previousRing < 0 && !frame?.hasHeadSide) {
        if (Math.abs(tz) > 0.9) {
          sideX = 1;
          sideY = 0;
          sideZ = 0;
        }
      }
      const projection = sideX * tx + sideY * ty + sideZ * tz;
      sideX -= projection * tx;
      sideY -= projection * ty;
      sideZ -= projection * tz;
      const sideLength = Math.hypot(sideX, sideY, sideZ);
      if (sideLength < EPSILON) {
        if (Math.abs(tz) > 0.9) {
          sideX = 0;
          sideY = -tz;
          sideZ = ty;
        } else {
          sideX = -ty;
          sideY = tx;
          sideZ = 0;
        }
      }
      const normalizedSide = Math.hypot(sideX, sideY, sideZ);
      sideX /= normalizedSide;
      sideY /= normalizedSide;
      sideZ /= normalizedSide;
      if (previousRing < 0 && frame) {
        frame.headSideX = sideX;
        frame.headSideY = sideY;
        frame.headSideZ = sideZ;
        frame.hasHeadSide = true;
      }
      const depthX = ty * sideZ - tz * sideY;
      const depthY = tz * sideX - tx * sideZ;
      const depthZ = tx * sideY - ty * sideX;

      const speed =
        (this.speeds[Math.max(0, segment - 1)]! +
          this.speeds[segment]! +
          this.speeds[segment + 1]! +
          this.speeds[Math.min(count - 1, segment + 2)]!) *
        0.25;
      const speedScale = Math.min(
        1,
        speed / Math.max(params.motionReferenceSpeed, EPSILON)
      );
      const birth =
        this.births[segment]! * (1 - t) + this.births[segment + 1]! * t;
      const life = Math.min(
        1,
        Math.max(0, (now - birth) / Math.max(params.lifetimeSeconds, EPSILON))
      );
      const endTaper = Math.min(1, sample / 3, (total - sample) / 3);
      const irregularity =
        0.975 + 0.025 * Math.sin(sample * 0.37 + speed * 0.7);
      const pressedRadius = 0.014 + params.strokeWidthMaxWorld * 0.12;
      const liftedRadius = 0.012 + params.strokeWidthMinWorld * 0.8;
      const radius =
        Math.min(
          0.065,
          Math.max(
            0.008,
            (pressedRadius * (1 - speedScale) + liftedRadius * speedScale) *
              irregularity
          )
        ) *
        (0.14 + 0.86 * Math.max(0, endTaper));
      const opacity =
        params.opacityMax *
        params.intensity *
        Math.pow(1 - life, params.resolvedPalette.watercolor ? 1.4 : 0.8);
      const ring = this.ringCursor++;
      for (let cross = 0; cross < SIDES; cross++) {
        const angle = (cross * Math.PI * 2) / SIDES;
        const ca = Math.cos(angle),
          sa = Math.sin(angle);
        const surfaceX = sideX * ca + depthX * sa * 0.56;
        const surfaceY = sideY * ca + depthY * sa * 0.56;
        const surfaceZ = sideZ * ca + depthZ * sa * 0.56;
        const normalX = sideX * ca + (depthX * sa) / 0.56;
        const normalY = sideY * ca + (depthY * sa) / 0.56;
        const normalZ = sideZ * ca + (depthZ * sa) / 0.56;
        const normalLength = Math.hypot(normalX, normalY, normalZ);
        const vertex = ring * SIDES + cross;
        const v3 = vertex * 3;
        this.positions[v3] = x + radius * surfaceX;
        this.positions[v3 + 1] = y + radius * surfaceY;
        this.positions[v3 + 2] = z + radius * surfaceZ;
        this.normals[v3] = normalX / normalLength;
        this.normals[v3 + 1] = normalY / normalLength;
        this.normals[v3 + 2] = normalZ / normalLength;
        this.pigments[v3] = this.pigment.right;
        this.pigments[v3 + 1] = this.pigment.green;
        this.pigments[v3 + 2] = this.pigment.left;
        this.edges[v3] = this.edge.right;
        this.edges[v3 + 1] = this.edge.green;
        this.edges[v3 + 2] = this.edge.left;
        this.alphas[vertex] = opacity;
        this.wetness[vertex] = params.emissiveMaterial ? 1 : params.viscosity;
      }
      if (previousRing >= 0) {
        for (let cross = 0; cross < SIDES; cross++) {
          const next = (cross + 1) % SIDES;
          const a = previousRing * SIDES + cross;
          const b = previousRing * SIDES + next;
          const c = ring * SIDES + cross;
          const d = ring * SIDES + next;
          this.indices[this.indexCursor++] = a;
          this.indices[this.indexCursor++] = b;
          this.indices[this.indexCursor++] = c;
          this.indices[this.indexCursor++] = b;
          this.indices[this.indexCursor++] = d;
          this.indices[this.indexCursor++] = c;
        }
      }
      previousRing = ring;
      previousTangentX = tx;
      previousTangentY = ty;
      previousTangentZ = tz;
    }
    if (this.indexCursor > groupStart) {
      this.geometry.addGroup(
        groupStart,
        this.indexCursor - groupStart,
        params.emissiveMaterial ? 1 : 0
      );
    }
  }

  commit(): void {
    if (this.ringCursor === 0 && this.committedIndices === 0) return;
    const vertexCount = this.ringCursor * SIDES;
    for (const [name, elements] of [
      ["position", 3],
      ["normal", 3],
      ["pigment", 3],
      ["edge", 3],
      ["alpha", 1],
      ["wetness", 1],
    ] as const) {
      const attribute = this.geometry.getAttribute(name) as BufferAttribute;
      attribute.clearUpdateRanges();
      if (vertexCount > 0) {
        attribute.addUpdateRange(0, vertexCount * elements);
        attribute.needsUpdate = true;
      }
    }
    const index = this.geometry.index as BufferAttribute;
    index.clearUpdateRanges();
    if (this.indexCursor > 0) {
      index.addUpdateRange(0, this.indexCursor);
      index.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, this.indexCursor);
    this.committedIndices = this.indexCursor;
  }

  clear(): void {
    this.beginFrame();
    this.commit();
  }
  dispose(): void {
    this.geometry.dispose();
  }

  private attribute(name: string, data: Float32Array, size: number): void {
    this.geometry.setAttribute(
      name,
      new BufferAttribute(data, size).setUsage(DynamicDrawUsage)
    );
  }
}
