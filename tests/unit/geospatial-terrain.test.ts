import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import {
  loadGeospatialTerrain,
  loadGeospatialEvidenceLayers,
  parseGeospatialTerrainManifest,
  projectedMetersToWorld,
  worldToProjectedMeters,
  type GeospatialTerrainManifestV2,
  type TerrainFetch,
} from "#lib/shared/3d/procedural-engine/generation/geospatial-terrain.js";

function heightBytes(values: number[]): ArrayBuffer {
  const bytes = new ArrayBuffer(values.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes);
  values.forEach((value, index) => {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, value, true);
  });
  return bytes;
}

function digest(bytes: ArrayBuffer): string {
  return createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
}

function uint16Bytes(values: number[]): ArrayBuffer {
  const bytes = new ArrayBuffer(values.length * Uint16Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes);
  values.forEach((value, index) => {
    view.setUint16(index * Uint16Array.BYTES_PER_ELEMENT, value, true);
  });
  return bytes;
}

function manifestFixture(bytes: ArrayBuffer): GeospatialTerrainManifestV2 {
  return {
    schemaVersion: 2,
    pipelineVersion: 1,
    siteId: "flow-fest-test",
    displayName: "Flow Fest test terrain",
    sourceLock: {
      path: "scripts/geospatial/test-lock.json",
      sha256: "a".repeat(64),
    },
    worldFrame: {
      units: "meter",
      metersPerUnit: 1,
      handedness: "right",
      axes: { x: "east", y: "up", z: "south" },
      projectedCrs: {
        authority: "EPSG",
        code: 26916,
        name: "NAD83 / UTM zone 16N",
        wkt: "fixture",
      },
      requestedAnchorWgs84: { latitude: 39.589617, longitude: -84.785764 },
      resolvedOriginWgs84: { latitude: 39.58962, longitude: -84.78576 },
      originProjectedMeters: { easting: 690000, northing: 4385000 },
      vertical: { datum: "NAVD88", originElevationMeters: 90, scale: 1 },
    },
    terrain: {
      height: {
        path: "/data/flow-fest-sim/test-height.f32",
        productType: "DTM",
        encoding: "float32-le",
        layout: "row-major",
        rowOrder: "north-to-south",
        columnOrder: "west-to-east",
        width: 2,
        height: 2,
        sampleSpacingMeters: 1,
        nativeGroundSampleDistanceMeters: 1,
        resamplingKernel: "bilinear",
        minimumElevationMeters: 100,
        maximumElevationMeters: 103,
        reliefMeters: 3,
        noDataSamples: 0,
        byteLength: bytes.byteLength,
        sha256: digest(bytes),
      },
      sampleBoundsWorldMeters: { minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5 },
      coverageBoundaryWorldMeters: [
        { x: -0.5, z: -0.5 },
        { x: 0.5, z: -0.5 },
        { x: 0.5, z: 0.5 },
        { x: -0.5, z: 0.5 },
      ],
    },
    surfaceEvidence: {
      path: "/data/flow-fest-sim/test-surface.u16",
      encoding: "uint16-le-centimeters-above-dtm",
      noDataValue: 65535,
      width: 2,
      height: 2,
      byteLength: 8,
      sha256: "b".repeat(64),
      coverageRatio: 1,
      maximumOffsetMeters: 20,
      sampleSpacingMeters: 1,
      sampleBoundsWorldMeters: {
        minX: -0.5,
        maxX: 0.5,
        minZ: -0.5,
        maxZ: 0.5,
      },
    },
    orthophoto: {
      path: "/data/flow-fest-sim/test-ortho.webp",
      format: "webp",
      width: 2,
      height: 2,
      rowOrder: "north-to-south",
      columnOrder: "west-to-east",
      sourceYear: 2023,
      sourceAcquisitionDateUnixMilliseconds: 1,
      sourceResolutionMeters: 0.3,
      runtimePixelSizeMeters: 0.5,
      projectedCrs: { authority: "EPSG", code: 26916 },
      sampleBoundsWorldMeters: {
        minX: -0.5,
        maxX: 0.5,
        minZ: -0.5,
        maxZ: 0.5,
      },
      byteLength: 1,
      sha256: "c".repeat(64),
    },
  };
}

