import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Texture,
} from "three";
import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";

export type FlowFestTerrainHostMode = "bounded-static" | "chunked";

export interface FlowFestColliderMesh {
  name: string;
  vertices: Float32Array;
  indices: Uint32Array;
  centerX: number;
  centerZ: number;
  halfExtentX: number;
  halfExtentZ: number;
}

export interface FlowFestTerrainHostMetrics {
  mode: FlowFestTerrainHostMode;
  buildMilliseconds: number;
  renderMeshes: number;
  colliderMeshes: number;
  vertices: number;
  triangles: number;
  geometryBytes: number;
  sourceHeightSamples: number;
  fullDetailBounds: FlowFestTerrainDetailBounds | null;
  farSampleStepMeters: number;
}

export interface FlowFestTerrainDetailBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface FlowFestTerrainHostOptions {
  fullDetailBounds?: FlowFestTerrainDetailBounds;
  fullDetailPaddingMeters?: number;
  farSampleStep?: number;
}

export interface FlowFestTerrainHost {
  root: Group;
  colliders: FlowFestColliderMesh[];
  metrics: FlowFestTerrainHostMetrics;
  dispose(): void;
}

export interface FlowFestChunkSeamTraversal {
  seamCrossings: number;
  seamAdjacentProbes: number;
  endpointProbes: number;
  probes: Array<{ x: number; z: number }>;
}

const CHUNK_SEGMENTS = 32;
const RENDER_CHUNK_SEGMENTS = 192;

export function flowFestColliderWindowKey(
  x: number,
  z: number,
  worldBounds: { minX: number; minZ: number },
  chunkSizeMeters = CHUNK_SEGMENTS
): string {
  const column = Math.floor((x - worldBounds.minX) / chunkSizeMeters);
  const row = Math.floor((z - worldBounds.minZ) / chunkSizeMeters);
  return `${column}:${row}`;
}

/**
 * Register each chunk-grid crossing and probe five centimetres before, on,
 * and after it. This is the deterministic traversal set used by the live
 * Rapier audit, not a screenshot-only approximation of seam continuity.
 */
export function buildFlowFestChunkSeamTraversal(
  start: { x: number; z: number },
  end: { x: number; z: number },
  worldBounds: { minX: number; minZ: number },
  chunkSizeMeters = CHUNK_SEGMENTS,
  epsilonMeters = 0.05
): FlowFestChunkSeamTraversal {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const seamParameters: number[] = [];
  for (
    let x =
      Math.ceil(
        (Math.min(start.x, end.x) - worldBounds.minX) / chunkSizeMeters
      ) *
        chunkSizeMeters +
      worldBounds.minX;
    x < Math.max(start.x, end.x);
    x += chunkSizeMeters
  ) {
    if (Math.abs(dx) < 1e-9) break;
    const t = (x - start.x) / dx;
    if (t > 1e-9 && t < 1 - 1e-9) seamParameters.push(t);
  }
  for (
    let z =
      Math.ceil(
        (Math.min(start.z, end.z) - worldBounds.minZ) / chunkSizeMeters
      ) *
        chunkSizeMeters +
      worldBounds.minZ;
    z < Math.max(start.z, end.z);
    z += chunkSizeMeters
  ) {
    if (Math.abs(dz) < 1e-9) break;
    const t = (z - start.z) / dz;
    if (t > 1e-9 && t < 1 - 1e-9) seamParameters.push(t);
  }
  const epsilon = length > 0 ? epsilonMeters / length : 0;
  const parameters = new Set<string>(["0.000000000000", "1.000000000000"]);
  for (const seam of seamParameters) {
    parameters.add(Math.max(0, seam - epsilon).toFixed(12));
    parameters.add(seam.toFixed(12));
    parameters.add(Math.min(1, seam + epsilon).toFixed(12));
  }
  const probes = [...parameters]
    .sort()
    .map(Number)
    .map((t) => ({
      x: start.x + dx * t,
      z: start.z + dz * t,
    }));
  return {
    seamCrossings: seamParameters.length,
    seamAdjacentProbes: seamParameters.length * 3,
    endpointProbes: 2,
    probes,
  };
}

