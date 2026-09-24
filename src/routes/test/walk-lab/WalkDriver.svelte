<script lang="ts">
  /**
   * WalkDriver
   *
   * Turns a walk pattern into a path. Lives inside the canvas because the
   * integration has to happen on the same clock the animator is reading, and
   * renders nothing.
   *
   * The pattern says which way to face and which way to travel; this advances
   * the position at the commanded speed and hands the whole command back out.
   * Deriving the path from the speed rather than the other way round is the
   * point: the animator scales its stride to the speed it is told, so if the
   * body covered a different distance than it was told about, every foot on
   * the floor would slide by the difference.
   *
   * A captured stop is the exception. Once it starts braking, the root follows
   * the stop's own distance curve to the mark, as a destination walk's does.
   */

  import { useTask } from "@threlte/core";
  import type {
    LocomotionGaitClock,
    ScheduledGaitTimingSample,
    TerminalStepPlan,
  } from "@austencloud/scene-3d";
  import { stepOf } from "$lib/shared/3d/diagnostics/gait/walk-patterns";
  import {
    sampleDestinationWalkPlan,
    type DestinationWalkPlan,
  } from "$lib/shared/3d/locomotion/destination-walk-plan";
  import {
    assertGaitTimingPlanMatchesSteps,
    sampleGaitTimingPlan,
    type GaitTimingPlan,
  } from "$lib/shared/3d/locomotion/gait-timing-plan";
  import {
    createPatternTerminalStepPlan,
    samplePatternTerminalTravel,
  } from "$lib/shared/3d/locomotion/pattern-terminal-step-plan";
  import type {
    WalkPattern,
    WalkTick,
  } from "$lib/shared/3d/diagnostics/gait/walk-patterns";
  import type { ManualInput, WalkState } from "./walk-command";

  interface Props {
    pattern: WalkPattern;
    /** Base ground speed the pattern's rate multiplies, m/s. */
    speed: number;
    running: boolean;
    /** When set, the pattern is ignored and these drive the character. */
    manual: ManualInput | null;
    /** Mark-to-mark intent driven by the animator's own authored-step clock. */
    destinationPlan?: DestinationWalkPlan | null;
    /** Musical footfall declarations for the destination move. */
    gaitTimingPlan?: GaitTimingPlan | null;
    gaitClock?: LocomotionGaitClock | null;
    /** Change it to put the character back at the origin. */
    resetNonce: number;
    onState: (state: WalkState) => void;
    onDepartureStep?: (step: number | null) => void;
    onGaitTimingSample?: (sample: ScheduledGaitTimingSample | null) => void;
  }

  let {
    pattern,
    speed,
    running,
    manual,
    destinationPlan = null,
    gaitTimingPlan = null,
    gaitClock = null,
    resetNonce,
    onState,
    onDepartureStep,
    onGaitTimingSample,
  }: Props = $props();

  /** Radians a second the hand-driven mode turns at. */
  const MANUAL_TURN_RATE = 1.8;

  let t = 0;
  let x = 0;
  let z = 0;
  let facing = 0;
  let travelled = 0;
  let departureStep: number | null = null;
  let departureDistanceStep: number | null = null;
  let departureTime: number | null = null;
  let observedFootfalls = 0;
  let latestTimingError: number | null = null;
  let maxTimingError = 0;
  let previousObservedStep = 0;
  let previousObservedScoreTime = 0;
  let scoreStarted = false;
  let patternTerminalStepPlan: TerminalStepPlan | null = null;
  /** Where the armed stop ends, and the world direction it travels along. */
  let patternTerminalMark: {
    x: number;
    z: number;
    ux: number;
    uz: number;
  } | null = null;
  /** Ground left to the mark when the root handed over to the stop, and how
   *  far through the stop the animator already was on that frame. */
  let patternBraking: { distance: number; from: number } | null = null;
  let holdPatternTime = false;

  $effect(() => {
    if (destinationPlan && gaitTimingPlan) {
      assertGaitTimingPlanMatchesSteps(gaitTimingPlan, destinationPlan.steps);
    }
  });

  $effect(() => {
    // Read so the reset re-runs, then clear everything the path accumulated.
    void resetNonce;
    t = 0;
    x = 0;
    z = 0;
    facing = 0;
    travelled = 0;
    departureStep = null;
    departureDistanceStep = null;
    departureTime = null;
    observedFootfalls = 0;
    latestTimingError = null;
    maxTimingError = 0;
    previousObservedStep = 0;
    previousObservedScoreTime = gaitTimingPlan?.departureTimeSeconds ?? 0;
    scoreStarted = false;
    patternTerminalStepPlan = null;
    patternTerminalMark = null;
    patternBraking = null;
    holdPatternTime = false;
    onDepartureStep?.(null);
    onGaitTimingSample?.(null);
  });

  function driveDestination(
    plan: DestinationWalkPlan,
    dt: number,
    scoreDelta: number
  ): void {
    if (running) {
      if (!gaitTimingPlan) {
        t += dt;
      } else if (departureStep !== null) {
        // Asset initialization can leave one oversized frame directly after
        // the gait clock first appears. The lab has no audio transport to
        // catch up to yet, so earn the departure epoch on one healthy frame;
        // after that, score time remains authoritative through real stalls.
        if (scoreStarted) t += scoreDelta;
        else if (scoreDelta <= 0.1) {
          scoreStarted = true;
          t += scoreDelta;
        }
      }
    }

    // Capture the animator where it is rather than inventing a second phase
    // origin. The first command starts movement; the callback then advances
    // this same clock on the next frame.
    if (departureStep === null && gaitClock) {
      departureStep = gaitClock.step;
      departureDistanceStep = gaitClock.distanceStep ?? gaitClock.step;
      departureTime = t;
      previousObservedScoreTime = gaitTimingPlan?.departureTimeSeconds ?? t;
      onDepartureStep?.(departureStep);
    }
    const scoreTimeSeconds = gaitTimingPlan
      ? gaitTimingPlan.departureTimeSeconds +
        Math.max(0, t - (departureTime ?? t))
      : t;
    const timingSample = gaitTimingPlan
      ? sampleGaitTimingPlan(gaitTimingPlan, scoreTimeSeconds)
      : null;
    onGaitTimingSample?.(
      timingSample && departureStep !== null
        ? {
            planId: gaitTimingPlan!.id,
            gaitStep: departureStep + timingSample.step,
            cadence: timingSample.cadence,
            arrived: timingSample.arrived,
            settled: timingSample.settled,
            settleProgress: timingSample.settleProgress,
          }
        : null
    );
    const authoredStep =
      departureStep === null || !gaitClock
        ? 0
        : Math.max(0, gaitClock.step - departureStep);
    const distanceStep =
      departureDistanceStep === null || !gaitClock
        ? authoredStep
        : Math.max(
            0,
            (gaitClock.distanceStep ?? gaitClock.step) - departureDistanceStep
          );
    const sample = sampleDestinationWalkPlan(
      plan,
      authoredStep,
      distanceStep,
      timingSample?.cadence ?? plan.cadence
    );

    if (gaitTimingPlan && departureStep !== null && gaitClock) {
      const observedStep = Math.min(plan.steps, authoredStep);
      const completed = Math.floor(observedStep + 1e-6);
      for (
        let footfall = observedFootfalls + 1;
        footfall <= completed;
        footfall++
      ) {
        const declared = gaitTimingPlan.footfalls[footfall - 1]!;
        const observedSpan = observedStep - previousObservedStep;
        const crossing =
          observedSpan > 1e-6
            ? previousObservedScoreTime +
              ((footfall - previousObservedStep) / observedSpan) *
                (scoreTimeSeconds - previousObservedScoreTime)
            : scoreTimeSeconds;
        latestTimingError = (crossing - declared.plantTimeSeconds) * 1000;
        maxTimingError = Math.max(maxTimingError, Math.abs(latestTimingError));
      }
      observedFootfalls = Math.max(observedFootfalls, completed);
      previousObservedStep = observedStep;
      previousObservedScoreTime = scoreTimeSeconds;
    }

    x = sample.position.x;
    z = sample.position.z;
    travelled = plan.distance * sample.progress;
    facing = Math.atan2(plan.direction.x, plan.direction.z);
    const moving = running && !(timingSample?.arrived ?? sample.arrived);

    onState({
      t,
      x,
      z,
      facing,
      isMoving: moving,
      // Each braking placement has its own distance. Feeding that distance's
      // speed keeps stride warping matched to the root plan instead of asking
      // the feet to keep a steady-loop stride while the body decelerates.
      speed: moving ? sample.speed : 0,
      direction: { x: 0, z: 1 },
      phase: sample.arrived
        ? `arrived on step ${plan.steps}`
        : `walking to mark · step ${sample.step.toFixed(1)} of ${plan.steps}`,
      travelled,
      plannedSteps: plan.steps,
      completedSteps: sample.step,
      endpointError: plan.distance - travelled,
      ...(gaitTimingPlan && {
        timing: {
          planId: gaitTimingPlan.id,
          scoreTimeSeconds,
          observedFootfalls,
          nextPlantBeat: timingSample?.nextFootfall?.plantBeat ?? null,
          latestErrorMilliseconds: latestTimingError,
          maxErrorMilliseconds: maxTimingError,
          settled: timingSample?.settled ?? false,
        },
      }),
      turnRequest: null,
      terminalStepPlan: null,
    });
  }

  function manualTick(input: ManualInput, dt: number): WalkTick {
    facing += input.turn * MANUAL_TURN_RATE * dt;
    const moving = input.forward !== 0 || input.right !== 0;
    return {
      facing,
      isMoving: moving,
      rate: moving ? 1 : 0,
      direction: { x: input.right, z: input.forward },
      phase: moving ? "driven" : "standing",
    };
  }

  useTask((rawDelta) => {
    // A tab that was in the background hands back one enormous delta, which
    // would teleport the character across the arena and write a jolt into the
    // buffer that nothing in the rig did.
    const dt = Math.min(rawDelta, 1 / 20);

    if (destinationPlan) {
      driveDestination(
        destinationPlan,
        running ? dt : 0,
        running ? rawDelta : 0
      );
      return;
    }

    if (running && !holdPatternTime) t += dt;

    const tick = manual
      ? manualTick(manual, running ? dt : 0)
      : pattern.tick(t % pattern.period(speed), speed);

    let armedIntent: number | null = null;
    if (manual || tick.turnRequest) {
      patternTerminalStepPlan = null;
      patternTerminalMark = null;
      patternBraking = null;
    } else if (!patternTerminalStepPlan && tick.terminalIntent && gaitClock) {
      patternTerminalStepPlan = createPatternTerminalStepPlan({
        intent: tick.terminalIntent,
        gaitStep: gaitClock.step,
        cadence: gaitClock.cadence,
        speed: speed * tick.rate,
      });
      if (patternTerminalStepPlan) {
        armedIntent = tick.terminalIntent.remainingDistance;
      }
    }
    const terminalStatus = gaitClock?.terminal?.status;
    holdPatternTime =
      !manual &&
      tick.waitForTerminalSettle === true &&
      (terminalStatus === "braking" || terminalStatus === "landed");

    facing = tick.facing;

    // Once the stop is braking, the captured clip owns the root the way it
    // owns a destination walk's: the body decelerates with the pose instead
    // of arriving at walking speed and stopping dead under planted feet.
    const brakingOwnsRoot =
      !!patternTerminalStepPlan &&
      !!patternTerminalMark &&
      gaitClock?.distanceStep !== undefined &&
      (terminalStatus === "braking" ||
        terminalStatus === "landed" ||
        (terminalStatus === "settled" && !tick.isMoving));

    let moved = 0;
    if (brakingOwnsRoot && !patternBraking) {
      // The gait clock reports the animator's last frame, so on the first
      // braking frame it still reads no progress. Walk this frame as scripted
      // and take the stop's curve up from wherever that leaves the root;
      // starting from the stop's own origin stalled the root for a frame and
      // then threw it forward to catch up.
      const step = stepOf(tick, running ? speed : 0, dt);
      x += step.dx;
      z += step.dz;
      moved = step.distance;
      const mark = patternTerminalMark!;
      patternBraking = {
        distance: Math.max(0, (mark.x - x) * mark.ux + (mark.z - z) * mark.uz),
        from: samplePatternTerminalTravel(
          patternTerminalStepPlan!,
          gaitClock!.distanceStep!
        ),
      };
    } else if (brakingOwnsRoot) {
      const mark = patternTerminalMark!;
      const travel = samplePatternTerminalTravel(
        patternTerminalStepPlan!,
        gaitClock!.distanceStep!
      );
      const left =
        patternBraking!.from >= 1
          ? 0
          : patternBraking!.distance *
            Math.max(0, (1 - travel) / (1 - patternBraking!.from));
      const nextX = mark.x - mark.ux * left;
      const nextZ = mark.z - mark.uz * left;
      moved = Math.max(0, (nextX - x) * mark.ux + (nextZ - z) * mark.uz);
      x = nextX;
      z = nextZ;
    } else {
      const step = stepOf(tick, running ? speed : 0, dt);
      x += step.dx;
      z += step.dz;
      moved = step.distance;
      if (armedIntent !== null) {
        // The pattern's remaining distance is measured at this tick's time,
        // which is where this frame's step has just put the root.
        const unit = stepOf(tick, 1, 1);
        const unitLength = Math.hypot(unit.dx, unit.dz);
        if (unitLength > 1e-9) {
          const ux = unit.dx / unitLength;
          const uz = unit.dz / unitLength;
          patternTerminalMark = {
            x: x + ux * armedIntent,
            z: z + uz * armedIntent,
            ux,
            uz,
          };
        }
      }
    }
    travelled += moved;

    const length = Math.hypot(tick.direction.x, tick.direction.z);
    onState({
      t,
      x,
      z,
      facing,
      isMoving: brakingOwnsRoot ? terminalStatus === "braking" : moved > 0,
      speed: dt > 0 ? moved / dt : 0,
      direction:
        length > 1e-6
          ? { x: tick.direction.x / length, z: tick.direction.z / length }
          : { x: 0, z: 1 },
      phase: tick.phase,
      travelled,
      turnRequest: tick.turnRequest ?? null,
      terminalStepPlan: patternTerminalStepPlan,
    });
  });
</script>
