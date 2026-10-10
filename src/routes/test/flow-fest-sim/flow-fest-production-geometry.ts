import {
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  type Material,
  type Object3D as ThreeObject3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { childSeed, makeRng } from "#lib/shared/foundation/utils/seeded-rng.js";
import {
  FLOW_FEST_MASTER_SEED,
  type FlowFestProductionCollisionMesh,
  type FlowFestProductionCollisionSet,
} from "#lib/features/flow-fest-sim/domain/flow-fest-simulation-contract.js";
import { FLOW_FEST_FIRE_JAM_CONTRACT } from "#lib/features/flow-fest-sim/domain/flow-fest-fire-jam.js";
import {
  auditFlowFestLivingCommunity,
  type FlowFestFestivalCommunityLayout,
  type FlowFestFestivalPersonBehavior,
  type FlowFestFestivalPersonPlacement,
  type FlowFestFestivalPersonRole,
} from "#lib/features/flow-fest-sim/domain/flow-fest-living-fire-jam.js";
import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";
import {
  type FlowFestBranchId,
  type FlowFestRuntimeContract,
  type FlowFestRuntimePoint,
  type FlowFestRuntimeSegment,
  type FlowFestRuntimeZone,
} from "../flow-fest-graybox/flow-fest-runtime-contract";
import { sampleFlowFestTerrainWorldY } from "../flow-fest-graybox/flow-fest-terrain-host";
import { type FlowFestCanopyEvidence } from "./flow-fest-site-fidelity";
import {
  allFlowFestCampPlanLines,
  createFlowFestCampPlan,
  flowFestCampPlanLineToRuntimeSegment,
  FLOW_FEST_LOWER_ENTRANCE_APPROACH_ID,
  FLOW_FEST_PUBLIC_ROAD_SOURCE,
  type FlowFestCampPlan,
  type FlowFestCampPlanLandmark,
  type FlowFestCampPlanLine,
} from "./flow-fest-camp-plan";
import {
  buildFlowFestGroundFamilyMask,
  type FlowFestGroundFamilyMask,
} from "./flow-fest-ground-surface";
import { deriveFlowFestLowerCampOccupancy } from "./flow-fest-lower-camp-occupancy";
import {
  FLOW_FEST_PARKED_CAR_MODELS,
  flowFestParkedCarModel,
  settleFlowFestParkedCarOnGround,
  type FlowFestParkedCarPlacement,
} from "./flow-fest-parked-cars";
import { FLOW_FEST_SITE_TREE_LAYOUT } from "./flow-fest-site-tree-layout";
import {
  deriveFlowFestForestEcology,
  type FlowFestForestEcologyLayout,
  type FlowFestForestTreePlacement,
} from "./flow-fest-forest-ecology";
import { flowFestTreeFamilyPlan } from "./flow-fest-tree-species";
import { buildFlowFestEntranceScene } from "./flow-fest-entrance-geometry";
import { pointInsideFlowFestEntranceFixtureClearance } from "./flow-fest-entrance-reference";

export interface FlowFestProductionDressing {
  root: Group;
  /**
   * The plan this dressing was built from. Exposed so downstream layers (the
   * population routing graph) consume the same registered geometry instead of
   * re-deriving coordinates of their own.
   */
  campPlan: FlowFestCampPlan;
  forestEcology: FlowFestForestEcologyLayout;
  /**
   * The lower-loop car park. Bodies are GLB assets that load asynchronously
   * in `FlowFestParkedCars.svelte`; only their walk-up colliders live in
   * `collision.staticMesh`.
   */
  parkedCars: FlowFestParkedCarPlacement[];
  groundSurface: FlowFestGroundFamilyMask;
  festivalCommunity: FlowFestFestivalCommunityLayout;
  festivalCommunityAudit: ReturnType<typeof auditFlowFestLivingCommunity>;
  collision: FlowFestProductionCollisionSet;
  counts: {
    interpretedTrees: number;
    tents: number;
    vehicles: number;
    festivalPeople: number;
    routeLanterns: number;
    sitePathSurfaces: number;
    wayfindingMarkers: number;
    entranceLandmarks: number;
  };
  orientationAudit: {
    publicRoadSurfaceCount: number;
    internalDriveSurfaceCount: number;
    lowerCampgroundLoopSurfaceCount: number;
    tracedConnectorSurfaceCount: number;
    landmarkMarkerCount: number;
    officialRoadFeatureObjectId: number;
    entranceAnchorErrorMeters: number;
    streetViewReferenceViewCount: number;
    roadMarkingSurfaceCount: number;
  };
  spatialAudit: {
    campRouteViolations: number;
    minimumTentCenterDistance: number;
    minimumVehicleCenterDistance: number;
    minimumTentVehicleDistance: number;
    lowerTentPerimeterCount: number;
    lowerTentMinimumLoopDistance: number;
    lowerTentMaximumLoopDistance: number;
    lowerCenterVehicleCount: number;
    lowerCenterTentCount: number;
    lowerCenterCanopyCount: number;
    lowerInnerRoadsideTentCount: number;
    lowerOuterTreeLineTentCount: number;
    lowerCenterVehicleOutsideLoopCount: number;
    lowerCenterVehicleAisleIntrusionCount: number;
    lowerCenterVehicleWalkLaneIntrusionCount: number;
    lowerCenterGearWalkLaneIntrusionCount: number;
    lowerCenterVehicleEmptyStallCount: number;
    lowerInnerRoadsideTentOutsideLoopCount: number;
    lowerOuterTreeLineTentInsideLoopCount: number;
    minimumCanopyPeakDistance: number;
    minimumSiteTreeDistance: number;
    tracedConnectorSurfaceCount: number;
    forestTreeRouteIntrusions: number;
    forestGrassRouteIntrusions: number;
    forestGroundLifeRouteIntrusions: number;
  };
  setCampEstablished(visible: boolean): void;
  setCampDressingVisible(visible: boolean): void;
  setFestivalActive(visible: boolean): void;
  dispose(): void;
}

interface Placement {
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  colorIndex: number;
}

const TENT_COLORS = ["#e56c4c", "#e6b859", "#6fa68c", "#6f7fc2", "#bd77a0"];
/** Pop-up canopy tops: the white, navy, tan and forest green a big-box shop sells. */
const CANOPY_COLORS = ["#e8e6df", "#2f3f66", "#c9b68a", "#3f6b4b"];
/** Open ground around the lower gate check-in where no stall may sit. */
const LOWER_GATE_CHECK_IN_APRON_RADIUS_METERS = 10;

export function buildFlowFestProductionDressing(
  contract: FlowFestRuntimeContract,
  terrain: ImportedTerrainDataV2,
  canopy: FlowFestCanopyEvidence,
  selectedBranch: FlowFestBranchId
): FlowFestProductionDressing {
  const root = new Group();
  root.name = "FFS_ProductionRehearsal";
  const staticCollisionParts: BufferGeometry[] = [];
  const campEstablishedCollisionParts: BufferGeometry[] = [];
  const festivalActiveCollisionParts: BufferGeometry[] = [];

  const campPlan = createFlowFestCampPlan(contract, selectedBranch);
  const siteSurfaces = buildMeasuredSiteSurfaces(campPlan, terrain);
  root.add(siteSurfaces.group);

  const entrance = buildFlowFestEntranceScene(terrain, campPlan);
  root.add(entrance.group);
  staticCollisionParts.push(...entrance.collisionParts);

  const wayfinding = buildFlowFestWayfinding(campPlan, terrain);
  root.add(wayfinding.group);

  const sourceForestEcology = deriveFlowFestForestEcology(
    contract,
    terrain,
    canopy,
    campPlan,
    { speciesPlan: FLOW_FEST_SITE_TREE_LAYOUT }
  );
  const entranceClearedTrees = sourceForestEcology.trees.filter(
    (tree) =>
      !pointInsideFlowFestEntranceFixtureClearance(tree, tree.crownRadiusMeters)
  );
  // The ecology lists measured-canopy trees first and infill trees after them,
  // so the audit split survives the entrance clearing without a per-tree flag.
  const entranceClearedMeasuredTrees = sourceForestEcology.trees
    .slice(0, sourceForestEcology.audit.measuredCanopyPlacements)
    .filter(
      (tree) =>
        !pointInsideFlowFestEntranceFixtureClearance(
          tree,
          tree.crownRadiusMeters
        )
    ).length;
  const entranceClearedGrass = sourceForestEcology.grass.filter(
    (grass) => !pointInsideFlowFestEntranceFixtureClearance(grass, 0.6)
  );
  const entranceClearedGroundLife = sourceForestEcology.groundLife.filter(
    (plant) => !pointInsideFlowFestEntranceFixtureClearance(plant, 1)
  );
  const forestEcology = {
    ...sourceForestEcology,
    trees: entranceClearedTrees,
    grass: entranceClearedGrass,
    groundLife: entranceClearedGroundLife,
    audit: {
      ...sourceForestEcology.audit,
      sourceTreeFamilies: new Set(
        entranceClearedTrees.map((tree) => tree.familyId)
      ).size,
      sourceTreeSpecies: new Set(
        entranceClearedTrees.map(
          (tree) => flowFestTreeFamilyPlan(tree.familyId)?.speciesId ?? "unknown"
        )
      ).size,
      measuredCanopyPlacements: entranceClearedMeasuredTrees,
      infillTreePlacements:
        entranceClearedTrees.length - entranceClearedMeasuredTrees,
      grassPlacements: entranceClearedGrass.length,
      groundLifePlacements: entranceClearedGroundLife.length,
    },
  };
  const trees = buildInterpretedTrees(
    forestEcology.trees,
    staticCollisionParts
  );
  root.add(trees.group);

  const camp = buildCampClusters(
    contract,
    terrain,
    campPlan,
    selectedBranch,
    staticCollisionParts,
    campEstablishedCollisionParts
  );
  root.add(camp.group);

  const festival = buildFestivalHeart(
    contract,
    terrain,
    festivalActiveCollisionParts
  );
  root.add(festival.group);

  const lanterns = buildRouteLanterns(contract, terrain, selectedBranch);
  root.add(lanterns.group);

  return {
    root,
    campPlan,
    forestEcology,
    parkedCars: camp.parkedCars,
    groundSurface: buildFlowFestGroundFamilyMask(
      campPlan,
      forestEcology,
      terrain.worldBounds
    ),
    festivalCommunity: festival.community,
    festivalCommunityAudit: auditFlowFestLivingCommunity(
      festival.community,
      FLOW_FEST_FIRE_JAM_CONTRACT.performanceFloorRadiusMeters
    ),
    collision: {
      staticMesh: mergeProductionCollisionParts(
        staticCollisionParts,
        trees.count +
          camp.staticTents +
          camp.vehicles +
          camp.canopies +
          entrance.collisionVisibleObjectCount
      ),
      campEstablishedMesh: mergeProductionCollisionParts(
        campEstablishedCollisionParts,
        1
      ),
      festivalActiveMesh: mergeProductionCollisionParts(
        festivalActiveCollisionParts,
        festival.fixtures
      ),
      visibleSolidCounts: {
        treeTrunks: trees.count,
        tents: camp.tents,
        vehicles: camp.vehicles,
        entranceFixtures: entrance.collisionVisibleObjectCount,
        festivalFixtures: festival.fixtures,
      },
    },
    counts: {
      interpretedTrees: trees.count,
      tents: camp.tents,
      vehicles: camp.vehicles,
      festivalPeople: festival.people,
      routeLanterns: lanterns.count,
      sitePathSurfaces: siteSurfaces.count,
      wayfindingMarkers: wayfinding.count,
      entranceLandmarks: Object.values(entrance.counts).reduce(
        (sum, count) => sum + count,
        0
      ),
    },
    orientationAudit: {
      publicRoadSurfaceCount: siteSurfaces.publicRoadCount,
      internalDriveSurfaceCount: siteSurfaces.internalDriveCount,
      lowerCampgroundLoopSurfaceCount: siteSurfaces.lowerLoopCount,
      tracedConnectorSurfaceCount: siteSurfaces.tracedConnectorCount,
      landmarkMarkerCount: wayfinding.count,
      officialRoadFeatureObjectId: FLOW_FEST_PUBLIC_ROAD_SOURCE.featureObjectId,
      entranceAnchorErrorMeters: entrance.audit.entranceAnchorErrorMeters,
      streetViewReferenceViewCount: entrance.audit.referenceViewCount,
      roadMarkingSurfaceCount: entrance.counts.roadMarkingRibbons,
    },
    spatialAudit: {
      ...camp.spatialAudit,
      // The ecology lists measured LiDAR canopy peaks first and jittered-grid
      // infill after them, and the two populations are held to different
      // spacings: the peak detector rejects a second peak within 7.5 m, the
      // infill pass rejects a candidate within 4.5 m of any tree already
      // placed. Auditing them as one pool reported the infill floor under a
      // name that promises the peak floor, so each is measured on its own.
      minimumCanopyPeakDistance: minimumPairDistance(
        trees.placements.slice(0, forestEcology.audit.measuredCanopyPlacements)
      ),
      minimumSiteTreeDistance: minimumPairDistance(trees.placements),
      tracedConnectorSurfaceCount: siteSurfaces.tracedConnectorCount,
      forestTreeRouteIntrusions: forestEcology.audit.treeRouteIntrusions,
      forestGrassRouteIntrusions: forestEcology.audit.grassRouteIntrusions,
      forestGroundLifeRouteIntrusions:
        forestEcology.audit.groundLifeRouteIntrusions,
    },
    setCampEstablished: camp.setEstablished,
    setCampDressingVisible: camp.setDressingVisible,
    setFestivalActive: (visible) => {
      festival.group.visible = visible;
    },
    dispose: () => disposeObjectTree(root),
  };
}

function buildInterpretedTrees(
  placements: FlowFestForestTreePlacement[],
  collisionParts: BufferGeometry[]
): { group: Group; count: number; placements: FlowFestForestTreePlacement[] } {
  const group = new Group();
  group.name = "FFS_LidarDerivedCanopyPeaks";
  const trunkGeometry = new CylinderGeometry(0.78, 1, 1, 7);
  trunkGeometry.translate(0, 0.5, 0);
  const trunk = createInstancedMesh(
    trunkGeometry,
    new MeshStandardMaterial({ color: "#4a3325", roughness: 1 }),
    placements,
    (placement, object) => {
      object.position.set(placement.x, placement.y, placement.z);
      object.rotation.y = placement.rotation;
      object.scale.set(
        placement.trunkRadiusMeters,
        placement.trunkHeightMeters,
        placement.trunkRadiusMeters
      );
    }
  );
  appendPlacementCollisionParts(
    collisionParts,
    trunkGeometry,
    placements,
    (placement, object) => {
      object.position.set(placement.x, placement.y, placement.z);
      object.rotation.y = placement.rotation;
      object.scale.set(
        placement.trunkRadiusMeters,
        placement.trunkHeightMeters,
        placement.trunkRadiusMeters
      );
    }
  );
  // Keep the registered collider node name stable. Its visual crown owner is
  // now FlowFestForestEcology, but this measured-center trunk still anchors
  // both camera avoidance and Rapier collision.
  trunk.name = "FFS_TreeTrunks_Interpreted";
  trunk.visible = false;
  trunk.castShadow = false;
  trunk.receiveShadow = false;
  group.add(trunk);
  return { group, count: placements.length, placements };
}

function buildMeasuredSiteSurfaces(
  plan: FlowFestCampPlan,
  terrain: ImportedTerrainDataV2
): {
  group: Group;
  count: number;
  publicRoadCount: number;
  internalDriveCount: number;
  lowerLoopCount: number;
  tracedConnectorCount: number;
} {
  const group = new Group();
  group.name = "FFS_CanonicalSitePaths_PlanAligned";

  for (const road of plan.publicRoads) {
    const shoulder = createPlanRibbon(
      terrain,
      { ...road, widthMeters: road.widthMeters + 2.4 },
      "#96866c",
      0.052
    );
    shoulder.name = `FFS_PublicRoadShoulder_${road.id}_ODOT`;
    shoulder.userData.evidence = road.evidence;
    const asphalt = createPlanRibbon(terrain, road, "#2e3330", 0.072);
    asphalt.name = `FFS_PublicRoad_${road.id}_ODOT`;
    asphalt.userData.evidence = road.evidence;
    asphalt.userData.featureObjectId =
      FLOW_FEST_PUBLIC_ROAD_SOURCE.featureObjectId;
    group.add(shoulder, asphalt);
  }

  for (const drive of plan.internalDrives) {
    // The entrance scene renders this interpreted centerline as one continuous,
    // variable-width gravel drive. A second generic ribbon would overlap it.
    if (drive.id === FLOW_FEST_LOWER_ENTRANCE_APPROACH_ID) continue;
    const mesh = createPlanRibbon(terrain, drive, "#aa9676", 0.076);
    mesh.name = `FFS_PrivateDrive_${drive.id}_OrthophotoInterpreted`;
    mesh.userData.evidence = drive.evidence;
    group.add(mesh);
  }

  for (const connector of plan.footConnectors) {
    const mesh = createPlanRibbon(terrain, connector, "#b98958", 0.082);
    mesh.name = `FFS_FootConnector_${connector.id}_AustenTraced`;
    mesh.userData.evidence = connector.evidence;
    group.add(mesh);
  }

  return {
    group,
    count:
      plan.publicRoads.length +
      plan.internalDrives.length +
      plan.footConnectors.length,
    publicRoadCount: plan.publicRoads.length,
    internalDriveCount: plan.internalDrives.length,
    lowerLoopCount: plan.internalDrives.filter(
      (drive) => drive.id === "lower-campground-loop"
    ).length,
    tracedConnectorCount: plan.footConnectors.length,
  };
}

function createPlanRibbon(
  terrain: ImportedTerrainDataV2,
  line: FlowFestCampPlanLine,
  color: string,
  elevationMeters: number
): Mesh {
  const segment: FlowFestRuntimeSegment = {
    id: line.id,
    mode: line.kind === "foot-connector" ? "person" : "vehicle",
    widthMeters: line.widthMeters,
    lengthMeters: lineLength(line.points),
    sourceClasses: [line.evidence],
    pathClass: line.kind,
    points: line.points.map((point) => ({
      ...point,
      sourceTerrainY: 0,
      reviewTerrainY: 0,
    })),
  };
  const mesh = new Mesh(
    buildTerrainConformingPlanRibbonGeometry(terrain, segment, elevationMeters),
    new MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  mesh.receiveShadow = true;
  return mesh;
}

/** Centreline sample step for every generated plan ribbon. */
const RIBBON_SAMPLE_SPACING_METERS = 0.75;

function buildTerrainConformingPlanRibbonGeometry(
  terrain: ImportedTerrainDataV2,
  segment: FlowFestRuntimeSegment,
  elevationMeters: number
): BufferGeometry {
  const sourcePoints = segment.points;
  const closed =
    sourcePoints.length > 2 &&
    Math.hypot(
      sourcePoints[0]!.x - sourcePoints.at(-1)!.x,
      sourcePoints[0]!.z - sourcePoints.at(-1)!.z
    ) < 0.15;
  const pathPoints = closed ? sourcePoints.slice(0, -1) : sourcePoints;
  const samples: Array<{ x: number; z: number }> = [];
  const segmentCount = closed ? pathPoints.length : pathPoints.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const start = pathPoints[index]!;
    const end = pathPoints[(index + 1) % pathPoints.length]!;
    const steps = Math.max(
      1,
      Math.ceil(
        Math.hypot(end.x - start.x, end.z - start.z) /
          RIBBON_SAMPLE_SPACING_METERS
      )
    );
    for (let step = 0; step < steps; step += 1) {
      const ratio = step / steps;
      samples.push({
        x: start.x + (end.x - start.x) * ratio,
        z: start.z + (end.z - start.z) * ratio,
      });
    }
  }
  if (!closed && pathPoints.length > 0) {
    const last = pathPoints.at(-1)!;
    const previous = samples.at(-1);
    // A traced polyline can end on a segment far shorter than one sample step,
    // and the terminus then lands a couple of centimetres past the last sample.
    // Two rows that close together are still swept by the full ribbon width, so
    // the half-width offsets rotate further than the centreline advances and the
    // final quads fold back on themselves with downward normals. Snap the last
    // sample onto the terminus instead of adding a sliver row: the ribbon still
    // ends exactly on the traced endpoint.
    if (
      previous &&
      Math.hypot(previous.x - last.x, previous.z - last.z) <
        RIBBON_SAMPLE_SPACING_METERS / 2
    ) {
      previous.x = last.x;
      previous.z = last.z;
    } else {
      samples.push({ x: last.x, z: last.z });
    }
  }

  const columns = 12;
  const positions: number[] = [];
  const indices: number[] = [];
  samples.forEach((sample, index) => {
    const previous = closed
      ? samples[(index - 1 + samples.length) % samples.length]!
      : samples[Math.max(0, index - 1)]!;
    const next = closed
      ? samples[(index + 1) % samples.length]!
      : samples[Math.min(samples.length - 1, index + 1)]!;
    const directionX = next.x - previous.x;
    const directionZ = next.z - previous.z;
    const directionLength = Math.hypot(directionX, directionZ) || 1;
    const normalX = -directionZ / directionLength;
    const normalZ = directionX / directionLength;
    for (let column = 0; column <= columns; column += 1) {
      const across =
        -segment.widthMeters / 2 + (segment.widthMeters * column) / columns;
      const x = sample.x + normalX * across;
      const z = sample.z + normalZ * across;
      positions.push(
        x,
        sampleFlowFestTerrainWorldY(terrain, x, z) + elevationMeters,
        z
      );
    }
  });

  const rowLinks = closed ? samples.length : Math.max(0, samples.length - 1);
  for (let index = 0; index < rowLinks; index += 1) {
    const nextIndex = (index + 1) % samples.length;
    const previousRow = index * (columns + 1);
    const row = nextIndex * (columns + 1);
    for (let column = 0; column < columns; column += 1) {
      const previousLeft = previousRow + column;
      const previousRight = previousLeft + 1;
      const left = row + column;
      const right = left + 1;
      indices.push(
        previousLeft,
        previousRight,
        left,
        left,
        previousRight,
        right
      );
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

function lineLength(points: Array<{ x: number; z: number }>): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.z - points[index - 1]!.z
    );
  }
  return length;
}

function buildFlowFestWayfinding(
  plan: FlowFestCampPlan,
  terrain: ImportedTerrainDataV2
): { group: Group; count: number } {
  const group = new Group();
  group.name = "FFS_PlanLandmarkWayfinding";
  const landmarks = plan.landmarks.filter(
    (landmark) =>
      landmark.id !== "camp-road-entrance" &&
      ["entrance", "check-in", "parking-gate", "parking"].includes(
        landmark.kind
      )
  );
  const postPlacements = landmarks.map((landmark, index) => ({
    landmark,
    x: landmark.position.x + Math.cos(index * 2.399963229728653) * 3.2,
    y:
      sampleFlowFestTerrainWorldY(
        terrain,
        landmark.position.x,
        landmark.position.z
      ) + 0.02,
    z: landmark.position.z + Math.sin(index * 2.399963229728653) * 3.2,
    rotation: (index % 2) * (Math.PI / 2),
    scale: 1,
    colorIndex: index,
    color: wayfindingColor(landmark),
  }));

  const postGeometry = new CylinderGeometry(0.055, 0.075, 1.85, 8);
  postGeometry.translate(0, 0.925, 0);
  const posts = createInstancedMesh(
    postGeometry,
    new MeshStandardMaterial({ color: "#382b20", roughness: 0.94 }),
    postPlacements,
    (placement, object) => {
      object.position.set(placement.x, placement.y, placement.z);
    }
  );
  posts.name = "FFS_WayfindingPosts_PlanLandmarks";

  const boardGeometry = new BoxGeometry(1.05, 0.32, 0.08);
  const boards = createInstancedMesh(
    boardGeometry,
    new MeshStandardMaterial({ color: "#6c8c72", roughness: 0.8 }),
    postPlacements,
    (placement, object) => {
      object.position.set(placement.x, placement.y + 1.56, placement.z);
      object.rotation.y = placement.rotation;
    },
    (placement) => new Color(placement.color)
  );
  boards.name = "FFS_WayfindingBoards_PlanLandmarks";
  boards.userData.landmarks = landmarks.map(({ id, label, evidence }) => ({
    id,
    label,
    evidence,
  }));

  const capGeometry = new CylinderGeometry(0.1, 0.1, 0.07, 10);
  const caps = createInstancedMesh(
    capGeometry,
    new MeshBasicMaterial({ color: "#f0b05f" }),
    postPlacements,
    (placement, object) => {
      object.position.set(placement.x, placement.y + 1.9, placement.z);
    },
    (placement) => new Color(placement.color)
  );
  caps.name = "FFS_WayfindingCaps_PlanLandmarks";
  group.add(posts, boards, caps);
  return { group, count: landmarks.length };
}

function wayfindingColor(landmark: FlowFestCampPlanLandmark): string {
  if (landmark.kind === "entrance") return "#edb35f";
  if (landmark.kind === "check-in") return "#ef845e";
  if (landmark.kind === "parking-gate" || landmark.kind === "parking") {
    return "#7ea5ce";
  }
  return "#86aa7d";
}

function buildCampClusters(
  contract: FlowFestRuntimeContract,
  terrain: ImportedTerrainDataV2,
  campPlan: FlowFestCampPlan,
  selectedBranch: FlowFestBranchId,
  staticCollisionParts: BufferGeometry[],
  campEstablishedCollisionParts: BufferGeometry[]
): {
  group: Group;
  tents: number;
  staticTents: number;
  vehicles: number;
  canopies: number;
  parkedCars: FlowFestParkedCarPlacement[];
  spatialAudit: Pick<
    FlowFestProductionDressing["spatialAudit"],
    | "campRouteViolations"
    | "minimumTentCenterDistance"
    | "minimumVehicleCenterDistance"
    | "minimumTentVehicleDistance"
    | "lowerTentPerimeterCount"
    | "lowerTentMinimumLoopDistance"
    | "lowerTentMaximumLoopDistance"
    | "lowerCenterVehicleCount"
    | "lowerCenterTentCount"
    | "lowerCenterCanopyCount"
    | "lowerInnerRoadsideTentCount"
    | "lowerOuterTreeLineTentCount"
    | "lowerCenterVehicleOutsideLoopCount"
    | "lowerCenterVehicleAisleIntrusionCount"
    | "lowerCenterVehicleWalkLaneIntrusionCount"
    | "lowerCenterGearWalkLaneIntrusionCount"
    | "lowerCenterVehicleEmptyStallCount"
    | "lowerInnerRoadsideTentOutsideLoopCount"
    | "lowerOuterTreeLineTentInsideLoopCount"
  >;
  setEstablished(visible: boolean): void;
  setDressingVisible(visible: boolean): void;
} {
  const group = new Group();
  group.name = "FFS_AuthoredFestivalCamps";
  const tentPlacements: Placement[] = [];
  const occupiedTentPlacements: Placement[] = [];
  const lowerInnerRoadsideTentPlacements: Placement[] = [];
  const lowerOuterTreeLineTentPlacements: Placement[] = [];
  const lowerCenterTentPlacements: Placement[] = [];
  const canopyPlacements: Placement[] = [];
  const vehiclePlacements: Array<
    Placement & Pick<FlowFestParkedCarPlacement, "modelId" | "paintIndex" | "pitch" | "roll">
  > = [];
  const routes = allFlowFestCampPlanLines(campPlan).map(
    flowFestCampPlanLineToRuntimeSegment
  );
  const lowerLoop = campPlan.internalDrives.find(
    (drive) => drive.id === "lower-campground-loop"
  );
  if (!lowerLoop) {
    throw new Error("The shared camp plan is missing the lower road loop");
  }
  let playerTentPlacement: Placement | null = null;
  const registerTent = (
    placement: Placement,
    branch: FlowFestBranchId,
    rng: () => number,
    playerCandidate: boolean
  ): Placement => {
    const tentPlacement: Placement = {
      ...placement,
      rotation: placement.rotation + Math.PI + (rng() - 0.5) * 0.4,
      scale: 0.86 + rng() * 0.26,
      colorIndex: Math.floor(rng() * TENT_COLORS.length),
    };
    occupiedTentPlacements.push(tentPlacement);
    if (
      playerCandidate &&
      branch === selectedBranch &&
      playerTentPlacement === null
    ) {
      playerTentPlacement = { ...tentPlacement, scale: 1.25 };
    } else {
      tentPlacements.push(tentPlacement);
    }
    return tentPlacement;
  };

  const lowerRng = makeRng(
    childSeed(FLOW_FEST_MASTER_SEED, "lower-campground-occupancy")
  );
  const lowerGateCamera = contract.reviewCameras.find(
    (camera) => camera.id === "lower-gate"
  );
  const lowerOccupancy = deriveFlowFestLowerCampOccupancy({
    rng: lowerRng,
    loop: lowerLoop,
    routes,
    // The check-in apron stays open: the gate crew stands there and arriving
    // cars queue through it before they pick a row.
    keepClear: lowerGateCamera
      ? [
          {
            x: lowerGateCamera.positionWorld[0],
            z: lowerGateCamera.positionWorld[2],
            radiusMeters: LOWER_GATE_CHECK_IN_APRON_RADIUS_METERS,
          },
        ]
      : [],
  });
  for (const [
    index,
    placement,
  ] of lowerOccupancy.outerTreeLineTents.entries()) {
    const groundedPlacement = groundTentPlacement(placement, terrain);
    lowerOuterTreeLineTentPlacements.push(
      registerTent(groundedPlacement, "lower-tent", lowerRng, index === 0)
    );
  }
  for (const placement of lowerOccupancy.innerRoadsideTents) {
    lowerInnerRoadsideTentPlacements.push(
      registerTent(
        groundTentPlacement(placement, terrain),
        "lower-tent",
        lowerRng,
        false
      )
    );
  }
  for (const [index, placement] of lowerOccupancy.centerTents.entries()) {
    lowerCenterTentPlacements.push(
      registerTent(
        groundTentPlacement(placement, terrain),
        "car-camp",
        lowerRng,
        index === 0
      )
    );
  }

  for (const placement of lowerOccupancy.centerCanopies) {
    canopyPlacements.push({
      ...groundTentPlacement(placement, terrain),
      rotation: placement.rotation + (lowerRng() - 0.5) * 0.3,
      colorIndex: Math.floor(lowerRng() * CANOPY_COLORS.length),
    });
  }

  // The GLB bodies are grounded at their own y=0. Each one settles on the
  // heightfield under its four wheels, so a car on a cross-slope rolls with
  // the field instead of hovering over its uphill tyres.
  vehiclePlacements.push(
    ...lowerOccupancy.centerVehicles.map((placement) => ({
      x: placement.x,
      z: placement.z,
      rotation: placement.rotation,
      modelId: placement.modelId,
      paintIndex: placement.paintIndex,
      ...settleFlowFestParkedCarOnGround(
        flowFestParkedCarModel(placement.modelId),
        placement,
        (x, z) => sampleFlowFestTerrainWorldY(terrain, x, z)
      ),
      scale: 1,
      colorIndex: 0,
    }))
  );

  const upperZone = contract.zones.find(
    (candidate) => candidate.id === "upper-tent-zone"
  );
  if (!upperZone) {
    throw new Error("The runtime contract is missing the upper tent zone");
  }
  const upperRng = makeRng(childSeed(FLOW_FEST_MASTER_SEED, "upper-tent-zone"));
  const upperTentCount = 21;
  const upperRadiusX =
    upperZone.radiusMeters ?? upperZone.searchRadiusXMeters ?? 12;
  const upperRadiusZ =
    upperZone.radiusMeters ?? upperZone.searchRadiusZMeters ?? 12;
  for (let index = 0; index < upperTentCount; index += 1) {
    const placement = findCampPlacement({
      rng: upperRng,
      zone: upperZone,
      terrain,
      routes,
      radiusX: upperRadiusX,
      radiusZ: upperRadiusZ,
      index,
      count: upperTentCount,
      routeClearance: 1.4,
      minimumPeerDistance: 3.1,
      peers: occupiedTentPlacements,
      otherPeers: vehiclePlacements,
      minimumOtherDistance: 3,
    });
    registerTent(placement, "upper-tent", upperRng, index === 0);
  }

  // The camper the walk-up collider sees. It stays the old pyramid envelope so
  // every clearance in the camp plan means exactly what it meant before; only
  // what the eye sees changes below.
  const tentCollisionProxy = new ConeGeometry(1.75, 1.85, 4);
  tentCollisionProxy.rotateY(Math.PI / 4);
  tentCollisionProxy.translate(0, 0.925, 0);
  const ridgeTentGeometry = buildRidgeTentGeometry();
  const domeTentGeometry = buildDomeTentGeometry();
  const tentMaterial = () =>
    new MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.88,
      side: DoubleSide,
      vertexColors: true,
    });
  // The already-seeded colour index picks the shape too, so a camp reads as a
  // mix of ridge and dome tents without adding a second random stream.
  const isDomeTent = (placement: Placement) => placement.colorIndex % 2 === 1;
  const ridgeTentPlacements = tentPlacements.filter(
    (placement) => !isDomeTent(placement)
  );
  const domeTentPlacements = tentPlacements.filter(isDomeTent);
  const tentMesh = createInstancedMesh(
    ridgeTentGeometry,
    tentMaterial(),
    ridgeTentPlacements,
    applyPlacement,
    (placement) => new Color(TENT_COLORS[placement.colorIndex]!)
  );
  const domeTentMesh = createInstancedMesh(
    domeTentGeometry,
    tentMaterial(),
    domeTentPlacements,
    applyPlacement,
    (placement) => new Color(TENT_COLORS[placement.colorIndex]!)
  );
  appendPlacementCollisionParts(
    staticCollisionParts,
    tentCollisionProxy,
    tentPlacements,
    applyPlacement
  );
  tentMesh.name = "FFS_Tents_AuthoredFestivalDressing";
  domeTentMesh.name = "FFS_TentsDome_AuthoredFestivalDressing";
  for (const mesh of [tentMesh, domeTentMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  if (!playerTentPlacement) {
    throw new Error(`Missing authored player tent for ${selectedBranch}`);
  }
  const resolvedPlayerTentPlacement: Placement = playerTentPlacement;
  const playerTentMaterial = tentMaterial();
  playerTentMaterial.color.set(
    TENT_COLORS[resolvedPlayerTentPlacement.colorIndex]!
  );
  const playerTent = new Mesh(
    isDomeTent(resolvedPlayerTentPlacement) ? domeTentGeometry : ridgeTentGeometry,
    playerTentMaterial
  );
  applyPlacement(resolvedPlayerTentPlacement, playerTent);
  appendPlacementCollisionParts(
    campEstablishedCollisionParts,
    tentCollisionProxy,
    [resolvedPlayerTentPlacement],
    applyPlacement
  );
  playerTent.name = `FFS_PlayerTent_${selectedBranch}_Authored`;
  playerTent.castShadow = true;
  playerTent.receiveShadow = true;
  playerTent.visible = false;

  // The visible bodies are GLB assets rendered by FlowFestParkedCars.svelte.
  // What the walk-up collider sees is one box per body, sized from the same
  // catalogue footprint the stall arithmetic used, so the camera stops at a
  // van's flank and a hatchback's, not at one average car.
  for (const model of FLOW_FEST_PARKED_CAR_MODELS) {
    const modelPlacements = vehiclePlacements.filter(
      (placement) => placement.modelId === model.id
    );
    if (modelPlacements.length === 0) continue;
    const vehicleCollisionProxy = new BoxGeometry(
      model.lengthMeters + 0.1,
      model.heightMeters,
      model.widthMeters + 0.1
    );
    vehicleCollisionProxy.translate(0, model.heightMeters / 2, 0);
    appendPlacementCollisionParts(
      staticCollisionParts,
      vehicleCollisionProxy,
      modelPlacements,
      applyVehiclePlacement
    );
  }

  // Pop-up canopies off the tailgates. The walk-up collider only sees the four
  // legs, so a camper can still step under the shade.
  const canopyGeometry = buildPopUpCanopyGeometry();
  const canopyMesh = createInstancedMesh(
    canopyGeometry,
    tentMaterial(),
    canopyPlacements,
    applyPlacement,
    (placement) => new Color(CANOPY_COLORS[placement.colorIndex]!)
  );
  canopyMesh.name = "FFS_Canopies_AuthoredFestivalDressing";
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;
  const canopyLegCollisionProxy = buildPopUpCanopyLegCollisionProxy();
  appendPlacementCollisionParts(
    staticCollisionParts,
    canopyLegCollisionProxy,
    canopyPlacements,
    applyPlacement
  );
  group.add(tentMesh, domeTentMesh, playerTent, canopyMesh);
  const allTentPlacements = occupiedTentPlacements;
  return {
    group,
    tents: tentPlacements.length + 1,
    staticTents: tentPlacements.length,
    vehicles: vehiclePlacements.length,
    canopies: canopyPlacements.length,
    parkedCars: vehiclePlacements.map((placement) => ({
      x: placement.x,
      y: placement.y,
      z: placement.z,
      rotation: placement.rotation,
      pitch: placement.pitch,
      roll: placement.roll,
      modelId: placement.modelId,
      paintIndex: placement.paintIndex,
    })),
    spatialAudit: {
      campRouteViolations:
        allTentPlacements.filter((placement) =>
          pointNearRoutes(placement.x, placement.z, routes, 1.4)
        ).length +
        vehiclePlacements.filter((placement) =>
          pointNearRoutes(placement.x, placement.z, routes, 2.5)
        ).length,
      minimumTentCenterDistance: minimumPairDistance(allTentPlacements),
      minimumVehicleCenterDistance: minimumPairDistance(vehiclePlacements),
      minimumTentVehicleDistance: minimumCrossDistance(
        allTentPlacements,
        vehiclePlacements
      ),
      lowerTentPerimeterCount:
        lowerInnerRoadsideTentPlacements.length +
        lowerOuterTreeLineTentPlacements.length,
      lowerTentMinimumLoopDistance: minimumDistanceToPlanLine(
        [
          ...lowerInnerRoadsideTentPlacements,
          ...lowerOuterTreeLineTentPlacements,
        ],
        lowerLoop
      ),
      lowerTentMaximumLoopDistance: maximumDistanceToPlanLine(
        [
          ...lowerInnerRoadsideTentPlacements,
          ...lowerOuterTreeLineTentPlacements,
        ],
        lowerLoop
      ),
      lowerCenterVehicleCount: vehiclePlacements.length,
      lowerCenterTentCount: lowerCenterTentPlacements.length,
      lowerCenterCanopyCount: canopyPlacements.length,
      lowerInnerRoadsideTentCount: lowerInnerRoadsideTentPlacements.length,
      lowerOuterTreeLineTentCount: lowerOuterTreeLineTentPlacements.length,
      lowerCenterVehicleOutsideLoopCount:
        lowerOccupancy.audit.centerVehicleOutsideLoopCount,
      lowerCenterVehicleAisleIntrusionCount:
        lowerOccupancy.audit.centerVehicleAisleIntrusionCount,
      lowerCenterVehicleWalkLaneIntrusionCount:
        lowerOccupancy.audit.centerVehicleWalkLaneIntrusionCount,
      lowerCenterGearWalkLaneIntrusionCount:
        lowerOccupancy.audit.centerGearWalkLaneIntrusionCount,
      lowerCenterVehicleEmptyStallCount:
        lowerOccupancy.audit.centerVehicleEmptyStallCount,
      lowerInnerRoadsideTentOutsideLoopCount:
        lowerOccupancy.audit.innerRoadsideTentOutsideLoopCount,
      lowerOuterTreeLineTentInsideLoopCount:
        lowerOccupancy.audit.outerTreeLineTentInsideLoopCount,
    },
    setEstablished: (visible) => {
      playerTent.visible = visible;
    },
    setDressingVisible: (visible) => {
      group.visible = visible;
    },
  };
}

function groundTentPlacement(
  placement: { x: number; z: number; rotation: number },
  terrain: ImportedTerrainDataV2
): Placement {
  return {
    ...placement,
    y: sampleFlowFestTerrainWorldY(terrain, placement.x, placement.z) + 0.08,
    scale: 1,
    colorIndex: 0,
  };
}

function minimumPairDistance(placements: Placement[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let first = 0; first < placements.length; first += 1) {
    for (let second = first + 1; second < placements.length; second += 1) {
      minimum = Math.min(
        minimum,
        Math.hypot(
          placements[first]!.x - placements[second]!.x,
          placements[first]!.z - placements[second]!.z
        )
      );
    }
  }
  return Number.isFinite(minimum) ? minimum : 0;
}

function minimumCrossDistance(
  firstPlacements: Placement[],
  secondPlacements: Placement[]
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const first of firstPlacements) {
    for (const second of secondPlacements) {
      minimum = Math.min(
        minimum,
        Math.hypot(first.x - second.x, first.z - second.z)
      );
    }
  }
  return Number.isFinite(minimum) ? minimum : 0;
}

