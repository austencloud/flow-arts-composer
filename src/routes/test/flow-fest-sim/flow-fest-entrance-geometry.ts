import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type Material,
} from "three";
import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";
import type {
  FlowFestRuntimePoint,
  FlowFestRuntimeSegment,
} from "../flow-fest-graybox/flow-fest-runtime-contract";
import { buildFlowFestTerrainRibbonGeometry } from "../flow-fest-graybox/flow-fest-review-geometry";
import { sampleFlowFestTerrainWorldY } from "../flow-fest-graybox/flow-fest-terrain-host";
import {
  FLOW_FEST_LOWER_ENTRANCE_APRON,
  FLOW_FEST_LOWER_ENTRANCE_APRON_ID,
  FLOW_FEST_LOWER_ENTRANCE_APPROACH_ID,
  FLOW_FEST_LOWER_GATEHOUSE_SITE,
  FLOW_FEST_PUBLIC_ROAD_SOURCE,
  type FlowFestCampPlan,
} from "./flow-fest-camp-plan";
import {
  FLOW_FEST_ENTRANCE_REFERENCE,
  flowFestEntranceLocalToWorld,
} from "./flow-fest-entrance-reference";

export interface FlowFestEntranceScene {
  group: Group;
  collisionParts: BufferGeometry[];
  collisionVisibleObjectCount: number;
  counts: {
    drivewayAprons: number;
    gatehouses: number;
    fenceRuns: number;
    gateSigns: number;
    utilityPoles: number;
    roadMarkingRibbons: number;
  };
  audit: {
    entranceAnchorErrorMeters: number;
    roadFeatureObjectId: number;
    referenceViewCount: number;
    sourceImageryDate: string;
  };
}

interface WorldPoint {
  x: number;
  z: number;
}

interface FencePlacement extends WorldPoint {
  y: number;
  yaw: number;
  length: number;
}

