/**
 * An exact-step walk laid on a beat clock: where each footfall lands, and the
 * plans `PerformerRig` needs to step it (the destination walk, the gait
 * timing, the braking terminal step).
 *
 * Extracted from the Stage module's `compileStageTravel` so every host that
 * walks a performer to the beat compiles the same three plans the same way:
 * the Stage module (formation travel) and the Flow Fest phrase stage
 * (travelling phrases).
 */
import type {
  ScheduledGaitTimingSample,
  TerminalStepPlan,
} from "@austencloud/scene-3d";

import {
  createDestinationWalkPlan,
  createTerminalStepPlan,
  sampleDestinationWalkPlan,
  type DestinationWalkPlan,
  type GroundPoint,
} from "./destination-walk-plan";
import {
  createGaitTimingPlan,
  sampleGaitTimingPlan,
  type GaitTimingPlan,
} from "./gait-timing-plan";

export interface BeatTravelRequest {
  /** Names the timing plan. */
  id: string;
  /** Names the terminal step plan; `terminal:<id>` when omitted. */
  terminalId?: string;
  from: GroundPoint;
  to: GroundPoint;
  steps: number;
  departureBeat: number;
  arrivalBeat: number;
  bpm: number;
  /** Rig facing at the end of the walk (PerformerRig's convention, 0 = +z). */
  arrivalFacing: number;
  /** Gait steps already walked before this one, so the feet carry on. */
  departureGaitStep: number;
  /**
   * The beat footfall `step` (1-based) lands on, given the fraction of the
   * distance covered at that footfall. Omit it for footfalls evenly spaced
   * in time from departure to arrival.
   */
  footfallBeat?: (step: number, distanceFraction: number) => number;
}

export interface BeatTravel {
  destinationPlan: DestinationWalkPlan;
  timingPlan: GaitTimingPlan;
  terminalPlan: TerminalStepPlan;
  departureGaitStep: number;
}

export interface BeatTravelSample {
  position: { x: number; z: number };
  progress: number;
  speed: number;
  moving: boolean;
  gaitTimingSample: ScheduledGaitTimingSample;
  terminalStepPlan: TerminalStepPlan;
}

export function compileBeatTravel(request: BeatTravelRequest): BeatTravel {
  const durationBeats = request.arrivalBeat - request.departureBeat;
  const secondsPerBeat = 60 / request.bpm;
  const destinationPlan = createDestinationWalkPlan({
    from: request.from,
    to: request.to,
    steps: request.steps,
    cadence: request.steps / (durationBeats * secondsPerBeat),
  });
  const footfallBeat =
    request.footfallBeat ??
    ((step: number) =>
      request.departureBeat + (step / request.steps) * durationBeats);
  const footfalls = destinationPlan.stepBoundaries
    .slice(1)
    .map((distance, index) => {
      const plantBeat = footfallBeat(
        index + 1,
        distance / destinationPlan.distance
      );
      return {
        step: index + 1,
        plantBeat,
        plantTimeSeconds: plantBeat * secondsPerBeat,
      };
    });
  const settledBeat = request.arrivalBeat + Math.min(0.5, durationBeats / 4);
  const timingPlan = createGaitTimingPlan({
    id: request.id,
    departureBeat: request.departureBeat,
    departureTimeSeconds: request.departureBeat * secondsPerBeat,
    footfalls,
    settledBeat,
    settledTimeSeconds: settledBeat * secondsPerBeat,
  });
  const terminalPlan = createTerminalStepPlan(
    destinationPlan,
    request.departureGaitStep,
    request.terminalId ?? `terminal:${request.id}`,
    request.arrivalFacing,
    request.id
  );
  return {
    destinationPlan,
    timingPlan,
    terminalPlan,
    departureGaitStep: request.departureGaitStep,
  };
}

export function sampleBeatTravel(
  travel: BeatTravel,
  beat: number,
  bpm: number
): BeatTravelSample {
  const timing = sampleGaitTimingPlan(travel.timingPlan, (beat * 60) / bpm);
  const destination = sampleDestinationWalkPlan(
    travel.destinationPlan,
    timing.step,
    timing.step,
    timing.cadence
  );
  return {
    position: destination.position,
    progress: destination.progress,
    speed: destination.speed,
    moving: destination.moving,
    gaitTimingSample: {
      planId: travel.timingPlan.id,
      gaitStep: travel.departureGaitStep + timing.step,
      cadence: timing.cadence,
      arrived: timing.arrived,
      settled: timing.settled,
      settleProgress: timing.settleProgress,
    },
    terminalStepPlan: travel.terminalPlan,
  };
}
