import volcanicWorldR7 from "../../domain/models/scene-configs/ember-volcanic-world-r7.json";
import {
  LAVA_RIVER_BANK_MARGIN_FRACTION,
  LAVA_RIVER_TERMINUS,
} from "./lava-river-geometry";

export interface EmberSurfacePlacement {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  family: "cold" | "iron" | "glass";
}

export interface EmberSurfaceEcology {
  rubble: EmberSurfacePlacement[];
  plates: EmberSurfacePlacement[];
  outcrops: EmberSurfacePlacement[];
}

// Heights are stored relative to groundY so every consumer keeps using the
// `groundY + placement.position[1]` convention the near-field scatter already
// uses.
export interface EmberTerrainHeightField {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  columns: number;
  rows: number;
  heights: Float32Array;
}

const HEIGHT_FIELD_COLUMNS = 64;
const HEIGHT_FIELD_ROWS = 64;

const LAVA_CORRIDOR = volcanicWorldR7.lavaRiver.pointsRuntimeXZHeight.map(
  ([x, z]) => [x, z] as [number, number]
);

// Cumulative arc length at each corridor vertex, so a point's position along
// the run can be recovered from whichever segment it is nearest.
const LAVA_CORRIDOR_ARC = LAVA_CORRIDOR.reduce<number[]>((arc, point, index) => {
  if (index === 0) return [0];
  const [px, pz] = LAVA_CORRIDOR[index - 1]!;
  arc.push(arc[index - 1]! + Math.hypot(point[0] - px, point[1] - pz));
  return arc;
}, []);
const LAVA_CORRIDOR_LENGTH =
  LAVA_CORRIDOR_ARC[LAVA_CORRIDOR_ARC.length - 1]! || 1;
const LAVA_BASE_HALF_WIDTH = volcanicWorldR7.lavaRiver.width * 0.5;

// The bald bearings. Every one of these sits beyond the near talus apron on
// the east, west and south slopes that the orbit cameras fill with bare
// terrain; north is left to the river corridor and the breached caldera.
const OUTER_FIELD_CLUSTERS = [
  { x: 58, z: -4, spread: 16 },
  { x: 86, z: 26, spread: 18 },
  { x: 74, z: -46, spread: 17 },
  { x: 112, z: -6, spread: 20 },
  { x: 132, z: 34, spread: 20 },
  { x: -60, z: 12, spread: 16 },
  { x: -90, z: -20, spread: 18 },
  { x: -72, z: 46, spread: 17 },
  { x: -114, z: 8, spread: 20 },
  { x: -134, z: -34, spread: 20 },
  { x: 12, z: -60, spread: 17 },
  { x: -28, z: -82, spread: 18 },
  { x: 40, z: -94, spread: 19 },
  { x: -6, z: -118, spread: 20 },
] as const;

const TALUS_CLUSTERS = [
  { x: -18, z: -20, spread: 5.5 },
  { x: 26, z: -18, spread: 6.2 },
  { x: -26, z: 10, spread: 5.8 },
  { x: 28, z: 20, spread: 6.5 },
  { x: -18, z: 30, spread: 5.4 },
  { x: 20, z: -36, spread: 6.8 },
  { x: -30, z: -38, spread: 6.6 },
  { x: 34, z: 38, spread: 7.2 },
] as const;

function clusteredPosition(
  random: () => number,
  clusters: readonly { x: number; z: number; spread: number }[]
): [number, number] {
  const cluster = clusters[Math.floor(random() * clusters.length)]!;
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random()) * cluster.spread;
  return [
    cluster.x + Math.cos(angle) * radius,
    cluster.z + Math.sin(angle) * radius,
  ];
}

/**
 * Bins world-space terrain vertices into a coarse height grid in one pass.
 *
 * The basin carries roughly eighteen thousand vertices over a 380x335m
 * footprint, which is about four per cell at 64x64 — dense enough to seat
 * scatter and to trace the world rim, and cheap enough (a single linear pass,
 * no raycasts, no render targets) to run once when the slice finishes loading.
 * `points` is a flat world-space XYZ triple array; `groundY` is subtracted so
 * stored heights stay in the same relative space as every other placement.
 */
