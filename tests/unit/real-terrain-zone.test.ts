import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createRealTerrainZone,
  getBlendedHeight,
  sampleRealHeight,
  type ImportedTerrainDataV2,
  type LegacyImportedTerrainData,
} from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";

function geospatialFixture(): ImportedTerrainDataV2 {
  return {
    version: 2,
    name: "Meter-true fixture",
    sourceManifestPath: "/data/fixture/terrain.manifest.json",
    worldBounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
    heightmap: {
      width: 3,
      height: 3,
      minElevation: 100,
      maxElevation: 122,
      verticalOriginMeters: 90,
      verticalScale: 1,
      heights: new Float32Array([100, 101, 102, 110, 111, 112, 120, 121, 122]),
    },
    boundary: [
      { worldX: -1, worldZ: -1 },
      { worldX: 1, worldZ: -1 },
      { worldX: 1, worldZ: 1 },
      { worldX: -1, worldZ: 1 },
    ],
    geoReference: {
      projectedCrs: {
        authority: "EPSG",
        code: 26916,
        name: "NAD83 / UTM zone 16N",
      },
      requestedAnchorWgs84: { latitude: 39.589617, longitude: -84.785764 },
      resolvedOriginWgs84: { latitude: 39.58962, longitude: -84.78576 },
      originProjectedMeters: { easting: 690000, northing: 4385000 },
      axes: { x: "east", y: "up", z: "south" },
      verticalDatum: "NAVD88",
    },
  };
}

describe("real terrain meter frame", () => {
  it("preserves one elevation meter as one world meter", () => {
    const zone = createRealTerrainZone(geospatialFixture());

    expect(sampleRealHeight(zone, -1, -1)).toBe(10);
    expect(sampleRealHeight(zone, 0, 0)).toBe(21);
    expect(sampleRealHeight(zone, 1, 1)).toBe(32);
    expect(sampleRealHeight(zone, -0.5, -0.5)).toBe(15.5);
  });

  it("keeps north-to-south rows aligned with negative-to-positive world Z", () => {
    const zone = createRealTerrainZone(geospatialFixture());

    expect(sampleRealHeight(zone, 0, -1)).toBe(11);
    expect(sampleRealHeight(zone, 0, 1)).toBe(31);
  });

  it("never mixes procedural noise into the measured footprint", () => {
    const zone = createRealTerrainZone(geospatialFixture());
    const oneMeterInside = { x: 0, z: 0 };

    expect(
      getBlendedHeight(zone, oneMeterInside.x, oneMeterInside.z, -1_000, 30)
    ).toBe(sampleRealHeight(zone, oneMeterInside.x, oneMeterInside.z));
  });

  it("rejects a legacy boundary captured in a different coordinate frame", () => {
    const mismatched: LegacyImportedTerrainData = {
      version: 1,
      name: "Mismatched legacy fixture",
      timestamp: "2026-01-01T00:00:00.000Z",
      geoBounds: {
        nw: { lat: 1, lng: 1 },
        se: { lat: 0, lng: 2 },
      },
      center: { lat: 0.5, lng: 1.5 },
      worldDimensions: { width: 2, depth: 2, originX: 0, originZ: 0 },
      heightmap: {
        width: 2,
        height: 2,
        minElevation: 100,
        maxElevation: 103,
        heights: [100, 101, 102, 103],
      },
      boundary: [
        { u: 0, v: 0, worldX: -10, worldZ: -10 },
        { u: 1, v: 0, worldX: 10, worldZ: -10 },
        { u: 1, v: 1, worldX: 10, worldZ: 10 },
      ],
    };

    expect(() => createRealTerrainZone(mismatched)).toThrow(
      "boundary uses a different coordinate frame"
    );
  });

  it("rejects the checked legacy Hannon artifact instead of silently stretching it", () => {
    const path = resolve(
      process.cwd(),
      "static/data/hannons-camp/hannons-camp-terrain.json"
    );
    const legacy = JSON.parse(
      readFileSync(path, "utf8")
    ) as LegacyImportedTerrainData;

    expect(() => createRealTerrainZone(legacy)).toThrow(
      "boundary uses a different coordinate frame"
    );
  });
});