const WHITE_PAINT = new MeshStandardMaterial({
  color: "#ecebe2",
  roughness: 0.88,
});
const GRAVEL = new MeshStandardMaterial({
  color: "#c9b99c",
  roughness: 1,
  metalness: 0,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

export function buildFlowFestEntranceScene(
  terrain: ImportedTerrainDataV2,
  plan: FlowFestCampPlan
): FlowFestEntranceScene {
  const group = new Group();
  group.name = "FFS_StreetViewEntrance_August2024";
  group.userData.referenceId = FLOW_FEST_ENTRANCE_REFERENCE.referenceId;
  group.userData.sourceImageryDate =
    FLOW_FEST_ENTRANCE_REFERENCE.sourceReference.imageryDate;
  group.userData.referenceImageryStored = false;

  const entrance = plan.landmarks.find(
    (landmark) =>
      landmark.id ===
      FLOW_FEST_ENTRANCE_REFERENCE.coordinateAuthority.entranceLandmarkId
  );
  if (!entrance) {
    throw new Error("Flow Fest entrance scene is missing its camp-plan anchor");
  }
  const anchor = FLOW_FEST_LOWER_GATEHOUSE_SITE;
  const entranceAnchorErrorMeters = Math.hypot(
    entrance.position.x - anchor.x,
    entrance.position.z - anchor.z
  );
  if (entranceAnchorErrorMeters > 0.05) {
    throw new Error(
      `Flow Fest entrance reference drifted ${entranceAnchorErrorMeters.toFixed(3)}m from the shared camp plan`
    );
  }
  if (
    FLOW_FEST_PUBLIC_ROAD_SOURCE.featureObjectId !==
    FLOW_FEST_ENTRANCE_REFERENCE.coordinateAuthority.roadFeatureObjectId
  ) {
    throw new Error("Flow Fest entrance road authority does not match ODOT");
  }

  const collisionParts: BufferGeometry[] = [];
  const driveway = buildDrivewayApron(terrain, plan);
  const roadMarkings = buildRoadMarkings(terrain, plan);
  const gatehouse = buildGatehouse(terrain, collisionParts);
  const fence = buildFence(terrain, collisionParts);
  const gateSign = buildGateSign(terrain);
  const utility = buildUtilityLine(terrain, collisionParts);
  group.add(driveway, roadMarkings, gatehouse, fence, gateSign, utility);

  return {
    group,
    collisionParts,
    collisionVisibleObjectCount: 4,
    counts: {
      drivewayAprons: 1,
      gatehouses: 1,
      fenceRuns: 2,
      gateSigns: 1,
      utilityPoles:
        FLOW_FEST_ENTRANCE_REFERENCE.siteLayout.utility.spanOffsetsMeters
          .length,
      roadMarkingRibbons: 5,
    },
    audit: {
      entranceAnchorErrorMeters,
      roadFeatureObjectId: FLOW_FEST_PUBLIC_ROAD_SOURCE.featureObjectId,
      referenceViewCount: FLOW_FEST_ENTRANCE_REFERENCE.views.length,
      sourceImageryDate:
        FLOW_FEST_ENTRANCE_REFERENCE.sourceReference.imageryDate,
    },
  };
}

function buildDrivewayApron(
  terrain: ImportedTerrainDataV2,
  plan: FlowFestCampPlan
): Mesh {
  const drive = plan.internalDrives.find(
    (candidate) => candidate.id === FLOW_FEST_LOWER_ENTRANCE_APPROACH_ID
  );
  if (!drive) {
    throw new Error("Flow Fest entrance cannot find its private approach");
  }
  const centerline = [
    ...drive.points,
    ...FLOW_FEST_LOWER_ENTRANCE_APRON.slice(1),
  ];
  const approachLength = drive.points.slice(1).reduce((sum, end, index) => {
    const start = drive.points[index]!;
    return sum + Math.hypot(end.x - start.x, end.z - start.z);
  }, 0);

  const slices: Array<{ point: WorldPoint; progress: number }> = [];
  let travelled = 0;
  centerline.slice(1).forEach((end, segmentIndex) => {
    const start = centerline[segmentIndex]!;
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    const steps = Math.max(1, Math.ceil(length / 1.5));
    for (let step = segmentIndex === 0 ? 0 : 1; step <= steps; step += 1) {
      const ratio = step / steps;
      slices.push({
        point: {
          x: start.x + (end.x - start.x) * ratio,
          z: start.z + (end.z - start.z) * ratio,
        },
        progress: travelled + length * ratio,
      });
    }
    travelled += length;
  });

  const drivewayReference = FLOW_FEST_ENTRANCE_REFERENCE.siteLayout.driveway;
  const widthProfile = [
    { progress: 0, halfWidth: drivewayReference.roadHalfWidthMeters },
    {
      progress: approachLength,
      halfWidth: drivewayReference.loopHalfWidthMeters,
    },
    { progress: travelled, halfWidth: drivewayReference.loopHalfWidthMeters },
  ];
  const halfWidthAt = (progress: number): number => {
    const endIndex = widthProfile.findIndex(
      (section) => section.progress >= progress
    );
    if (endIndex <= 0) return widthProfile[0]!.halfWidth;
    const start = widthProfile[endIndex - 1]!;
    const end = widthProfile[endIndex]!;
    const ratio = (progress - start.progress) / (end.progress - start.progress);
    return start.halfWidth + (end.halfWidth - start.halfWidth) * ratio;
  };
  const positions: number[] = [];
  const indices: number[] = [];
  const columns = 12;
  slices.forEach((slice, index) => {
    const previous = slices[Math.max(0, index - 1)]!.point;
    const next = slices[Math.min(slices.length - 1, index + 1)]!.point;
    const tangentX = next.x - previous.x;
    const tangentZ = next.z - previous.z;
    const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
    const normalX = -tangentZ / tangentLength;
    const normalZ = tangentX / tangentLength;
    const halfWidth = halfWidthAt(slice.progress);
    for (let column = 0; column <= columns; column += 1) {
      const offset = -halfWidth + (halfWidth * 2 * column) / columns;
      const point = {
        x: slice.point.x + normalX * offset,
        z: slice.point.z + normalZ * offset,
      };
      positions.push(
        point.x,
        sampleFlowFestTerrainWorldY(terrain, point.x, point.z) + 0.08,
        point.z
      );
    }
    if (index === 0) return;
    const previousRow = (index - 1) * (columns + 1);
    const row = index * (columns + 1);
    for (let column = 0; column < columns; column += 1) {
      const previousLeft = previousRow + column;
      const previousRight = previousLeft + 1;
      const left = row + column;
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
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, GRAVEL.clone());
  mesh.name = "FFS_EntranceDriveway_PaleGravelApron_StreetViewObserved";
  mesh.receiveShadow = true;
  mesh.userData.evidence =
    "imagery-interpreted-centerline; provisional-interior-apron; street-view-observed-proportion";
  mesh.userData.centerlineFeatureId = FLOW_FEST_LOWER_ENTRANCE_APPROACH_ID;
  mesh.userData.apronFeatureId = FLOW_FEST_LOWER_ENTRANCE_APRON_ID;
  return mesh;
}

function buildRoadMarkings(
  terrain: ImportedTerrainDataV2,
  plan: FlowFestCampPlan
): Group {
  const group = new Group();
  group.name = "FFS_EntranceRoadPaint_ODOTAligned";
  const road = plan.publicRoads.find(
    (candidate) => candidate.id === "odot-camden-college-corner-road"
  );
  if (!road) throw new Error("Flow Fest entrance cannot find the ODOT road");

  const markings = [
    {
      id: "roadside-edge",
      offset: road.widthMeters / 2 - 0.22,
      width: 0.12,
      color: "#eeeadd",
      breakAtDriveway: false,
    },
    {
      id: "camp-edge",
      offset: -(road.widthMeters / 2 - 0.22),
      width: 0.12,
      color: "#eeeadd",
      breakAtDriveway: true,
    },
    {
      id: "center-left",
      offset: 0.11,
      width: 0.095,
      color: "#d7ad3f",
      breakAtDriveway: false,
    },
    {
      id: "center-right",
      offset: -0.11,
      width: 0.095,
      color: "#d7ad3f",
      breakAtDriveway: false,
    },
  ];

  for (const marking of markings) {
    const offsetPoints = offsetPolyline(road.points, marking.offset);
    const runs = marking.breakAtDriveway
      ? splitPolylineAroundPoint(
          offsetPoints,
          FLOW_FEST_ENTRANCE_REFERENCE.siteLayout.entranceWorld,
          FLOW_FEST_ENTRANCE_REFERENCE.siteLayout.fence
            .driveGapHalfWidthMeters + 1.1
        )
      : [offsetPoints];
    runs.forEach((points, runIndex) => {
      const segment: FlowFestRuntimeSegment = {
        id: `entrance-road-paint-${marking.id}-${runIndex + 1}`,
        mode: "vehicle",
        widthMeters: marking.width,
        lengthMeters: polylineLength(points),
        sourceClasses: ["street-view-observed-road-marking"],
        pathClass: "official-road-derived-marking",
        points: points.map(
          (point): FlowFestRuntimePoint => ({
            ...point,
            sourceTerrainY: 0,
            reviewTerrainY: 0,
          })
        ),
      };
      const mesh = new Mesh(
        buildFlowFestTerrainRibbonGeometry(terrain, segment, 0.104),
        new MeshStandardMaterial({
          color: marking.color,
          roughness: 0.92,
          metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        })
      );
      mesh.name = `FFS_EntranceRoadPaint_${marking.id}_${runIndex + 1}_ODOTAligned`;
      mesh.receiveShadow = true;
      mesh.userData.roadLabel = FLOW_FEST_PUBLIC_ROAD_SOURCE.label;
      mesh.userData.roadFeatureObjectId =
        FLOW_FEST_PUBLIC_ROAD_SOURCE.featureObjectId;
      group.add(mesh);
    });
  }
  return group;
}

function buildGatehouse(
  terrain: ImportedTerrainDataV2,
  collisionParts: BufferGeometry[]
): Group {
  const layout = FLOW_FEST_ENTRANCE_REFERENCE.siteLayout;
  const spec = layout.gatehouse;
  const center = flowFestEntranceLocalToWorld(spec.localCenter);
  const groundY = sampleFlowFestTerrainWorldY(terrain, center.x, center.z);
  const yaw = Math.atan2(layout.driveInwardUnit.x, layout.driveInwardUnit.z);
  const group = new Group();
  group.name = "FFS_EntranceGatehouse_August2024";
  group.position.set(center.x, groundY, center.z);
  group.rotation.y = yaw;
  group.userData.evidence = spec.sourceConfidence;

  const wall = localBox(
    "FFS_EntranceGatehouse_Walls",
    [spec.widthMeters, spec.wallHeightMeters, spec.depthMeters],
    [0, spec.wallHeightMeters / 2, 0],
    WHITE_PAINT.clone()
  );
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  const roofRise = spec.ridgeHeightMeters - spec.wallHeightMeters;
  const roofHalfDepth = spec.depthMeters / 2 + 0.42;
  const roofAngle = Math.atan2(roofRise, roofHalfDepth);
  const roofSlopeLength = Math.hypot(roofRise, roofHalfDepth);
  const roofMaterial = new MeshStandardMaterial({
    color: "#deddd2",
    roughness: 0.94,
  });
  for (const side of [-1, 1] as const) {
    const roof = localBox(
      `FFS_EntranceGatehouse_Roof_${side < 0 ? "Front" : "Rear"}`,
      [spec.widthMeters + 0.7, 0.16, roofSlopeLength],
      [0, spec.wallHeightMeters + roofRise / 2, side * roofHalfDepth * 0.52],
      roofMaterial.clone()
    );
    roof.rotation.x = side * roofAngle;
    roof.castShadow = true;
    group.add(roof);
  }

  const frontZ = -spec.depthMeters / 2 - 0.052;
  const gableGeometry = new BufferGeometry();
  gableGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        -spec.widthMeters / 2,
        spec.wallHeightMeters,
        frontZ,
        spec.widthMeters / 2,
        spec.wallHeightMeters,
        frontZ,
        0,
        spec.ridgeHeightMeters,
        frontZ,
      ],
      3
    )
  );
  gableGeometry.setIndex([0, 1, 2]);
  gableGeometry.computeVertexNormals();
  const gable = new Mesh(gableGeometry, WHITE_PAINT.clone());
  gable.name = "FFS_EntranceGatehouse_FrontGable";
  group.add(gable);

  const porchDepth = 1.7;
  const porchFrontZ = -spec.depthMeters / 2 - porchDepth / 2;
  const porchSlab = localBox(
    "FFS_EntranceGatehouse_PorchSlab",
    [spec.widthMeters + 0.5, 0.12, porchDepth + 0.35],
    [0, 0.08, porchFrontZ],
    new MeshStandardMaterial({ color: "#b9b09f", roughness: 1 })
  );
  porchSlab.receiveShadow = true;
  const porchRoof = localBox(
    "FFS_EntranceGatehouse_PorchRoof",
    [spec.widthMeters + 0.8, 0.13, porchDepth + 0.55],
    [0, spec.wallHeightMeters - 0.12, porchFrontZ + 0.08],
    roofMaterial.clone()
  );
  porchRoof.rotation.x = -0.08;
  porchRoof.castShadow = true;
  group.add(porchSlab, porchRoof);

  const columnMaterial = WHITE_PAINT.clone();
  for (const x of [-3.55, -0.9, 1.8, 3.55]) {
    const column = new Mesh(
      new CylinderGeometry(0.075, 0.09, 2.42, 8),
      columnMaterial.clone()
    );
    column.name = "FFS_EntranceGatehouse_PorchColumn";
    column.position.set(x, 1.23, -spec.depthMeters / 2 - porchDepth + 0.18);
    column.castShadow = true;
    group.add(column);
  }

  const frontageZ = -spec.depthMeters / 2 - 0.035;
  const windowMaterial = new MeshStandardMaterial({
    color: "#263235",
    roughness: 0.22,
    metalness: 0.05,
  });
  for (const x of [-2.4, -0.65]) {
    const window = localBox(
      "FFS_EntranceGatehouse_FrontWindow",
      [1.35, 1.02, 0.08],
      [x, 1.38, frontageZ],
      windowMaterial.clone()
    );
    group.add(window);
  }
  const door = localBox(
    "FFS_EntranceGatehouse_FrontDoor",
    [0.95, 2.05, 0.09],
    [1.0, 1.05, frontageZ - 0.01],
    new MeshStandardMaterial({ color: "#d8d5c7", roughness: 0.8 })
  );
  const doorWindow = localBox(
    "FFS_EntranceGatehouse_DoorWindow",
    [0.63, 0.68, 0.04],
    [1.0, 1.55, frontageZ - 0.07],
    windowMaterial.clone()
  );
  group.add(door, doorWindow);

  const fascia = localBox(
    "FFS_EntranceGatehouse_PlainFascia",
    [spec.widthMeters + 0.18, 0.2, 0.12],
    [0, spec.wallHeightMeters + 0.04, frontageZ - 0.03],
    WHITE_PAINT.clone()
  );
  group.add(fascia);

  const machineX = -spec.widthMeters / 2 + 0.78;
  const machine = localBox(
    "FFS_EntranceGatehouse_CocaColaMachine",
    [0.88, 2.02, 0.68],
    [machineX, 1.03, frontageZ - 0.38],
    new MeshStandardMaterial({ color: "#b71f27", roughness: 0.46 })
  );
  const machineFace = localBox(
    "FFS_EntranceGatehouse_CocaColaMachineFace",
    [0.68, 1.65, 0.035],
    [machineX, 1.12, frontageZ - 0.735],
    new MeshStandardMaterial({ color: "#8d1118", roughness: 0.35 })
  );
  const machineMark = new Mesh(
    new CircleGeometry(0.24, 24),
    new MeshBasicMaterial({ color: "#f6eee4", side: DoubleSide })
  );
  machineMark.name = "FFS_EntranceGatehouse_CocaColaMachineMark";
  machineMark.position.set(machineX, 1.35, frontageZ - 0.76);
  group.add(machine, machineFace, machineMark);

  group.updateMatrixWorld(true);
  collisionParts.push(wall.geometry.clone().applyMatrix4(wall.matrixWorld));
  return group;
}

function buildFence(
  terrain: ImportedTerrainDataV2,
  collisionParts: BufferGeometry[]
): Group {
  const { entranceWorld, driveInwardUnit, roadTangentUnit, fence } =
    FLOW_FEST_ENTRANCE_REFERENCE.siteLayout;
  const baseline = {
    x: entranceWorld.x + driveInwardUnit.x * fence.inwardOffsetMeters,
    z: entranceWorld.z + driveInwardUnit.z * fence.inwardOffsetMeters,
  };
  const ranges: Array<{ id: string; start: number; end: number }> = [
    {
      id: "left",
      start: -fence.driveGapHalfWidthMeters - fence.leftRunMeters,
      end: -fence.driveGapHalfWidthMeters,
    },
    {
      id: "right",
      start: fence.driveGapHalfWidthMeters,
      end: fence.driveGapHalfWidthMeters + fence.rightRunMeters,
    },
  ];
  const group = new Group();
  group.name = "FFS_EntranceFence_WhiteThreeRail_StreetViewObserved";
  const postGeometry = new BoxGeometry(0.14, 1.48, 0.14);
  const railGeometry = new BoxGeometry(0.085, 0.095, 1);
  const postPlacements: FencePlacement[] = [];
  const railPlacements: FencePlacement[] = [];
  const yaw = Math.atan2(roadTangentUnit.x, roadTangentUnit.z);

  for (const range of ranges) {
    const length = range.end - range.start;
    const segmentCount = Math.max(
      1,
      Math.ceil(length / fence.postSpacingMeters)
    );
    const spacing = length / segmentCount;
    for (let index = 0; index <= segmentCount; index += 1) {
      const distance = range.start + spacing * index;
      const point = alongRoad(baseline, distance);
      postPlacements.push({
        ...point,
        y: sampleFlowFestTerrainWorldY(terrain, point.x, point.z),
        yaw,
        length: 1,
      });
      if (index === segmentCount) continue;
      const nextDistance = distance + spacing;
      const midpoint = alongRoad(baseline, (distance + nextDistance) / 2);
      for (const railHeight of [0.42, 0.84, 1.25]) {
        railPlacements.push({
          ...midpoint,
          y:
            sampleFlowFestTerrainWorldY(terrain, midpoint.x, midpoint.z) +
            railHeight,
          yaw,
          length: spacing + 0.08,
        });
      }
    }

    const midpointDistance = (range.start + range.end) / 2;
    const midpoint = alongRoad(baseline, midpointDistance);
    const collider = new Mesh(new BoxGeometry(0.18, 1.4, length));
    collider.position.set(
      midpoint.x,
      sampleFlowFestTerrainWorldY(terrain, midpoint.x, midpoint.z) + 0.72,
      midpoint.z
    );
    collider.rotation.y = yaw;
    collider.updateMatrix();
    collisionParts.push(
      collider.geometry.clone().applyMatrix4(collider.matrix)
    );
    collider.geometry.dispose();
  }

  const posts = createInstances(
    postGeometry,
    WHITE_PAINT.clone(),
    postPlacements,
    (placement, object) => {
      object.position.set(placement.x, placement.y + 0.74, placement.z);
      object.rotation.y = placement.yaw;
    }
  );
  posts.name = "FFS_EntranceFence_Posts";
  posts.castShadow = true;
  const rails = createInstances(
    railGeometry,
    WHITE_PAINT.clone(),
    railPlacements,
    (placement, object) => {
      object.position.set(placement.x, placement.y, placement.z);
      object.rotation.y = placement.yaw;
      object.scale.z = placement.length;
    }
  );
  rails.name = "FFS_EntranceFence_ThreeRails";
  rails.castShadow = true;
  group.add(posts, rails);
  return group;
}

function buildGateSign(terrain: ImportedTerrainDataV2): Group {
  const signSpec = FLOW_FEST_ENTRANCE_REFERENCE.siteLayout.gateSign;
  const point = flowFestEntranceLocalToWorld(signSpec.localCenter);
  const groundY = sampleFlowFestTerrainWorldY(terrain, point.x, point.z);
  const yaw = Math.atan2(
    FLOW_FEST_ENTRANCE_REFERENCE.siteLayout.driveInwardUnit.x,
    FLOW_FEST_ENTRANCE_REFERENCE.siteLayout.driveInwardUnit.z
  );
  const group = new Group();
  group.name = "FFS_EntranceGateSign_StreetViewObserved";
  group.position.set(point.x, groundY, point.z);
  group.rotation.y = yaw;
  for (const x of [-0.48, 0.48]) {
    const post = new Mesh(
      new CylinderGeometry(0.045, 0.06, 0.88, 7),
      new MeshStandardMaterial({ color: "#5c4a35", roughness: 1 })
    );
    post.position.set(x, 0.44, 0);
    group.add(post);
  }
  const board = createLabelPlane(
    "FFS_EntranceGateSign_Board",
    signSpec.label,
    1.38,
    0.62,
    "#e8e5d9",
    "#28362c"
  );
  board.position.set(0, 0.78, -0.05);
  board.rotation.y = Math.PI;
  group.add(board);
  return group;
}

function buildUtilityLine(
  terrain: ImportedTerrainDataV2,
  collisionParts: BufferGeometry[]
): Group {
  const { entranceWorld, driveInwardUnit, roadTangentUnit, utility } =
    FLOW_FEST_ENTRANCE_REFERENCE.siteLayout;
  const group = new Group();
  group.name = "FFS_EntranceUtilityLine_StreetViewObserved";
  const poleMaterial = new MeshStandardMaterial({
    color: "#66533d",
    roughness: 1,
  });
  const polePositions = utility.spanOffsetsMeters.map((offset) => {
    const point = {
      x:
        entranceWorld.x +
        roadTangentUnit.x * offset +
        driveInwardUnit.x * utility.inwardOffsetMeters,
      z:
        entranceWorld.z +
        roadTangentUnit.z * offset +
        driveInwardUnit.z * utility.inwardOffsetMeters,
    };
    return {
      ...point,
      y: sampleFlowFestTerrainWorldY(terrain, point.x, point.z),
    };
  });

  polePositions.forEach((position, index) => {
    const pole = new Mesh(
      new CylinderGeometry(0.15, 0.22, utility.poleHeightMeters, 9),
      poleMaterial.clone()
    );
    pole.name = `FFS_EntranceUtilityPole_${index + 1}`;
    pole.position.set(
      position.x,
      position.y + utility.poleHeightMeters / 2,
      position.z
    );
    pole.castShadow = true;
    const crossarm = new Mesh(
      new BoxGeometry(2.2, 0.13, 0.16),
      poleMaterial.clone()
    );
    crossarm.name = `FFS_EntranceUtilityCrossarm_${index + 1}`;
    crossarm.position.set(
      position.x,
      position.y + utility.poleHeightMeters - 0.55,
      position.z
    );
    crossarm.rotation.y = Math.atan2(roadTangentUnit.x, roadTangentUnit.z);
    crossarm.castShadow = true;
    group.add(pole, crossarm);
    if (index === 1) {
      pole.updateMatrix();
      collisionParts.push(pole.geometry.clone().applyMatrix4(pole.matrix));
    }
  });

  const wireNormal = { x: -roadTangentUnit.z, z: roadTangentUnit.x };
  for (const lateral of [-0.48, 0.48]) {
    const material = new MeshBasicMaterial({ color: "#242422" });
    for (let span = 1; span < polePositions.length; span += 1) {
      const start = polePositions[span - 1]!;
      const end = polePositions[span]!;
      const startY = start.y + utility.poleHeightMeters - 0.38;
      const endY = end.y + utility.poleHeightMeters - 0.38;
      const curve = new CatmullRomCurve3([
        new Vector3(
          start.x + wireNormal.x * lateral,
          startY,
          start.z + wireNormal.z * lateral
        ),
        new Vector3(
          (start.x + end.x) / 2 + wireNormal.x * lateral,
          (startY + endY) / 2 - 0.72,
          (start.z + end.z) / 2 + wireNormal.z * lateral
        ),
        new Vector3(
          end.x + wireNormal.x * lateral,
          endY,
          end.z + wireNormal.z * lateral
        ),
      ]);
      const wire = new Mesh(
        new TubeGeometry(curve, 12, 0.025, 5, false),
        material
      );
      wire.name = `FFS_EntranceOverheadWire_${lateral}_${span}`;
      group.add(wire);
    }
  }
  return group;
}

function alongRoad(origin: WorldPoint, distance: number): WorldPoint {
  const tangent = FLOW_FEST_ENTRANCE_REFERENCE.siteLayout.roadTangentUnit;
  return {
    x: origin.x + tangent.x * distance,
    z: origin.z + tangent.z * distance,
  };
}

function offsetPolyline(points: WorldPoint[], offset: number): WorldPoint[] {
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    return {
      x: point.x + (-dz / length) * offset,
      z: point.z + (dx / length) * offset,
    };
  });
}