/** Bilinear sampling in the exact north-to-south/east-to-west runtime grid. */
export function sampleFlowFestTerrainWorldY(
  terrain: ImportedTerrainDataV2,
  x: number,
  z: number
): number {
  const { width, height, heights, verticalOriginMeters } = terrain.heightmap;
  const column =
    ((x - terrain.worldBounds.minX) /
      (terrain.worldBounds.maxX - terrain.worldBounds.minX)) *
    (width - 1);
  const row =
    ((z - terrain.worldBounds.minZ) /
      (terrain.worldBounds.maxZ - terrain.worldBounds.minZ)) *
    (height - 1);
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(column)));
  const z0 = Math.max(0, Math.min(height - 1, Math.floor(row)));
  const x1 = Math.min(width - 1, x0 + 1);
  const z1 = Math.min(height - 1, z0 + 1);
  const tx = Math.max(0, Math.min(1, column - x0));
  const tz = Math.max(0, Math.min(1, row - z0));
  const northWest = heights[z0 * width + x0] ?? verticalOriginMeters;
  const northEast = heights[z0 * width + x1] ?? verticalOriginMeters;
  const southWest = heights[z1 * width + x0] ?? verticalOriginMeters;
  const southEast = heights[z1 * width + x1] ?? verticalOriginMeters;
  const north = northWest + (northEast - northWest) * tx;
  const south = southWest + (southEast - southWest) * tx;
  return north + (south - north) * tz - verticalOriginMeters;
}

interface GridWindow {
  startColumn: number;
  startRow: number;
  segmentColumns: number;
  segmentRows: number;
}

/**
 * The bounded and chunked Gate 2 candidates share this exact vertex builder.
 * The host choice changes ownership granularity only; it cannot change a
 * height, triangle winding, UV, or collider vertex.
 */
export function buildFlowFestTerrainHost(
  terrain: ImportedTerrainDataV2,
  mode: FlowFestTerrainHostMode,
  orthophoto: Texture | null,
  options: FlowFestTerrainHostOptions = {}
): FlowFestTerrainHost {
  const startedAt = performance.now();
  const material = new MeshStandardMaterial({
    color: orthophoto ? "#ffffff" : "#8a907c",
    map: orthophoto,
    roughness: 1,
    metalness: 0,
  });
  if (orthophoto) {
    orthophoto.colorSpace = SRGBColorSpace;
    orthophoto.needsUpdate = true;
  }

  const root = new Group();
  root.name = `FFS_TerrainHost_${mode}`;
  const colliders: FlowFestColliderMesh[] = [];
  let vertices = 0;
  let triangles = 0;
  let geometryBytes = 0;
  const spacingX =
    (terrain.worldBounds.maxX - terrain.worldBounds.minX) /
    (terrain.heightmap.width - 1);
  const spacingZ =
    (terrain.worldBounds.maxZ - terrain.worldBounds.minZ) /
    (terrain.heightmap.height - 1);

  const boundedWindow = {
    startColumn: 0,
    startRow: 0,
    segmentColumns: terrain.heightmap.width - 1,
    segmentRows: terrain.heightmap.height - 1,
  };
  const renderWindows =
    mode === "bounded-static"
      ? [boundedWindow]
      : buildGridWindows(
          terrain.heightmap.width,
          terrain.heightmap.height,
          RENDER_CHUNK_SEGMENTS,
          "render"
        );
  const farSampleStep =
    mode === "chunked"
      ? Math.max(1, Math.floor(options.farSampleStep ?? 1))
      : 1;
  const detailWindow =
    mode === "chunked" && farSampleStep > 1 && options.fullDetailBounds
      ? worldBoundsToGridWindow(
          terrain,
          options.fullDetailBounds,
          options.fullDetailPaddingMeters ?? 0,
          farSampleStep
        )
      : null;
  const colliderWindows =
    mode === "bounded-static"
      ? renderWindows
      : buildGridWindows(
          terrain.heightmap.width,
          terrain.heightmap.height,
          CHUNK_SEGMENTS,
          "collider"
        );

  for (const window of renderWindows) {
    const built = detailWindow
      ? buildAdaptiveWindowGeometry(
          terrain,
          window,
          detailWindow,
          farSampleStep
        )
      : buildWindowGeometry(terrain, window);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(built.positions, 3));
    geometry.setAttribute("uv", new BufferAttribute(built.uvs!, 2));
    if (built.normals) {
      geometry.setAttribute("normal", new BufferAttribute(built.normals, 3));
    }
    geometry.setIndex(new BufferAttribute(built.indices, 1));
    if (!built.normals) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const mesh = new Mesh(geometry, material);
    mesh.name =
      mode === "bounded-static"
        ? "FFS_Terrain_Bounded"
        : `FFS_Terrain_ChunkedRender_${window.startColumn / RENDER_CHUNK_SEGMENTS}_${window.startRow / RENDER_CHUNK_SEGMENTS}`;
    mesh.receiveShadow = true;
    root.add(mesh);

    vertices += built.positions.length / 3;
    triangles += built.indices.length / 3;
    geometryBytes +=
      built.positions.byteLength +
      built.uvs!.byteLength +
      (built.normals?.byteLength ?? 0) +
      built.indices.byteLength;

    if (mode === "bounded-static") {
      colliders.push({
        name: mesh.name,
        // The bounded host shares the exact visible typed arrays.
        vertices: built.positions,
        indices: built.indices,
        centerX:
          terrain.worldBounds.minX +
          window.startColumn * spacingX +
          (window.segmentColumns * spacingX) / 2,
        centerZ:
          terrain.worldBounds.minZ +
          window.startRow * spacingZ +
          (window.segmentRows * spacingZ) / 2,
        halfExtentX: (window.segmentColumns * spacingX) / 2,
        halfExtentZ: (window.segmentRows * spacingZ) / 2,
      });
    }
  }

  if (mode === "chunked") {
    for (const window of colliderWindows) {
      const built = buildWindowGeometry(terrain, window, false);
      colliders.push({
        name: `FFS_Terrain_Chunk_${window.startColumn / CHUNK_SEGMENTS}_${window.startRow / CHUNK_SEGMENTS}`,
        // Render batching changes draw ownership only. Every collider vertex
        // is rebuilt from the same source sample and exact triangle winding.
        vertices: built.positions,
        indices: built.indices,
        centerX:
          terrain.worldBounds.minX +
          window.startColumn * spacingX +
          (window.segmentColumns * spacingX) / 2,
        centerZ:
          terrain.worldBounds.minZ +
          window.startRow * spacingZ +
          (window.segmentRows * spacingZ) / 2,
        halfExtentX: (window.segmentColumns * spacingX) / 2,
        halfExtentZ: (window.segmentRows * spacingZ) / 2,
      });
      geometryBytes += built.positions.byteLength + built.indices.byteLength;
    }
  }

  const metrics: FlowFestTerrainHostMetrics = {
    mode,
    buildMilliseconds: performance.now() - startedAt,
    renderMeshes: renderWindows.length,
    colliderMeshes: colliders.length,
    vertices,
    triangles,
    geometryBytes,
    sourceHeightSamples: terrain.heightmap.heights.length,
    fullDetailBounds: detailWindow
      ? gridWindowToWorldBounds(terrain, detailWindow)
      : null,
    farSampleStepMeters: farSampleStep * spacingX,
  };

  return {
    root,
    colliders,
    metrics,
    dispose() {
      root.traverse((object) => {
        if (object instanceof Mesh) object.geometry.dispose();
      });
      material.dispose();
      orthophoto?.dispose();
    },
  };
}