function minimumDistanceToPlanLine(
  placements: Placement[],
  line: FlowFestCampPlanLine
): number {
  return planLinePlacementDistances(placements, line).reduce(
    (minimum, distance) => Math.min(minimum, distance),
    Number.POSITIVE_INFINITY
  );
}

function maximumDistanceToPlanLine(
  placements: Placement[],
  line: FlowFestCampPlanLine
): number {
  return planLinePlacementDistances(placements, line).reduce(
    (maximum, distance) => Math.max(maximum, distance),
    0
  );
}

function planLinePlacementDistances(
  placements: Placement[],
  line: FlowFestCampPlanLine
): number[] {
  return placements.map((placement) => {
    let minimum = Number.POSITIVE_INFINITY;
    for (let index = 1; index < line.points.length; index += 1) {
      minimum = Math.min(
        minimum,
        distanceToSegment(
          placement.x,
          placement.z,
          line.points[index - 1]!,
          line.points[index]!
        )
      );
    }
    return minimum;
  });
}

function findCampPlacement(options: {
  rng: () => number;
  zone: FlowFestRuntimeZone;
  terrain: ImportedTerrainDataV2;
  routes: FlowFestRuntimeSegment[];
  radiusX: number;
  radiusZ: number;
  index: number;
  count: number;
  routeClearance: number;
  minimumPeerDistance: number;
  peers: Placement[];
  otherPeers: Placement[];
  minimumOtherDistance: number;
}): Placement {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const angle =
      (options.index / options.count) * Math.PI * 2 +
      (options.rng() - 0.5) * 0.72 +
      attempt * 0.31;
    const ring = 0.52 + 0.38 * Math.sqrt(options.rng());
    const x = options.zone.center.x + Math.cos(angle) * options.radiusX * ring;
    const z = options.zone.center.z + Math.sin(angle) * options.radiusZ * ring;
    if (pointNearRoutes(x, z, options.routes, options.routeClearance)) continue;
    if (
      options.peers.some(
        (peer) =>
          Math.hypot(peer.x - x, peer.z - z) < options.minimumPeerDistance
      ) ||
      options.otherPeers.some(
        (peer) =>
          Math.hypot(peer.x - x, peer.z - z) < options.minimumOtherDistance
      )
    ) {
      continue;
    }
    return {
      x,
      y: sampleFlowFestTerrainWorldY(options.terrain, x, z) + 0.08,
      z,
      rotation: angle,
      scale: 1,
      colorIndex: 0,
    };
  }
  throw new Error(
    `Could not place authored camp object ${options.index + 1}/${options.count} in ${options.zone.id}`
  );
}