export function createEmberTerrainHeightField(
  points: ArrayLike<number>,
  groundY: number,
  bounds = {
    minX: volcanicWorldR7.terrain.runtimeXRange[0]!,
    maxX: volcanicWorldR7.terrain.runtimeXRange[1]!,
    minZ: volcanicWorldR7.terrain.runtimeZRange[0]!,
    maxZ: volcanicWorldR7.terrain.runtimeZRange[1]!,
  }
): EmberTerrainHeightField {
  const columns = HEIGHT_FIELD_COLUMNS;
  const rows = HEIGHT_FIELD_ROWS;
  const cells = columns * rows;
  const sums = new Float64Array(cells);
  const counts = new Uint32Array(cells);
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;

  for (let index = 0; index + 2 < points.length; index += 3) {
    const column = Math.floor(
      ((points[index]! - bounds.minX) / spanX) * (columns - 1) + 0.5
    );
    const row = Math.floor(
      ((points[index + 2]! - bounds.minZ) / spanZ) * (rows - 1) + 0.5
    );
    if (column < 0 || column >= columns || row < 0 || row >= rows) continue;
    const cell = row * columns + column;
    sums[cell]! += points[index + 1]! - groundY;
    counts[cell]! += 1;
  }

  const heights = new Float32Array(cells);
  const filled = new Uint8Array(cells);
  for (let cell = 0; cell < cells; cell += 1) {
    if (counts[cell] === 0) continue;
    heights[cell] = sums[cell]! / counts[cell]!;
    filled[cell] = 1;
  }

  // Vertex jitter leaves a scattering of empty cells. Dilate from filled
  // neighbours rather than leaving zeros, which would read as pits.
  for (let pass = 0; pass < 8; pass += 1) {
    let repaired = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const cell = row * columns + column;
        if (filled[cell]) continue;
        let total = 0;
        let found = 0;
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nz = row + dz;
            const nx = column + dx;
            if (nz < 0 || nz >= rows || nx < 0 || nx >= columns) continue;
            const neighbour = nz * columns + nx;
            if (!filled[neighbour]) continue;
            total += heights[neighbour]!;
            found += 1;
          }
        }
        if (found === 0) continue;
        heights[cell] = total / found;
        repaired += 1;
      }
    }
    if (repaired === 0) break;
    for (let cell = 0; cell < cells; cell += 1) {
      if (heights[cell] !== 0) filled[cell] = 1;
    }
  }

  return { ...bounds, columns, rows, heights };
}

function heightAtCell(
  field: EmberTerrainHeightField,
  column: number,
  row: number
): number {
  const clampedColumn = Math.max(0, Math.min(field.columns - 1, column));
  const clampedRow = Math.max(0, Math.min(field.rows - 1, row));
  return field.heights[clampedRow * field.columns + clampedColumn]!;
}

export function sampleEmberTerrainHeight(
  field: EmberTerrainHeightField,
  x: number,
  z: number
): number {
  const u =
    ((x - field.minX) / (field.maxX - field.minX)) * (field.columns - 1);
  const v = ((z - field.minZ) / (field.maxZ - field.minZ)) * (field.rows - 1);
  const column = Math.floor(u);
  const row = Math.floor(v);
  const fx = u - column;
  const fz = v - row;
  const top =
    heightAtCell(field, column, row) * (1 - fx) +
    heightAtCell(field, column + 1, row) * fx;
  const bottom =
    heightAtCell(field, column, row + 1) * (1 - fx) +
    heightAtCell(field, column + 1, row + 1) * fx;
  return top * (1 - fz) + bottom * fz;
}

export function sampleEmberTerrainSlope(
  field: EmberTerrainHeightField,
  x: number,
  z: number
): number {
  const stepX = (field.maxX - field.minX) / (field.columns - 1);
  const stepZ = (field.maxZ - field.minZ) / (field.rows - 1);
  const gradientX =
    (sampleEmberTerrainHeight(field, x + stepX, z) -
      sampleEmberTerrainHeight(field, x - stepX, z)) /
    (2 * stepX);
  const gradientZ =
    (sampleEmberTerrainHeight(field, x, z + stepZ) -
      sampleEmberTerrainHeight(field, x, z - stepZ)) /
    (2 * stepZ);
  return Math.hypot(gradientX, gradientZ);
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

function projectOntoSegment(
  x: number,
  z: number,
  [ax, az]: [number, number],
  [bx, bz]: [number, number]
): { distance: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const denominator = dx * dx + dz * dz;
  const t =
    denominator === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / denominator));
  return { distance: Math.hypot(x - (ax + dx * t), z - (az + dz * t)), t };
}