function buildGridWindows(
  width: number,
  height: number,
  segmentSize: number,
  role: "render" | "collider"
): GridWindow[] {
  const segmentWidth = width - 1;
  const segmentHeight = height - 1;
  if (
    role === "collider" &&
    (segmentWidth % segmentSize !== 0 || segmentHeight % segmentSize !== 0)
  ) {
    throw new Error(
      `Flow Fest ${role} grid requires ${segmentSize}m-aligned terrain; received ${width}x${height}`
    );
  }

  const windows: GridWindow[] = [];
  for (let row = 0; row < segmentHeight; row += segmentSize) {
    for (let column = 0; column < segmentWidth; column += segmentSize) {
      windows.push({
        startColumn: column,
        startRow: row,
        segmentColumns: Math.min(segmentSize, segmentWidth - column),
        segmentRows: Math.min(segmentSize, segmentHeight - row),
      });
    }
  }
  return windows;
}

function buildWindowGeometry(
  terrain: ImportedTerrainDataV2,
  window: GridWindow,
  includeUvs = true
): {
  positions: Float32Array;
  uvs: Float32Array | null;
  normals: Float32Array | null;
  indices: Uint32Array;
} {
  const width = terrain.heightmap.width;
  const height = terrain.heightmap.height;
  const columns = window.segmentColumns + 1;
  const rows = window.segmentRows + 1;
  const positions = new Float32Array(columns * rows * 3);
  const uvs = includeUvs ? new Float32Array(columns * rows * 2) : null;
  const indices = new Uint32Array(
    window.segmentColumns * window.segmentRows * 6
  );
  const spacing =
    (terrain.worldBounds.maxX - terrain.worldBounds.minX) / (width - 1);
  const verticalOrigin = terrain.heightmap.verticalOriginMeters;

  let positionOffset = 0;
  let uvOffset = 0;
  for (let localRow = 0; localRow < rows; localRow += 1) {
    const sourceRow = window.startRow + localRow;
    for (let localColumn = 0; localColumn < columns; localColumn += 1) {
      const sourceColumn = window.startColumn + localColumn;
      const sourceIndex = sourceRow * width + sourceColumn;
      positions[positionOffset++] =
        terrain.worldBounds.minX + sourceColumn * spacing;
      positions[positionOffset++] =
        (terrain.heightmap.heights[sourceIndex] ?? verticalOrigin) -
        verticalOrigin;
      positions[positionOffset++] =
        terrain.worldBounds.minZ + sourceRow * spacing;
      if (uvs) {
        uvs[uvOffset++] = sourceColumn / (width - 1);
        // The source image is north-up: its top row is the terrain's min Z.
        uvs[uvOffset++] = 1 - sourceRow / (height - 1);
      }
    }
  }

  let indexOffset = 0;
  for (let row = 0; row < window.segmentRows; row += 1) {
    for (let column = 0; column < window.segmentColumns; column += 1) {
      const northWest = row * columns + column;
      const northEast = northWest + 1;
      const southWest = (row + 1) * columns + column;
      const southEast = southWest + 1;
      indices[indexOffset++] = northWest;
      indices[indexOffset++] = southWest;
      indices[indexOffset++] = northEast;
      indices[indexOffset++] = northEast;
      indices[indexOffset++] = southWest;
      indices[indexOffset++] = southEast;
    }
  }

  return { positions, uvs, normals: null, indices };
}

