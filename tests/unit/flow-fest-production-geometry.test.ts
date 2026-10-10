import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { InstancedMesh, Mesh } from "three";
import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";
import { parseFlowFestRuntimeContract } from "../../src/routes/test/flow-fest-graybox/flow-fest-runtime-contract";
import { buildFlowFestProductionDressing } from "../../src/routes/test/flow-fest-sim/flow-fest-production-geometry";
import { FLOW_FEST_LOWER_LOOP_ROAD_CROSSING } from "../../src/routes/test/flow-fest-sim/flow-fest-camp-plan";
import { getFlowFestVehicleStagePoint } from "../../src/routes/test/flow-fest-sim/flow-fest-site-fidelity";

const root = process.cwd();

function readTypedArray<T extends Float32Array | Uint16Array>(
  path: string,
  make: (buffer: ArrayBuffer) => T
): T {
  const bytes = readFileSync(resolve(root, path));
  return make(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer
  );
}

function loadInputs() {
  const contract = parseFlowFestRuntimeContract(
    JSON.parse(
      readFileSync(
        resolve(root, "static/data/flow-fest-sim/gate2-runtime-contract.json"),
        "utf8"
      )
    )
  );
  const heights = readTypedArray(
    "static/data/flow-fest-sim/terrain-height.f32",
    (buffer) => new Float32Array(buffer)
  );
  const offsets = readTypedArray(
    "static/data/flow-fest-sim/surface-offset.u16",
    (buffer) => new Uint16Array(buffer)
  );
  const terrain: ImportedTerrainDataV2 = {
    version: 2,
    name: "Flow Fest Sim Earth site",
    sourceManifestPath: "/data/flow-fest-sim/terrain.manifest.json",
    worldBounds: { minX: -512, maxX: 512, minZ: -512, maxZ: 512 },
    heightmap: {
      width: 1025,
      height: 1025,
      minElevation: 270.7053527832031,
      maxElevation: 298.4906005859375,
      verticalOriginMeters: 270,
      verticalScale: 1,
      heights,
    },
    boundary: [
      { worldX: -512, worldZ: -512 },
      { worldX: 512, worldZ: -512 },
      { worldX: 512, worldZ: 512 },
      { worldX: -512, worldZ: 512 },
    ],
    geoReference: {
      projectedCrs: {
        authority: "EPSG",
        code: 26916,
        name: "NAD83 / UTM zone 16N",
      },
      requestedAnchorWgs84: { latitude: 39.589617, longitude: -84.785764 },
      resolvedOriginWgs84: {
        latitude: 39.589613265369856,
        longitude: -84.78576527257212,
      },
      originProjectedMeters: { easting: 690142, northing: 4384552 },
      axes: { x: "east", y: "up", z: "south" },
      verticalDatum: "NAVD88",
    },
  };
  return { contract, terrain, offsets };
}

function closestMeshVertex(
  mesh: Mesh,
  point: { x: number; z: number }
): { distance: number; y: number } {
  const positions = mesh.geometry.getAttribute("position");
  let closest = { distance: Number.POSITIVE_INFINITY, y: 0 };
  for (let index = 0; index < positions.count; index += 1) {
    const distance = Math.hypot(
      positions.getX(index) - point.x,
      positions.getZ(index) - point.z
    );
    if (distance < closest.distance) {
      closest = { distance, y: positions.getY(index) };
    }
  }
  return closest;
}

