import {
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from "three";
import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";
import {
  allFlowFestSegments,
  type FlowFestBranchId,
  type FlowFestRuntimeContract,
  type FlowFestRuntimePoint,
  type FlowFestRuntimeSegment,
  type FlowFestRuntimeZone,
} from "./flow-fest-runtime-contract";
import { sampleFlowFestTerrainWorldY } from "./flow-fest-terrain-host";

export interface FlowFestBarrierGeometry {
  mesh: Mesh;
  vertices: Float32Array;
  indices: Uint32Array;
  occupancy: Uint8Array;
  occupancyWidth: number;
  occupancyHeight: number;
  occupancyMinX: number;
  occupancyMinZ: number;
  occupiedCellCount: number;
  cellSizeMeters: 1;
  corridorClearanceMeters: number;
  vehicleCorridorClearanceMeters: number;
  vehicleHalfWidthMeters: number;
  conservativeDilationMeters: number;
}

export interface FlowFestBarrierTopologyAudit {
  status: "passed" | "failed";
  spawnUnobstructed: boolean;
  approvedPersonLegs: number;
  obstructedApprovedLegs: Array<{
    segmentId: string;
    legIndex: number;
  }>;
  approvedVehicleLegs: number;
  obstructedApprovedVehicleLegs: Array<{
    segmentId: string;
    legIndex: number;
  }>;
  connectors: {
    upperClearingToMiddleEarth: FlowFestConnectorNavigationAudit;
    middleEarthToLowerClearing: FlowFestConnectorNavigationAudit;
  };
  zones: Record<
    string,
    {
      sampledCells: number;
      openCells: number;
      openFraction: number;
      minimumRequiredOpenFraction: number;
      passed: boolean;
    }
  >;
}

export interface FlowFestConnectorNavigationAudit {
  connected: boolean;
  approvedDistanceMeters: number;
  gridDistanceMeters: number | null;
  smoothedNavigableDistanceMeters: number | null;
  maximumDeviationFromApprovedMeters: number | null;
  maximumAllowedDeviationMeters: number;
  withinApprovedCorridor: boolean;
  inCorridorGridDistanceMeters: number | null;
  offCorridorChallengerGridDistanceMeters: number | null;
  offCorridorChallengerIsShorter: boolean;
}

const BARRIER_CELL_SIZE_METERS = 1 as const;
const PLAYER_RADIUS_METERS = 0.3;
const KINEMATIC_OFFSET_METERS = 0.02;
const VEHICLE_HALF_WIDTH_METERS = 1;
const RASTER_MARGIN_METERS = 0.4;
const CONSERVATIVE_DILATION_METERS = 18;
const MAXIMUM_CONNECTOR_DEVIATION_METERS = 2.5;

const BRANCH_COLOR: Record<FlowFestBranchId, string> = {
  "lower-tent": "#ffb45b",
  "upper-tent": "#b69cff",
  "car-camp": "#69df9d",
};

/**
 * Build the legibility layer from the canonical Gate 2 contract. Nothing in
 * this group collides; it explains the routes and evidence classes without
 * becoming a second description of the ground.
 */
export function buildFlowFestReviewOverlay(
  contract: FlowFestRuntimeContract,
  terrain: ImportedTerrainDataV2,
  selectedBranch: FlowFestBranchId
): Group {
  const root = new Group();
  root.name = "FFS_ReviewOverlay";

  for (const branchId of Object.keys(
    contract.routes.arrivalBranches
  ) as FlowFestBranchId[]) {
    const branch = contract.routes.arrivalBranches[branchId];
    const segments = [
      ...branch.segments,
      contract.routes.nightReturnBranches[branchId],
    ];
    for (const segment of segments) {
      const geometry = buildFlowFestTerrainRibbonGeometry(terrain, segment);
      const mesh = new Mesh(
        geometry,
        new MeshBasicMaterial({
          color: BRANCH_COLOR[branchId],
          transparent: true,
          opacity: branchId === selectedBranch ? 0.92 : 0.28,
          depthWrite: false,
          side: DoubleSide,
        })
      );
      mesh.name = `FFS_Route_${branchId}_${segment.id}`;
      mesh.renderOrder = branchId === selectedBranch ? 4 : 2;
      root.add(mesh);
    }
  }

  for (const zone of contract.zones) {
    const radiusX = zone.radiusMeters ?? zone.searchRadiusXMeters ?? 8;
    const radiusZ = zone.radiusMeters ?? zone.searchRadiusZMeters ?? radiusX;
    const points: FlowFestRuntimePoint[] = [];
    for (let index = 0; index <= 96; index += 1) {
      const angle = (index / 96) * Math.PI * 2;
      const x = zone.center.x + Math.cos(angle) * radiusX;
      const z = zone.center.z + Math.sin(angle) * radiusZ;
      points.push({
        x,
        z,
        sourceTerrainY: sampleFlowFestTerrainWorldY(terrain, x, z),
        reviewTerrainY: 0,
      });
    }
    const ring = new Mesh(
      buildFlowFestTerrainRibbonGeometry(terrain, {
        id: zone.id,
        mode: "person",
        widthMeters: 0.55,
        lengthMeters: 0,
        sourceClasses: [zone.class],
        pathClass: zone.shape,
        points,
      }),
      new MeshBasicMaterial({
        color: zone.id === "middle-earth-zone" ? "#62d8de" : "#fff4c7",
        transparent: true,
        opacity: 0.76,
        depthWrite: false,
        side: DoubleSide,
      })
    );
    ring.name = `FFS_Zone_${zone.id}`;
    ring.renderOrder = 5;
    root.add(ring);
  }

  for (const anchor of contract.anchors) {
    const geometry = new ConeGeometry(0.85, 2.8, 8);
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color:
          anchor.id === "car-camp"
            ? BRANCH_COLOR["car-camp"]
            : anchor.id === "upper-tent"
              ? BRANCH_COLOR["upper-tent"]
              : BRANCH_COLOR["lower-tent"],
        roughness: 0.78,
      })
    );
    mesh.name = `FFS_Anchor_${anchor.id}`;
    mesh.position.set(
      anchor.positionWorld[0],
      sampleFlowFestTerrainWorldY(
        terrain,
        anchor.positionWorld[0],
        anchor.positionWorld[2]
      ) + 1.55,
      anchor.positionWorld[2]
    );
    root.add(mesh);
  }

  return root;
}

