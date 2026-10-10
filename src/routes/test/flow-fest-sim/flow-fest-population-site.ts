/**
 * Binds the registered Flow Fest geometry to the population layer.
 *
 * This is the only place the population touches site coordinates, and it never
 * authors one. Corridors come from the Gate 2 person-route legs and the camp
 * plan's traced foot connectors. Envelopes come from the registered zones. The
 * fire anchor comes from the already-derived festival community layout, so the
 * fire circle keeps a single owner.
 */

import {
  buildFlowFestCorridorGraph,
  isInsideFlowFestClearing,
  type FlowFestCorridorClearing,
  type FlowFestCorridorLeg,
  type FlowFestCorridorPoint,
} from "#lib/features/flow-fest-sim/domain/flow-fest-corridor-graph.js";
import type {
  FlowFestAnchorKind,
  FlowFestPopulationAnchor,
  FlowFestPopulationSite,
} from "#lib/features/flow-fest-sim/domain/flow-fest-population.js";
import { FLOW_FEST_MASTER_SEED } from "#lib/features/flow-fest-sim/domain/flow-fest-simulation-contract.js";
import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";
import type {
  FlowFestBranchId,
  FlowFestRuntimeContract,
} from "../flow-fest-graybox/flow-fest-runtime-contract";
import { sampleFlowFestTerrainWorldY } from "../flow-fest-graybox/flow-fest-terrain-host";
import type { FlowFestCampPlan } from "./flow-fest-camp-plan";

const BRANCH_IDS: FlowFestBranchId[] = ["lower-tent", "upper-tent", "car-camp"];

/**
 * Openness measured by the Gate 1 surface-evidence pass, transcribed from
 * `flow-fest-sim-production-contract.md`. A zone only earns open-field wander
 * when the survey actually measured it open; the rest hold people in place,
 * which is the truthful reading of a 69.7 percent circle.
 */
const ZONE_OPENNESS: Record<
  string,
  { measuredOpenFraction: number; measured: boolean; note: string }
> = {
  "middle-earth-zone": {
    measuredOpenFraction: 0.993,
    measured: true,
    note: "Middle Earth envelope measured 99.3 percent open.",
  },
  "night-heart-zone": {
    measuredOpenFraction: 0.993,
    measured: true,
    note: "Contained inside the Middle Earth envelope that measured 99.3 percent open.",
  },
  "car-camp-zone": {
    measuredOpenFraction: 1,
    measured: true,
    note: "Car-camping open middle measured 100.0 percent open.",
  },
  "lower-tent-zone": {
    measuredOpenFraction: 0.826,
    measured: false,
    note: "Lower-tent perimeter example circle measured 82.6 percent open; partly treed.",
  },
  "lower-gate-zone": {
    measuredOpenFraction: 0.697,
    measured: false,
    note: "Lower gate circle measured 69.7 percent open; partly treed.",
  },
};

const ANCHOR_KIND_BY_ZONE: Record<string, FlowFestAnchorKind> = {
  "lower-gate-zone": "gate",
  "lower-tent-zone": "camp",
  "upper-tent-zone": "camp",
  "car-camp-zone": "camp",
  "west-upper-parking-zone": "parking",
  "middle-earth-zone": "gathering",
  "night-heart-zone": "gathering",
};

function zoneRadii(zone: FlowFestCampPlan["zones"][number]): {
  radiusXMeters: number;
  radiusZMeters: number;
} {
  return {
    radiusXMeters: zone.radiusXMeters,
    radiusZMeters: zone.radiusZMeters,
  };
}

function personLegs(
  contract: FlowFestRuntimeContract,
  plan: FlowFestCampPlan
): FlowFestCorridorLeg[] {
  const legs: FlowFestCorridorLeg[] = [];
  for (const branchId of BRANCH_IDS) {
    const branch = contract.routes.arrivalBranches[branchId];
    const nightReturn = contract.routes.nightReturnBranches[branchId];
    for (const segment of [...branch.segments, nightReturn]) {
      if (segment.mode !== "person") continue;
      // Leg ids repeat across branches with different geometry, so the graph
      // namespaces them rather than silently merging two different walks.
      legs.push({
        id: `${branchId}:${segment.id}`,
        widthMeters: segment.widthMeters,
        points: segment.points.map((point) => ({ x: point.x, z: point.z })),
      });
    }
  }
  for (const connector of plan.footConnectors) {
    legs.push({
      id: `plan:${connector.id}`,
      widthMeters: connector.widthMeters,
      points: connector.points.map((point) => ({ x: point.x, z: point.z })),
    });
  }
  return legs;
}

function clearings(plan: FlowFestCampPlan): FlowFestCorridorClearing[] {
  return plan.zones.map((zone) => {
    const openness = ZONE_OPENNESS[zone.id];
    const radii = zoneRadii(zone);
    return {
      id: zone.id,
      center: { x: zone.center.x, z: zone.center.z },
      radiusXMeters: radii.radiusXMeters,
      radiusZMeters: radii.radiusZMeters,
      measuredOpenFraction: openness?.measuredOpenFraction ?? 0,
      wanderPolicy: openness?.measured ? "measured-open" : "authored-ambient",
    } satisfies FlowFestCorridorClearing;
  });
}