function nearestCorridorPoint(
  x: number,
  z: number
): { distance: number; run: number } {
  let distance = Number.POSITIVE_INFINITY;
  let run = 0;
  for (let index = 0; index < LAVA_CORRIDOR.length - 1; index += 1) {
    const projected = projectOntoSegment(
      x,
      z,
      LAVA_CORRIDOR[index]!,
      LAVA_CORRIDOR[index + 1]!
    );
    if (projected.distance >= distance) continue;
    distance = projected.distance;
    const segmentLength =
      LAVA_CORRIDOR_ARC[index + 1]! - LAVA_CORRIDOR_ARC[index]!;
    run =
      (LAVA_CORRIDOR_ARC[index]! + projected.t * segmentLength) /
      LAVA_CORRIDOR_LENGTH;
  }
  return { distance, run };
}

const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Half-width of the river polygon (channel plus bank margin) at normalised arc
 * position `run`, following the same toe spread the strip builder applies. The
 * delta more than doubles the channel over its last stretch, which is why a
 * fixed centreline clearance seated boulders and plates inside the lobe. The
 * source taper and the rounded tip are ignored on purpose: clearance errs wide
 * at both ends of the run.
 */
export function emberLavaCorridorHalfWidth(run: number): number {
  const { fraction, spread } = LAVA_RIVER_TERMINUS;
  const toe =
    fraction > 0
      ? Math.max(0, Math.min(1, (run - (1 - fraction)) / fraction))
      : 0;
  const widening = 1 + (spread - 1) * smootherstep(toe);
  return (
    LAVA_BASE_HALF_WIDTH *
    (0.9 + Math.sin(run * Math.PI) * 0.1 + 0.025) *
    widening *
    (1 + LAVA_RIVER_BANK_MARGIN_FRACTION)
  );
}

export function distanceToEmberLavaCorridor(x: number, z: number): number {
  return nearestCorridorPoint(x, z).distance;
}

/** Metres from the river polygon's edge; negative inside the run. */
export function distanceToEmberLavaCorridorEdge(x: number, z: number): number {
  const { distance, run } = nearestCorridorPoint(x, z);
  return distance - emberLavaCorridorHalfWidth(run);
}

export interface EmberHorizonApronGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

const APRON_SEGMENTS_PER_SIDE = 56;

/**
 * The apron's rim ring starts this far inside the terrain bounds and this far
 * below the sampled surface. The height field is a 64x64 cell average, so a
 * ring placed exactly on the rim at exactly the sampled height sat above or
 * beside the real edge by a fraction of a metre, and from any camera on the
 * far side of the basin that gap showed a hairline of bright sky along the
 * whole rim. Tucked under the terrain the seam has nothing to leak.
 */
export const EMBER_APRON_RIM_INSET = 4;
export const EMBER_APRON_RIM_TUCK = 1.4;

function apronPerimeterPoint(
  field: EmberTerrainHeightField,
  t: number
): [number, number] {
  const side = Math.min(3, Math.floor(t * 4));
  const local = t * 4 - side;
  switch (side) {
    case 0:
      return [field.minX + (field.maxX - field.minX) * local, field.minZ];
    case 1:
      return [field.maxX, field.minZ + (field.maxZ - field.minZ) * local];
    case 2:
      return [field.maxX - (field.maxX - field.minX) * local, field.maxZ];
    default:
      return [field.minX, field.maxZ - (field.maxZ - field.minZ) * local];
  }
}

