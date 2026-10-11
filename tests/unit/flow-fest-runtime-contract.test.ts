import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";
import {
  horizontalToVerticalFovDegrees,
  parseFlowFestRuntimeContract,
  verticalToHorizontalFovDegrees,
  type FlowFestRuntimeContract,
} from "../../src/routes/test/flow-fest-graybox/flow-fest-runtime-contract";
import {
  auditFlowFestBarrierTopology,
  buildFlowFestLidarBarrierGeometry,
} from "../../src/routes/test/flow-fest-graybox/flow-fest-review-geometry";

const contractPath = resolve(
  process.cwd(),
  "static/data/flow-fest-sim/gate2-runtime-contract.json"
);

function readContract(): FlowFestRuntimeContract {
  return parseFlowFestRuntimeContract(
    JSON.parse(readFileSync(contractPath, "utf8")) as unknown
  );
}

function readTerrain(): ImportedTerrainDataV2 {
  const manifest = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "static/data/flow-fest-sim/terrain.manifest.json"),
      "utf8"
    )
  ) as {
    terrain: {
      height: {
        width: number;
        height: number;
        minimumElevationMeters: number;
        maximumElevationMeters: number;
      };
      sampleBoundsWorldMeters: {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
      };
      coverageBoundaryWorldMeters: Array<{ x: number; z: number }>;
    };
    worldFrame: {
      vertical: { originElevationMeters: number };
      projectedCrs: { code: number; name: string };
      requestedAnchorWgs84: { latitude: number; longitude: number };
      resolvedOriginWgs84: { latitude: number; longitude: number };
      originProjectedMeters: { easting: number; northing: number };
      axes: { x: "east"; y: "up"; z: "south" };
    };
  };
  const bytes = readFileSync(
    resolve(process.cwd(), "static/data/flow-fest-sim/terrain-height.f32")
  );
  const heights = new Float32Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  return {
    version: 2,
    name: "Flow Fest Sim Earth",
    sourceManifestPath: "/data/flow-fest-sim/terrain.manifest.json",
    worldBounds: manifest.terrain.sampleBoundsWorldMeters,
    heightmap: {
      width: manifest.terrain.height.width,
      height: manifest.terrain.height.height,
      minElevation: manifest.terrain.height.minimumElevationMeters,
      maxElevation: manifest.terrain.height.maximumElevationMeters,
      verticalOriginMeters: manifest.worldFrame.vertical.originElevationMeters,
      verticalScale: 1,
      heights,
    },
    boundary: manifest.terrain.coverageBoundaryWorldMeters.map((point) => ({
      worldX: point.x,
      worldZ: point.z,
    })),
    geoReference: {
      projectedCrs: {
        authority: "EPSG",
        code: manifest.worldFrame.projectedCrs.code,
        name: manifest.worldFrame.projectedCrs.name,
      },
      requestedAnchorWgs84: manifest.worldFrame.requestedAnchorWgs84,
      resolvedOriginWgs84: manifest.worldFrame.resolvedOriginWgs84,
      originProjectedMeters: manifest.worldFrame.originProjectedMeters,
      axes: manifest.worldFrame.axes,
      verticalDatum: "NAVD88",
    },
  };
}