/**
 * Build visible gameplay topology from measured above-ground returns.
 *
 * The output deliberately does not call these boxes trees or buildings. The
 * source proves that something rises above the DTM, and Austen's traces prove
 * where the two corridors pass through that surface mass. We classify every
 * one-metre sample in the active lidar footprint, conservatively dilate that
 * measured mask, then carve every approved person and vehicle corridor. The
 * dilation is explicit gameplay invention; registered clearings retain their
 * measured cells but are not filled by that invention. The occupied cells are
 * merged into one visible mesh and those exact arrays go to Rapier as one
 * trimesh.
 */
export function buildFlowFestLidarBarrierGeometry(
  contract: FlowFestRuntimeContract,
  terrain: ImportedTerrainDataV2,
  surfaceOffsetsCentimeters: Uint16Array
): FlowFestBarrierGeometry {
  const width = terrain.heightmap.width;
  const height = terrain.heightmap.height;
  if (surfaceOffsetsCentimeters.length !== width * height) {
    throw new Error("Flow Fest lidar surface dimensions do not match the DTM");
  }
  const proxy = contract.surfaceEvidenceProxy;
  const routes = allFlowFestSegments(contract);
  const occupancyMinX = Math.ceil(proxy.activeBoundsWorldMeters.minX);
  const occupancyMinZ = Math.ceil(proxy.activeBoundsWorldMeters.minZ);
  const occupancyMaxX = Math.floor(proxy.activeBoundsWorldMeters.maxX);
  const occupancyMaxZ = Math.floor(proxy.activeBoundsWorldMeters.maxZ);
  const occupancyWidth = occupancyMaxX - occupancyMinX + 1;
  const occupancyHeight = occupancyMaxZ - occupancyMinZ + 1;
  const measuredOccupancy = new Uint8Array(occupancyWidth * occupancyHeight);
  const occupancy = new Uint8Array(occupancyWidth * occupancyHeight);
  const measuredHeights = new Float32Array(occupancy.length);
  const corridorClearanceMeters = Math.max(
    ...routes
      .filter((route) => route.mode === "person")
      .map(
        (route) =>
          route.widthMeters / 2 +
          PLAYER_RADIUS_METERS +
          KINEMATIC_OFFSET_METERS +
          RASTER_MARGIN_METERS
      )
  );
  const vehicleCorridorClearanceMeters = Math.max(
    ...routes
      .filter((route) => route.mode === "vehicle")
      .map(
        (route) =>
          route.widthMeters / 2 +
          VEHICLE_HALF_WIDTH_METERS +
          RASTER_MARGIN_METERS
      )
  );
  const positions: number[] = [];
  const indices: number[] = [];
  let occupiedCellCount = 0;

  for (let localRow = 0; localRow < occupancyHeight; localRow += 1) {
    const z = occupancyMinZ + localRow;
    const sourceRow = Math.round(z - terrain.worldBounds.minZ);
    for (let localColumn = 0; localColumn < occupancyWidth; localColumn += 1) {
      const x = occupancyMinX + localColumn;
      const sourceColumn = Math.round(x - terrain.worldBounds.minX);
      const encoded =
        surfaceOffsetsCentimeters[sourceRow * width + sourceColumn];
      if (encoded == null || encoded === 65535) continue;
      const measuredHeight = encoded / 100;
      if (measuredHeight < proxy.thresholdMetersAboveDtm) continue;
      const index = localRow * occupancyWidth + localColumn;
      measuredOccupancy[index] = 1;
    }
  }

  const dilatedOccupancy = dilateManhattan(
    measuredOccupancy,
    occupancyWidth,
    occupancyHeight,
    CONSERVATIVE_DILATION_METERS
  );
  for (let localRow = 0; localRow < occupancyHeight; localRow += 1) {
    const z = occupancyMinZ + localRow;
    for (let localColumn = 0; localColumn < occupancyWidth; localColumn += 1) {
      const index = localRow * occupancyWidth + localColumn;
      if (dilatedOccupancy[index] !== 1) continue;
      const x = occupancyMinX + localColumn;
      if (routeCarvesCell(x, z, routes)) continue;
      if (
        measuredOccupancy[index] !== 1 &&
        contract.zones.some((zone) => pointInsideZone(x, z, zone))
      ) {
        continue;
      }
      occupancy[index] = 1;
      // Every cell begins with a measured >=4 m return or lies within the
      // declared conservative gameplay dilation around one. A uniform four
      // metre screen keeps that invention visible and collision-identical.
      measuredHeights[index] = proxy.thresholdMetersAboveDtm;
      occupiedCellCount += 1;
    }
  }

  for (let localRow = 0; localRow < occupancyHeight; localRow += 1) {
    for (let localColumn = 0; localColumn < occupancyWidth; localColumn += 1) {
      const index = localRow * occupancyWidth + localColumn;
      if (occupancy[index] !== 1) continue;
      appendBarrierCell(
        positions,
        indices,
        terrain,
        occupancy,
        occupancyWidth,
        occupancyHeight,
        localColumn,
        localRow,
        occupancyMinX + localColumn,
        occupancyMinZ + localRow,
        measuredHeights[index]!
      );
    }
  }

  const vertices = new Float32Array(positions);
  const triangleIndices = new Uint32Array(indices);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(vertices, 3));
  geometry.setIndex(new BufferAttribute(triangleIndices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: "#36533c",
      roughness: 1,
      transparent: true,
      opacity: 0.78,
      side: DoubleSide,
    })
  );
  mesh.name = "FFS_Barrier_LidarProxy_Merged";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return {
    mesh,
    vertices,
    indices: triangleIndices,
    occupancy,
    occupancyWidth,
    occupancyHeight,
    occupancyMinX,
    occupancyMinZ,
    occupiedCellCount,
    cellSizeMeters: BARRIER_CELL_SIZE_METERS,
    corridorClearanceMeters,
    vehicleCorridorClearanceMeters,
    vehicleHalfWidthMeters: VEHICLE_HALF_WIDTH_METERS,
    conservativeDilationMeters: CONSERVATIVE_DILATION_METERS,
  };
}