/**
 * Builds the outward apron that carries the world past the slice's rim.
 *
 * The GLB simply stops at the terrain bounds, so from the south-west and south
 * establishing cameras the ground ends in a hard cut with the bright horizon
 * showing underneath it. This walks the rim, samples its real height, and
 * extends a descending skirt outward from it. The caller renders it with the
 * basin's own material, so the world-space detail synthesis continues straight
 * across the seam and exponential fog dissolves the far edge into the sky
 * instead of ending it on a line. Harmonics on the loop parameter are integer
 * so the ring closes without a seam.
 */
export function createEmberHorizonApron(
  field: EmberTerrainHeightField,
  reach = 220,
  drop = 26
): EmberHorizonApronGeometryData {
  const loop = APRON_SEGMENTS_PER_SIDE * 4;
  const vertices = (loop + 1) * 2;
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2);
  const indices = new Uint16Array(loop * 6);
  const centerX = (field.minX + field.maxX) / 2;
  const centerZ = (field.minZ + field.maxZ) / 2;

  for (let step = 0; step <= loop; step += 1) {
    const t = (step % loop) / loop;
    const [x, z] = apronPerimeterPoint(field, t);
    const angle = Math.PI * 2 * t;
    const reachAt =
      reach *
      (0.74 + 0.18 * Math.sin(angle * 3 + 0.7) + 0.08 * Math.sin(angle * 7));
    const dropAt = drop * (0.86 + 0.24 * Math.sin(angle * 5 + 2.1));
    const outwardX = x - centerX;
    const outwardZ = z - centerZ;
    const outwardLength = Math.hypot(outwardX, outwardZ) || 1;
    const unitX = outwardX / outwardLength;
    const unitZ = outwardZ / outwardLength;
    const innerX = x - unitX * EMBER_APRON_RIM_INSET;
    const innerZ = z - unitZ * EMBER_APRON_RIM_INSET;
    const rimHeight =
      Math.min(
        sampleEmberTerrainHeight(field, x, z),
        sampleEmberTerrainHeight(field, innerX, innerZ)
      ) - EMBER_APRON_RIM_TUCK;
    const u = (x - field.minX) / (field.maxX - field.minX);
    const v = (z - field.minZ) / (field.maxZ - field.minZ);

    const inner = step * 6;
    positions[inner] = innerX;
    positions[inner + 1] = rimHeight;
    positions[inner + 2] = innerZ;
    positions[inner + 3] = x + unitX * reachAt;
    positions[inner + 4] = rimHeight - dropAt;
    positions[inner + 5] = z + unitZ * reachAt;

    const uvOffset = step * 4;
    uvs[uvOffset] = u;
    uvs[uvOffset + 1] = v;
    uvs[uvOffset + 2] = u;
    uvs[uvOffset + 3] = v;
  }

  for (let step = 0; step < loop; step += 1) {
    const base = step * 2;
    const triangle = step * 6;
    // Wound so the face normal resolves upward: the rim is traced
    // minZ -> maxX -> maxZ -> minX, which needs the outer ring visited in
    // reverse for an up-facing surface.
    indices[triangle] = base;
    indices[triangle + 1] = base + 3;
    indices[triangle + 2] = base + 1;
    indices[triangle + 3] = base;
    indices[triangle + 4] = base + 2;
    indices[triangle + 5] = base + 3;
  }

  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const a = indices[triangle]! * 3;
    const b = indices[triangle + 1]! * 3;
    const c = indices[triangle + 2]! * 3;
    const abx = positions[b]! - positions[a]!;
    const aby = positions[b + 1]! - positions[a + 1]!;
    const abz = positions[b + 2]! - positions[a + 2]!;
    const acx = positions[c]! - positions[a]!;
    const acy = positions[c + 1]! - positions[a + 1]!;
    const acz = positions[c + 2]! - positions[a + 2]!;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const vertex of [a, b, c]) {
      normals[vertex]! += nx;
      normals[vertex + 1]! += ny;
      normals[vertex + 2]! += nz;
    }
  }

  for (let vertex = 0; vertex < normals.length; vertex += 3) {
    const length =
      Math.hypot(normals[vertex]!, normals[vertex + 1]!, normals[vertex + 2]!) ||
      1;
    normals[vertex]! /= length;
    normals[vertex + 1]! /= length;
    normals[vertex + 2]! /= length;
  }

  return { positions, normals, uvs, indices };
}

