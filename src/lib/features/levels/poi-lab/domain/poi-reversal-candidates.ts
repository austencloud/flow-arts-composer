import {
  norm,
  type PositionValue,
} from "#lib/shared/notation/qft/qft-model.js";
import {
  trajectoryPropIndexAt,
  trajectoryReversals,
  type QftPropRateProfile,
  type QftTrajectory,
} from "#lib/shared/notation/qft/qft-trajectory.js";

export type PoiReversalVerdict = "legal" | "illegal" | "unsure";
export type PoiReversalCalibration = "pendulum" | "extendulum";

export interface PoiReversalCandidate {
  id: string;
  trajectory: QftTrajectory;
  reversalStep: PositionValue;
  reversalPropPosition: PositionValue;
  calibration?: PoiReversalCalibration;
}

export interface PoiReversalLabel {
  candidate: PoiReversalCandidate;
  verdict: PoiReversalVerdict;
}

export type PoiCandidateSelectionReason =
  | "calibration-pendulum"
  | "calibration-extendulum"
  | "coverage"
  | "boundary"
  | "repeat";

export interface PoiCandidateSelection {
  candidate: PoiReversalCandidate;
  reason: PoiCandidateSelectionReason;
}

const RADII = [0, 0.5, 1] as const;
const DIRECTIONS = [1, -1] as const;
const POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function wrapStep(step: number): number {
  return ((step % 8) + 8) % 8;
}

function profileForReversalStep(reversalStepIndex: number): QftPropRateProfile {
  return Array.from({ length: 8 }, (_, stepIndex) =>
    wrapStep(stepIndex - reversalStepIndex) < 4 ? 1 : -1
  ) as unknown as QftPropRateProfile;
}

function radiusToken(radius: number): string {
  if (radius === 0.5) return "05";
  return String(radius);
}

function candidateId(
  radius: number,
  handDirection: 1 | -1,
  reversalStepIndex: number,
  propPosition: PositionValue
): string {
  return `poi-r${radiusToken(radius)}-d${handDirection === 1 ? "cw" : "ccw"}-s${reversalStepIndex + 1}-p${propPosition}`;
}

function buildCandidate(
  radius: number,
  handDirection: 1 | -1,
  reversalStepIndex: number,
  reversalPropPosition: PositionValue
): PoiReversalCandidate {
  const propRate = profileForReversalStep(reversalStepIndex);
  const phaseProbe: QftTrajectory = {
    radius,
    handDirection,
    propRate,
    propPhase: 8,
  };
  const phaseOffset = trajectoryPropIndexAt(phaseProbe, reversalStepIndex) - 8;
  const propPhase = norm(reversalPropPosition - phaseOffset);
  const calibration =
    radius === 0 && reversalPropPosition === 2
      ? "pendulum"
      : radius === 1 &&
          handDirection === 1 &&
          reversalStepIndex === 0 &&
          reversalPropPosition === 2
        ? "extendulum"
        : undefined;

  return {
    id: candidateId(
      radius,
      handDirection,
      reversalStepIndex,
      reversalPropPosition
    ),
    trajectory: {
      radius,
      handDirection,
      propRate,
      propPhase,
    },
    reversalStep: (reversalStepIndex + 1) as PositionValue,
    reversalPropPosition,
    ...(calibration ? { calibration } : {}),
  };
}

export function generatePoiReversalCandidates(): PoiReversalCandidate[] {
  const candidates: PoiReversalCandidate[] = [];

  /*
   * A stationary hand has no direction and no meaningful hand-position phase.
   * Its two reversal bearings form one undirected axis, so 1/5 and 5/1 are the
   * same cyclic animation. Four axes cover the stationary experiment.
   */
  for (const propPosition of [1, 2, 3, 4] as const) {
    candidates.push(buildCandidate(0, 1, 0, propPosition));
  }

  for (const radius of RADII.filter((value) => value > 0)) {
    for (const handDirection of DIRECTIONS) {
      for (
        let reversalStepIndex = 0;
        reversalStepIndex < 8;
        reversalStepIndex += 1
      ) {
        for (const propPosition of POSITIONS) {
          candidates.push(
            buildCandidate(
              radius,
              handDirection,
              reversalStepIndex,
              propPosition
            )
          );
        }
      }
    }
  }

  return candidates;
}

export const POI_REVERSAL_CANDIDATES = generatePoiReversalCandidates();

function circularPositionDistance(a: number, b: number): number {
  const direct = Math.abs(a - b);
  return Math.min(direct, 8 - direct) / 4;
}

function reversalPairDistance(
  a: PoiReversalCandidate,
  b: PoiReversalCandidate,
  swap: boolean
): number {
  const aReversals = trajectoryReversals(a.trajectory);
  const bReversals = trajectoryReversals(b.trajectory);
  if (aReversals.length !== 2 || bReversals.length !== 2) return 8;

  return aReversals.reduce((total, reversal, index) => {
    const other = bReversals[swap ? 1 - index : index];
    if (!other) return total + 4;
    const handDistance =
      a.trajectory.radius === 0 || b.trajectory.radius === 0
        ? 0
        : circularPositionDistance(reversal.handPosition, other.handPosition);
    const propDistance = circularPositionDistance(
      reversal.propPosition,
      other.propPosition
    );
    const directionDistance =
      Math.sign(reversal.toRate) === Math.sign(other.toRate) ? 0 : 0.25;
    return total + handDistance + propDistance + directionDistance;
  }, 0);
}

