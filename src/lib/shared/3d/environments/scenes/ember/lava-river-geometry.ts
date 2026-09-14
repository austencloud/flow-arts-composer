import {
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  Ray,
  Vector3,
  type BufferGeometry as BufferGeometryType,
  type Object3D,
} from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { LavaRiverChannelConfig } from "../../domain/models/scene-configs";

/**
 * Strip width added beyond the molten channel on each side, as a fraction of
 * the channel half-width. The shader terminates the surface on a noise contour
 * somewhere inside this margin, so the straight polygon edge never becomes the
 * silhouette the viewer reads as the shore.
 */
export const LAVA_RIVER_BANK_MARGIN_FRACTION = 0.34;

/**
 * Metres the outer margin descends below the channel floor. The carved bed in
 * the world GLB rises at the shore, so a margin that stays level rides up the
 * bank; descending tucks it under the levee instead.
 */
export const LAVA_RIVER_BANK_PLUNGE = 0.26;

/** Metres the channel floor dishes from the centreline to its nominal edge. */
export const LAVA_RIVER_CHANNEL_DISH = 0.05;

/** Metres the draped surface sits above the sampled terrain height. */
export const LAVA_RIVER_SURFACE_OFFSET = 0.1;

/**
 * Metres the outer margin is pushed below the terrain it is draped against, so
 * the polygon edge terminates inside the bank rather than on top of it.
 */
export const LAVA_RIVER_MARGIN_BURY = 0.14;

/**
 * Ceiling on how far the margin may chase terrain downward. Without it the
 * upper run — which rides a ridge crest whose bed falls five metres within one
 * channel width — would hang a five metre curtain off each shoulder.
 */
export const LAVA_RIVER_MAX_MARGIN_DROP = 1.2;

/**
 * Baked roles that form the walkable/basin ground sheet. Taken from the same
 * set the ground-detail material patch treats as surface (`ember-ground-detail.ts`),
 * minus `lava-channel-levee` and `stage-crust-transition`: the levee is the
 * raised bank beside the channel, and draping onto it would lift the ribbon out
 * of the bed the drape exists to find. Backdrop props (`meshy-*`) are excluded
 * outright — they are closed shells whose far wall reads as terrain from above.
 */
export const LAVA_RIVER_TERRAIN_ROLES: readonly string[] = [
  "volcanic-basin",
  "playable-surface",
  "playable-shelf",
  "shelf-stratum",
];

export interface LavaTerrainSampler {
  /** Highest allowed ground surface under (x, z), or null where none exists. */
  heightAt(x: number, z: number): number | null;
  /** Number of ground meshes the sampler resolved. Zero means no coverage. */
  readonly meshCount: number;
}

interface TerrainEntry {
  bvh: MeshBVH;
  toLocal: Matrix4;
  toWorld: Matrix4;
}

/**
 * BVHs are keyed by geometry so a scene rebuild (a look change, a config edit)
 * reuses the acceleration structure instead of re-walking 36k triangles.
 */
const bvhCache = new WeakMap<BufferGeometryType, MeshBVH>();

function acquireBvh(geometry: BufferGeometryType): MeshBVH | null {
  const cached = bvhCache.get(geometry);
  if (cached) return cached;
  if (!geometry.getAttribute("position")) return null;
  const bvh = new MeshBVH(geometry);
  bvhCache.set(geometry, bvh);
  return bvh;
}

/**
 * Collects the baked ground sheets from a loaded world asset into a downward
 * height query. Built once per river build; the strip, its margins, the vent
 * mouth, and the glow skirt all drape through this one sampler.
 */