/**
 * Prove the intended topology against the exact visible/collider mesh.
 * Approved centerlines must stay open, and an eight-neighbour search with
 * diagonal corner cutting disabled must not find a route shorter than either
 * Austen-traced connector.
 */
export function auditFlowFestBarrierTopology(
  contract: FlowFestRuntimeContract,
  barriers: FlowFestBarrierGeometry
): FlowFestBarrierTopologyAudit {
  const segments = allFlowFestSegments(contract);
  const personSegments = segments.filter(
    (segment) => segment.mode === "person"
  );
  const vehicleSegments = segments.filter(
    (segment) => segment.mode === "vehicle"
  );
  const obstructedApprovedLegs: FlowFestBarrierTopologyAudit["obstructedApprovedLegs"] =
    [];
  let approvedPersonLegs = 0;
  for (const segment of personSegments) {
    for (let legIndex = 1; legIndex < segment.points.length; legIndex += 1) {
      approvedPersonLegs += 1;
      const start = segment.points[legIndex - 1]!;
      const end = segment.points[legIndex]!;
      if (
        approvedLegTouchesBarrier(
          start,
          end,
          barriers,
          PLAYER_RADIUS_METERS + KINEMATIC_OFFSET_METERS
        )
      ) {
        obstructedApprovedLegs.push({
          segmentId: segment.id,
          legIndex: legIndex - 1,
        });
      }
    }
  }
  const obstructedApprovedVehicleLegs: FlowFestBarrierTopologyAudit["obstructedApprovedVehicleLegs"] =
    [];
  let approvedVehicleLegs = 0;
  for (const segment of vehicleSegments) {
    for (let legIndex = 1; legIndex < segment.points.length; legIndex += 1) {
      approvedVehicleLegs += 1;
      const start = segment.points[legIndex - 1]!;
      const end = segment.points[legIndex]!;
      if (
        approvedLegTouchesBarrier(
          start,
          end,
          barriers,
          VEHICLE_HALF_WIDTH_METERS
        )
      ) {
        obstructedApprovedVehicleLegs.push({
          segmentId: segment.id,
          legIndex: legIndex - 1,
        });
      }
    }
  }

  const upper = contract.connectorTraces.upperClearingToMiddleEarth.vertices;
  const lower = contract.connectorTraces.middleEarthToLowerClearing.vertices;
  const connectors = {
    upperClearingToMiddleEarth: auditConnectorNavigation(upper, barriers),
    middleEarthToLowerClearing: auditConnectorNavigation(lower, barriers),
  };
  const zones = Object.fromEntries(
    contract.zones.map((zone) => {
      let sampledCells = 0;
      let openCells = 0;
      for (let row = 0; row < barriers.occupancyHeight; row += 1) {
        const z = barriers.occupancyMinZ + row;
        for (let column = 0; column < barriers.occupancyWidth; column += 1) {
          const x = barriers.occupancyMinX + column;
          if (!pointInsideZone(x, z, zone)) continue;
          sampledCells += 1;
          if (!pointTouchesOccupiedCell(x, z, barriers)) openCells += 1;
        }
      }
      const openFraction = sampledCells > 0 ? openCells / sampledCells : 0;
      const minimumRequiredOpenFraction =
        zone.shape === "surface-open-region" ? 0.95 : 0.5;
      return [
        zone.id,
        {
          sampledCells,
          openCells,
          openFraction,
          minimumRequiredOpenFraction,
          passed: openFraction >= minimumRequiredOpenFraction,
        },
      ];
    })
  );
  const [spawnX, , spawnZ] = contract.spawn.positionWorld;
  const spawnUnobstructed = !pointTouchesOccupiedCell(spawnX, spawnZ, barriers);
  const status =
    spawnUnobstructed &&
    obstructedApprovedLegs.length === 0 &&
    obstructedApprovedVehicleLegs.length === 0 &&
    connectors.upperClearingToMiddleEarth.connected &&
    connectors.upperClearingToMiddleEarth.withinApprovedCorridor &&
    connectors.middleEarthToLowerClearing.connected &&
    connectors.middleEarthToLowerClearing.withinApprovedCorridor &&
    Object.values(zones).every((zone) => zone.passed)
      ? "passed"
      : "failed";
  return {
    status,
    spawnUnobstructed,
    approvedPersonLegs,
    obstructedApprovedLegs,
    approvedVehicleLegs,
    obstructedApprovedVehicleLegs,
    connectors,
    zones,
  };
}