/**
 * Vertex colour multiplies with the instance colour, so one instanced draw can
 * carry a coloured fly and a dark door, or a coloured car and black wheels,
 * without a second material or a second batch. White keeps the instance colour
 * exactly; a grey darkens it toward the shadowed part of the same object.
 */
const CAMP_SHADE = {
  fly: 1,
  panel: 0.72,
  door: 0.3,
  groundsheet: 0.24,
  pole: 0.46,
  glass: 0.16,
  tyre: 0.07,
  trim: 0.34,
} as const;

/**
 * Give a merged part a flat vertex colour and a trivial index. Everything in
 * the camp batch must agree on indexing before `mergeGeometries` will accept it,
 * and three.js primitives are indexed, so the sequential index keeps a
 * hand-authored panel in the same batch as a `BoxGeometry`.
 */
function shadeCampPart(geometry: BufferGeometry, shade: number): BufferGeometry {
  // Camp dressing is untextured, and mergeGeometries rejects a batch whose
  // members disagree about which attributes exist. Dropping the primitives' UVs
  // lets a hand-authored fly panel share a batch with a BoxGeometry sill.
  geometry.deleteAttribute("uv");
  geometry.deleteAttribute("uv1");
  const vertexCount = geometry.attributes.position!.count;
  const colors = new Float32Array(vertexCount * 3);
  colors.fill(shade);
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  if (!geometry.getIndex()) {
    const indices = new Uint16Array(vertexCount);
    for (let index = 0; index < vertexCount; index += 1) indices[index] = index;
    geometry.setIndex(new BufferAttribute(indices, 1));
  }
  return geometry;
}