/** Distinct registered leg vertices inside a clearing, spread out. */
function spreadVerticesInside(
  legs: FlowFestCorridorLeg[],
  clearing: FlowFestCorridorClearing,
  minimumSpacingMeters: number,
  exclude: ReadonlyArray<FlowFestCorridorPoint>,
  exclusionRadiusMeters: number,
  limit: number
): FlowFestCorridorPoint[] {
  const picked: FlowFestCorridorPoint[] = [];
  for (const leg of legs) {
    for (const point of leg.points) {
      if (picked.length >= limit) return picked;
      if (!isInsideFlowFestClearing(clearing, point.x, point.z, 3)) continue;
      if (
        exclude.some(
          (other) =>
            Math.hypot(other.x - point.x, other.z - point.z) <
            exclusionRadiusMeters
        )
      ) {
        continue;
      }
      if (
        picked.some(
          (other) =>
            Math.hypot(other.x - point.x, other.z - point.z) <
            minimumSpacingMeters
        )
      ) {
        continue;
      }
      picked.push({ x: point.x, z: point.z });
    }
  }
  return picked;
}

export interface FlowFestPopulationSiteInput {
  contract: FlowFestRuntimeContract;
  plan: FlowFestCampPlan;
  branch: FlowFestBranchId;
  /** Fire circle and LED circle, taken from the derived community layout. */
  fireCenter: FlowFestCorridorPoint;
  ledCircleCenter: FlowFestCorridorPoint;
  groundY: (x: number, z: number) => number;
}

/** Ground sampler for the running scene. */
export function flowFestTerrainGroundY(
  terrain: ImportedTerrainDataV2
): (x: number, z: number) => number {
  return (x, z) => sampleFlowFestTerrainWorldY(terrain, x, z);
}

export interface FlowFestPopulationSiteReport {
  legCount: number;
  clearingCount: number;
  nodeCount: number;
  edgeCount: number;
  anchorCount: number;
  unroutableAnchorIds: string[];
  measuredOpenClearingIds: string[];
}

export function createFlowFestPopulationSite(
  input: FlowFestPopulationSiteInput
): { site: FlowFestPopulationSite; report: FlowFestPopulationSiteReport } {
  const legs = personLegs(input.contract, input.plan);
  const clearingList = clearings(input.plan);

  const anchorInputs: Array<{
    id: string;
    label: string;
    kind: FlowFestAnchorKind;
    x: number;
    z: number;
  }> = [];

  for (const zone of input.plan.zones) {
    const kind = ANCHOR_KIND_BY_ZONE[zone.id];
    if (!kind) continue;
    // The night heart and Middle Earth share a centre; one gathering anchor is
    // enough, and the fire anchor below owns the circle itself.
    if (zone.id === "night-heart-zone") continue;
    anchorInputs.push({
      id: `zone:${zone.id}`,
      label: zone.label,
      kind,
      x: zone.center.x,
      z: zone.center.z,
    });
  }

  const fire = {
    id: "fire:night-heart",
    label: "Fire circle",
    kind: "fire" as const,
    x: input.fireCenter.x,
    z: input.fireCenter.z,
  };
  anchorInputs.push(fire);

  const middleEarth = clearingList.find(
    (clearing) => clearing.id === "middle-earth-zone"
  );
  if (middleEarth) {
    const practicePoints = spreadVerticesInside(
      legs,
      middleEarth,
      16,
      [
        { x: fire.x, z: fire.z },
        { x: input.ledCircleCenter.x, z: input.ledCircleCenter.z },
      ],
      12,
      3
    );
    practicePoints.forEach((point, index) => {
      anchorInputs.push({
        id: `practice:middle-earth-${index}`,
        label: `Middle Earth practice spot ${index + 1}`,
        kind: "practice",
        x: point.x,
        z: point.z,
      });
    });
  }

  const graph = buildFlowFestCorridorGraph({
    legs,
    clearings: clearingList,
    anchors: anchorInputs.map((anchor) => ({
      id: anchor.id,
      x: anchor.x,
      z: anchor.z,
    })),
  });

  const anchors: FlowFestPopulationAnchor[] = anchorInputs.map((anchor) => {
    const nodeIndex = graph.anchorNodeByeId.get(anchor.id)!;
    const clearingIndex = clearingList.findIndex((clearing) =>
      isInsideFlowFestClearing(clearing, anchor.x, anchor.z)
    );
    return {
      id: anchor.id,
      label: anchor.label,
      kind: anchor.kind,
      x: anchor.x,
      z: anchor.z,
      clearingIndex,
      routable: (graph.adjacency[nodeIndex]?.length ?? 0) > 0,
    };
  });

  const site: FlowFestPopulationSite = {
    seed: `${FLOW_FEST_MASTER_SEED}:population:${input.branch}`,
    graph,
    anchors,
    fireAnchorId: fire.id,
    groundY: input.groundY,
  };

  return {
    site,
    report: {
      legCount: legs.length,
      clearingCount: clearingList.length,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      anchorCount: anchors.length,
      unroutableAnchorIds: anchors
        .filter((anchor) => !anchor.routable)
        .map((anchor) => anchor.id),
      measuredOpenClearingIds: clearingList
        .filter((clearing) => clearing.wanderPolicy === "measured-open")
        .map((clearing) => clearing.id),
    },
  };
}

/** Camp anchors people may call home, in a stable order. */
export function flowFestHomeAnchorIds(
  site: FlowFestPopulationSite
): string[] {
  return site.anchors
    .filter((anchor) => anchor.kind === "camp")
    .map((anchor) => anchor.id);
}