function pointInsideZone(
  x: number,
  z: number,
  zone: FlowFestRuntimeZone
): boolean {
  const dx = x - zone.center.x;
  const dz = z - zone.center.z;
  if (zone.shape === "circle") {
    return Math.hypot(dx, dz) <= (zone.radiusMeters ?? 0);
  }
  const radiusX = zone.searchRadiusXMeters ?? 0;
  const radiusZ = zone.searchRadiusZMeters ?? 0;
  if (radiusX <= 0 || radiusZ <= 0) return false;
  return (dx * dx) / (radiusX * radiusX) + (dz * dz) / (radiusZ * radiusZ) <= 1;
}

function appendBarrierCell(
  positions: number[],
  indices: number[],
  terrain: ImportedTerrainDataV2,
  occupancy: Uint8Array,
  occupancyWidth: number,
  occupancyHeight: number,
  column: number,
  row: number,
  centerX: number,
  centerZ: number,
  measuredHeight: number
): void {
  const half = BARRIER_CELL_SIZE_METERS / 2;
  const corners = [
    [centerX - half, centerZ - half],
    [centerX + half, centerZ - half],
    [centerX + half, centerZ + half],
    [centerX - half, centerZ + half],
  ] as const;
  const bases = corners.map(([x, z]) =>
    sampleFlowFestTerrainWorldY(terrain, x, z)
  );
  const tops = bases.map((base) => base + measuredHeight);
  appendQuad(
    positions,
    indices,
    [corners[0][0], tops[0]!, corners[0][1]],
    [corners[3][0], tops[3]!, corners[3][1]],
    [corners[2][0], tops[2]!, corners[2][1]],
    [corners[1][0], tops[1]!, corners[1][1]]
  );

  const neighbors = [
    { column, row: row - 1, a: 0, b: 1 },
    { column: column + 1, row, a: 1, b: 2 },
    { column, row: row + 1, a: 2, b: 3 },
    { column: column - 1, row, a: 3, b: 0 },
  ];
  for (const neighbor of neighbors) {
    const occupied =
      neighbor.column >= 0 &&
      neighbor.column < occupancyWidth &&
      neighbor.row >= 0 &&
      neighbor.row < occupancyHeight &&
      occupancy[neighbor.row * occupancyWidth + neighbor.column] === 1;
    if (occupied) continue;
    const a = neighbor.a;
    const b = neighbor.b;
    appendQuad(
      positions,
      indices,
      [corners[a]![0], bases[a]!, corners[a]![1]],
      [corners[b]![0], bases[b]!, corners[b]![1]],
      [corners[b]![0], tops[b]!, corners[b]![1]],
      [corners[a]![0], tops[a]!, corners[a]![1]]
    );
  }
}