function splitPolylineAroundPoint(
  points: WorldPoint[],
  point: WorldPoint,
  gapHalfLength: number
): WorldPoint[][] {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(
      distances[index - 1]! +
        Math.hypot(
          points[index]!.x - points[index - 1]!.x,
          points[index]!.z - points[index - 1]!.z
        )
    );
  }
  let nearestDistance = 0;
  let nearestError = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    const ratio =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - start.x) * dx + (point.z - start.z) * dz) /
                lengthSquared
            )
          );
    const projected = { x: start.x + dx * ratio, z: start.z + dz * ratio };
    const error = Math.hypot(point.x - projected.x, point.z - projected.z);
    if (error >= nearestError) continue;
    nearestError = error;
    nearestDistance = distances[index - 1]! + Math.hypot(dx, dz) * ratio;
  }
  const total = distances.at(-1) ?? 0;
  const gapStart = Math.max(0, nearestDistance - gapHalfLength);
  const gapEnd = Math.min(total, nearestDistance + gapHalfLength);
  return [
    slicePolylineAtDistances(points, distances, 0, gapStart),
    slicePolylineAtDistances(points, distances, gapEnd, total),
  ].filter((run) => run.length >= 2);
}

function slicePolylineAtDistances(
  points: WorldPoint[],
  distances: number[],
  startDistance: number,
  endDistance: number
): WorldPoint[] {
  const sampledStart = samplePolylineAtDistance(
    points,
    distances,
    startDistance
  );
  const sampledEnd = samplePolylineAtDistance(points, distances, endDistance);
  const interior = points.filter(
    (_point, index) =>
      distances[index]! > startDistance && distances[index]! < endDistance
  );
  return [sampledStart, ...interior, sampledEnd];
}