function worldBoundsToGridWindow(
  terrain: ImportedTerrainDataV2,
  bounds: FlowFestTerrainDetailBounds,
  paddingMeters: number,
  alignment: number
): GridWindow {
  const segmentsX = terrain.heightmap.width - 1;
  const segmentsZ = terrain.heightmap.height - 1;
  const spacingX =
    (terrain.worldBounds.maxX - terrain.worldBounds.minX) / segmentsX;
  const spacingZ =
    (terrain.worldBounds.maxZ - terrain.worldBounds.minZ) / segmentsZ;
  const snapDown = (value: number, spacing: number, minimum: number) =>
    Math.max(
      0,
      Math.floor((value - paddingMeters - minimum) / spacing / alignment) *
        alignment
    );
  const snapUp = (
    value: number,
    spacing: number,
    minimum: number,
    maximum: number
  ) =>
    Math.min(
      maximum,
      Math.ceil((value + paddingMeters - minimum) / spacing / alignment) *
        alignment
    );
  const startColumn = snapDown(bounds.minX, spacingX, terrain.worldBounds.minX);
  const endColumn = snapUp(
    bounds.maxX,
    spacingX,
    terrain.worldBounds.minX,
    segmentsX
  );
  const startRow = snapDown(bounds.minZ, spacingZ, terrain.worldBounds.minZ);
  const endRow = snapUp(
    bounds.maxZ,
    spacingZ,
    terrain.worldBounds.minZ,
    segmentsZ
  );
  return {
    startColumn,
    startRow,
    segmentColumns: endColumn - startColumn,
    segmentRows: endRow - startRow,
  };
}

function gridWindowToWorldBounds(
  terrain: ImportedTerrainDataV2,
  window: GridWindow
): FlowFestTerrainDetailBounds {
  const spacingX =
    (terrain.worldBounds.maxX - terrain.worldBounds.minX) /
    (terrain.heightmap.width - 1);
  const spacingZ =
    (terrain.worldBounds.maxZ - terrain.worldBounds.minZ) /
    (terrain.heightmap.height - 1);
  return {
    minX: terrain.worldBounds.minX + window.startColumn * spacingX,
    maxX:
      terrain.worldBounds.minX +
      (window.startColumn + window.segmentColumns) * spacingX,
    minZ: terrain.worldBounds.minZ + window.startRow * spacingZ,
    maxZ:
      terrain.worldBounds.minZ +
      (window.startRow + window.segmentRows) * spacingZ,
  };
}

/**
 * Keep every source vertex inside the registered campground while widening
 * only the off-site horizon. Adjacent rows are zipper-triangulated when their
 * sample counts differ, so the single surface has no skirts or T-junctions.
 */