export function createEmberSurfaceEcology(
  stageRadius: number,
  seed = 9413,
  heightField: EmberTerrainHeightField | null = null
): EmberSurfaceEcology {
  const random = createRandom(seed);
  const stageClearance = Math.max(7.4, stageRadius + 2.2);
  const rubble: EmberSurfacePlacement[] = [];
  const plates: EmberSurfacePlacement[] = [];
  const outcrops: EmberSurfacePlacement[] = [];

  for (let attempt = 0; attempt < 1_000 && rubble.length < 150; attempt += 1) {
    const [x, z] = clusteredPosition(random, TALUS_CLUSTERS);
    if (Math.hypot(x, z) < stageClearance) continue;
    if (distanceToEmberLavaCorridorEdge(x, z) < 1.4) continue;
    const size = 0.055 + Math.pow(random(), 2.2) * 0.34;
    const familyRoll = random();
    rubble.push({
      position: [x, 0.025 + random() * 0.035, z],
      rotation: [random() * 0.7, random() * Math.PI * 2, random() * 0.7],
      scale: [
        size * (0.72 + random() * 0.75),
        size * (0.48 + random() * 0.5),
        size * (0.72 + random() * 0.75),
      ],
      family: familyRoll > 0.84 ? "iron" : familyRoll > 0.62 ? "glass" : "cold",
    });
  }

  for (let attempt = 0; attempt < 500 && plates.length < 32; attempt += 1) {
    const [x, z] = clusteredPosition(random, TALUS_CLUSTERS);
    if (Math.hypot(x, z) < stageClearance + 0.8) continue;
    if (distanceToEmberLavaCorridorEdge(x, z) < 2.2) continue;
    const span = 0.34 + random() * 0.72;
    plates.push({
      position: [x, 0.045 + random() * 0.025, z],
      rotation: [
        (random() - 0.5) * 0.16,
        random() * Math.PI * 2,
        (random() - 0.5) * 0.16,
      ],
      scale: [span * (0.65 + random() * 0.8), 0.08 + random() * 0.09, span],
      family: random() > 0.72 ? "iron" : "glass",
    });
  }

  // The bald bearings need boulders, not pebbles: the near-field rubble tops
  // out at 0.4m, which is invisible past about forty metres. These are metre-
  // scale outcrops seated on the sampled terrain, and they render through the
  // same three instanced meshes as the rubble, so the scatter costs instances
  // rather than draw calls.
  if (heightField) {
    for (
      let attempt = 0;
      attempt < 4_000 && outcrops.length < 240;
      attempt += 1
    ) {
      const [x, z] = clusteredPosition(random, OUTER_FIELD_CLUSTERS);
      if (Math.hypot(x, z) < 34) continue;
      if (x < heightField.minX + 12 || x > heightField.maxX - 12) continue;
      if (z < heightField.minZ + 12 || z > heightField.maxZ - 12) continue;
      // Measured from the polygon edge, not the centreline: the delta more
      // than doubles the run over its last stretch, and a centreline clearance
      // seated boulders inside the lobe.
      if (distanceToEmberLavaCorridorEdge(x, z) < 5) continue;
      // A boulder pinned to a cliff face reads as a floating card, so only
      // seat them where the terrain is walkable-ish.
      if (sampleEmberTerrainSlope(heightField, x, z) > 0.55) continue;
      const size = 0.9 + Math.pow(random(), 1.9) * 3.2;
      const familyRoll = random();
      outcrops.push({
        position: [
          x,
          sampleEmberTerrainHeight(heightField, x, z) - size * 0.24,
          z,
        ],
        rotation: [
          (random() - 0.5) * 0.9,
          random() * Math.PI * 2,
          (random() - 0.5) * 0.9,
        ],
        scale: [
          size * (0.78 + random() * 0.7),
          size * (0.52 + random() * 0.58),
          size * (0.78 + random() * 0.7),
        ],
        family: familyRoll > 0.9 ? "iron" : familyRoll > 0.74 ? "glass" : "cold",
      });
    }
  }

  return { rubble, plates, outcrops };
}