function dilateManhattan(
  source: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  const distance = new Int16Array(source.length);
  distance.fill(-1);
  const queue = new Int32Array(source.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== 1) continue;
    distance[index] = 0;
    queue[tail++] = index;
  }
  while (head < tail) {
    const index = queue[head++]!;
    const nextDistance = distance[index]! + 1;
    if (nextDistance > radius) continue;
    const column = index % width;
    const row = Math.floor(index / width);
    const neighbors = [
      column > 0 ? index - 1 : -1,
      column + 1 < width ? index + 1 : -1,
      row > 0 ? index - width : -1,
      row + 1 < height ? index + width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || distance[neighbor] !== -1) continue;
      distance[neighbor] = nextDistance;
      queue[tail++] = neighbor;
    }
  }
  const result = new Uint8Array(source.length);
  for (let index = 0; index < distance.length; index += 1) {
    if (distance[index]! >= 0 && distance[index]! <= radius) result[index] = 1;
  }
  return result;
}

function appendQuad(
  positions: number[],
  indices: number[],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  d: readonly [number, number, number]
): void {
  const base = positions.length / 3;
  positions.push(...a, ...b, ...c, ...d);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function approvedLegTouchesBarrier(
  start: { x: number; z: number },
  end: { x: number; z: number },
  barriers: FlowFestBarrierGeometry,
  collisionRadiusMeters: number
): boolean {
  const distance = Math.hypot(end.x - start.x, end.z - start.z);
  const steps = Math.max(1, Math.ceil(distance / 0.25));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = start.x + (end.x - start.x) * t;
    const z = start.z + (end.z - start.z) * t;
    if (pointTouchesOccupiedCell(x, z, barriers, collisionRadiusMeters)) {
      return true;
    }
  }
  return false;
}

function pointTouchesOccupiedCell(
  x: number,
  z: number,
  barriers: FlowFestBarrierGeometry,
  collisionRadiusMeters = PLAYER_RADIUS_METERS + KINEMATIC_OFFSET_METERS
): boolean {
  const localX = x - barriers.occupancyMinX;
  const localZ = z - barriers.occupancyMinZ;
  const searchRadius = Math.ceil(collisionRadiusMeters + 1);
  const centerColumn = Math.round(localX);
  const centerRow = Math.round(localZ);
  for (
    let row = Math.max(0, centerRow - searchRadius);
    row <= Math.min(barriers.occupancyHeight - 1, centerRow + searchRadius);
    row += 1
  ) {
    for (
      let column = Math.max(0, centerColumn - searchRadius);
      column <=
      Math.min(barriers.occupancyWidth - 1, centerColumn + searchRadius);
      column += 1
    ) {
      if (barriers.occupancy[row * barriers.occupancyWidth + column] !== 1) {
        continue;
      }
      const centerX = barriers.occupancyMinX + column;
      const centerZ = barriers.occupancyMinZ + row;
      const dx = Math.max(0, Math.abs(x - centerX) - 0.5);
      const dz = Math.max(0, Math.abs(z - centerZ) - 0.5);
      if (Math.hypot(dx, dz) <= collisionRadiusMeters) {
        return true;
      }
    }
  }
  return false;
}

function auditConnectorNavigation(
  trace: FlowFestRuntimePoint[],
  barriers: FlowFestBarrierGeometry
): FlowFestConnectorNavigationAudit {
  const approvedDistanceMeters = polylineDistance(trace);
  const path = findShortestNavigablePath(trace[0]!, trace.at(-1)!, barriers);
  const inCorridorPath = findShortestNavigablePath(
    trace[0]!,
    trace.at(-1)!,
    barriers,
    (x, z) =>
      distanceToPolyline(x, z, trace) <= MAXIMUM_CONNECTOR_DEVIATION_METERS
  );
  const offCorridorChallengerGridDistanceMeters = findShortestOffCorridorPath(
    trace[0]!,
    trace.at(-1)!,
    trace,
    barriers
  );
  if (!path) {
    return {
      connected: false,
      approvedDistanceMeters,
      gridDistanceMeters: null,
      smoothedNavigableDistanceMeters: null,
      maximumDeviationFromApprovedMeters: null,
      maximumAllowedDeviationMeters: MAXIMUM_CONNECTOR_DEVIATION_METERS,
      withinApprovedCorridor: false,
      inCorridorGridDistanceMeters: inCorridorPath?.distanceMeters ?? null,
      offCorridorChallengerGridDistanceMeters,
      offCorridorChallengerIsShorter: false,
    };
  }
  const smoothed = stringPullNavigablePath(
    [
      { x: trace[0]!.x, z: trace[0]!.z },
      ...path.points.slice(1, -1),
      { x: trace.at(-1)!.x, z: trace.at(-1)!.z },
    ],
    barriers
  );
  const samples = samplePolyline(smoothed, 0.25);
  let maximumDeviationFromApprovedMeters = 0;
  for (const point of samples) {
    const distance = distanceToPolyline(point.x, point.z, trace);
    maximumDeviationFromApprovedMeters = Math.max(
      maximumDeviationFromApprovedMeters,
      distance
    );
  }
  const inCorridorGridDistanceMeters = inCorridorPath?.distanceMeters ?? null;
  const offCorridorChallengerIsShorter =
    offCorridorChallengerGridDistanceMeters !== null &&
    inCorridorGridDistanceMeters !== null &&
    offCorridorChallengerGridDistanceMeters + 1e-6 <
      inCorridorGridDistanceMeters;
  return {
    connected: true,
    approvedDistanceMeters,
    gridDistanceMeters: path.distanceMeters,
    smoothedNavigableDistanceMeters: polylineDistance(smoothed),
    maximumDeviationFromApprovedMeters,
    maximumAllowedDeviationMeters: MAXIMUM_CONNECTOR_DEVIATION_METERS,
    withinApprovedCorridor:
      maximumDeviationFromApprovedMeters <=
        MAXIMUM_CONNECTOR_DEVIATION_METERS && !offCorridorChallengerIsShorter,
    inCorridorGridDistanceMeters,
    offCorridorChallengerGridDistanceMeters,
    offCorridorChallengerIsShorter,
  };
}