export function createLavaTerrainSampler(
  root: Object3D | null | undefined,
  roles: readonly string[] = LAVA_RIVER_TERRAIN_ROLES
): LavaTerrainSampler | null {
  if (!root) return null;

  const allowed = new Set(roles);
  const entries: TerrainEntry[] = [];
  let top = -Infinity;
  let bottom = Infinity;

  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const role = child.userData?.tka_role as string | undefined;
    if (role === undefined || !allowed.has(role)) return;
    const geometry = child.geometry as BufferGeometryType | undefined;
    if (!geometry) return;
    const bvh = acquireBvh(geometry);
    if (!bvh) return;

    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box) {
      const worldBox = box.clone().applyMatrix4(child.matrixWorld);
      top = Math.max(top, worldBox.max.y);
      bottom = Math.min(bottom, worldBox.min.y);
    }

    entries.push({
      bvh,
      toLocal: new Matrix4().copy(child.matrixWorld).invert(),
      toWorld: new Matrix4().copy(child.matrixWorld),
    });
  });

  if (entries.length === 0) return null;

  const ceiling = Number.isFinite(top) ? top + 1 : 1;
  const floor = Number.isFinite(bottom) ? bottom - 1 : -1;

  const worldStart = new Vector3();
  const worldEnd = new Vector3();
  const localStart = new Vector3();
  const localEnd = new Vector3();
  const ray = new Ray();

  return {
    meshCount: entries.length,
    heightAt(x, z) {
      worldStart.set(x, ceiling, z);
      worldEnd.set(x, floor, z);
      let best: number | null = null;

      for (const entry of entries) {
        localStart.copy(worldStart).applyMatrix4(entry.toLocal);
        localEnd.copy(worldEnd).applyMatrix4(entry.toLocal);
        const span = localEnd.distanceTo(localStart);
        if (span <= 0) continue;
        ray.origin.copy(localStart);
        ray.direction.copy(localEnd).sub(localStart).divideScalar(span);

        const hit = entry.bvh.raycastFirst(ray, DoubleSide, 0, span);
        if (!hit) continue;
        const y = hit.point.clone().applyMatrix4(entry.toWorld).y;
        if (best === null || y > best) best = y;
      }

      return best;
    },
  };
}

export interface LavaRiverTerminusOptions {
  /** Fraction of the run, measured from the tail, that spreads into the toe. */
  fraction: number;
  /** Half-width multiplier at full spread, before the rounding cap. */
  spread: number;
  /** Where inside the toe the semicircular cap starts closing the outline. */
  capStart: number;
}

export interface LavaRiverSourceOptions {
  enabled: boolean;
  /** Mouth width across the flow, in channel widths. */
  widthScale: number;
  /** Mouth length along the flow, in channel widths. */
  lengthScale: number;
  /** Metres the mouth's centre sits below its rim. */
  bowlDepth: number;
  rings: number;
  sectors: number;
}

export interface LavaRiverGlowOptions {
  enabled: boolean;
  /** Half-span of the skirt in channel half-widths (1 is the channel edge). */
  reach: number;
  /** Metres the skirt floats above the terrain it drapes onto. */
  lift: number;
  columns: number;
}

export const LAVA_RIVER_TERMINUS: LavaRiverTerminusOptions = {
  fraction: 0.085,
  spread: 2.15,
  capStart: 0.55,
};

export const LAVA_RIVER_SOURCE: LavaRiverSourceOptions = {
  enabled: true,
  widthScale: 1.56,
  lengthScale: 1.25,
  bowlDepth: 0.55,
  rings: 14,
  sectors: 40,
};

export const LAVA_RIVER_GLOW: LavaRiverGlowOptions = {
  enabled: true,
  reach: 5.2,
  lift: 0.06,
  columns: 20,
};

interface LavaRiverGeometryOptions {
  channel: LavaRiverChannelConfig;
  poolPosition: { x: number; z: number };
  groundY: number;
  width: number;
  terrain?: LavaTerrainSampler | null;
  surfaceOffset?: number;
  bankMarginFraction?: number;
  bankPlunge?: number;
  channelDish?: number;
  marginBury?: number;
  maxMarginDrop?: number;
  terminus?: Partial<LavaRiverTerminusOptions>;
  source?: Partial<LavaRiverSourceOptions>;
  glow?: Partial<LavaRiverGlowOptions>;
  lightCount?: number;
  longitudinalSegments?: number;
  lateralSegments?: number;
}

export interface LavaRiverGeometryResult {
  geometry: BufferGeometry;
  /** Additive ground skirt that lights the corridor without a light budget. */
  glowGeometry: BufferGeometry | null;
  /** Emissive breach the ribbon emerges from, or null when disabled. */
  ventGeometry: BufferGeometry | null;
  lightPositions: Vector3[];
  /** Centreline arc length in world units. */
  channelLength: number;
  /** Draped centreline, head first. Exposed for contract tests. */
  centreline: Vector3[];
  /** Metres of fall from head to tail along the draped centreline. */
  descent: number;
  /** Steepest downhill grade found, as a rise-over-run ratio. */
  peakGrade: number;
  /** True when at least one centreline sample resolved against terrain. */
  draped: boolean;
}

