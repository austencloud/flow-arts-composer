import { describe, expect, it } from "vitest";
import { Mesh } from "three";
import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";
import {
  buildFlowFestTerrainHost,
  buildFlowFestChunkSeamTraversal,
  flowFestColliderWindowKey,
  sampleFlowFestTerrainWorldY,
} from "../../src/routes/test/flow-fest-graybox/flow-fest-terrain-host";

function makeTerrain(width: number, height: number): ImportedTerrainDataV2 {
  const heights = new Float32Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      heights[row * width + column] = 270 + column * 0.5 + row * 0.25;
    }
  }
  return {
    version: 2,
    name: "Flow Fest test terrain",
    sourceManifestPath: "/data/flow-fest-sim/terrain.manifest.json",
    worldBounds: {
      minX: 0,
      maxX: width - 1,
      minZ: 0,
      maxZ: height - 1,
    },
    heightmap: {
      width,
      height,
      minElevation: 270,
      maxElevation: 270 + (width - 1) * 0.5 + (height - 1) * 0.25,
      verticalOriginMeters: 270,
      verticalScale: 1,
      heights,
    },
    boundary: [
      { worldX: 0, worldZ: 0 },
      { worldX: width - 1, worldZ: 0 },
      { worldX: width - 1, worldZ: height - 1 },
      { worldX: 0, worldZ: height - 1 },
    ],
    geoReference: {
      projectedCrs: {
        authority: "EPSG",
        code: 26916,
        name: "NAD83 / UTM zone 16N",
      },
      requestedAnchorWgs84: { latitude: 39.589617, longitude: -84.785764 },
      resolvedOriginWgs84: { latitude: 39.589617, longitude: -84.785764 },
      originProjectedMeters: { easting: 690142, northing: 4384552 },
      axes: { x: "east", y: "up", z: "south" },
      verticalDatum: "NAVD88",
    },
  };
}