/** Build a flat-shaded, indexed panel from an explicit triangle fan of corners. */
function buildCampPanel(
  corners: ReadonlyArray<readonly [number, number, number]>,
  shade: number
): BufferGeometry {
  const triangles = corners.length - 2;
  const positions = new Float32Array(triangles * 9);
  const normals = new Float32Array(triangles * 9);
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const a = corners[0]!;
    const b = corners[triangle + 1]!;
    const c = corners[triangle + 2]!;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    for (const [slot, corner] of [a, b, c].entries()) {
      const offset = triangle * 9 + slot * 3;
      positions[offset] = corner[0];
      positions[offset + 1] = corner[1];
      positions[offset + 2] = corner[2];
      normals[offset] = nx / length;
      normals[offset + 1] = ny / length;
      normals[offset + 2] = nz / length;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  return shadeCampPart(geometry, shade);
}

function mergeCampParts(parts: BufferGeometry[], label: string): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error(`Flow Fest ${label} geometry failed to merge`);
  return merged;
}

const CANOPY_HALF_SIZE = 1.5;
const CANOPY_LEG_HEIGHT = 2.05;
const CANOPY_PEAK_RISE = 0.7;
const CANOPY_VALANCE_DROP = 0.22;

/**
 * A 3 m pop-up canopy off a tailgate: four legs, a shallow four-sided peak,
 * and the valance that hangs off its eave, plus the folding table and cooler
 * that live under every one of them. The instance colour is the fabric; the
 * legs, table and cooler take their shade from vertex colour.
 */
function buildPopUpCanopyGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const leg = new CylinderGeometry(0.03, 0.03, CANOPY_LEG_HEIGHT, 6);
      leg.translate(
        x * (CANOPY_HALF_SIZE - 0.05),
        CANOPY_LEG_HEIGHT / 2,
        z * (CANOPY_HALF_SIZE - 0.05)
      );
      parts.push(shadeCampPart(leg, CAMP_SHADE.pole));
    }
  }
  const peak = new ConeGeometry(
    CANOPY_HALF_SIZE * Math.SQRT2,
    CANOPY_PEAK_RISE,
    4,
    1,
    true
  );
  peak.rotateY(Math.PI / 4);
  peak.translate(0, CANOPY_LEG_HEIGHT + CANOPY_PEAK_RISE / 2, 0);
  parts.push(shadeCampPart(peak, CAMP_SHADE.fly));
  const eave = CANOPY_LEG_HEIGHT;
  const hem = CANOPY_LEG_HEIGHT - CANOPY_VALANCE_DROP;
  const s = CANOPY_HALF_SIZE;
  const valanceSides: Array<
    ReadonlyArray<readonly [number, number, number]>
  > = [
    [[-s, eave, s], [s, eave, s], [s, hem, s], [-s, hem, s]],
    [[s, eave, -s], [-s, eave, -s], [-s, hem, -s], [s, hem, -s]],
    [[s, eave, s], [s, eave, -s], [s, hem, -s], [s, hem, s]],
    [[-s, eave, -s], [-s, eave, s], [-s, hem, s], [-s, hem, -s]],
  ];
  for (const corners of valanceSides) {
    parts.push(buildCampPanel(corners, CAMP_SHADE.panel));
  }
  const tableTop = new BoxGeometry(1.2, 0.04, 0.6);
  tableTop.translate(0.3, 0.74, -0.5);
  parts.push(shadeCampPart(tableTop, CAMP_SHADE.trim));
  for (const x of [-0.5, 0.5]) {
    const tableLeg = new BoxGeometry(0.04, 0.72, 0.5);
    tableLeg.translate(0.3 + x, 0.36, -0.5);
    parts.push(shadeCampPart(tableLeg, CAMP_SHADE.pole));
  }
  const cooler = new BoxGeometry(0.72, 0.44, 0.42);
  cooler.translate(-0.8, 0.22, 0.7);
  parts.push(shadeCampPart(cooler, CAMP_SHADE.door));
  return mergeCampParts(parts, "pop-up canopy");
}