export function poiReversalCandidateDistance(
  a: PoiReversalCandidate,
  b: PoiReversalCandidate
): number {
  const radiusDistance = Math.abs(a.trajectory.radius - b.trajectory.radius);
  const handDirectionDistance =
    a.trajectory.radius === 0 || b.trajectory.radius === 0
      ? 0
      : a.trajectory.handDirection === b.trajectory.handDirection
        ? 0
        : 0.75;
  const reversalDistance = Math.min(
    reversalPairDistance(a, b, false),
    reversalPairDistance(a, b, true)
  );

  return radiusDistance + handDirectionDistance + reversalDistance;
}

function latestLabels(
  labels: readonly PoiReversalLabel[]
): Map<string, PoiReversalLabel> {
  const latest = new Map<string, PoiReversalLabel>();
  for (const label of labels) latest.set(label.candidate.id, label);
  return latest;
}

function leastRepeatedCandidate(
  candidates: readonly PoiReversalCandidate[],
  labels: readonly PoiReversalLabel[]
): PoiReversalCandidate | null {
  const counts = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  labels.forEach((label, index) => {
    counts.set(label.candidate.id, (counts.get(label.candidate.id) ?? 0) + 1);
    if (!firstSeen.has(label.candidate.id))
      firstSeen.set(label.candidate.id, index);
  });

  const lastId = labels.at(-1)?.candidate.id;
  return (
    candidates
      .filter(
        (candidate) => counts.has(candidate.id) && candidate.id !== lastId
      )
      .sort(
        (a, b) =>
          (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0) ||
          (firstSeen.get(a.id) ?? Infinity) -
            (firstSeen.get(b.id) ?? Infinity) ||
          a.id.localeCompare(b.id)
      )[0] ?? null
  );
}

function farthestCoverageCandidate(
  unreviewed: readonly PoiReversalCandidate[],
  reviewed: readonly PoiReversalCandidate[]
): PoiReversalCandidate {
  if (reviewed.length === 0) return unreviewed[0]!;

  return [...unreviewed].sort((a, b) => {
    const aDistance = Math.min(
      ...reviewed.map((item) => poiReversalCandidateDistance(a, item))
    );
    const bDistance = Math.min(
      ...reviewed.map((item) => poiReversalCandidateDistance(b, item))
    );
    return bDistance - aDistance || a.id.localeCompare(b.id);
  })[0]!;
}

function boundaryCandidate(
  unreviewed: readonly PoiReversalCandidate[],
  legal: readonly PoiReversalCandidate[],
  illegal: readonly PoiReversalCandidate[],
  reviewed: readonly PoiReversalCandidate[]
): PoiReversalCandidate {
  return [...unreviewed].sort((a, b) => {
    const score = (candidate: PoiReversalCandidate) => {
      const nearestLegal = Math.min(
        ...legal.map((item) => poiReversalCandidateDistance(candidate, item))
      );
      const nearestIllegal = Math.min(
        ...illegal.map((item) => poiReversalCandidateDistance(candidate, item))
      );
      const nearestReviewed = Math.min(
        ...reviewed.map((item) => poiReversalCandidateDistance(candidate, item))
      );
      return (
        1 / (0.25 + nearestLegal + nearestIllegal) +
        Math.min(2, nearestReviewed) * 0.12
      );
    };

    return score(b) - score(a) || a.id.localeCompare(b.id);
  })[0]!;
}

export function selectNextPoiReversalCandidate(
  labels: readonly PoiReversalLabel[],
  candidates: readonly PoiReversalCandidate[] = POI_REVERSAL_CANDIDATES
): PoiCandidateSelection | null {
  if (candidates.length === 0) return null;

  const latest = latestLabels(labels);
  const pendulum = candidates.find(
    (candidate) => candidate.calibration === "pendulum"
  );
  if (pendulum && !latest.has(pendulum.id)) {
    return { candidate: pendulum, reason: "calibration-pendulum" };
  }
  const extendulum = candidates.find(
    (candidate) => candidate.calibration === "extendulum"
  );
  if (extendulum && !latest.has(extendulum.id)) {
    return { candidate: extendulum, reason: "calibration-extendulum" };
  }

  if (labels.length > 0 && (labels.length + 1) % 10 === 0) {
    const repeat = leastRepeatedCandidate(candidates, labels);
    if (repeat) return { candidate: repeat, reason: "repeat" };
  }

  const unreviewed = candidates.filter(
    (candidate) => !latest.has(candidate.id)
  );
  if (unreviewed.length === 0) {
    const repeat = leastRepeatedCandidate(candidates, labels) ?? candidates[0]!;
    return { candidate: repeat, reason: "repeat" };
  }

  const reviewed = [...latest.values()].map((label) => label.candidate);
  const legal = [...latest.values()]
    .filter((label) => label.verdict === "legal")
    .map((label) => label.candidate);
  const illegal = [...latest.values()]
    .filter((label) => label.verdict === "illegal")
    .map((label) => label.candidate);

  if (legal.length === 0 || illegal.length === 0) {
    return {
      candidate: farthestCoverageCandidate(unreviewed, reviewed),
      reason: "coverage",
    };
  }

  return {
    candidate: boundaryCandidate(unreviewed, legal, illegal, reviewed),
    reason: "boundary",
  };
}