describe("Flow Fest Gate 2 terrain hosts", () => {
  it("uses the visible bounded geometry arrays as the collider arrays", () => {
    const terrain = makeTerrain(33, 33);
    const host = buildFlowFestTerrainHost(terrain, "bounded-static", null);
    const mesh = host.root.children[0] as Mesh;
    const positions = mesh.geometry.getAttribute("position").array;
    const indices = mesh.geometry.getIndex()?.array;

    expect(host.colliders).toHaveLength(1);
    expect(host.colliders[0]?.vertices).toBe(positions);
    expect(host.colliders[0]?.indices).toBe(indices);
    expect(host.metrics.vertices).toBe(33 * 33);
    expect(host.metrics.triangles).toBe(32 * 32 * 2);
    host.dispose();
  });

  it("keeps chunk seams byte-identical to the bounded source grid", () => {
    const terrain = makeTerrain(65, 33);
    const host = buildFlowFestTerrainHost(terrain, "chunked", null);

    expect(host.metrics.renderMeshes).toBe(1);
    expect(host.metrics.colliderMeshes).toBe(2);
    const west = host.colliders[0]?.vertices;
    const east = host.colliders[1]?.vertices;
    expect(west).toBeDefined();
    expect(east).toBeDefined();
    for (let row = 0; row < 33; row += 1) {
      const westOffset = (row * 33 + 32) * 3;
      const eastOffset = row * 33 * 3;
      expect(Array.from(west!.slice(westOffset, westOffset + 3))).toEqual(
        Array.from(east!.slice(eastOffset, eastOffset + 3))
      );
    }
    host.dispose();
  });

  it("keeps the campground on the full grid while decimating only the far field", () => {
    const terrain = makeTerrain(65, 65);
    const host = buildFlowFestTerrainHost(terrain, "chunked", null, {
      fullDetailBounds: { minX: 16, maxX: 48, minZ: 16, maxZ: 48 },
      farSampleStep: 2,
    });
    const mesh = host.root.children[0] as Mesh;
    const positions = Array.from(
      mesh.geometry.getAttribute("position").array as Float32Array
    );
    const renderedPoints = new Set<string>();
    for (let offset = 0; offset < positions.length; offset += 3) {
      renderedPoints.add(`${positions[offset]}:${positions[offset + 2]}`);
    }

    expect(host.metrics.triangles).toBeLessThan(64 * 64 * 2);
    expect(host.metrics.triangles).toBeGreaterThan(32 * 32 * 2);
    expect(host.metrics.fullDetailBounds).toEqual({
      minX: 16,
      maxX: 48,
      minZ: 16,
      maxZ: 48,
    });
    expect(renderedPoints.has("17:17")).toBe(true);
    expect(renderedPoints.has("1:1")).toBe(false);
    expect(mesh.geometry.getAttribute("normal").count).toBe(
      mesh.geometry.getAttribute("position").count
    );
    expect(mesh.geometry.getIndex()!.count % 3).toBe(0);
    expect(
      Math.max(...Array.from(mesh.geometry.getIndex()!.array))
    ).toBeLessThan(mesh.geometry.getAttribute("position").count);
    expect(host.colliders).toHaveLength(4);
    host.dispose();
  });

  it("tiles the visual terrain into independently frustum-cullable 192 metre meshes", () => {
    const terrain = makeTerrain(257, 257);
    const host = buildFlowFestTerrainHost(terrain, "chunked", null, {
      fullDetailBounds: { minX: 64, maxX: 192, minZ: 64, maxZ: 192 },
      farSampleStep: 2,
    });
    const renderMeshes = host.root.children as Mesh[];

    expect(host.metrics.renderMeshes).toBe(4);
    expect(host.metrics.colliderMeshes).toBe(64);
    expect(renderMeshes).toHaveLength(4);
    for (const mesh of renderMeshes) {
      expect(mesh.frustumCulled).toBe(true);
      expect(mesh.geometry.boundingBox).not.toBeNull();
      const bounds = mesh.geometry.boundingBox!;
      expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(192);
      expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(192);
    }
    expect(renderMeshes.map((mesh) => mesh.name)).toEqual([
      "FFS_Terrain_ChunkedRender_0_0",
      "FFS_Terrain_ChunkedRender_1_0",
      "FFS_Terrain_ChunkedRender_0_1",
      "FFS_Terrain_ChunkedRender_1_1",
    ]);
    host.dispose();
  });

  it("samples the meter grid in the declared +X east, +Z south frame", () => {
    const terrain = makeTerrain(33, 33);
    expect(sampleFlowFestTerrainWorldY(terrain, 4, 8)).toBeCloseTo(4, 6);
    expect(sampleFlowFestTerrainWorldY(terrain, 4.5, 8.5)).toBeCloseTo(
      4.375,
      6
    );
  });

  it("probes before, on, and after every crossed 32 metre chunk seam", () => {
    const traversal = buildFlowFestChunkSeamTraversal(
      { x: -45, z: -17 },
      { x: 45, z: 47 },
      { minX: -512, minZ: -512 }
    );

    expect(traversal.seamCrossings).toBe(5);
    expect(traversal.seamAdjacentProbes).toBe(15);
    expect(traversal.endpointProbes).toBe(2);
    expect(traversal.probes).toHaveLength(17);
    const xSeamDistances = traversal.probes
      .map((point) => Math.hypot(point.x, point.z - 15))
      .filter((distance) => distance <= 0.051)
      .sort((a, b) => a - b);
    expect(xSeamDistances).toHaveLength(3);
    expect(xSeamDistances[0]).toBeCloseTo(0, 8);
    expect(xSeamDistances[1]).toBeCloseTo(0.05, 5);
    expect(xSeamDistances[2]).toBeCloseTo(0.05, 5);
  });

  it("keeps one collider window key until the player crosses a chunk seam", () => {
    const bounds = { minX: -512, minZ: -512 };
    expect(flowFestColliderWindowKey(-511.9, -511.9, bounds)).toBe("0:0");
    expect(flowFestColliderWindowKey(-480.01, -480.01, bounds)).toBe("0:0");
    expect(flowFestColliderWindowKey(-480, -480, bounds)).toBe("1:1");
    expect(flowFestColliderWindowKey(15.9, -480.1, bounds)).toBe("16:0");
  });
});