/** Only the legs stop a walker; the shade itself is open on every side. */
function buildPopUpCanopyLegCollisionProxy(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const leg = new BoxGeometry(0.18, CANOPY_LEG_HEIGHT, 0.18);
      leg.translate(
        x * (CANOPY_HALF_SIZE - 0.05),
        CANOPY_LEG_HEIGHT / 2,
        z * (CANOPY_HALF_SIZE - 0.05)
      );
      parts.push(leg);
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("Flow Fest canopy collision proxy failed to merge");
  return merged;
}

const RIDGE_TENT_HALF_LENGTH = 1.32;
const RIDGE_TENT_HALF_WIDTH = 1.06;
const RIDGE_TENT_RIDGE_HEIGHT = 1.52;
const DOME_TENT_RADIUS = 1.18;
const DOME_TENT_HEIGHT = 1.42;

/**
 * A four-sided cone is a pyramid, and a field of pyramids reads as traffic
 * cones, not as a campground. Camps here are ridge tents and dome tents: a
 * taut fly over a rectangular or round footprint, a dark door on the entry
 * face, and a groundsheet lip where the fabric meets the field.
 *
 * Both variants stay inside the pyramid's old envelope, so every camp-plan
 * coordinate, clearance and collision proxy carries over untouched.
 */
function buildRidgeTentGeometry(): BufferGeometry {
  const L = RIDGE_TENT_HALF_LENGTH;
  const W = RIDGE_TENT_HALF_WIDTH;
  const H = RIDGE_TENT_RIDGE_HEIGHT;
  const lip = 0.14;
  const parts: BufferGeometry[] = [];

  // The two sloping fly panels, ridge at the top, groundsheet lip at the base.
  for (const side of [1, -1] as const) {
    parts.push(
      buildCampPanel(
        side > 0
          ? [
              [-L, lip, side * W],
              [L, lip, side * W],
              [L, H, 0],
              [-L, H, 0],
            ]
          : [
              [-L, H, 0],
              [L, H, 0],
              [L, lip, side * W],
              [-L, lip, side * W],
            ],
        CAMP_SHADE.fly
      )
    );
  }
  // The gable ends. The front one is the doorway, so it is the dark panel.
  parts.push(
    buildCampPanel(
      [
        [L, lip, -W],
        [L, lip, W],
        [L, H, 0],
      ],
      CAMP_SHADE.door
    )
  );
  parts.push(
    buildCampPanel(
      [
        [-L, lip, W],
        [-L, lip, -W],
        [-L, H, 0],
      ],
      CAMP_SHADE.panel
    )
  );
  // Groundsheet skirt: a low box so the tent meets the field instead of
  // hovering over it, and so a grazing view never sees under the fly.
  const skirt = new BoxGeometry(L * 2, lip * 2, W * 2);
  skirt.translate(0, lip, 0);
  parts.push(shadeCampPart(skirt, CAMP_SHADE.groundsheet));
  // Ridge pole overhang at both ends.
  const pole = new CylinderGeometry(0.045, 0.045, L * 2.24, 5);
  pole.rotateZ(Math.PI / 2);
  pole.translate(0, H, 0);
  parts.push(shadeCampPart(pole, CAMP_SHADE.pole));

  return mergeCampParts(parts, "ridge tent");
}

function buildDomeTentGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const dome = new SphereGeometry(
    DOME_TENT_RADIUS,
    12,
    5,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.5
  );
  dome.scale(1, DOME_TENT_HEIGHT / DOME_TENT_RADIUS, 0.88);
  parts.push(shadeCampPart(dome, CAMP_SHADE.fly));

  // Crossed dome poles, which is what reads as a dome tent at fifty metres.
  for (const rotation of [Math.PI * 0.25, -Math.PI * 0.25]) {
    const arc = new TorusGeometry(
      DOME_TENT_RADIUS * 0.99,
      0.04,
      4,
      12,
      Math.PI
    );
    arc.rotateY(rotation);
    arc.scale(1, DOME_TENT_HEIGHT / DOME_TENT_RADIUS, 1);
    parts.push(shadeCampPart(arc, CAMP_SHADE.pole));
  }

  // Vestibule: a small awning over the door on the +X face.
  parts.push(
    buildCampPanel(
      [
        [DOME_TENT_RADIUS * 0.52, 0.06, -0.62],
        [DOME_TENT_RADIUS * 1.5, 0.06, -0.46],
        [DOME_TENT_RADIUS * 1.5, 0.06, 0.46],
        [DOME_TENT_RADIUS * 0.52, 0.06, 0.62],
      ],
      CAMP_SHADE.groundsheet
    )
  );
  parts.push(
    buildCampPanel(
      [
        [DOME_TENT_RADIUS * 0.5, 0.06, 0.62],
        [DOME_TENT_RADIUS * 1.48, 0.06, 0.46],
        [DOME_TENT_RADIUS * 1.48, 0.5, 0.46],
        [DOME_TENT_RADIUS * 0.5, 0.98, 0.62],
      ],
      CAMP_SHADE.panel
    )
  );
  parts.push(
    buildCampPanel(
      [
        [DOME_TENT_RADIUS * 0.5, 0.98, -0.62],
        [DOME_TENT_RADIUS * 1.48, 0.5, -0.46],
        [DOME_TENT_RADIUS * 1.48, 0.06, -0.46],
        [DOME_TENT_RADIUS * 0.5, 0.06, -0.62],
      ],
      CAMP_SHADE.panel
    )
  );
  // The doorway itself, inset into the dome face.
  parts.push(
    buildCampPanel(
      [
        [DOME_TENT_RADIUS * 0.5, 0.04, -0.56],
        [DOME_TENT_RADIUS * 0.5, 0.04, 0.56],
        [DOME_TENT_RADIUS * 0.52, 0.96, 0.34],
        [DOME_TENT_RADIUS * 0.52, 0.96, -0.34],
      ],
      CAMP_SHADE.door
    )
  );

  return mergeCampParts(parts, "dome tent");
}

const FIRE_PIT_INNER_RADIUS_METERS = 1.42;
const FIRE_PIT_STONE_COUNT = 18;

/**
 * Burnt ground inside the stone ring. The rim is deliberately off-round: a
 * perfect circle at this scale reads as a manufactured fire bowl.
 */