function samplePolylineAtDistance(
  points: WorldPoint[],
  distances: number[],
  target: number
): WorldPoint {
  for (let index = 1; index < distances.length; index += 1) {
    if (distances[index]! < target) continue;
    const startDistance = distances[index - 1]!;
    const span = distances[index]! - startDistance;
    const ratio = span === 0 ? 0 : (target - startDistance) / span;
    return {
      x:
        points[index - 1]!.x +
        (points[index]!.x - points[index - 1]!.x) * ratio,
      z:
        points[index - 1]!.z +
        (points[index]!.z - points[index - 1]!.z) * ratio,
    };
  }
  return { ...points.at(-1)! };
}

function polylineLength(points: WorldPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.z - points[index - 1]!.z
    );
  }
  return length;
}

function localBox(
  name: string,
  dimensions: [number, number, number],
  position: [number, number, number],
  material: Material
): Mesh {
  const mesh = new Mesh(new BoxGeometry(...dimensions), material);
  mesh.name = name;
  mesh.position.set(...position);
  return mesh;
}

function createInstances<T>(
  geometry: BufferGeometry,
  material: Material,
  placements: T[],
  place: (placement: T, object: Object3D) => void
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
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = true;
  return mesh;
}

function createLabelPlane(
  name: string,
  label: string,
  width: number,
  height: number,
  background: string,
  foreground: string
): Mesh {
  const geometry = new BoxGeometry(width, height, 0.035);
  const fallback = new MeshBasicMaterial({ color: background });
  if (typeof document === "undefined") {
    const mesh = new Mesh(geometry, fallback);
    mesh.name = name;
    return mesh;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = Math.max(160, Math.round((768 * height) / width));
  const context = canvas.getContext("2d");
  if (
    !context ||
    typeof context.fillRect !== "function" ||
    typeof context.fillText !== "function"
  ) {
    const mesh = new Mesh(geometry, fallback);
    mesh.name = name;
    return mesh;
  }
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = foreground;
  context.font = `700 ${Math.round(canvas.height * 0.38)}px Georgia, serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    label,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width * 0.9
  );
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  const material = new MeshBasicMaterial({
    color: new Color("#ffffff"),
    map: texture,
  });
  fallback.dispose();
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}
