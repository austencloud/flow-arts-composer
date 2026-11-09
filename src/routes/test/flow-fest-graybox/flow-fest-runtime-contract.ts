export type FlowFestBranchId = "lower-tent" | "upper-tent" | "car-camp";

export interface FlowFestRuntimePoint {
  x: number;
  z: number;
  sourceTerrainY: number;
  reviewTerrainY: number;
}

export interface FlowFestRuntimeSegment {
  id: string;
  mode: "person" | "vehicle";
  widthMeters: number;
  lengthMeters: number;
  nominalSpeedMetersPerSecond?: number | null;
  nominalDurationSeconds?: number | null;
  sourceClasses: string[];
  pathClass: string;
  points: FlowFestRuntimePoint[];
}

export interface FlowFestArrivalBranch {
  label: string;
  vehicleOutcome: "relocated-to-west-upper-parking" | "stays-at-campsite";
  segments: FlowFestRuntimeSegment[];
}

export interface FlowFestReviewCamera {
  id: string;
  label: string;
  horizontalFovDegrees: number;
  positionWorld: [number, number, number];
  targetWorld: [number, number, number];
  /**
   * Arrive standing on the terrain under the camera instead of at its height.
   * Shared view links set this; registered review frames keep their exact eye.
   */
  standOnGround?: boolean;
}

export interface FlowFestRuntimeZone {
  id: string;
  label: string;
  class: "invention" | "interpreted";
  shape: "circle" | "surface-open-region";
  center: FlowFestRuntimePoint;
  radiusMeters?: number;
  searchRadiusXMeters?: number;
  searchRadiusZMeters?: number;
}

export interface FlowFestRuntimeAnchor {
  id: string;
  label: string;
  sourceClass: string;
  placeholderKind: string;
  positionWorld: [number, number, number];
}

export interface FlowFestRuntimeContract {
  schemaVersion: 1;
  sceneId: "flow-fest-sim-earth";
  gateId: "playable-graybox";
  coordinateContentFingerprint: {
    algorithm: "sha256";
    canonicalPayloadSha256: string;
  };
  sourceAuthority: {
    inputs: Array<{ path: string; sha256: string }>;
  };
  runtimeWorldFrame: {
    units: "meter";
    metersPerUnit: 1;
    handedness: "right";
    axes: { x: "east"; y: "up"; z: "south" };
  };
  surfaceEvidenceProxy: {
    strideSamples: number;
    thresholdMetersAboveDtm: number;
    activeBoundsWorldMeters: {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    };
  };
  routes: {
    arrivalBranches: Record<FlowFestBranchId, FlowFestArrivalBranch>;
    nightReturnBranches: Record<FlowFestBranchId, FlowFestRuntimeSegment>;
  };
  connectorTraces: {
    upperClearingToMiddleEarth: { vertices: FlowFestRuntimePoint[] };
    middleEarthToLowerClearing: { vertices: FlowFestRuntimePoint[] };
  };
  spawn: {
    anchorId: "lower-gate-spawn";
    positionWorld: [number, number, number];
    eyeHeightMeters: number;
  };
  reviewCameras: FlowFestReviewCamera[];
  zones: FlowFestRuntimeZone[];
  anchors: FlowFestRuntimeAnchor[];
  firstPersonReview: {
    eyeHeightMeters: number;
    points: FlowFestRuntimePoint[];
  };
  nodePolicy: {
    runtimeTopologyBarrierPolicy: {
      allowedPrefix: "FFS_Barrier_LidarProxy_";
      sourceClass: "interpreted-gameplay-from-measured-surface";
      visibleColliderIdentityRequired: true;
    };
  };
}

export function horizontalToVerticalFovDegrees(
  horizontalFovDegrees: number,
  aspect: number
): number {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new Error("Flow Fest camera aspect must be positive");
  }
  return (
    (2 *
      Math.atan(Math.tan((horizontalFovDegrees * Math.PI) / 360) / aspect) *
      180) /
    Math.PI
  );
}

export function verticalToHorizontalFovDegrees(
  verticalFovDegrees: number,
  aspect: number
): number {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new Error("Flow Fest camera aspect must be positive");
  }
  return (
    (2 *
      Math.atan(Math.tan((verticalFovDegrees * Math.PI) / 360) * aspect) *
      180) /
    Math.PI
  );
}

const REQUIRED_INPUT_HASHES = new Map([
  [
    "static/data/flow-fest-sim/terrain.manifest.json",
    "22bb16b5ed1585bd7eeb15b42d71b8577ed5b8ce5955ed9d01e66b727bb9af46",
  ],
  [
    "docs/superpowers/specs/flow-fest-sim/flow-fest-site-plan.json",
    "e4408ef29ff201f2c244d25e888a274905150880d58ff158493e8e1891eb4070",
  ],
  [
    "docs/superpowers/specs/flow-fest-sim/austen-traced-connectors.json",
    "af4d263c7a4cd063d156531a974245dd714281c82c0eceaf04903358a5e58e62",
  ],
  [
    "static/data/flow-fest-sim/terrain-height.f32",
    "d56f912d24c644156f088b95240c02cb76c1e4548b2990ccd7dd80f0f6eecafd",
  ],
]);