function distanceToPolyline(
  x: number,
  z: number,
  trace: Array<{ x: number; z: number }>
): number {
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < trace.length; index += 1) {
    const start = trace[index - 1]!;
    const end = trace[index]!;
    distance = Math.min(
      distance,
      distanceToSegment(x, z, start.x, start.z, end.x, end.z)
    );
  }
  return distance;
}

function stringPullNavigablePath(
  points: Array<{ x: number; z: number }>,
  barriers: FlowFestBarrierGeometry
): Array<{ x: number; z: number }> {
  if (points.length <= 2) return points;
  const result = [points[0]!];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = anchor + 1;
    for (
      let candidate = points.length - 1;
      candidate > anchor + 1;
      candidate -= 1
    ) {
      if (
        segmentIsCollisionClear(points[anchor]!, points[candidate]!, barriers)
      ) {
        next = candidate;
        break;
      }
    }
    result.push(points[next]!);
    anchor = next;
  }
  return result;
}

function segmentIsCollisionClear(
  start: { x: number; z: number },
  end: { x: number; z: number },
  barriers: FlowFestBarrierGeometry
): boolean {
  const distance = Math.hypot(end.x - start.x, end.z - start.z);
  const steps = Math.max(1, Math.ceil(distance / 0.05));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    if (
      pointTouchesOccupiedCell(
        start.x + (end.x - start.x) * t,
        start.z + (end.z - start.z) * t,
        barriers
      )
    ) {
      return false;
    }
  }
  return true;
}

function samplePolyline(
  points: Array<{ x: number; z: number }>,
  spacing: number
): Array<{ x: number; z: number }> {
  const samples: Array<{ x: number; z: number }> = [];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let step = index === 1 ? 0 : 1; step <= steps; step += 1) {
      const t = step / steps;
      samples.push({
        x: start.x + (end.x - start.x) * t,
        z: start.z + (end.z - start.z) * t,
      });
    }
  }
  return samples;
}