function buildAdaptiveWindowGeometry(
  terrain: ImportedTerrainDataV2,
  window: GridWindow,
  detailWindow: GridWindow,
  farSampleStep: number
): {
  positions: Float32Array;
  uvs: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
} {
  const width = terrain.heightmap.width;
  const height = terrain.heightmap.height;
  const verticalOrigin = terrain.heightmap.verticalOriginMeters;
  const spacingX =
    (terrain.worldBounds.maxX - terrain.worldBounds.minX) / (width - 1);
  const spacingZ =
    (terrain.worldBounds.maxZ - terrain.worldBounds.minZ) / (height - 1);
  const detailEndColumn =
    detailWindow.startColumn + detailWindow.segmentColumns;
  const detailEndRow = detailWindow.startRow + detailWindow.segmentRows;
  const rowSamples = buildAdaptiveAxisSamples(
    window.startRow,
    window.startRow + window.segmentRows,
    detailWindow.startRow,
    detailEndRow,
    farSampleStep,
    true
  );
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const rows: Array<{ columns: number[]; vertices: number[] }> = [];

  for (const sourceRow of rowSamples) {
    const rowIsDetailed =
      sourceRow >= detailWindow.startRow && sourceRow <= detailEndRow;
    const columns = buildAdaptiveAxisSamples(
      window.startColumn,
      window.startColumn + window.segmentColumns,
      detailWindow.startColumn,
      detailEndColumn,
      farSampleStep,
      rowIsDetailed
    );
    const vertices: number[] = [];
    for (const sourceColumn of columns) {
      const sourceIndex = sourceRow * width + sourceColumn;
      const vertexIndex = positions.length / 3;
      vertices.push(vertexIndex);
      positions.push(
        terrain.worldBounds.minX + sourceColumn * spacingX,
        (terrain.heightmap.heights[sourceIndex] ?? verticalOrigin) -
          verticalOrigin,
        terrain.worldBounds.minZ + sourceRow * spacingZ
      );
      uvs.push(sourceColumn / (width - 1), 1 - sourceRow / (height - 1));
      appendTerrainNormal(
        normals,
        terrain.heightmap.heights,
        width,
        height,
        sourceColumn,
        sourceRow,
        spacingX,
        spacingZ
      );
    }
    rows.push({ columns, vertices });
  }

  const indices: number[] = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const north = rows[rowIndex - 1]!;
    const south = rows[rowIndex]!;
    let northIndex = 0;
    let southIndex = 0;
    while (
      northIndex < north.columns.length - 1 ||
      southIndex < south.columns.length - 1
    ) {
      const nextNorth =
        north.columns[northIndex + 1] ?? Number.POSITIVE_INFINITY;
      const nextSouth =
        south.columns[southIndex + 1] ?? Number.POSITIVE_INFINITY;
      const northWest = north.vertices[northIndex]!;
      const southWest = south.vertices[southIndex]!;
      if (nextNorth <= nextSouth) {
        indices.push(northWest, southWest, north.vertices[northIndex + 1]!);
        northIndex += 1;
      }
      if (nextSouth <= nextNorth) {
        indices.push(
          north.vertices[northIndex]!,
          southWest,
          south.vertices[southIndex + 1]!
        );
        southIndex += 1;
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}

function buildAdaptiveAxisSamples(
  start: number,
  end: number,
  detailStart: number,
  detailEnd: number,
  farSampleStep: number,
  includeDetail: boolean
): number[] {
  const samples = new Set<number>([start, end]);
  for (let sample = start; sample <= end; sample += farSampleStep) {
    samples.add(sample);
  }
  if (includeDetail) {
    const first = Math.max(start, detailStart);
    const last = Math.min(end, detailEnd);
    for (let sample = first; sample <= last; sample += 1) samples.add(sample);
  }
  return [...samples].sort((a, b) => a - b);
}

function appendTerrainNormal(
  output: number[],
  heights: Float32Array,
  width: number,
  height: number,
  column: number,
  row: number,
  spacingX: number,
  spacingZ: number
): void {
  const west = Math.max(0, column - 1);
  const east = Math.min(width - 1, column + 1);
  const north = Math.max(0, row - 1);
  const south = Math.min(height - 1, row + 1);
  const slopeX =
    ((heights[row * width + east] ?? 0) - (heights[row * width + west] ?? 0)) /
    ((east - west) * spacingX || 1);
  const slopeZ =
    ((heights[south * width + column] ?? 0) -
      (heights[north * width + column] ?? 0)) /
    ((south - north) * spacingZ || 1);
  const inverseLength = 1 / Math.hypot(slopeX, 1, slopeZ);
  output.push(-slopeX * inverseLength, inverseLength, -slopeZ * inverseLength);
}
