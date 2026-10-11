import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

import { sampleFormationPerformance } from "./stage-formation-sampler";
import { resolveStageTravel } from "./stage-travel-plan";
import type { StageChoreography } from "./stage-types";

export interface StageFloorTravelSegment {
  id: string;
  formationId: string;
  performerId: string;
  setIndex: number;
  label: string;
  startBeat: number;
  endBeat: number;
  minimumStartBeat: number;
  maximumEndBeat: number;
  distanceMeters: number;
  requestedStepCount: number | null;
  resolvedStepCount: number | null;
  supportedStepRange: { min: number; max: number } | null;
  exact: boolean;
}

export interface StageFloorSpeedSample {
  beat: number;
  metersPerSecond: number;
}

export function stageSequenceDisplayName(sequence: SequenceData): string {
  return (
    sequence.displayName?.trim() ||
    sequence.intendedWord?.trim() ||
    sequence.word?.trim() ||
    sequence.name?.trim() ||
    "Sequence"
  );
}

function spotAtOrBefore(
  choreography: StageChoreography,
  performerId: string,
  formationIndex: number
) {
  for (let index = formationIndex; index >= 0; index -= 1) {
    const spot = choreography.formations[index]?.spots[performerId];
    if (spot) return spot;
  }
  return undefined;
}

export function projectPerformerFloorTravel(
  choreography: StageChoreography,
  performerId: string
): StageFloorTravelSegment[] {
  return choreography.formations.slice(1).flatMap((formation, offset) => {
    const setIndex = offset + 1;
    const travel = resolveStageTravel(choreography, performerId, setIndex);
    if (!travel) return [];

    return [
      {
        id: `${performerId}:${formation.id}`,
        formationId: formation.id,
        performerId,
        setIndex,
        label: formation.label?.trim() || `Set ${setIndex + 1}`,
        startBeat: travel.departureBeat,
        endBeat: travel.arrivalBeat,
        minimumStartBeat: choreography.formations[setIndex - 1]?.atBeat ?? 0,
        maximumEndBeat: formation.atBeat,
        distanceMeters: travel.distanceMeters,
        requestedStepCount: travel.requestedStepCount,
        resolvedStepCount: travel.resolvedStepCount,
        supportedStepRange: travel.supportedStepRange,
        exact: travel.exact,
      },
    ];
  });
}

export function samplePerformerFloorSpeed(
  choreography: StageChoreography,
  performerId: string,
  endBeat: number,
  samplesPerBeat = 4
): StageFloorSpeedSample[] {
  const safeEndBeat = Math.max(0, endBeat);
  const safeSamplesPerBeat = Math.max(1, Math.floor(samplesPerBeat));
  const sampleCount = Math.ceil(safeEndBeat * safeSamplesPerBeat);

  return Array.from({ length: sampleCount + 1 }, (_, index) => {
    const beat = Math.min(safeEndBeat, index / safeSamplesPerBeat);
    return {
      beat,
      metersPerSecond: sampleFormationPerformance(
        choreography,
        performerId,
        beat
      ).speedMetersPerSecond,
    };
  });
}

export function floorSpeedPath(
  samples: readonly StageFloorSpeedSample[],
  endBeat: number,
  maxMetersPerSecond: number,
  height = 100
): string {
  if (samples.length === 0 || endBeat <= 0) return "";
  const safeMax = Math.max(0.001, maxMetersPerSecond);

  return samples
    .map((sample, index) => {
      const y = Math.max(
        0,
        Math.min(height, height - (sample.metersPerSecond / safeMax) * height)
      );
      return `${index === 0 ? "M" : "L"} ${sample.beat.toFixed(3)} ${y.toFixed(3)}`;
    })
    .join(" ");
}