function requestFixture(
  manifest: GeospatialTerrainManifestV2,
  bytes: ArrayBuffer
): TerrainFetch {
  return async (path) => {
    if (path.endsWith("terrain.manifest.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => manifest,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      arrayBuffer: async () => bytes.slice(0),
    };
  };
}

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto });
  }
});

describe("geospatial terrain package", () => {
  it("loads only after validating shape, checksum, statistics, units, and axes", async () => {
    const bytes = heightBytes([100, 101, 102, 103]);
    const manifest = manifestFixture(bytes);

    const terrain = await loadGeospatialTerrain(
      "/data/flow-fest-sim/terrain.manifest.json",
      requestFixture(manifest, bytes)
    );

    expect(terrain.heightmap.heights).toEqual(
      new Float32Array([100, 101, 102, 103])
    );
    expect(terrain.heightmap.verticalScale).toBe(1);
    expect(terrain.geoReference.axes).toEqual({
      x: "east",
      y: "up",
      z: "south",
    });
  });

  it("rejects a plausible-looking binary with the wrong content hash", async () => {
    const expectedBytes = heightBytes([100, 101, 102, 103]);
    const alteredBytes = heightBytes([100, 101, 102, 104]);
    const manifest = manifestFixture(expectedBytes);

    await expect(
      loadGeospatialTerrain(
        "/data/flow-fest-sim/terrain.manifest.json",
        requestFixture(manifest, alteredBytes)
      )
    ).rejects.toThrow("checksum mismatch");
  });

  it("rejects grid bounds that disagree with sample count and spacing", () => {
    const bytes = heightBytes([100, 101, 102, 103]);
    const manifest = manifestFixture(bytes);
    manifest.terrain.sampleBoundsWorldMeters.maxX = 10;

    expect(() => parseGeospatialTerrainManifest(manifest)).toThrow(
      "bounds disagree with sample spacing"
    );
  });

  it("loads optional surface and imagery layers only after byte and hash checks", async () => {
    const height = heightBytes([100, 101, 102, 103]);
    const surface = uint16Bytes([0, 120, 65535, 230]);
    const ortho = new Uint8Array([82, 73, 70, 70]).buffer;
    const manifest = manifestFixture(height);
    manifest.surfaceEvidence.sha256 = digest(surface);
    manifest.orthophoto.byteLength = ortho.byteLength;
    manifest.orthophoto.sha256 = digest(ortho);
    const request: TerrainFetch = async (path) => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      arrayBuffer: async () =>
        path.endsWith(".u16") ? surface.slice(0) : ortho.slice(0),
    });

    const layers = await loadGeospatialEvidenceLayers(manifest, request);

    expect(layers.surfaceOffsetsCentimeters).toEqual(
      new Uint16Array([0, 120, 65535, 230])
    );
    expect(layers.orthophotoBytes.byteLength).toBe(4);
  });

  it("round-trips projected and game coordinates without changing handedness", () => {
    const bytes = heightBytes([100, 101, 102, 103]);
    const manifest = parseGeospatialTerrainManifest(manifestFixture(bytes));
    const projected = {
      easting: 690123.25,
      northing: 4384932.5,
      elevationMeters: 117.75,
    };

    const world = projectedMetersToWorld(manifest, projected);

    expect(world).toEqual({ x: 123.25, y: 27.75, z: 67.5 });
    expect(worldToProjectedMeters(manifest, world)).toEqual(projected);
  });

  it("parses the checked manifest and matches its real height binary", () => {
    const manifestPath = resolve(
      process.cwd(),
      "static/data/flow-fest-sim/terrain.manifest.json"
    );
    const manifest = parseGeospatialTerrainManifest(
      JSON.parse(readFileSync(manifestPath, "utf8"))
    );
    const heightPath = resolve(
      process.cwd(),
      `static${manifest.terrain.height.path}`
    );
    const bytes = readFileSync(heightPath);

    expect(bytes.byteLength).toBe(manifest.terrain.height.byteLength);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      manifest.terrain.height.sha256
    );
  });
});