function findShortestNavigablePath(
  start: FlowFestRuntimePoint,
  end: FlowFestRuntimePoint,
  barriers: FlowFestBarrierGeometry,
  isAllowed: (x: number, z: number) => boolean = () => true
): { distanceMeters: number; points: Array<{ x: number; z: number }> } | null {
  const width = barriers.occupancyWidth;
  const height = barriers.occupancyHeight;
  const nodeCount = width * height;
  const startColumn = Math.round(start.x - barriers.occupancyMinX);
  const startRow = Math.round(start.z - barriers.occupancyMinZ);
  const endColumn = Math.round(end.x - barriers.occupancyMinX);
  const endRow = Math.round(end.z - barriers.occupancyMinZ);
  const canEnter = (column: number, row: number) =>
    isNavigable(column, row, barriers) &&
    isAllowed(barriers.occupancyMinX + column, barriers.occupancyMinZ + row);
  if (!canEnter(startColumn, startRow) || !canEnter(endColumn, endRow)) {
    return null;
  }
  const startIndex = startRow * width + startColumn;
  const endIndex = endRow * width + endColumn;
  const distances = new Float64Array(nodeCount);
  distances.fill(Number.POSITIVE_INFINITY);
  distances[startIndex] = 0;
  const parents = new Int32Array(nodeCount);
  parents.fill(-1);
  const closed = new Uint8Array(nodeCount);
  const heap = new NavigationMinHeap();
  heap.push(startIndex, 0);
  const steps = [
    [-1, 0, 1],
    [1, 0, 1],
    [0, -1, 1],
    [0, 1, 1],
    [-1, -1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [1, 1, Math.SQRT2],
  ] as const;

  while (heap.length > 0) {
    const current = heap.pop()!;
    if (closed[current.index] === 1) continue;
    if (current.index === endIndex) break;
    closed[current.index] = 1;
    const column = current.index % width;
    const row = Math.floor(current.index / width);
    for (const [dx, dz, cost] of steps) {
      const nextColumn = column + dx;
      const nextRow = row + dz;
      if (!canEnter(nextColumn, nextRow)) continue;
      if (
        dx !== 0 &&
        dz !== 0 &&
        (!canEnter(column + dx, row) || !canEnter(column, row + dz))
      ) {
        continue;
      }
      const nextIndex = nextRow * width + nextColumn;
      const nextDistance = distances[current.index]! + cost;
      if (nextDistance + 1e-9 >= distances[nextIndex]!) continue;
      distances[nextIndex] = nextDistance;
      parents[nextIndex] = current.index;
      const heuristic = Math.hypot(endColumn - nextColumn, endRow - nextRow);
      heap.push(nextIndex, nextDistance + heuristic);
    }
  }

  if (!Number.isFinite(distances[endIndex])) return null;
  const points: Array<{ x: number; z: number }> = [];
  for (let index = endIndex; index >= 0; index = parents[index]!) {
    const column = index % width;
    const row = Math.floor(index / width);
    points.push({
      x: barriers.occupancyMinX + column,
      z: barriers.occupancyMinZ + row,
    });
    if (index === startIndex) break;
  }
  points.reverse();
  return { distanceMeters: distances[endIndex]!, points };
}

function findShortestOffCorridorPath(
  start: FlowFestRuntimePoint,
  end: FlowFestRuntimePoint,
  trace: FlowFestRuntimePoint[],
  barriers: FlowFestBarrierGeometry
): number | null {
  const width = barriers.occupancyWidth;
  const height = barriers.occupancyHeight;
  const startColumn = Math.round(start.x - barriers.occupancyMinX);
  const startRow = Math.round(start.z - barriers.occupancyMinZ);
  const endColumn = Math.round(end.x - barriers.occupancyMinX);
  const endRow = Math.round(end.z - barriers.occupancyMinZ);
  if (
    !isNavigable(startColumn, startRow, barriers) ||
    !isNavigable(endColumn, endRow, barriers)
  ) {
    return null;
  }
  const startCell = startRow * width + startColumn;
  const endCell = endRow * width + endColumn;
  const stateCount = width * height * 2;
  const distances = new Float64Array(stateCount);
  distances.fill(Number.POSITIVE_INFINITY);
  const startState = startCell * 2;
  distances[startState] = 0;
  const closed = new Uint8Array(stateCount);
  const heap = new NavigationMinHeap();
  heap.push(startState, 0);
  const steps = [
    [-1, 0, 1],
    [1, 0, 1],
    [0, -1, 1],
    [0, 1, 1],
    [-1, -1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [1, 1, Math.SQRT2],
  ] as const;
  while (heap.length > 0) {
    const current = heap.pop()!;
    if (closed[current.index] === 1) continue;
    closed[current.index] = 1;
    const leftCorridor = current.index % 2 === 1;
    const cell = Math.floor(current.index / 2);
    if (cell === endCell && leftCorridor) return distances[current.index]!;
    const column = cell % width;
    const row = Math.floor(cell / width);
    for (const [dx, dz, cost] of steps) {
      const nextColumn = column + dx;
      const nextRow = row + dz;
      if (!isNavigable(nextColumn, nextRow, barriers)) continue;
      if (
        dx !== 0 &&
        dz !== 0 &&
        (!isNavigable(column + dx, row, barriers) ||
          !isNavigable(column, row + dz, barriers))
      ) {
        continue;
      }
      const nextCell = nextRow * width + nextColumn;
      const nextLeftCorridor =
        leftCorridor ||
        distanceToPolyline(
          barriers.occupancyMinX + nextColumn,
          barriers.occupancyMinZ + nextRow,
          trace
        ) > MAXIMUM_CONNECTOR_DEVIATION_METERS;
      const nextState = nextCell * 2 + (nextLeftCorridor ? 1 : 0);
      const nextDistance = distances[current.index]! + cost;
      if (nextDistance + 1e-9 >= distances[nextState]!) continue;
      distances[nextState] = nextDistance;
      const heuristic = Math.hypot(endColumn - nextColumn, endRow - nextRow);
      heap.push(nextState, nextDistance + heuristic);
    }
  }
  return null;
}

function isNavigable(
  column: number,
  row: number,
  barriers: FlowFestBarrierGeometry
): boolean {
  return (
    column >= 0 &&
    column < barriers.occupancyWidth &&
    row >= 0 &&
    row < barriers.occupancyHeight &&
    barriers.occupancy[row * barriers.occupancyWidth + column] === 0
  );
}

function polylineDistance(points: Array<{ x: number; z: number }>): number {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    distance += Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.z - points[index - 1]!.z
    );
  }
  return distance;
}