function buildFireAshBedGeometry(): BufferGeometry {
  const geometry = new CircleGeometry(FIRE_PIT_INNER_RADIUS_METERS, 30);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position!;
  // Vertex 0 is the centre; it drops so the bed dishes toward the coals.
  positions.setY(0, -0.05);
  for (let index = 1; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const angle = Math.atan2(z, x);
    // Periodic in theta, so the seam vertex pair stays coincident.
    const wobble =
      1 + 0.07 * Math.sin(3 * angle + 0.7) + 0.045 * Math.sin(7 * angle + 2.1);
    positions.setXYZ(index, x * wobble, 0, z * wobble);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Hand-laid field stones. Merged into one geometry so the pit stays a single
 * mesh for the camera collider and the authored-fixture count.
 */
function buildFireStoneRingGeometry(): BufferGeometry {
  const rng = makeRng(childSeed(FLOW_FEST_MASTER_SEED, "fire-pit-stones"));
  const stones: BufferGeometry[] = [];
  for (let index = 0; index < FIRE_PIT_STONE_COUNT; index += 1) {
    const angle =
      (index / FIRE_PIT_STONE_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.14;
    const radius = FIRE_PIT_INNER_RADIUS_METERS + 0.22 + rng() * 0.12;
    const size = 0.19 + rng() * 0.13;
    const stone = new DodecahedronGeometry(size, 0);
    stone.scale(1.18, 0.62 + rng() * 0.24, 0.94);
    stone.rotateY(rng() * Math.PI * 2);
    stone.rotateX((rng() - 0.5) * 0.5);
    stone.rotateZ((rng() - 0.5) * 0.5);
    stone.translate(
      Math.cos(angle) * radius,
      // Half-buried, with a couple of stones seated deeper than the rest.
      size * (0.34 + rng() * 0.3),
      Math.sin(angle) * radius
    );
    stones.push(stone);
  }
  const merged = mergeGeometries(stones, false);
  for (const stone of stones) stone.dispose();
  if (!merged) {
    throw new Error("Flow Fest fire pit stones failed to merge");
  }
  merged.computeVertexNormals();
  // PolyhedronGeometry is non-indexed, but every other authored collision part
  // is indexed and mergeGeometries refuses a mixed batch. A trivial sequential
  // index keeps the flat-shaded vertex layout and lets the pit join the camera
  // collider merge.
  if (!merged.getIndex()) {
    const vertexCount = merged.attributes.position!.count;
    const indices = new Uint16Array(vertexCount);
    for (let index = 0; index < vertexCount; index += 1) indices[index] = index;
    merged.setIndex(new BufferAttribute(indices, 1));
  }
  return merged;
}

function buildFestivalHeart(
  contract: FlowFestRuntimeContract,
  terrain: ImportedTerrainDataV2,
  collisionParts: BufferGeometry[]
): {
  group: Group;
  people: number;
  fixtures: number;
  community: FlowFestFestivalCommunityLayout;
} {
  const group = new Group();
  group.name = "FFS_FictionalFestivalHeart";
  group.visible = false;
  const zone = contract.zones.find(
    (candidate) => candidate.id === "night-heart-zone"
  )!;
  const fireCenter = {
    x: zone.center.x - 11,
    z: zone.center.z + 1.5,
    y: sampleFlowFestTerrainWorldY(
      terrain,
      zone.center.x - 11,
      zone.center.z + 1.5
    ),
  };
  const ledCircleCenter = {
    x: zone.center.x + 20,
    z: zone.center.z + 12,
    y: sampleFlowFestTerrainWorldY(
      terrain,
      zone.center.x + 20,
      zone.center.z + 12
    ),
  };
  const performanceFloorGeometry = new CircleGeometry(
    FLOW_FEST_FIRE_JAM_CONTRACT.performanceFloorRadiusMeters,
    64
  );
  performanceFloorGeometry.rotateX(-Math.PI / 2);
  const floorPositions = performanceFloorGeometry.attributes.position!;
  for (let index = 0; index < floorPositions.count; index += 1) {
    const worldX = fireCenter.x + floorPositions.getX(index);
    const worldZ = fireCenter.z + floorPositions.getZ(index);
    floorPositions.setXYZ(
      index,
      worldX,
      sampleFlowFestTerrainWorldY(terrain, worldX, worldZ) + 0.035,
      worldZ
    );
  }
  floorPositions.needsUpdate = true;
  performanceFloorGeometry.computeVertexNormals();
  const performanceFloor = new Mesh(
    performanceFloorGeometry,
    new MeshStandardMaterial({
      color: "#332b26",
      roughness: 1,
      metalness: 0,
    })
  );
  performanceFloor.name = "FFS_FireJam_OpenPerformanceFloor_Authored";
  performanceFloor.receiveShadow = true;
  group.add(performanceFloor);

  // A smooth torus reads as a pool float, not a fire pit. The pit is a bed of
  // burnt ground with a hand-laid ring of field stones around it: irregular
  // silhouette at 13 m, a dark disc with a warm centre at 100 m.
  const ashBed = new Mesh(
    buildFireAshBedGeometry(),
    new MeshStandardMaterial({
      color: "#100c0a",
      roughness: 1,
      metalness: 0,
      emissive: "#3a1408",
      emissiveIntensity: 0.5,
    })
  );
  ashBed.position.set(fireCenter.x, fireCenter.y + 0.07, fireCenter.z);
  ashBed.name = "FFS_FireJam_CentralFireAshBed_Authored";
  group.add(ashBed);

  const fireRing = new Mesh(
    buildFireStoneRingGeometry(),
    new MeshStandardMaterial({
      color: "#6d675c",
      roughness: 0.94,
      metalness: 0.02,
    })
  );
  fireRing.position.set(fireCenter.x, fireCenter.y, fireCenter.z);
  fireRing.name = "FFS_FireJam_CentralFireRing_Authored";
  fireRing.castShadow = true;
  fireRing.receiveShadow = true;
  group.add(fireRing);
  appendObjectCollisionPart(collisionParts, fireRing);

  const canopy = new Group();
  canopy.name = "FFS_LEDFlowCircle_OpenCanopy_Authored";
  const poleGeometry = new CylinderGeometry(0.08, 0.11, 3.4, 10);
  const poleMaterial = new MeshStandardMaterial({
    color: "#303947",
    roughness: 0.4,
    metalness: 0.68,
  });
  const canopyPostOffsets: Array<[number, number]> = [
    [-3.25, -2.6],
    [3.25, -2.6],
    [3.25, 2.6],
    [-3.25, 2.6],
  ];
  for (const [index, [offsetX, offsetZ]] of canopyPostOffsets.entries()) {
    const x = ledCircleCenter.x + offsetX;
    const z = ledCircleCenter.z + offsetZ;
    const y = sampleFlowFestTerrainWorldY(terrain, x, z);
    const pole = new Mesh(poleGeometry, poleMaterial);
    pole.position.set(x, y + 1.7, z);
    pole.name = `FFS_LEDFlowCircle_CanopyPost_${index + 1}_Authored`;
    pole.castShadow = true;
    canopy.add(pole);
    appendObjectCollisionPart(collisionParts, pole);
  }
  const roof = new Mesh(
    new BoxGeometry(7.15, 0.16, 5.75),
    new MeshStandardMaterial({
      color: "#36304d",
      emissive: "#18102a",
      emissiveIntensity: 0.7,
      roughness: 0.58,
      metalness: 0.08,
    })
  );
  roof.position.set(
    ledCircleCenter.x,
    ledCircleCenter.y + 3.38,
    ledCircleCenter.z
  );
  roof.rotation.z = -0.035;
  roof.name = "FFS_LEDFlowCircle_FlatCanopy_Authored";
  roof.castShadow = true;
  canopy.add(roof);

  const hangingLedRing = new Mesh(
    new TorusGeometry(1.7, 0.07, 10, 64),
    new MeshBasicMaterial({ color: "#70e7ff", toneMapped: false })
  );
  hangingLedRing.position.set(
    ledCircleCenter.x,
    ledCircleCenter.y + 1.75,
    ledCircleCenter.z
  );
  hangingLedRing.name = "FFS_LEDFlowCircle_HangingRing_Authored";
  canopy.add(hangingLedRing);

  const ledFloorRing = new Mesh(
    new TorusGeometry(2.45, 0.055, 8, 64),
    new MeshBasicMaterial({ color: "#da72ff", toneMapped: false })
  );
  ledFloorRing.position.set(
    ledCircleCenter.x,
    ledCircleCenter.y + 0.08,
    ledCircleCenter.z
  );
  ledFloorRing.rotation.x = Math.PI / 2;
  ledFloorRing.name = "FFS_LEDFlowCircle_FloorRing_Authored";
  canopy.add(ledFloorRing);
  group.add(canopy);

  const community = deriveFlowFestFestivalCommunityLayout(contract, terrain);
  return {
    group,
    people: community.people.length,
    fixtures: 5,
    community,
  };
}

export function deriveFlowFestFestivalCommunityLayout(
  contract: FlowFestRuntimeContract,
  terrain: ImportedTerrainDataV2
): FlowFestFestivalCommunityLayout {
  const zone = contract.zones.find(
    (candidate) => candidate.id === "night-heart-zone"
  );
  if (!zone) throw new Error("Flow Fest night-heart zone is missing");
  const fireCenter = {
    x: zone.center.x - 11,
    z: zone.center.z + 1.5,
    y: sampleFlowFestTerrainWorldY(
      terrain,
      zone.center.x - 11,
      zone.center.z + 1.5
    ),
  };
  const ledCircleCenter = {
    x: zone.center.x + 20,
    z: zone.center.z + 12,
    y: sampleFlowFestTerrainWorldY(
      terrain,
      zone.center.x + 20,
      zone.center.z + 12
    ),
  };
  const avatarIds: FlowFestFestivalPersonPlacement["avatarId"][] = [
    "ch07",
    "ch18",
    "ch24",
    "ch22",
    "ch41",
    "ch12",
    "ch21",
    "ch42",
    "ch01",
  ];
  const people: FlowFestFestivalPersonPlacement[] = [];
  const addPerson = (
    id: string,
    avatarIndex: number,
    role: FlowFestFestivalPersonRole,
    behavior: FlowFestFestivalPersonBehavior,
    x: number,
    z: number,
    target: { x: number; z: number },
    phaseOffset: number,
    options?: Pick<
      FlowFestFestivalPersonPlacement,
      "lookTarget" | "performanceTarget" | "queueTarget" | "rotationOrdinal"
    >
  ): void => {
    people.push({
      id,
      avatarId: avatarIds[avatarIndex % avatarIds.length]!,
      role,
      behavior,
      x,
      y: sampleFlowFestTerrainWorldY(terrain, x, z),
      z,
      facingAngle: Math.atan2(target.x - x, target.z - z),
      phaseOffset,
      ...options,
    });
  };

  // The circle is authored as uneven human clusters with one deliberately
  // empty arrival wedge. A mathematically perfect ring reads like conference
  // seating and makes it unclear where a new spinner can safely enter.
  const spectatorOffsets = [
    [-14, -1],
    [-13, 3],
    [-11, 7],
    [-8, 10.5],
    [-3, 12.7],
    [2, 13.2],
    [6.5, 11.5],
    [10.2, 8.7],
    [13.2, 4.2],
    [14, 0.2],
    [12.8, -4.5],
    [9.4, -8.2],
    [5, -10.8],
    [-5.5, -10.2],
    [-10, -7.4],
    [-13, -4.3],
  ] as const;
  const socialPartners = new Map<number, number>([
    [2, 3],
    [3, 2],
    [7, 8],
    [8, 7],
    [14, 15],
    [15, 14],
  ]);
  const perimeterWalkers = new Set([0, 6, 11]);
  const spectatorCount = 16;
  for (let index = 0; index < spectatorCount; index += 1) {
    const [offsetX, offsetZ] = spectatorOffsets[index]!;
    const partnerIndex = socialPartners.get(index);
    const partner =
      partnerIndex === undefined ? null : spectatorOffsets[partnerIndex]!;
    const behavior: FlowFestFestivalPersonBehavior = perimeterWalkers.has(index)
      ? "perimeter-walk"
      : partner
        ? "social-pair"
        : "watch-fire";
    addPerson(
      `fire-spectator-${index + 1}`,
      index,
      "spectator",
      behavior,
      fireCenter.x + offsetX,
      fireCenter.z + offsetZ,
      fireCenter,
      index * 0.91,
      partner
        ? {
            lookTarget: {
              x: fireCenter.x + partner[0],
              z: fireCenter.z + partner[1],
            },
          }
        : undefined
    );
  }

  const performanceAngles = [0.42, 2.48, 4.56] as const;
  const queueAngles = [0.08, 0.48, 0.88, 1.28, 1.68] as const;
  queueAngles.forEach((queueAngle, index) => {
    const performanceAngle = performanceAngles[index % 3]!;
    const performanceTarget = {
      x: fireCenter.x + Math.cos(performanceAngle) * 4.65,
      z: fireCenter.z + Math.sin(performanceAngle) * 4.65,
    };
    const queueTarget = {
      x: fireCenter.x + Math.cos(queueAngle) * 9.75,
      z: fireCenter.z + Math.sin(queueAngle) * 9.75,
    };
    const role: FlowFestFestivalPersonRole =
      index === 1 || index === 4 ? "fire-hoop" : "fire-poi";
    addPerson(
      `fire-performer-${index + 1}`,
      index + spectatorCount,
      role,
      "fire-rotation",
      performanceTarget.x,
      performanceTarget.z,
      fireCenter,
      index * 2.1,
      {
        rotationOrdinal: index,
        performanceTarget: {
          ...performanceTarget,
          y: sampleFlowFestTerrainWorldY(
            terrain,
            performanceTarget.x,
            performanceTarget.z
          ),
        },
        queueTarget: {
          ...queueTarget,
          y: sampleFlowFestTerrainWorldY(terrain, queueTarget.x, queueTarget.z),
        },
      }
    );
  });

  [0.6, 2.7, 4.8].forEach((angle, index) => {
    addPerson(
      `led-flow-artist-${index + 1}`,
      index + 4,
      "led-flow",
      "led-session",
      ledCircleCenter.x + Math.cos(angle) * 3.7,
      ledCircleCenter.z + Math.sin(angle) * 3.3,
      ledCircleCenter,
      index * 1.7
    );
  });

  [
    { x: zone.center.x + 10, z: zone.center.z - 12 },
    { x: zone.center.x + 13, z: zone.center.z + 17 },
  ].forEach((position, index) => {
    addPerson(
      `field-juggler-${index + 1}`,
      index + 9,
      "juggler",
      "field-practice",
      position.x,
      position.z,
      { x: position.x, z: position.z + 1 },
      index * 2.4
    );
  });

  return {
    fireCenter,
    ledCircleCenter,
    people,
    spectatorCount,
    performerCount: people.length - spectatorCount,
    firePerformerCount: queueAngles.length,
    activeFirePerformerCount: performanceAngles.length,
    ingressBearingRadians: -Math.PI / 2,
    ingressHalfWidthRadians: 0.42,
  };
}

function buildRouteLanterns(
  contract: FlowFestRuntimeContract,
  terrain: ImportedTerrainDataV2,
  selectedBranch: FlowFestBranchId
): { group: Group; count: number } {
  const group = new Group();
  group.name = "FFS_SelectedBranch_Lanterns";
  const personSegments = [
    ...contract.routes.arrivalBranches[selectedBranch].segments,
    contract.routes.nightReturnBranches[selectedBranch],
  ].filter((segment) => segment.mode === "person");
  const placements: Placement[] = [];
  for (const segment of personSegments) {
    for (
      let pointIndex = 1;
      pointIndex < segment.points.length;
      pointIndex += 1
    ) {
      const start = segment.points[pointIndex - 1]!;
      const end = segment.points[pointIndex]!;
      const distance = Math.hypot(end.x - start.x, end.z - start.z);
      const count = Math.floor(distance / 14);
      for (let index = 1; index <= count; index += 1) {
        const t = index / (count + 1);
        const x = start.x + (end.x - start.x) * t;
        const z = start.z + (end.z - start.z) * t;
        placements.push({
          x,
          y: sampleFlowFestTerrainWorldY(terrain, x, z),
          z,
          rotation: 0,
          scale: 1,
          colorIndex: 0,
        });
      }
    }
  }
  const postGeometry = new CylinderGeometry(0.022, 0.034, 0.56, 7);
  postGeometry.translate(0, 0.28, 0);
  const posts = createInstancedMesh(
    postGeometry,
    new MeshStandardMaterial({
      color: "#33271f",
      roughness: 0.94,
      metalness: 0,
    }),
    placements,
    (placement, object) => {
      object.position.set(placement.x, placement.y + 0.02, placement.z);
    }
  );
  posts.name = "FFS_PathLanternPosts_AuthoredWayfinding";
  posts.castShadow = true;
  const lanternGeometry = new DodecahedronGeometry(0.095, 1);
  const lanterns = createInstancedMesh(
    lanternGeometry,
    new MeshBasicMaterial({ color: "#ffc673", toneMapped: false }),
    placements,
    (placement, object) => {
      object.position.set(placement.x, placement.y + 0.64, placement.z);
    }
  );
  lanterns.name = "FFS_PathLanterns_AuthoredWayfinding";
  group.add(posts, lanterns);
  return { group, count: placements.length };
}

function appendPlacementCollisionParts<TPlacement extends Placement>(
  target: BufferGeometry[],
  geometry: BufferGeometry,
  placements: TPlacement[],
  place: (placement: TPlacement, object: Object3D) => void
): void {
  const object = new Object3D();
  for (const placement of placements) {
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.scale.set(1, 1, 1);
    place(placement, object);
    object.updateMatrix();
    target.push(geometry.clone().applyMatrix4(object.matrix));
  }
}

function appendObjectCollisionPart(
  target: BufferGeometry[],
  object: Mesh
): void {
  object.updateMatrix();
  target.push(object.geometry.clone().applyMatrix4(object.matrix));
}

function mergeProductionCollisionParts(
  parts: BufferGeometry[],
  visibleObjectCount: number
): FlowFestProductionCollisionMesh {
  const merged = mergeGeometries(parts, false);
  try {
    if (!merged) {
      throw new Error("Flow Fest visible collision geometry did not merge");
    }
    const position = merged.getAttribute("position");
    const index = merged.getIndex();
    if (!position || !index) {
      throw new Error("Flow Fest visible collision geometry is not indexed");
    }
    const vertices = new Float32Array(position.array.length);
    vertices.set(position.array as ArrayLike<number>);
    const indices = new Uint32Array(index.array.length);
    indices.set(index.array as ArrayLike<number>);
    return { vertices, indices, visibleObjectCount };
  } finally {
    parts.forEach((part) => part.dispose());
    merged?.dispose();
  }
}

function createInstancedMesh<TPlacement extends Placement>(
  geometry: BufferGeometry,
  material: Material,
  placements: TPlacement[],
  place: (placement: TPlacement, object: Object3D) => void,
  color?: (placement: TPlacement) => Color
): InstancedMesh {
  const mesh = new InstancedMesh(
    geometry,
    material,
    Math.max(placements.length, 1)
  );
  mesh.count = placements.length;
  const object = new Object3D();
  placements.forEach((placement, index) => {
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.scale.set(1, 1, 1);
    place(placement, object);
    object.updateMatrix();
    mesh.setMatrixAt(index, object.matrix);
    if (color) mesh.setColorAt(index, color(placement));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = true;
  return mesh;
}

function applyPlacement(placement: Placement, object: Object3D): void {
  object.position.set(placement.x, placement.y, placement.z);
  object.rotation.y = placement.rotation;
  object.scale.setScalar(placement.scale);
}

/** A settled car: yaw, then pitch about its axle line, then roll across it. */
function applyVehiclePlacement(
  placement: Placement & Pick<FlowFestParkedCarPlacement, "pitch" | "roll">,
  object: Object3D
): void {
  object.position.set(placement.x, placement.y, placement.z);
  object.rotation.set(placement.roll, placement.rotation, placement.pitch, "YZX");
  object.scale.setScalar(placement.scale);
}

function pointNearRoutes(
  x: number,
  z: number,
  routes: FlowFestRuntimeSegment[],
  extraClearance: number
): boolean {
  return routes.some((route) => {
    const clearance = route.widthMeters / 2 + extraClearance;
    for (let index = 1; index < route.points.length; index += 1) {
      if (
        distanceToSegment(
          x,
          z,
          route.points[index - 1]!,
          route.points[index]!
        ) <= clearance
      ) {
        return true;
      }
    }
    return false;
  });
}

function distanceToSegment(
  x: number,
  z: number,
  start: Pick<FlowFestRuntimePoint, "x" | "z">,
  end: Pick<FlowFestRuntimePoint, "x" | "z">
): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return Math.hypot(x - start.x, z - start.z);
  const t = Math.max(
    0,
    Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / lengthSquared)
  );
  return Math.hypot(x - (start.x + dx * t), z - (start.z + dz * t));
}

function disposeObjectTree(root: ThreeObject3D): void {
  root.traverse((object) => {
    const mesh = object as Mesh;
    mesh.geometry?.dispose();
    if (!mesh.material) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    materials.forEach((material) => {
      if ("map" in material) {
        const map = (material as Material & { map?: { dispose(): void } }).map;
        map?.dispose();
      }
      material.dispose();
    });
  });
  root.removeFromParent();
}