describe("Flow Fest production dressing", () => {
  it("stages every branch at its contract-owned unload and settled endpoints", () => {
    const { contract } = loadInputs();
    expect(
      getFlowFestVehicleStagePoint(contract, "lower-tent", "unload")
    ).toMatchObject({ x: 286, z: -130 });
    expect(
      getFlowFestVehicleStagePoint(contract, "lower-tent", "settled")
    ).toMatchObject({ x: -110, z: -30 });
    expect(
      getFlowFestVehicleStagePoint(contract, "upper-tent", "unload")
    ).toMatchObject({ x: -62, z: -74 });
    expect(
      getFlowFestVehicleStagePoint(contract, "upper-tent", "settled")
    ).toMatchObject({ x: -110, z: -30 });
    expect(
      getFlowFestVehicleStagePoint(contract, "car-camp", "unload")
    ).toMatchObject({ x: 255, z: -130 });
    expect(
      getFlowFestVehicleStagePoint(contract, "car-camp", "settled")
    ).toMatchObject({ x: 255, z: -130 });
  });

  it("is deterministic, source-classed, and keeps the three camp types distinct", () => {
    const { contract, terrain, offsets } = loadInputs();
    const first = buildFlowFestProductionDressing(
      contract,
      terrain,
      { offsetsCentimeters: offsets, width: 1025, height: 1025 },
      "lower-tent"
    );
    const second = buildFlowFestProductionDressing(
      contract,
      terrain,
      { offsetsCentimeters: offsets, width: 1025, height: 1025 },
      "lower-tent"
    );

    expect(first.counts).toEqual(second.counts);
    expect(first.counts).toMatchObject({
      tents: 53,
      vehicles: 44,
      festivalPeople: 26,
    });
    expect(first.counts.interpretedTrees).toBeGreaterThan(250);
    expect(first.counts.interpretedTrees).toBeLessThan(2500);
    expect(first.counts.routeLanterns).toBeGreaterThan(20);
    expect(first.counts.sitePathSurfaces).toBe(7);
    expect(first.counts.wayfindingMarkers).toBe(3);
    expect(first.counts.entranceLandmarks).toBe(13);
    expect(first.orientationAudit).toEqual({
      publicRoadSurfaceCount: 1,
      internalDriveSurfaceCount: 4,
      lowerCampgroundLoopSurfaceCount: 1,
      tracedConnectorSurfaceCount: 2,
      landmarkMarkerCount: 3,
      officialRoadFeatureObjectId: 3019609,
      entranceAnchorErrorMeters: 0,
      streetViewReferenceViewCount: 4,
      roadMarkingSurfaceCount: 5,
    });
    expect(first.spatialAudit).toMatchObject({ campRouteViolations: 0 });
    // Measured LiDAR peaks keep the detector's 7.5 m rejection radius; the
    // jittered-grid infill trees planted between them keep their own 4.5 m
    // floor, so no two trunks in the site woodland ever fuse.
    expect(first.spatialAudit.minimumCanopyPeakDistance).toBeGreaterThanOrEqual(
      7.5
    );
    expect(first.spatialAudit.minimumSiteTreeDistance).toBeGreaterThanOrEqual(
      4.5
    );
    expect(
      first.spatialAudit.tracedConnectorSurfaceCount
    ).toBeGreaterThanOrEqual(2);
    expect(first.spatialAudit.minimumTentCenterDistance).toBeGreaterThanOrEqual(
      3.1
    );
    expect(first.spatialAudit.lowerTentPerimeterCount).toBe(22);
    expect(first.spatialAudit.lowerTentMinimumLoopDistance).toBeGreaterThan(
      5.9
    );
    expect(first.spatialAudit.lowerTentMaximumLoopDistance).toBeLessThan(8);
    expect(first.spatialAudit).toMatchObject({
      lowerCenterVehicleCount: 44,
      lowerCenterTentCount: 10,
      lowerCenterCanopyCount: 8,
      lowerInnerRoadsideTentCount: 8,
      lowerOuterTreeLineTentCount: 14,
      lowerCenterVehicleOutsideLoopCount: 0,
      lowerCenterVehicleAisleIntrusionCount: 0,
      lowerCenterVehicleWalkLaneIntrusionCount: 0,
      lowerCenterGearWalkLaneIntrusionCount: 0,
      lowerInnerRoadsideTentOutsideLoopCount: 0,
      lowerOuterTreeLineTentInsideLoopCount: 0,
    });
    // Side-by-side stalls: a 3.55 m pitch with 0.12 m of jitter each way.
    expect(
      first.spatialAudit.minimumVehicleCenterDistance
    ).toBeGreaterThanOrEqual(3.05);
    expect(first.parkedCars).toHaveLength(44);
    for (const car of first.parkedCars) {
      expect(Math.abs(car.pitch)).toBeLessThan(0.2);
      expect(Math.abs(car.roll)).toBeLessThan(0.2);
    }
    expect(new Set(first.parkedCars.map((car) => car.modelId)).size).toBe(6);
    expect(
      first.spatialAudit.minimumTentVehicleDistance
    ).toBeGreaterThanOrEqual(3.2);
    expect(first.collision.visibleSolidCounts).toEqual({
      treeTrunks: first.counts.interpretedTrees,
      tents: first.counts.tents,
      vehicles: first.counts.vehicles,
      festivalFixtures: 5,
      entranceFixtures: 4,
    });
    // Trees, every tent but the player's own, the parked cars, the tailgate
    // canopies added with the car campground rows, and the four entrance
    // fixtures.
    expect(first.collision.staticMesh.visibleObjectCount).toBe(
      first.counts.interpretedTrees +
        first.counts.tents -
        1 +
        first.counts.vehicles +
        first.spatialAudit.lowerCenterCanopyCount +
        4
    );
    expect(first.collision.campEstablishedMesh.visibleObjectCount).toBe(1);
    expect(first.collision.festivalActiveMesh.visibleObjectCount).toBe(5);
    for (const mesh of [
      first.collision.staticMesh,
      first.collision.campEstablishedMesh,
      first.collision.festivalActiveMesh,
    ]) {
      expect(mesh.vertices.length).toBeGreaterThan(0);
      expect(mesh.indices.length % 3).toBe(0);
      expect(
        mesh.indices.reduce((maximum, index) => Math.max(maximum, index), 0)
      ).toBeLessThan(mesh.vertices.length / 3);
    }

    const firstTrees = first.root.getObjectByName(
      "FFS_TreeTrunks_Interpreted"
    ) as InstancedMesh;
    const secondTrees = second.root.getObjectByName(
      "FFS_TreeTrunks_Interpreted"
    ) as InstancedMesh;
    expect(Array.from(firstTrees.instanceMatrix.array.slice(0, 64))).toEqual(
      Array.from(secondTrees.instanceMatrix.array.slice(0, 64))
    );
    const festivalHeart = first.root.getObjectByName(
      "FFS_FictionalFestivalHeart"
    );
    expect(festivalHeart?.visible).toBe(false);
    expect(
      first.root.getObjectByName("FFS_LidarDerivedCanopyPeaks")
    ).toBeTruthy();
    expect(
      first.root.getObjectByName("FFS_CanonicalSitePaths_PlanAligned")
    ).toBeTruthy();
    const lowerLoop = first.root.getObjectByName(
      "FFS_PrivateDrive_lower-campground-loop_OrthophotoInterpreted"
    ) as Mesh;
    expect(lowerLoop.userData).toMatchObject({
      evidence: "public-orthophoto",
    });
    expect(lowerLoop.geometry.getAttribute("position").count).toBeGreaterThan(
      4_000
    );
    const entranceDrive = first.root.getObjectByName(
      "FFS_EntranceDriveway_PaleGravelApron_StreetViewObserved"
    ) as Mesh;
    expect(entranceDrive.userData).toMatchObject({
      evidence:
        "imagery-interpreted-centerline; provisional-interior-apron; street-view-observed-proportion",
      centerlineFeatureId: "camp-road-entrance-to-check-in",
      apronFeatureId: "lower-entrance-apron",
    });
    expect(
      first.root.getObjectByName(
        "FFS_PrivateDrive_camp-road-entrance-to-check-in_OrthophotoInterpreted"
      )
    ).toBeUndefined();
    const entranceSeam = closestMeshVertex(
      entranceDrive,
      FLOW_FEST_LOWER_LOOP_ROAD_CROSSING
    );
    const loopSeam = closestMeshVertex(
      lowerLoop,
      FLOW_FEST_LOWER_LOOP_ROAD_CROSSING
    );
    expect(entranceSeam.distance).toBeLessThan(0.01);
    expect(loopSeam.distance).toBeLessThan(0.01);
    expect(Math.abs(entranceSeam.y - loopSeam.y)).toBeLessThanOrEqual(0.01);
    expect(first.groundSurface.audit).toMatchObject({
      sourceRouteCount: 7,
    });
    expect(first.groundSurface.audit.lowerLoopPaintedPixels).toBeGreaterThan(
      300
    );
    const publicRoad = first.root.getObjectByName(
      "FFS_PublicRoad_odot-camden-college-corner-road_ODOT"
    ) as Mesh;
    expect(publicRoad.userData).toMatchObject({
      evidence: "official-road-inventory",
      featureObjectId: 3019609,
    });
    const publicRoadNormals = publicRoad.geometry.getAttribute("normal");
    expect(
      Array.from({ length: publicRoadNormals.count }, (_, index) =>
        publicRoadNormals.getY(index)
      ).every((normalY) => normalY > 0)
    ).toBe(true);
    expect(
      first.root.getObjectByName("FFS_PlanLandmarkWayfinding")
    ).toBeTruthy();
    expect(
      first.root.getObjectByName("FFS_StreetViewEntrance_August2024")
    ).toBeTruthy();
    expect(
      first.root.getObjectByName("FFS_EntranceGatehouse_August2024")
    ).toBeTruthy();
    expect(
      first.root.getObjectByName(
        "FFS_EntranceFence_WhiteThreeRail_StreetViewObserved"
      )
    ).toBeTruthy();
    expect(
      first.root.getObjectByName("FFS_EntranceGateSign_StreetViewObserved")
    ).toBeTruthy();
    expect(
      first.root.getObjectByName("FFS_EntranceUtilityLine_StreetViewObserved")
    ).toBeTruthy();
    expect(
      first.root.getObjectByName(
        "FFS_EntranceDriveway_PaleGravelApron_StreetViewObserved"
      )
    ).toBeTruthy();
    expect(
      first.root.getObjectByName("FFS_EntranceRoadPaint_ODOTAligned")?.children
    ).toHaveLength(5);
    const playerTent = first.root.getObjectByName(
      "FFS_PlayerTent_lower-tent_Authored"
    );
    expect(playerTent?.visible).toBe(false);
    first.setCampEstablished(true);
    expect(playerTent?.visible).toBe(true);
    first.setFestivalActive(true);
    expect(festivalHeart?.visible).toBe(true);
    expect(
      first.root.getObjectByName("FFS_NightHeart_Mast_Fictional")
    ).toBeFalsy();
    expect(
      first.root.getObjectByName("FFS_NightHeart_LightRing_Crown")
    ).toBeFalsy();
    expect(
      first.root.getObjectByName("FFS_FireJam_OpenPerformanceFloor_Authored")
    ).toBeTruthy();
    expect(
      first.root.getObjectByName("FFS_LEDFlowCircle_OpenCanopy_Authored")
    ).toBeTruthy();
    expect(first.festivalCommunity).toMatchObject({
      spectatorCount: 16,
      performerCount: 10,
      firePerformerCount: 5,
      activeFirePerformerCount: 3,
    });
    expect(first.festivalCommunityAudit).toMatchObject({
      spectatorFloorIntrusions: 0,
      fireRotationComplete: true,
      ingressParticipantCount: 0,
    });
    const firePerformers = first.festivalCommunity.people.filter((person) =>
      person.role.startsWith("fire-")
    );
    expect(firePerformers).toHaveLength(5);
    expect(
      firePerformers.every(
        (person) =>
          Math.hypot(
            person.x - first.festivalCommunity.fireCenter.x,
            person.z - first.festivalCommunity.fireCenter.z
          ) < 5
      )
    ).toBe(true);
    expect(
      Math.hypot(
        first.festivalCommunity.fireCenter.x -
          first.festivalCommunity.ledCircleCenter.x,
        first.festivalCommunity.fireCenter.z -
          first.festivalCommunity.ledCircleCenter.z
      )
    ).toBeGreaterThan(30);

    first.dispose();
    second.dispose();
  }, 30_000);

  it.each([
    ["lower-tent", 37],
    ["upper-tent", 22],
    ["car-camp", 24],
  ] as const)(
    "keeps %s branch dressing deterministic and route-clear",
    (branch, routeLanterns) => {
      const { contract, terrain, offsets } = loadInputs();
      const dressing = buildFlowFestProductionDressing(
        contract,
        terrain,
        { offsetsCentimeters: offsets, width: 1025, height: 1025 },
        branch
      );

      expect(dressing.counts).toMatchObject({
        tents: 53,
        vehicles: 44,
        festivalPeople: 26,
        routeLanterns,
      });
      expect(dressing.counts.interpretedTrees).toBeGreaterThan(250);
      expect(dressing.counts.sitePathSurfaces).toBeGreaterThan(5);
      expect(dressing.spatialAudit.campRouteViolations).toBe(0);
      expect(
        dressing.spatialAudit.minimumCanopyPeakDistance
      ).toBeGreaterThanOrEqual(7.5);
      expect(
        dressing.spatialAudit.minimumSiteTreeDistance
      ).toBeGreaterThanOrEqual(4.5);
      expect(dressing.collision.staticMesh.visibleObjectCount).toBe(
        dressing.counts.interpretedTrees + 108
      );
      expect(dressing.collision.campEstablishedMesh.visibleObjectCount).toBe(1);
      expect(dressing.collision.festivalActiveMesh.visibleObjectCount).toBe(5);
      expect(
        dressing.root.getObjectByName(`FFS_PlayerTent_${branch}_Authored`)
          ?.visible
      ).toBe(false);
      dressing.dispose();
    }
  );
});