describe("Flow Fest Gate 2 runtime contract", () => {
  it("preserves the registered horizontal lens across review aspects", () => {
    for (const aspect of [16 / 9, 4 / 3, 375 / 812, 2560 / 1440]) {
      const vertical = horizontalToVerticalFovDegrees(65, aspect);
      expect(verticalToHorizontalFovDegrees(vertical, aspect)).toBeCloseTo(
        65,
        10
      );
    }
  });

  it("locks approved walking timing and leaves vehicle timing unclaimed", () => {
    const contract = readContract();
    for (const branch of Object.values(contract.routes.arrivalBranches)) {
      for (const segment of branch.segments) {
        if (segment.mode === "person") {
          expect(segment.nominalSpeedMetersPerSecond).toBe(1.2);
          expect(segment.nominalDurationSeconds).toBeCloseTo(
            segment.lengthMeters / 1.2,
            5
          );
        } else {
          expect(segment.nominalSpeedMetersPerSecond).toBeNull();
          expect(segment.nominalDurationSeconds).toBeNull();
        }
      }
    }
  });

  it("keeps both traced connectors exact and their Middle Earth entries distinct", () => {
    const contract = readContract();
    const upper = contract.connectorTraces.upperClearingToMiddleEarth.vertices;
    const lower = contract.connectorTraces.middleEarthToLowerClearing.vertices;
    expect(upper).toHaveLength(13);
    expect(lower).toHaveLength(14);
    expect([upper.at(-1)?.x, upper.at(-1)?.z]).toEqual([99.2, -113.4]);
    expect([lower[0]?.x, lower[0]?.z]).toEqual([102.5, -113.8]);
    expect(
      Math.hypot(upper.at(-1)!.x - lower[0]!.x, upper.at(-1)!.z - lower[0]!.z)
    ).toBeCloseTo(3.324154, 5);
  });

  it("derives one visible collider mesh from the full measured occupancy mask", () => {
    const contract = readContract();
    const terrain = readTerrain();
    const bytes = readFileSync(
      resolve(process.cwd(), "static/data/flow-fest-sim/surface-offset.u16")
    );
    const surface = new Uint16Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength / Uint16Array.BYTES_PER_ELEMENT
    );
    const barriers = buildFlowFestLidarBarrierGeometry(
      contract,
      terrain,
      surface
    );
    expect(barriers.occupiedCellCount).toBe(95_588);
    expect(barriers.occupancyWidth).toBe(541);
    expect(barriers.occupancyHeight).toBe(211);
    expect(barriers.cellSizeMeters).toBe(1);
    expect(barriers.corridorClearanceMeters).toBeCloseTo(1.12, 8);
    expect(barriers.vehicleCorridorClearanceMeters).toBeCloseTo(2.9, 8);
    expect(barriers.vehicleHalfWidthMeters).toBe(1);
    expect(barriers.conservativeDilationMeters).toBe(18);
    expect(barriers.occupancy.reduce((total, cell) => total + cell, 0)).toBe(
      barriers.occupiedCellCount
    );
    expect(barriers.mesh.geometry.getAttribute("position").array).toBe(
      barriers.vertices
    );
    expect(barriers.mesh.geometry.getIndex()?.array).toBe(barriers.indices);
    barriers.mesh.geometry.dispose();
  });

  it("keeps every person and vehicle corridor plus each clearing open without an off-corridor challenger", () => {
    const contract = readContract();
    const terrain = readTerrain();
    const bytes = readFileSync(
      resolve(process.cwd(), "static/data/flow-fest-sim/surface-offset.u16")
    );
    const surface = new Uint16Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength / Uint16Array.BYTES_PER_ELEMENT
    );
    const barriers = buildFlowFestLidarBarrierGeometry(
      contract,
      terrain,
      surface
    );
    const audit = auditFlowFestBarrierTopology(contract, barriers);
    expect(audit.status).toBe("passed");
    expect(audit.spawnUnobstructed).toBe(true);
    expect(audit.approvedPersonLegs).toBeGreaterThan(100);
    expect(audit.obstructedApprovedLegs).toEqual([]);
    expect(audit.approvedVehicleLegs).toBeGreaterThan(50);
    expect(audit.obstructedApprovedVehicleLegs).toEqual([]);
    for (const connector of Object.values(audit.connectors)) {
      expect(connector.connected).toBe(true);
      expect(connector.withinApprovedCorridor).toBe(true);
      expect(connector.maximumDeviationFromApprovedMeters).toBeLessThanOrEqual(
        connector.maximumAllowedDeviationMeters
      );
      expect(connector.offCorridorChallengerIsShorter).toBe(false);
      expect(
        connector.offCorridorChallengerGridDistanceMeters
      ).toBeGreaterThanOrEqual(connector.inCorridorGridDistanceMeters!);
    }
    for (const zone of Object.values(audit.zones)) {
      expect(zone.passed).toBe(true);
      expect(zone.openFraction).toBeGreaterThanOrEqual(
        zone.minimumRequiredOpenFraction
      );
    }
    barriers.mesh.geometry.dispose();
  });
});
