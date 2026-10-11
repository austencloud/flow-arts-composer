import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from "three";
import type { Silk3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import { setRgbFromHex, type MutableRgb } from "../instancing/particle-color";
import type { BoundedSourcePath3D } from "../scene-effects/bounded-source-path-3d";

const EPSILON = 1e-8;
const MAX_PATH_POINTS_PER_RIBBON = 320;
const MAX_RENDER_POINTS_PER_RIBBON = 2560;
const MAX_SPLINE_SUBDIVISIONS = 8;
export const SILK_CROSS_SECTION_VERTEX_COUNT = 7;

export interface SilkRibbonFrame3D {
  headSideX: number;
  headSideY: number;
  headSideZ: number;
  hasHeadSide: boolean;
  propColor?: string;
  dynamicPositions?: Float32Array;
  dynamicVelocities?: Float32Array;
  dynamicCount?: number;
  pathExtended?: boolean;
}

export interface SilkMaterialProfile3D {
  sheen: number;
  roughness: number;
  translucency: number;
  weaveFrequency: number;
  identityMix: number;
}

const SILK_MATERIAL_PROFILES: Record<string, SilkMaterialProfile3D> = {
  satin: {
    sheen: 0.94,
    roughness: 0.22,
    translucency: 0.16,
    weaveFrequency: 34,
    identityMix: 0.68,
  },
  velvet: {
    sheen: 0.42,
    roughness: 0.82,
    translucency: 0.02,
    weaveFrequency: 24,
    identityMix: 0.2,
  },
  ethereal: {
    sheen: 0.82,
    roughness: 0.34,
    translucency: 0.38,
    weaveFrequency: 29,
    identityMix: 0.22,
  },
  shadow: {
    sheen: 0.3,
    roughness: 0.76,
    translucency: 0.12,
    weaveFrequency: 21,
    identityMix: 0.18,
  },
  gold_leaf: {
    sheen: 0.88,
    roughness: 0.3,
    translucency: 0.04,
    weaveFrequency: 18,
    identityMix: 0.1,
  },
  ember: {
    sheen: 0.58,
    roughness: 0.5,
    translucency: 0.18,
    weaveFrequency: 27,
    identityMix: 0.14,
  },
  custom: {
    sheen: 0.74,
    roughness: 0.44,
    translucency: 0.14,
    weaveFrequency: 27,
    identityMix: 0.42,
  },
};

export function resolveSilkMaterialProfile3D(
  paletteId: string
): Readonly<SilkMaterialProfile3D> {
  return SILK_MATERIAL_PROFILES[paletteId] ?? SILK_MATERIAL_PROFILES.custom!;
}

export function resolveSilkAttachmentScale(
  arcDistance: number,
  baseHalfWidth: number
): number {
  const openDistance = Math.max(0.08, baseHalfWidth * 0.9);
  return 0.06 + smoothstep(arcDistance, 0.012, openDistance) * 0.94;
}

/**
 * One allocation-free, indexed fabric surface shared by every active Silk
 * source. Each source writes a separate quad strip into the same buffers.
 */
export class SilkRibbonGeometry3D {
  readonly geometry = new BufferGeometry();

  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly ribbonTangents: Float32Array;
  private readonly bodyColors: Float32Array;
  private readonly edgeColors: Float32Array;
  private readonly alphas: Float32Array;
  private readonly ribbonEdges: Float32Array;
  private readonly progresses: Float32Array;
  private readonly emissives: Float32Array;
  private readonly sheens: Float32Array;
  private readonly roughnesses: Float32Array;
  private readonly translucencies: Float32Array;
  private readonly weaveFrequencies: Float32Array;
  private readonly indices: Uint32Array;

  private readonly rawCenters = new Float32Array(
    MAX_PATH_POINTS_PER_RIBBON * 3
  );
  private readonly rawCenterScratch = new Float32Array(
    MAX_PATH_POINTS_PER_RIBBON * 3
  );
  private readonly rawBirths = new Float32Array(MAX_PATH_POINTS_PER_RIBBON);
  private readonly rawSpeeds = new Float32Array(MAX_PATH_POINTS_PER_RIBBON);
  private readonly centers = new Float32Array(MAX_RENDER_POINTS_PER_RIBBON * 3);
  private readonly births = new Float32Array(MAX_RENDER_POINTS_PER_RIBBON);
  private readonly speeds = new Float32Array(MAX_RENDER_POINTS_PER_RIBBON);
  private readonly tangents = new Float32Array(
    MAX_RENDER_POINTS_PER_RIBBON * 3
  );
  private readonly sides = new Float32Array(MAX_RENDER_POINTS_PER_RIBBON * 3);
  private readonly arcLengths = new Float32Array(MAX_RENDER_POINTS_PER_RIBBON);
  private readonly body: MutableRgb = { right: 1, green: 1, left: 1 };
  private readonly bodyAlt: MutableRgb = { right: 1, green: 1, left: 1 };
  private readonly edge: MutableRgb = { right: 1, green: 1, left: 1 };
  private readonly edgeAlt: MutableRgb = { right: 1, green: 1, left: 1 };
  private readonly propTint: MutableRgb = { right: 1, green: 1, left: 1 };
  private sampleCursor = 0;
  private indexCursor = 0;
  /** Index count published by the last commit(). Lets an idle ribbon skip republishing an already-empty frame. */
  private committedIndexCount = 0;

  constructor(private readonly sampleCapacity: number) {
    const vertexCapacity = sampleCapacity * SILK_CROSS_SECTION_VERTEX_COUNT;
    this.positions = new Float32Array(vertexCapacity * 3);
    this.normals = new Float32Array(vertexCapacity * 3);
    this.ribbonTangents = new Float32Array(vertexCapacity * 3);
    this.bodyColors = new Float32Array(vertexCapacity * 3);
    this.edgeColors = new Float32Array(vertexCapacity * 3);
    this.alphas = new Float32Array(vertexCapacity);
    this.ribbonEdges = new Float32Array(vertexCapacity);
    this.progresses = new Float32Array(vertexCapacity);
    this.emissives = new Float32Array(vertexCapacity);
    this.sheens = new Float32Array(vertexCapacity);
    this.roughnesses = new Float32Array(vertexCapacity);
    this.translucencies = new Float32Array(vertexCapacity);
    this.weaveFrequencies = new Float32Array(vertexCapacity);
    this.indices = new Uint32Array(
      sampleCapacity * (SILK_CROSS_SECTION_VERTEX_COUNT - 1) * 6
    );

    this.setDynamicAttribute("position", this.positions, 3);
    this.setDynamicAttribute("normal", this.normals, 3);
    this.setDynamicAttribute("ribbonTangent", this.ribbonTangents, 3);
    this.setDynamicAttribute("bodyColor", this.bodyColors, 3);
    this.setDynamicAttribute("edgeColor", this.edgeColors, 3);
    this.setDynamicAttribute("alpha", this.alphas, 1);
    this.setDynamicAttribute("ribbonEdge", this.ribbonEdges, 1);
    this.setDynamicAttribute("progress", this.progresses, 1);
    this.setDynamicAttribute("emissive", this.emissives, 1);
    this.setDynamicAttribute("sheen", this.sheens, 1);
    this.setDynamicAttribute("roughness", this.roughnesses, 1);
    this.setDynamicAttribute("translucency", this.translucencies, 1);
    this.setDynamicAttribute("weaveFrequency", this.weaveFrequencies, 1);
    const index = new BufferAttribute(this.indices, 1);
    index.setUsage(DynamicDrawUsage);
    this.geometry.setIndex(index);
    this.geometry.setDrawRange(0, 0);
  }

  beginFrame(): void {
    this.sampleCursor = 0;
    this.indexCursor = 0;
  }

  writeRibbon(
    path: BoundedSourcePath3D,
    params: Silk3DParams,
    currentTime: number,
    frame: SilkRibbonFrame3D,
    energyScale = 1,
    sampleBudget = Number.POSITIVE_INFINITY,
    delta = 1 / 60
  ): void {
    const available = this.sampleCapacity - this.sampleCursor;
    const rawCount = Math.min(
      path.count,
      params.maxPointsPerTip,
      MAX_PATH_POINTS_PER_RIBBON
    );
    if (rawCount < 2 || available < 2) return;

    const count = this.readCenters(
      path,
      rawCount,
      Math.min(sampleBudget, available),
      frame,
      params,
      currentTime,
      delta
    );
    this.writeTangents(count);
    this.writeTransportedSides(count, frame);
    const materialProfile = resolveSilkMaterialProfile3D(
      params.resolvedPalette.id
    );
    this.resolveColors(params, frame, materialProfile);

    const baseVertex = this.sampleCursor * SILK_CROSS_SECTION_VERTEX_COUNT;
    for (let sample = 0; sample < count; sample++) {
      this.writeSample(
        baseVertex,
        sample,
        count,
        params,
        currentTime,
        energyScale,
        materialProfile
      );
    }
    for (let segment = 0; segment < count - 1; segment++) {
      const currentRow = baseVertex + segment * SILK_CROSS_SECTION_VERTEX_COUNT;
      const nextRow = currentRow + SILK_CROSS_SECTION_VERTEX_COUNT;
      for (
        let cross = 0;
        cross < SILK_CROSS_SECTION_VERTEX_COUNT - 1;
        cross++
      ) {
        const v0 = currentRow + cross;
        const v1 = v0 + 1;
        const v2 = nextRow + cross;
        const v3 = v2 + 1;
        this.indices[this.indexCursor++] = v0;
        this.indices[this.indexCursor++] = v1;
        this.indices[this.indexCursor++] = v2;
        this.indices[this.indexCursor++] = v1;
        this.indices[this.indexCursor++] = v3;
        this.indices[this.indexCursor++] = v2;
      }
    }
    this.sampleCursor += count;
  }

  /**
   * Publishes this frame's writes to the GPU.
   *
   * Every dirtied attribute carries an explicit update range, and an attribute
   * that received no writes stays clean. That matters more than it looks:
   * three's WebGLAttributes.updateBuffer falls back to uploading the ENTIRE
   * backing array when an attribute is dirty with no update ranges, so an idle
   * ribbon used to push 4.8 MB of bufferSubData every frame for a mesh whose
   * draw range was zero. Nothing reads a stale tail either way - setDrawRange
   * bounds every draw to what this frame actually wrote.
   */
  commit(): void {
    const vertexCount = this.sampleCursor * SILK_CROSS_SECTION_VERTEX_COUNT;
    if (
      vertexCount === 0 &&
      this.indexCursor === 0 &&
      this.committedIndexCount === 0
    ) {
      // An empty ribbon was already published: buffers are clean and the draw
      // range is already zero, so there is nothing to republish.
      return;
    }
    this.markUpdated("position", vertexCount * 3);
    this.markUpdated("normal", vertexCount * 3);
    this.markUpdated("ribbonTangent", vertexCount * 3);
    this.markUpdated("bodyColor", vertexCount * 3);
    this.markUpdated("edgeColor", vertexCount * 3);
    this.markUpdated("alpha", vertexCount);
    this.markUpdated("ribbonEdge", vertexCount);
    this.markUpdated("progress", vertexCount);
    this.markUpdated("emissive", vertexCount);
    this.markUpdated("sheen", vertexCount);
    this.markUpdated("roughness", vertexCount);
    this.markUpdated("translucency", vertexCount);
    this.markUpdated("weaveFrequency", vertexCount);
    const index = this.geometry.index as BufferAttribute;
    index.clearUpdateRanges();
    if (this.indexCursor > 0) {
      index.addUpdateRange(0, this.indexCursor);
      index.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, this.indexCursor);
    this.committedIndexCount = this.indexCursor;
  }

  /** Index count published by the last commit(); 0 means nothing is drawn. */
  get drawCount(): number {
    return this.committedIndexCount;
  }

  clear(): void {
    this.beginFrame();
    this.commit();
  }

  dispose(): void {
    this.geometry.dispose();
  }

  private readCenters(
    path: BoundedSourcePath3D,
    rawCount: number,
    renderBudget: number,
    frame: SilkRibbonFrame3D,
    params: Silk3DParams,
    currentTime: number,
    delta: number
  ): number {
    for (let sample = 0; sample < rawCount; sample++) {
      const pathIndex = path.indexFromNewest(sample);
      const i3 = sample * 3;
      this.rawCenters[i3] = path.xAt(pathIndex);
      this.rawCenters[i3 + 1] = path.yAt(pathIndex);
      this.rawCenters[i3 + 2] = path.zAt(pathIndex);
      this.rawBirths[sample] = path.birthAt(pathIndex);
      this.rawSpeeds[sample] = path.speedAt(pathIndex);
    }

    const dynamicPositions = frame.dynamicPositions;
    const dynamicVelocities = frame.dynamicVelocities;
    if (dynamicPositions && dynamicVelocities) {
      let dynamicCount = Math.min(frame.dynamicCount ?? 0, rawCount);
      if (frame.pathExtended) {
        const shiftCount = Math.min(dynamicCount, rawCount - 1);
        for (let sample = shiftCount; sample >= 1; sample--) {
          const target = sample * 3;
          const source = target - 3;
          dynamicPositions[target] = dynamicPositions[source]!;
          dynamicPositions[target + 1] = dynamicPositions[source + 1]!;
          dynamicPositions[target + 2] = dynamicPositions[source + 2]!;
          dynamicVelocities[target] = dynamicVelocities[source]!;
          dynamicVelocities[target + 1] = dynamicVelocities[source + 1]!;
          dynamicVelocities[target + 2] = dynamicVelocities[source + 2]!;
        }
        dynamicPositions[0] = this.rawCenters[0]!;
        dynamicPositions[1] = this.rawCenters[1]!;
        dynamicPositions[2] = this.rawCenters[2]!;
        dynamicVelocities[0] = 0;
        dynamicVelocities[1] = 0;
        dynamicVelocities[2] = 0;
        dynamicCount = Math.min(rawCount, dynamicCount + 1);
        frame.pathExtended = false;
      }

      for (let sample = dynamicCount; sample < rawCount; sample++) {
        const i3 = sample * 3;
        dynamicPositions[i3] = this.rawCenters[i3]!;
        dynamicPositions[i3 + 1] = this.rawCenters[i3 + 1]!;
        dynamicPositions[i3 + 2] = this.rawCenters[i3 + 2]!;
        dynamicVelocities[i3] = 0;
        dynamicVelocities[i3 + 1] = 0;
        dynamicVelocities[i3 + 2] = 0;
      }
      dynamicCount = rawCount;

      const dt = clamp(delta, 0, 1 / 30);
      const attraction = 7 + params.tautness * 17;
      const damping = Math.exp(-(4.2 + params.tautness * 3.8) * dt);
      const gravity =
        (0.12 + params.flutter * 0.34) * (1 - params.tautness * 0.72);
      for (let sample = 1; sample < rawCount; sample++) {
        const i3 = sample * 3;
        const trailing = sample / Math.max(1, rawCount - 1);
        const windPhase = currentTime * 2.1 + sample * 0.37;
        const wind =
          Math.sin(windPhase) * params.flutter * trailing * trailing * 0.2;
        let velocityX =
          dynamicVelocities[i3]! +
          (this.rawCenters[i3]! - dynamicPositions[i3]!) * attraction * dt;
        let velocityY =
          dynamicVelocities[i3 + 1]! +
          (this.rawCenters[i3 + 1]! - dynamicPositions[i3 + 1]!) *
            attraction *
            dt -
          gravity * trailing * dt;
        let velocityZ =
          dynamicVelocities[i3 + 2]! +
          (this.rawCenters[i3 + 2]! - dynamicPositions[i3 + 2]!) *
            attraction *
            dt;
        velocityX = (velocityX + wind * dt) * damping;
        velocityY *= damping;
        velocityZ =
          (velocityZ + Math.cos(windPhase * 0.83) * wind * dt) * damping;
        dynamicVelocities[i3] = velocityX;
        dynamicVelocities[i3 + 1] = velocityY;
        dynamicVelocities[i3 + 2] = velocityZ;
        dynamicPositions[i3] = dynamicPositions[i3]! + velocityX * dt;
        dynamicPositions[i3 + 1] = dynamicPositions[i3 + 1]! + velocityY * dt;
        dynamicPositions[i3 + 2] = dynamicPositions[i3 + 2]! + velocityZ * dt;
      }

      // The head is pinned. Every following point keeps the path's travelled
      // length, which turns the relaxed history into a streamer rather than a
      // shrinking spline.
      for (let iteration = 0; iteration < 3; iteration++) {
        dynamicPositions[0] = this.rawCenters[0]!;
        dynamicPositions[1] = this.rawCenters[1]!;
        dynamicPositions[2] = this.rawCenters[2]!;
        for (let sample = 1; sample < rawCount; sample++) {
          const i3 = sample * 3;
          const previous = i3 - 3;
          const targetDistance = Math.max(
            0.01,
            Math.hypot(
              this.rawCenters[i3]! - this.rawCenters[previous]!,
              this.rawCenters[i3 + 1]! - this.rawCenters[previous + 1]!,
              this.rawCenters[i3 + 2]! - this.rawCenters[previous + 2]!
            )
          );
          const dx = dynamicPositions[i3]! - dynamicPositions[previous]!;
          const dy =
            dynamicPositions[i3 + 1]! - dynamicPositions[previous + 1]!;
          const dz =
            dynamicPositions[i3 + 2]! - dynamicPositions[previous + 2]!;
          const distance = Math.hypot(dx, dy, dz) || targetDistance;
          const correction = ((distance - targetDistance) / distance) * 0.9;
          dynamicPositions[i3] = dynamicPositions[i3]! - dx * correction;
          dynamicPositions[i3 + 1] = dynamicPositions[i3 + 1]! - dy * correction;
          dynamicPositions[i3 + 2] = dynamicPositions[i3 + 2]! - dz * correction;
        }
      }

      this.rawCenters.set(dynamicPositions.subarray(0, rawCount * 3));
      frame.dynamicCount = dynamicCount;
    }

    // Raw tip history contains the choreography's intentional corners. Fabric
    // carries momentum through those corners instead of creasing like folded
    // cardboard. Two bounded relaxation passes remove the remaining kinks
    // while the attachment stays welded to the live tip.
    for (let pass = 0; pass < 2; pass++) {
      this.rawCenterScratch.set(this.rawCenters.subarray(0, rawCount * 3));
      for (let sample = 1; sample < rawCount - 1; sample++) {
        const i3 = sample * 3;
        const previous = i3 - 3;
        const next = i3 + 3;
        const trailingWeight = 0.2 + (sample / (rawCount - 1)) * 0.08;
        const centerWeight = 1 - trailingWeight * 2;
        this.rawCenters[i3] =
          this.rawCenterScratch[previous]! * trailingWeight +
          this.rawCenterScratch[i3]! * centerWeight +
          this.rawCenterScratch[next]! * trailingWeight;
        this.rawCenters[i3 + 1] =
          this.rawCenterScratch[previous + 1]! * trailingWeight +
          this.rawCenterScratch[i3 + 1]! * centerWeight +
          this.rawCenterScratch[next + 1]! * trailingWeight;
        this.rawCenters[i3 + 2] =
          this.rawCenterScratch[previous + 2]! * trailingWeight +
          this.rawCenterScratch[i3 + 2]! * centerWeight +
          this.rawCenterScratch[next + 2]! * trailingWeight;
      }
    }

    const maximumByBudget = Math.max(
      1,
      Math.floor((Math.max(2, renderBudget) - 1) / (rawCount - 1))
    );
    const subdivisions = Math.min(MAX_SPLINE_SUBDIVISIONS, maximumByBudget);
    let renderCount = 0;
    for (let segment = 0; segment < rawCount - 1; segment++) {
      const p0 = Math.max(0, segment - 1) * 3;
      const p1 = segment * 3;
      const p2 = (segment + 1) * 3;
      const p3 = Math.min(rawCount - 1, segment + 2) * 3;
      for (let subdivision = 0; subdivision < subdivisions; subdivision++) {
        const t = subdivision / subdivisions;
        const target = renderCount * 3;
        this.centers[target] = catmullRomScalar(
          this.rawCenters[p0]!,
          this.rawCenters[p1]!,
          this.rawCenters[p2]!,
          this.rawCenters[p3]!,
          t
        );
        this.centers[target + 1] = catmullRomScalar(
          this.rawCenters[p0 + 1]!,
          this.rawCenters[p1 + 1]!,
          this.rawCenters[p2 + 1]!,
          this.rawCenters[p3 + 1]!,
          t
        );
        this.centers[target + 2] = catmullRomScalar(
          this.rawCenters[p0 + 2]!,
          this.rawCenters[p1 + 2]!,
          this.rawCenters[p2 + 2]!,
          this.rawCenters[p3 + 2]!,
          t
        );
        this.births[renderCount] = mix(
          this.rawBirths[segment]!,
          this.rawBirths[segment + 1]!,
          t
        );
        this.speeds[renderCount] = mix(
          this.rawSpeeds[segment]!,
          this.rawSpeeds[segment + 1]!,
          t
        );
        renderCount++;
      }
    }
    const finalRaw = (rawCount - 1) * 3;
    const finalRender = renderCount * 3;
    this.centers[finalRender] = this.rawCenters[finalRaw]!;
    this.centers[finalRender + 1] = this.rawCenters[finalRaw + 1]!;
    this.centers[finalRender + 2] = this.rawCenters[finalRaw + 2]!;
    this.births[renderCount] = this.rawBirths[rawCount - 1]!;
    this.speeds[renderCount] = this.rawSpeeds[rawCount - 1]!;
    renderCount++;

    this.arcLengths[0] = 0;
    for (let sample = 1; sample < renderCount; sample++) {
      const i3 = sample * 3;
      const previous = i3 - 3;
      this.arcLengths[sample] =
        this.arcLengths[sample - 1]! +
        Math.hypot(
          this.centers[i3]! - this.centers[previous]!,
          this.centers[i3 + 1]! - this.centers[previous + 1]!,
          this.centers[i3 + 2]! - this.centers[previous + 2]!
        );
    }
    return renderCount;
  }

  private writeTangents(count: number): void {
    for (let sample = 0; sample < count; sample++) {
      const previous = Math.max(0, sample - 1) * 3;
      const next = Math.min(count - 1, sample + 1) * 3;
      const i3 = sample * 3;
      let tx = this.centers[next]! - this.centers[previous]!;
      let ty = this.centers[next + 1]! - this.centers[previous + 1]!;
      let tz = this.centers[next + 2]! - this.centers[previous + 2]!;
      let length = Math.hypot(tx, ty, tz);
      if (length < EPSILON && sample > 0) {
        tx = this.tangents[i3 - 3]!;
        ty = this.tangents[i3 - 2]!;
        tz = this.tangents[i3 - 1]!;
        length = 1;
      } else if (length < EPSILON) {
        tx = 0;
        ty = -1;
        tz = 0;
        length = 1;
      }
      this.tangents[i3] = tx / length;
      this.tangents[i3 + 1] = ty / length;
      this.tangents[i3 + 2] = tz / length;
    }
  }

  private writeTransportedSides(count: number, frame: SilkRibbonFrame3D): void {
    const tx = this.tangents[0]!;
    const ty = this.tangents[1]!;
    const tz = this.tangents[2]!;
    // Choreography is authored in the stage's XY plane, so that plane is the
    // ribbon's natural rest orientation. Parallel transport preserves real
    // turns; a soft rest-plane bias prevents a horizontal stroke from rolling
    // the whole cloth edge-on and disappearing from the default view.
    let sx = frame.hasHeadSide ? frame.headSideX : -ty;
    let sy = frame.hasHeadSide ? frame.headSideY : tx;
    let sz = frame.hasHeadSide ? frame.headSideZ : 0;
    let along = sx * tx + sy * ty + sz * tz;
    sx -= tx * along;
    sy -= ty * along;
    sz -= tz * along;
    let length = Math.hypot(sx, sy, sz);
    if (length < EPSILON) {
      sx = ty;
      sy = -tx;
      sz = 0;
      length = Math.hypot(sx, sy, sz) || 1;
    }
    sx /= length;
    sy /= length;
    sz /= length;
    this.sides[0] = sx;
    this.sides[1] = sy;
    this.sides[2] = sz;
    frame.headSideX = sx;
    frame.headSideY = sy;
    frame.headSideZ = sz;
    frame.hasHeadSide = true;

    for (let sample = 1; sample < count; sample++) {
      const i3 = sample * 3;
      const currentTx = this.tangents[i3]!;
      const currentTy = this.tangents[i3 + 1]!;
      const currentTz = this.tangents[i3 + 2]!;
      along = sx * currentTx + sy * currentTy + sz * currentTz;
      let nextSx = sx - currentTx * along;
      let nextSy = sy - currentTy * along;
      let nextSz = sz - currentTz * along;
      length = Math.hypot(nextSx, nextSy, nextSz);
      if (length < EPSILON) {
        nextSx = -currentTy;
        nextSy = currentTx;
        nextSz = 0;
        length = Math.hypot(nextSx, nextSy, nextSz) || 1;
      }
      nextSx /= length;
      nextSy /= length;
      nextSz /= length;

      const restLength = Math.hypot(currentTx, currentTy);
      if (restLength > EPSILON) {
        let restX = -currentTy / restLength;
        let restY = currentTx / restLength;
        if (restX * nextSx + restY * nextSy < 0) {
          restX = -restX;
          restY = -restY;
        }
        const restBias = 0.68;
        nextSx = mix(nextSx, restX, restBias);
        nextSy = mix(nextSy, restY, restBias);
        nextSz = mix(nextSz, 0, restBias);
        length = Math.hypot(nextSx, nextSy, nextSz) || 1;
      } else {
        length = 1;
      }
      sx = nextSx / length;
      sy = nextSy / length;
      sz = nextSz / length;
      this.sides[i3] = sx;
      this.sides[i3 + 1] = sy;
      this.sides[i3 + 2] = sz;
    }
  }

  private resolveColors(
    params: Silk3DParams,
    frame: SilkRibbonFrame3D,
    materialProfile: Readonly<SilkMaterialProfile3D>
  ): void {
    setRgbFromHex(this.body, params.resolvedPalette.body);
    setRgbFromHex(
      this.bodyAlt,
      params.resolvedPalette.bodyAlt ?? params.resolvedPalette.body
    );
    setRgbFromHex(this.edge, params.resolvedPalette.edge);
    setRgbFromHex(
      this.edgeAlt,
      params.resolvedPalette.edgeAlt ?? params.resolvedPalette.edge
    );
    setRgbFromHex(
      this.propTint,
      frame.propColor ?? params.resolvedPalette.body
    );

    // A light trace of the canonical prop color keeps crossings readable.
    // The palette still dominates, so Gold remains gold and Velvet remains red.
    const bodyMix = materialProfile.identityMix;
    const edgeMix = Math.min(0.42, bodyMix + 0.08);
    for (const color of [this.body, this.bodyAlt]) {
      color.right = mix(color.right, this.propTint.right, bodyMix);
      color.green = mix(color.green, this.propTint.green, bodyMix);
      color.left = mix(color.left, this.propTint.left, bodyMix);
    }
    for (const color of [this.edge, this.edgeAlt]) {
      color.right = mix(color.right, this.propTint.right, edgeMix);
      color.green = mix(color.green, this.propTint.green, edgeMix);
      color.left = mix(color.left, this.propTint.left, edgeMix);
    }
  }

  private writeSample(
    baseVertex: number,
    sample: number,
    count: number,
    params: Silk3DParams,
    currentTime: number,
    energyScale: number,
    materialProfile: Readonly<SilkMaterialProfile3D>
  ): void {
    const i3 = sample * 3;
    const life = clamp(
      (currentTime - this.births[sample]!) / params.lifetimeSeconds,
      0,
      1
    );
    const sampleProgress = sample / Math.max(1, count - 1);
    const tailEnvelope = 1 - smoothstep(sampleProgress, 0.72, 1);
    const speedScale = clamp(
      this.speeds[sample]! / params.motionReferenceSpeed,
      0,
      1
    );

    const tx = this.tangents[i3]!;
    const ty = this.tangents[i3 + 1]!;
    const tz = this.tangents[i3 + 2]!;
    const sx = this.sides[i3]!;
    const sy = this.sides[i3 + 1]!;
    const sz = this.sides[i3 + 2]!;
    let nx = ty * sz - tz * sy;
    let ny = tz * sx - tx * sz;
    let nz = tx * sy - ty * sx;

    const previousTangent = Math.max(0, sample - 1) * 3;
    const nextTangent = Math.min(count - 1, sample + 1) * 3;
    const tangentDot = clamp(
      this.tangents[previousTangent]! * this.tangents[nextTangent]! +
        this.tangents[previousTangent + 1]! * this.tangents[nextTangent + 1]! +
        this.tangents[previousTangent + 2]! * this.tangents[nextTangent + 2]!,
      -1,
      1
    );
    const speedChange =
      Math.abs(
        this.speeds[sample]! - this.speeds[Math.min(sample + 1, count - 1)]!
      ) / params.motionReferenceSpeed;
    const motionLoad = clamp((1 - tangentDot) * 5.5 + speedChange * 0.72, 0, 1);
    const surfaceEnergy = clamp(
      0.12 + params.flutter * 0.5 + motionLoad * 0.58,
      0,
      1
    );
    const phase =
      currentTime * (1.7 + params.flutter * 1.4) -
      sample * (0.19 + motionLoad * 0.13);

    // Transport gives the ribbon a stable frame. Motion load then twists that
    // frame, so direction changes travel down the cloth instead of producing a
    // camera-facing strip or a time-only sine wave.
    const attachmentRelease = smoothstep(
      this.arcLengths[sample]!,
      0.01,
      Math.max(0.1, params.baseHalfWidthWorld * 0.85)
    );
    const twist =
      Math.sin(phase) *
      (0.025 + surfaceEnergy * 0.29) *
      attachmentRelease *
      (0.25 + tailEnvelope * 0.75);
    let widthX = sx + nx * twist;
    let widthY = sy + ny * twist;
    let widthZ = sz + nz * twist;
    const widthLength = Math.hypot(widthX, widthY, widthZ) || 1;
    widthX /= widthLength;
    widthY /= widthLength;
    widthZ /= widthLength;
    nx = ty * widthZ - tz * widthY;
    ny = tz * widthX - tx * widthZ;
    nz = tx * widthY - ty * widthX;
    const normalLength = Math.hypot(nx, ny, nz) || 1;
    nx /= normalLength;
    ny /= normalLength;
    nz /= normalLength;

    const attachmentScale = resolveSilkAttachmentScale(
      this.arcLengths[sample]!,
      params.baseHalfWidthWorld
    );
    const ageTaper = Math.pow(Math.max(0, 1 - life), 0.72);
    const tailTaper = 1 - smoothstep(sampleProgress, 0.76, 1) * 0.96;
    const motionTightening = 1 - params.tautness * speedScale * 0.52;
    const widthPulse =
      1 +
      Math.sin(phase * 0.83 + motionLoad * 1.4) *
        surfaceEnergy *
        attachmentRelease *
        tailEnvelope *
        0.1;
    const halfWidth =
      params.baseHalfWidthWorld *
      (0.42 + params.intensity * 0.28) *
      attachmentScale *
      ageTaper *
      tailTaper *
      motionTightening *
      widthPulse;
    const flutterOffset =
      Math.sin(phase * 0.71 + 0.8) *
      attachmentRelease *
      (halfWidth * surfaceEnergy * 0.34 +
        params.baseHalfWidthWorld * params.flutter * 0.55);
    const gravitySag =
      params.baseHalfWidthWorld *
      (0.16 + params.flutter * 0.84) *
      (1 - params.tautness) *
      life *
      life *
      0.16;
    const centerX = this.centers[i3]! + nx * flutterOffset;
    const centerY = this.centers[i3 + 1]! + ny * flutterOffset - gravitySag;
    const centerZ = this.centers[i3 + 2]! + nz * flutterOffset;
    const colorMix = params.resolvedPalette.hueShift ? life : life * 0.08;
    const bodyRight = mix(this.body.right, this.bodyAlt.right, colorMix);
    const bodyGreen = mix(this.body.green, this.bodyAlt.green, colorMix);
    const bodyLeft = mix(this.body.left, this.bodyAlt.left, colorMix);
    const edgeRight = mix(this.edge.right, this.edgeAlt.right, colorMix);
    const edgeGreen = mix(this.edge.green, this.edgeAlt.green, colorMix);
    const edgeLeft = mix(this.edge.left, this.edgeAlt.left, colorMix);
    const alpha =
      Math.sqrt(params.intensity) *
      energyScale *
      Math.pow(Math.max(0, 1 - life), 1.15) *
      (0.2 + tailEnvelope * 0.8);
    const emissive = params.resolvedPalette.emissive ? 1 : 0;
    const totalArcLength = this.arcLengths[count - 1]!;
    const arcProgress =
      totalArcLength > EPSILON
        ? this.arcLengths[sample]! / totalArcLength
        : sampleProgress;
    const crownAmplitude =
      halfWidth * (0.045 + surfaceEnergy * 0.2) * Math.sin(phase * 0.43 + 0.9);
    const pleatAmplitude = halfWidth * (0.04 + surfaceEnergy * 0.24);
    const foldPhase = phase * 0.36 + motionLoad * 1.8;

    for (
      let crossIndex = 0;
      crossIndex < SILK_CROSS_SECTION_VERTEX_COUNT;
      crossIndex++
    ) {
      const across =
        (crossIndex / (SILK_CROSS_SECTION_VERTEX_COUNT - 1)) * 2 - 1;
      const edgeEnvelope = 1 - across * across;
      const crossPhase = across * Math.PI * 1.5 + foldPhase;
      const foldSignal = crownAmplitude + pleatAmplitude * Math.sin(crossPhase);
      const normalOffset = foldSignal * edgeEnvelope;
      const normalSlope =
        pleatAmplitude * Math.cos(crossPhase) * Math.PI * 1.5 * edgeEnvelope +
        foldSignal * -2 * across;
      const inverseHalfWidth = 1 / Math.max(0.001, halfWidth);
      let surfaceNormalX = nx - widthX * normalSlope * inverseHalfWidth;
      let surfaceNormalY = ny - widthY * normalSlope * inverseHalfWidth;
      let surfaceNormalZ = nz - widthZ * normalSlope * inverseHalfWidth;
      const surfaceNormalLength =
        Math.hypot(surfaceNormalX, surfaceNormalY, surfaceNormalZ) || 1;
      surfaceNormalX /= surfaceNormalLength;
      surfaceNormalY /= surfaceNormalLength;
      surfaceNormalZ /= surfaceNormalLength;

      const vertex =
        baseVertex + sample * SILK_CROSS_SECTION_VERTEX_COUNT + crossIndex;
      const v3 = vertex * 3;
      this.positions[v3] =
        centerX + widthX * halfWidth * across + nx * normalOffset;
      this.positions[v3 + 1] =
        centerY + widthY * halfWidth * across + ny * normalOffset;
      this.positions[v3 + 2] =
        centerZ + widthZ * halfWidth * across + nz * normalOffset;
      this.normals[v3] = surfaceNormalX;
      this.normals[v3 + 1] = surfaceNormalY;
      this.normals[v3 + 2] = surfaceNormalZ;
      this.ribbonTangents[v3] = tx;
      this.ribbonTangents[v3 + 1] = ty;
      this.ribbonTangents[v3 + 2] = tz;
      this.bodyColors[v3] = bodyRight;
      this.bodyColors[v3 + 1] = bodyGreen;
      this.bodyColors[v3 + 2] = bodyLeft;
      this.edgeColors[v3] = edgeRight;
      this.edgeColors[v3 + 1] = edgeGreen;
      this.edgeColors[v3 + 2] = edgeLeft;
      this.alphas[vertex] = alpha;
      this.ribbonEdges[vertex] = across;
      this.progresses[vertex] = arcProgress;
      this.emissives[vertex] = emissive;
      this.sheens[vertex] = materialProfile.sheen;
      this.roughnesses[vertex] = materialProfile.roughness;
      this.translucencies[vertex] = materialProfile.translucency;
      this.weaveFrequencies[vertex] = materialProfile.weaveFrequency;
    }
  }

  private setDynamicAttribute(
    name: string,
    array: Float32Array,
    itemSize: number
  ): void {
    const attribute = new BufferAttribute(array, itemSize);
    attribute.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute(name, attribute);
  }

  private markUpdated(name: string, componentCount: number): void {
    const attribute = this.geometry.getAttribute(name) as BufferAttribute;
    attribute.clearUpdateRanges();
    if (componentCount === 0) {
      // Nothing was written, and the draw range excludes whatever the previous
      // frame left behind. Leaving the attribute clean avoids a full-array
      // re-upload of a buffer nothing will read.
      return;
    }
    attribute.addUpdateRange(0, componentCount);
    attribute.needsUpdate = true;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value: number, minimum: number, maximum: number): number {
  const t = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function catmullRomScalar(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}