const BRANCH_IDS: FlowFestBranchId[] = ["lower-tent", "upper-tent", "car-camp"];

export async function loadFlowFestRuntimeContract(
  request: typeof fetch = fetch
): Promise<FlowFestRuntimeContract> {
  const response = await request(
    "/data/flow-fest-sim/gate2-runtime-contract.json"
  );
  if (!response.ok) {
    throw new Error(
      `Flow Fest Gate 2 contract failed to load (${response.status})`
    );
  }
  return parseFlowFestRuntimeContract(await response.json());
}

export function parseFlowFestRuntimeContract(
  value: unknown
): FlowFestRuntimeContract {
  const contract = value as FlowFestRuntimeContract;
  if (
    !contract ||
    contract.schemaVersion !== 1 ||
    contract.sceneId !== "flow-fest-sim-earth" ||
    contract.gateId !== "playable-graybox"
  ) {
    throw new Error("Flow Fest Gate 2 contract identity is invalid");
  }
  const frame = contract.runtimeWorldFrame;
  if (
    frame?.units !== "meter" ||
    frame.metersPerUnit !== 1 ||
    frame.handedness !== "right" ||
    frame.axes?.x !== "east" ||
    frame.axes?.y !== "up" ||
    frame.axes?.z !== "south"
  ) {
    throw new Error(
      "Flow Fest Gate 2 world frame drifted from the terrain frame"
    );
  }

  const inputs = new Map(
    contract.sourceAuthority?.inputs?.map((input) => [input.path, input.sha256])
  );
  for (const [path, sha256] of REQUIRED_INPUT_HASHES) {
    if (inputs.get(path) !== sha256) {
      throw new Error(`Flow Fest Gate 2 source lock mismatch for ${path}`);
    }
  }

  if (
    contract.connectorTraces?.upperClearingToMiddleEarth?.vertices?.length !==
      13 ||
    contract.connectorTraces?.middleEarthToLowerClearing?.vertices?.length !==
      14
  ) {
    throw new Error("Flow Fest Gate 2 connector trace vertex count is invalid");
  }
  const upperEntry =
    contract.connectorTraces.upperClearingToMiddleEarth.vertices.at(-1);
  const lowerEntry =
    contract.connectorTraces.middleEarthToLowerClearing.vertices[0];
  if (
    upperEntry?.x !== 99.2 ||
    upperEntry.z !== -113.4 ||
    lowerEntry?.x !== 102.5 ||
    lowerEntry.z !== -113.8
  ) {
    throw new Error("Flow Fest Gate 2 collapsed the two Middle Earth entries");
  }

  for (const branchId of BRANCH_IDS) {
    const arrival = contract.routes?.arrivalBranches?.[branchId];
    const nightReturn = contract.routes?.nightReturnBranches?.[branchId];
    if (!arrival?.segments?.length || !nightReturn?.points?.length) {
      throw new Error(`Flow Fest Gate 2 branch ${branchId} is incomplete`);
    }
    for (const segment of [...arrival.segments, nightReturn]) {
      if (segment.mode === "person") {
        if (segment.nominalSpeedMetersPerSecond !== 1.2) {
          throw new Error(
            `Flow Fest Gate 2 walking speed drifted on ${segment.id}`
          );
        }
      } else if (
        segment.nominalSpeedMetersPerSecond != null ||
        segment.nominalDurationSeconds != null
      ) {
        throw new Error(
          `Flow Fest Gate 2 invents an unapproved vehicle speed on ${segment.id}`
        );
      }
    }
  }

  const lowerGate = contract.zones?.find(
    (zone) => zone.id === "lower-gate-zone"
  );
  if (
    !lowerGate ||
    contract.spawn?.positionWorld?.[0] !== lowerGate.center.x ||
    contract.spawn.positionWorld[2] !== lowerGate.center.z ||
    contract.spawn.eyeHeightMeters !== 1.7 ||
    contract.reviewCameras?.length !== 5 ||
    contract.zones?.length !== 7 ||
    contract.anchors?.length !== 7
  ) {
    throw new Error(
      "Flow Fest Gate 2 spawn, camera, zone, or anchor set drifted"
    );
  }
  if (
    contract.nodePolicy?.runtimeTopologyBarrierPolicy
      ?.visibleColliderIdentityRequired !== true ||
    contract.nodePolicy.runtimeTopologyBarrierPolicy.allowedPrefix !==
      "FFS_Barrier_LidarProxy_"
  ) {
    throw new Error("Flow Fest Gate 2 runtime barrier policy is missing");
  }

  return contract;
}

export function allFlowFestSegments(
  contract: FlowFestRuntimeContract
): FlowFestRuntimeSegment[] {
  return BRANCH_IDS.flatMap((branchId) => [
    ...contract.routes.arrivalBranches[branchId].segments,
    contract.routes.nightReturnBranches[branchId],
  ]);
}