function resolveControlPoints({
  channel,
  poolPosition,
  groundY,
}: Pick<
  LavaRiverGeometryOptions,
  "channel" | "poolPosition" | "groundY"
>): Vector3[] {
  if (channel.points && channel.points.length >= 2) {
    return channel.points.map(
      ([x, z, height]) => new Vector3(x, groundY + height, z)
    );
  }

  const angle = channel.angle ?? 0;
  const length = channel.length ?? 1;
  const curvature = channel.curvature ?? 0;
  const sideX = -Math.sin(angle);
  const sideZ = Math.cos(angle);
  return [
    new Vector3(poolPosition.x, groundY + 0.03, poolPosition.z),
    new Vector3(
      poolPosition.x + Math.cos(angle) * length * 0.5 + sideX * curvature,
      groundY + 0.03,
      poolPosition.z + Math.sin(angle) * length * 0.5 + sideZ * curvature
    ),
    new Vector3(
      poolPosition.x + Math.cos(angle) * length,
      groundY + 0.03,
      poolPosition.z + Math.sin(angle) * length
    ),
  ];
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Reference grade the per-row steepness is normalised against. The authored
 * profile falls roughly 0.19 over the first control span and flattens below
 * 0.01 through the basin, so a 0.2 reference puts the headwaters at full
 * ridging and leaves the lower run smooth.
 */
const LAVA_RIVER_REFERENCE_GRADE = 0.2;

interface CentrelineRow {
  center: Vector3;
  side: Vector3;
  tangent: Vector3;
  halfWidth: number;
  /** `halfWidth` before the toe spread: the corridor the bank glow follows. */
  corridorHalfWidth: number;
  sourceTaper: number;
  arcLength: number;
  /** Normalised arc position, head 0 to tail 1. */
  run: number;
  /** Normalised downhill steepness, 0 flat to 1 at the reference grade. */
  grade: number;
  /** Toe progress, 0 upstream of the terminus and 1 at the tail. */
  toe: number;
}

export function createLavaRiverStripGeometry({
  channel,
  poolPosition,
  groundY,
  width,
  terrain = null,
  surfaceOffset = LAVA_RIVER_SURFACE_OFFSET,
  bankMarginFraction = LAVA_RIVER_BANK_MARGIN_FRACTION,
  bankPlunge = LAVA_RIVER_BANK_PLUNGE,
  channelDish = LAVA_RIVER_CHANNEL_DISH,
  marginBury = LAVA_RIVER_MARGIN_BURY,
  maxMarginDrop = LAVA_RIVER_MAX_MARGIN_DROP,
  terminus,
  source,
  glow,
  lightCount = 3,
  longitudinalSegments = 152,
  lateralSegments = 16,
}: LavaRiverGeometryOptions): LavaRiverGeometryResult {
  const controlPoints = resolveControlPoints({
    channel,
    poolPosition,
    groundY,
  });
  const curve = new CatmullRomCurve3(controlPoints, false, "centripetal", 0.5);
  // The control points sit 8 to 31 metres apart, so the default 200-division
  // arc table quantises the resample to roughly a metre. Six hundred puts the
  // spacing error well inside the vertex budget.
  curve.arcLengthDivisions = 600;

  const toeSpec = { ...LAVA_RIVER_TERMINUS, ...terminus };
  const sourceSpec = { ...LAVA_RIVER_SOURCE, ...source };
  const glowSpec = { ...LAVA_RIVER_GLOW, ...glow };

  const widthScale = channel.widthScale;
  const sourceTaperFraction = channel.sourceTaperFraction ?? 0;
  const marginFraction = Math.max(0, bankMarginFraction);
  const strippedSpan = 1 + marginFraction;
  // The drape only reads as terrain-following if the samples are closer
  // together than the bed's own relief, hence the sixty-sample floor.
  const rowSegments = Math.max(60, Math.round(longitudinalSegments));
  const rowCount = rowSegments + 1;

  // Pass one: resample by arc length and drape the centreline.
  const centers: Vector3[] = [];
  const tangents: Vector3[] = [];
  const drapedY = new Float64Array(rowCount);
  let draped = false;

  for (let row = 0; row < rowCount; row += 1) {
    const t = row / rowSegments;
    const center = curve.getPointAt(t);
    tangents.push(curve.getTangentAt(t).normalize());
    const sampled = terrain?.heightAt(center.x, center.z) ?? null;
    if (sampled !== null) draped = true;
    drapedY[row] = sampled === null ? center.y : sampled + surfaceOffset;
    centers.push(center);
  }

  // Two [0.25, 0.5, 0.25] passes remove the bed's triangle faceting without
  // flattening the profile. Endpoints are held so the head and tail keep the
  // exact height the drape gave them.
  const smoothed = new Float64Array(drapedY);
  for (let pass = 0; pass < 2; pass += 1) {
    const previous = Float64Array.from(smoothed);
    for (let row = 1; row < rowCount - 1; row += 1) {
      smoothed[row] =
        previous[row - 1]! * 0.25 + previous[row]! * 0.5 + previous[row + 1]! * 0.25;
    }
  }
  for (let row = 0; row < rowCount; row += 1) centers[row]!.y = smoothed[row]!;

  // Pass two: arc length, grade, and width on the draped centreline.
  const rows: CentrelineRow[] = [];
  let arcLength = 0;
  let peakGrade = 0;

  for (let row = 0; row < rowCount; row += 1) {
    const center = centers[row]!;
    const tangent = tangents[row]!;
    const side = new Vector3(-tangent.z, 0, tangent.x).normalize();
    if (row > 0) arcLength += centers[row - 1]!.distanceTo(center);

    const previous = centers[Math.max(0, row - 1)]!;
    const next = centers[Math.min(rowCount - 1, row + 1)]!;
    const horizontal = Math.hypot(next.x - previous.x, next.z - previous.z);
    const rawGrade = horizontal > 1e-4 ? (previous.y - next.y) / horizontal : 0;
    if (rawGrade > peakGrade) peakGrade = rawGrade;

    rows.push({
      center,
      side,
      tangent,
      halfWidth: 0,
      corridorHalfWidth: 0,
      sourceTaper: 1,
      arcLength,
      run: 0,
      grade: clamp01(rawGrade / LAVA_RIVER_REFERENCE_GRADE),
      toe: 0,
    });
  }

  const channelLength = arcLength || 1;

  for (let row = 0; row < rowCount; row += 1) {
    const entry = rows[row]!;
    const t = row / rowSegments;
    entry.run = entry.arcLength / channelLength;

    const taperProgress =
      sourceTaperFraction > 0 ? Math.min(1, t / sourceTaperFraction) : 1;
    entry.sourceTaper = smoothstep(taperProgress);

    // The toe spreads into a delta and then rounds off, so the run ends on a
    // cooling lobe instead of the square chop the audit caught mid-slope.
    const toe =
      toeSpec.fraction > 0
        ? clamp01((t - (1 - toeSpec.fraction)) / toeSpec.fraction)
        : 0;
    entry.toe = toe;
    const spread = 1 + (toeSpec.spread - 1) * smootherstep(toe);
    const capT =
      toe <= toeSpec.capStart
        ? 0
        : (toe - toeSpec.capStart) / Math.max(1e-4, 1 - toeSpec.capStart);
    const cap = Math.max(0.06, Math.sqrt(Math.max(0, 1 - capT * capT)));

    entry.corridorHalfWidth =
      width *
      widthScale *
      (0.9 + Math.sin(t * Math.PI) * 0.1 + Math.sin(t * 17.3 + 0.7) * 0.025) *
      entry.sourceTaper *
      cap *
      0.5;
    entry.halfWidth = entry.corridorHalfWidth * spread;
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const crossValues: number[] = [];
  const flowValues: number[] = [];
  const runValues: number[] = [];
  const gradeValues: number[] = [];
  const indices: number[] = [];

  const vertex = new Vector3();
  for (const row of rows) {
    // Flattening the dish and easing the plunge through the toe lets the lobe
    // read as a spreading sheet rather than a channel that kept its walls.
    const toeEase = smootherstep(row.toe);
    const dishScale = 1 - 0.85 * toeEase;
    const plungeScale = 1 - 0.6 * toeEase;

    for (let column = 0; column <= lateralSegments; column += 1) {
      const lateralT = column / lateralSegments;
      // ±1 lands on the nominal channel edge, ±(1 + margin) on the polygon edge.
      const cross = (lateralT * 2 - 1) * strippedSpan;
      const magnitude = Math.abs(cross);
      const dish = Math.min(1, magnitude) ** 2 * channelDish * dishScale;
      const marginProgress =
        marginFraction > 0 ? Math.max(0, magnitude - 1) / marginFraction : 0;
      const plunge = marginProgress ** 1.4 * bankPlunge * plungeScale;

      vertex.copy(row.center).addScaledVector(row.side, cross * row.halfWidth);
      vertex.y = row.center.y - (dish + plunge) * row.sourceTaper;

      if (marginProgress > 0 && terrain) {
        // Bury the polygon edge inside the bank it meets. Where the bed rises
        // the vertex is already under it and nothing moves; where the bed falls
        // away the margin follows it down by a bounded skirt instead of
        // hanging in the air as a cut edge.
        const bankY = terrain.heightAt(vertex.x, vertex.z);
        if (bankY !== null) {
          const drop = Math.min(
            maxMarginDrop,
            Math.max(0, vertex.y - (bankY - marginBury))
          );
          vertex.y -= drop * marginProgress;
        }
      }

      positions.push(vertex.x, vertex.y, vertex.z);
      // U is normalised arc length, not curve parameter: the control points are
      // spaced 8 to 31 metres apart, so a parameter-space U stretched the crust
      // pattern four-fold across the reach and left long stretches featureless.
      uvs.push(row.run, lateralT);
      crossValues.push(cross);
      flowValues.push(row.arcLength);
      runValues.push(row.run);
      gradeValues.push(row.grade);
    }
  }

  const rowWidth = lateralSegments + 1;
  for (let row = 0; row < rowSegments; row += 1) {
    for (let column = 0; column < lateralSegments; column += 1) {
      const a = row * rowWidth + column;
      const b = a + 1;
      const c = a + rowWidth;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aCross", new Float32BufferAttribute(crossValues, 1));
  geometry.setAttribute("aFlow", new Float32BufferAttribute(flowValues, 1));
  geometry.setAttribute("aRun", new Float32BufferAttribute(runValues, 1));
  geometry.setAttribute("aGrade", new Float32BufferAttribute(gradeValues, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const ventGeometry = sourceSpec.enabled
    ? createVentMouthGeometry({
        head: rows[0]!,
        width: width * widthScale,
        terrain,
        surfaceOffset,
        strippedSpan,
        spec: sourceSpec,
      })
    : null;

  const glowGeometry = glowSpec.enabled
    ? createGlowSkirtGeometry({
        rows,
        terrain,
        spec: glowSpec,
        // The channel tapers to nothing at the source and closes to a rounded
        // point at the toe. The skirt must not follow it there: radiance is
        // widest where the lava is hottest, and a skirt scaled off a zero-width
        // row would collapse into degenerate triangles at both ends.
        minHalfWidth: width * widthScale * 0.5 * 0.6,
      })
    : null;

  const resolvedLightCount = Math.max(1, Math.round(lightCount));
  const lightPositions = Array.from({ length: resolvedLightCount }, (_, index) => {
    const fraction =
      resolvedLightCount === 1
        ? 0.5
        : 0.12 + (index / (resolvedLightCount - 1)) * 0.78;
    return rows[Math.round(fraction * rowSegments)]!.center.clone();
  });

  return {
    geometry,
    glowGeometry,
    ventGeometry,
    lightPositions,
    channelLength,
    centreline: rows.map((row) => row.center.clone()),
    descent: rows[0]!.center.y - rows[rowCount - 1]!.center.y,
    peakGrade,
    draped,
  };
}

function createVentMouthGeometry({
  head,
  width,
  terrain,
  surfaceOffset,
  strippedSpan,
  spec,
}: {
  head: CentrelineRow;
  width: number;
  terrain: LavaTerrainSampler | null;
  surfaceOffset: number;
  strippedSpan: number;
  spec: LavaRiverSourceOptions;
}): BufferGeometry {
  const acrossRadius = width * spec.widthScale * 0.5;
  const alongRadius = width * spec.lengthScale * 0.5;
  const rings = Math.max(4, Math.round(spec.rings));
  const sectors = Math.max(8, Math.round(spec.sectors));
  const headY = head.center.y;

  const positions: number[] = [];
  const uvs: number[] = [];
  const crossValues: number[] = [];
  const flowValues: number[] = [];
  const runValues: number[] = [];
  const gradeValues: number[] = [];
  const indices: number[] = [];

  const vertex = new Vector3();
  for (let ring = 0; ring <= rings; ring += 1) {
    const radius = ring / rings;
    for (let sector = 0; sector <= sectors; sector += 1) {
      const angle = (sector / sectors) * Math.PI * 2;
      const along = Math.cos(angle) * radius * alongRadius;
      const across = Math.sin(angle) * radius * acrossRadius;

      vertex
        .copy(head.center)
        .addScaledVector(head.tangent, along)
        .addScaledVector(head.side, across);

      // Clamping to the head height keeps the mouth from climbing a rising rim
      // (it fills the crater instead), while still conforming downhill where the
      // vent sits on a crest and the ground falls away on every side.
      const sampled = terrain?.heightAt(vertex.x, vertex.z) ?? null;
      const base = sampled === null ? headY : Math.min(sampled + surfaceOffset, headY);
      vertex.y = base - spec.bowlDepth * (1 - radius * radius);

      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(radius, sector / sectors);
      // Radial distance rides the same cross convention as the strip, so the
      // shader's shore contour eats the rim into a ragged breach for free.
      crossValues.push(radius * strippedSpan);
      flowValues.push(along);
      runValues.push(0);
      gradeValues.push(1);
    }
  }

  const ringWidth = sectors + 1;
  for (let ring = 0; ring < rings; ring += 1) {
    for (let sector = 0; sector < sectors; sector += 1) {
      const a = ring * ringWidth + sector;
      const b = a + 1;
      const c = a + ringWidth;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aCross", new Float32BufferAttribute(crossValues, 1));
  geometry.setAttribute("aFlow", new Float32BufferAttribute(flowValues, 1));
  geometry.setAttribute("aRun", new Float32BufferAttribute(runValues, 1));
  geometry.setAttribute("aGrade", new Float32BufferAttribute(gradeValues, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createGlowSkirtGeometry({
  rows,
  terrain,
  spec,
  minHalfWidth,
}: {
  rows: CentrelineRow[];
  terrain: LavaTerrainSampler | null;
  spec: LavaRiverGlowOptions;
  minHalfWidth: number;
}): BufferGeometry {
  const columns = Math.max(6, Math.round(spec.columns));
  const positions: number[] = [];
  const uvs: number[] = [];
  const crossValues: number[] = [];
  const flowValues: number[] = [];
  const runValues: number[] = [];
  const gradeValues: number[] = [];
  const indices: number[] = [];

  const vertex = new Vector3();
  for (const row of rows) {
    // The skirt follows the corridor, not the delta. Its reach is measured in
    // half-widths, so scaled off the spread rows it fanned into a sheet more
    // than twice as wide as anywhere upstream, right where the lava is
    // coolest.
    const halfWidth = Math.max(row.corridorHalfWidth, minHalfWidth);
    for (let column = 0; column <= columns; column += 1) {
      const lateralT = column / columns;
      const cross = (lateralT * 2 - 1) * spec.reach;
      vertex.copy(row.center).addScaledVector(row.side, cross * halfWidth);
      const sampled = terrain?.heightAt(vertex.x, vertex.z) ?? null;
      vertex.y = (sampled === null ? row.center.y : sampled) + spec.lift;

      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(row.run, lateralT);
      crossValues.push(cross);
      flowValues.push(row.arcLength);
      runValues.push(row.run);
      gradeValues.push(row.grade);
    }
  }

  const rowWidth = columns + 1;
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * rowWidth + column;
      const b = a + 1;
      const c = a + rowWidth;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aCross", new Float32BufferAttribute(crossValues, 1));
  geometry.setAttribute("aFlow", new Float32BufferAttribute(flowValues, 1));
  geometry.setAttribute("aRun", new Float32BufferAttribute(runValues, 1));
  geometry.setAttribute("aGrade", new Float32BufferAttribute(gradeValues, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
