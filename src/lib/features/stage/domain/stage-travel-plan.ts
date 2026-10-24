import {
  compileBeatTravel,
  sampleBeatTravel,
  type BeatTravel,
  type BeatTravelSample,
} from "#lib/shared/3d/locomotion/beat-travel-plan.js";
import {
  chooseAutomaticExactSteps,
  exactStepRange,
  isExactStepCountSupported,
  type ExactStepRange,
} from "#lib/shared/3d/locomotion/straight-travel-constraints.js";

import { applyStageEasing, stageToWorld } from "./stage-performance-sampler";
import type {
  FormationSpot,
  StageChoreography,
  StageTravelTiming,
} from "./stage-types";

const MOVEMENT_EPSILON = 0.0001;

export interface ResolvedStageTravel {
  formationId: string;
  setIndex: number;
  performerId: string;
  from: FormationSpot;
  to: FormationSpot;
  departureBeat: number;
  arrivalBeat: number;
  durationBeats: number;
  durationSeconds: number;
  distanceMeters: number;
  requestedStepCount: number | null;
  resolvedStepCount: number | null;
  supportedStepRange: ExactStepRange | null;
  exact: boolean;
}

export interface CompiledStageTravel extends ResolvedStageTravel, BeatTravel {}

function spotAtOrBefore(
  choreography: StageChoreography,
  performerId: string,
  formationIndex: number
): FormationSpot | undefined {
  for (let index = formationIndex; index >= 0; index -= 1) {
    const spot = choreography.formations[index]?.spots[performerId];
    if (spot) return spot;
  }
  return undefined;
}

export function inheritedStageTravelTiming(
  choreography: StageChoreography,
  formationIndex: number
): StageTravelTiming {
  const formation = choreography.formations[formationIndex]!;
  return {
    departureBeat: Math.max(
      choreography.formations[formationIndex - 1]?.atBeat ?? 0,
      formation.atBeat - formation.transitionBeats
    ),
    arrivalBeat: formation.atBeat,
  };
}

export function resolveStageTravel(
  choreography: StageChoreography,
  performerId: string,
  formationIndex: number
): ResolvedStageTravel | null {
  const formation = choreography.formations[formationIndex];
  if (!formation || formationIndex <= 0) return null;
  const from = spotAtOrBefore(choreography, performerId, formationIndex - 1);
  const to = formation.spots[performerId] ?? from;
  if (!from || !to) return null;

  const inherited = inheritedStageTravelTiming(choreography, formationIndex);
  const authored = to.travel;
  const departureBeat = authored?.departureBeat ?? inherited.departureBeat;
  const arrivalBeat = authored?.arrivalBeat ?? inherited.arrivalBeat;
  const durationBeats = Math.max(0, arrivalBeat - departureBeat);
  const durationSeconds = (durationBeats * 60) / choreography.bpm;
  const worldFrom = stageToWorld(from, choreography);
  const worldTo = stageToWorld(to, choreography);
  const distanceMeters = Math.hypot(
    worldTo.x - worldFrom.x,
    worldTo.z - worldFrom.z
  );
  const supportedStepRange = exactStepRange(distanceMeters, durationSeconds);
  const requestedStepCount = authored?.stepCount ?? null;
  const resolvedStepCount =
    distanceMeters <= MOVEMENT_EPSILON
      ? null
      : requestedStepCount === null
        ? chooseAutomaticExactSteps(distanceMeters, durationSeconds)
        : isExactStepCountSupported(
              distanceMeters,
              durationSeconds,
              requestedStepCount
            )
          ? requestedStepCount
          : null;

  return {
    formationId: formation.id,
    setIndex: formationIndex,
    performerId,
    from,
    to,
    departureBeat,
    arrivalBeat,
    durationBeats,
    durationSeconds,
    distanceMeters,
    requestedStepCount,
    resolvedStepCount,
    supportedStepRange,
    // Legacy scenes keep their existing root-time interpolation until the
    // author touches this performer's Floor interval or step control.
    exact: to.travel !== undefined && resolvedStepCount !== null,
  };
}

/** Invert the destination spot's pacing curve at one travelled fraction. */
function beatAtDistanceFraction(
  fraction: number,
  easing: FormationSpot["easing"]
): number {
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) / 2;
    if (applyStageEasing(middle, easing) < fraction) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function compileStageTravel(
  choreography: StageChoreography,
  performerId: string,
  formationIndex: number,
  departureGaitStep: number
): CompiledStageTravel | null {
  const resolved = resolveStageTravel(
    choreography,
    performerId,
    formationIndex
  );
  if (!resolved?.exact || !resolved.resolvedStepCount) return null;

  const travel = compileBeatTravel({
    id: `stage:${resolved.performerId}:${resolved.formationId}`,
    terminalId: `terminal:${resolved.performerId}:${resolved.formationId}`,
    from: stageToWorld(resolved.from, choreography),
    to: stageToWorld(resolved.to, choreography),
    steps: resolved.resolvedStepCount,
    departureBeat: resolved.departureBeat,
    arrivalBeat: resolved.arrivalBeat,
    bpm: choreography.bpm,
    arrivalFacing: resolved.to.facingAngle ?? 0,
    departureGaitStep,
    // The destination spot's pacing curve says when each footfall lands.
    footfallBeat: (_step, distanceFraction) =>
      resolved.departureBeat +
      beatAtDistanceFraction(distanceFraction, resolved.to.easing) *
        resolved.durationBeats,
  });

  return { ...resolved, ...travel };
}

export function sampleCompiledStageTravel(
  travel: CompiledStageTravel,
  beat: number,
  bpm: number
): BeatTravelSample {
  return sampleBeatTravel(travel, beat, bpm);
}

export function departureGaitStepFor(
  choreography: StageChoreography,
  performerId: string,
  formationIndex: number
): number {
  let gaitStep = 0;
  for (let index = 1; index < formationIndex; index += 1) {
    gaitStep +=
      resolveStageTravel(choreography, performerId, index)?.resolvedStepCount ??
      0;
  }
  return gaitStep;
}