class NavigationMinHeap {
  readonly entries: Array<{ index: number; score: number }> = [];

  get length(): number {
    return this.entries.length;
  }

  push(index: number, score: number): void {
    this.entries.push({ index, score });
    let cursor = this.entries.length - 1;
    while (cursor > 0) {
      const parent = Math.floor((cursor - 1) / 2);
      if (this.entries[parent]!.score <= score) break;
      this.entries[cursor] = this.entries[parent]!;
      cursor = parent;
    }
    this.entries[cursor] = { index, score };
  }

  pop(): { index: number; score: number } | undefined {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (!first || !last || this.entries.length === 0) return first;
    let cursor = 0;
    while (true) {
      const left = cursor * 2 + 1;
      const right = left + 1;
      if (left >= this.entries.length) break;
      const child =
        right < this.entries.length &&
        this.entries[right]!.score < this.entries[left]!.score
          ? right
          : left;
      if (this.entries[child]!.score >= last.score) break;
      this.entries[cursor] = this.entries[child]!;
      cursor = child;
    }
    this.entries[cursor] = last;
    return first;
  }
}

export function buildFlowFestTerrainRibbonGeometry(
  terrain: ImportedTerrainDataV2,
  segment: FlowFestRuntimeSegment,
  elevationMeters = 0.12
): BufferGeometry {
  const samples: Array<{ x: number; z: number }> = [];
  const first = segment.points[0];
  if (first) samples.push({ x: first.x, z: first.z });
  for (
    let pointIndex = 1;
    pointIndex < segment.points.length;
    pointIndex += 1
  ) {
    const start = segment.points[pointIndex - 1]!;
    const end = segment.points[pointIndex]!;
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    const steps = Math.max(1, Math.ceil(distance / 2));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      samples.push({
        x: start.x + (end.x - start.x) * t,
        z: start.z + (end.z - start.z) * t,
      });
    }
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const halfWidth = segment.widthMeters / 2;
  for (let index = 0; index < samples.length; index += 1) {
    const point = samples[index]!;
    const previous = samples[Math.max(0, index - 1)]!;
    const next = samples[Math.min(samples.length - 1, index + 1)]!;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const distance = Math.hypot(dx, dz);
    const normalX = distance > 0 ? -dz / distance : 0;
    const normalZ = distance > 0 ? dx / distance : 0;
    const y =
      sampleFlowFestTerrainWorldY(terrain, point.x, point.z) + elevationMeters;
    positions.push(
      point.x + normalX * halfWidth,
      y,
      point.z + normalZ * halfWidth,
      point.x - normalX * halfWidth,
      y,
      point.z - normalZ * halfWidth
    );
    if (index > 0) {
      const previousLeft = (index - 1) * 2;
      const previousRight = previousLeft + 1;
      const left = index * 2;
      const right = left + 1;
      indices.push(
        previousLeft,
        left,
        previousRight,
        left,
        right,
        previousRight
      );
    }
  }
  // Fill authored corners with one terrain-conforming disc. A pure miter strip
  // self-intersects on the route's deliberate reversals (unload, gate return,
  // then parking), leaving dark triangular holes in the exact places the
  // review needs to read as continuous.
  for (const point of segment.points) {
    const base = positions.length / 3;
    const y =
      sampleFlowFestTerrainWorldY(terrain, point.x, point.z) +
      elevationMeters +
      0.005;
    const sides = 12;
    positions.push(point.x, y, point.z);
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      positions.push(
        point.x + Math.cos(angle) * halfWidth,
        y,
        point.z + Math.sin(angle) * halfWidth
      );
    }
    for (let side = 0; side < sides; side += 1) {
      indices.push(base, base + 1 + ((side + 1) % sides), base + 1 + side);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3)
  );
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();
  return geometry;
}

function routeCarvesCell(
  x: number,
  z: number,
  routes: FlowFestRuntimeSegment[]
): boolean {
  for (const route of routes) {
    const clearance =
      route.widthMeters / 2 +
      (route.mode === "vehicle"
        ? VEHICLE_HALF_WIDTH_METERS
        : PLAYER_RADIUS_METERS + KINEMATIC_OFFSET_METERS) +
      RASTER_MARGIN_METERS;
    for (let index = 1; index < route.points.length; index += 1) {
      const start = route.points[index - 1]!;
      const end = route.points[index]!;
      if (
        distanceToSegment(x, z, start.x, start.z, end.x, end.z) <= clearance
      ) {
        return true;
      }
    }
  }
  return false;
}

function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return Math.hypot(px - ax, pz - az);
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSquared)
  );
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
