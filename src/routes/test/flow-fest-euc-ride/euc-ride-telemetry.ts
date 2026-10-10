/**
 * Telemetry for the EUC free-ride lab.
 *
 * "He seems to twitch while riding" is a rate defect, not a pose defect: the
 * mounted-pose diagnostic already proves where the body IS, so the lab
 * measures how fast it MOVES. The meter keeps a short rolling window of the
 * visual lean/pitch angles and the pelvis offsets and reports their worst
 * instantaneous rates plus how often the pitch rate reverses sign. Smooth
 * riding shows low rates and near-zero reversals; a twitch shows up as a rate
 * spike and a reversal burst long before it is obvious in a screenshot.
 */
import type { FlowFestElectricUnicycleDynamics, FlowFestElectricUnicycleInput } from "#lib/features/flow-fest-sim/domain/flow-fest-electric-unicycle.js";
import type { FlowFestEucMountedPoseDiagnostic } from "#lib/features/flow-fest-sim/domain/flow-fest-euc-mounted-pose.js";

export const EUC_RIDE_CAMERA_IDS = ["chase", "side"] as const;
export type EucRideCameraId = (typeof EUC_RIDE_CAMERA_IDS)[number];

export interface EucRideTwitchReport {
  windowSeconds: number;
  maxLeanRateDegreesPerSecond: number;
  maxPitchRateDegreesPerSecond: number;
  maxPelvisRateMillimetersPerSecond: number;
  /** Sign reversals of the pitch rate per second — the oscillation signature. */
  pitchReversalsPerSecond: number;
}

export interface EucRideTelemetry {
  dynamics: FlowFestElectricUnicycleDynamics;
  input: FlowFestElectricUnicycleInput;
  collisionLimited: boolean;
  longitudinalAccelerationMetersPerSecondSquared: number;
  twitch: EucRideTwitchReport;
}

const WINDOW_SECONDS = 2.5;
const DEGREES = 180 / Math.PI;
const MILLIMETRES = 1000;
/** Pitch-rate magnitude below this is settling noise, not a reversal. */
const REVERSAL_FLOOR_DEGREES_PER_SECOND = 2;

interface TwitchSample {
  ageSeconds: number;
  leanRateDegreesPerSecond: number;
  pitchRateDegreesPerSecond: number;
  pelvisRateMillimetersPerSecond: number;
}

export interface EucRideTwitchMeter {
  sample(
    deltaSeconds: number,
    dynamics: FlowFestElectricUnicycleDynamics,
    pose: FlowFestEucMountedPoseDiagnostic | null
  ): EucRideTwitchReport;
}

export function createEucRideTwitchMeter(): EucRideTwitchMeter {
  const samples: TwitchSample[] = [];
  let previousLeanRadians: number | null = null;
  let previousPitchRadians: number | null = null;
  let previousPelvis: { forwardMeters: number; lateralMeters: number } | null =
    null;

  return {
    sample(deltaSeconds, dynamics, pose) {
      const safeDelta = Math.max(deltaSeconds, 1e-6);
      for (const entry of samples) entry.ageSeconds += safeDelta;
      while (samples.length > 0 && samples[0]!.ageSeconds > WINDOW_SECONDS) {
        samples.shift();
      }

      const leanRate =
        previousLeanRadians === null
          ? 0
          : ((dynamics.leanRadians - previousLeanRadians) / safeDelta) *
            DEGREES;
      const pitchRate =
        previousPitchRadians === null
          ? 0
          : ((dynamics.pitchRadians - previousPitchRadians) / safeDelta) *
            DEGREES;
      previousLeanRadians = dynamics.leanRadians;
      previousPitchRadians = dynamics.pitchRadians;

      let pelvisRate = 0;
      if (pose && pose.status === "ready") {
        const current = {
          forwardMeters: pose.pelvisForwardOffsetMeters,
          lateralMeters: pose.pelvisLateralOffsetMeters,
        };
        if (previousPelvis) {
          pelvisRate =
            (Math.hypot(
              current.forwardMeters - previousPelvis.forwardMeters,
              current.lateralMeters - previousPelvis.lateralMeters
            ) /
              safeDelta) *
            MILLIMETRES;
        }
        previousPelvis = current;
      } else {
        previousPelvis = null;
      }

      samples.push({
        ageSeconds: 0,
        leanRateDegreesPerSecond: leanRate,
        pitchRateDegreesPerSecond: pitchRate,
        pelvisRateMillimetersPerSecond: pelvisRate,
      });

      let maxLean = 0;
      let maxPitch = 0;
      let maxPelvis = 0;
      let reversals = 0;
      let previousSign = 0;
      let coveredSeconds = 0;
      for (const entry of samples) {
        maxLean = Math.max(maxLean, Math.abs(entry.leanRateDegreesPerSecond));
        maxPitch = Math.max(
          maxPitch,
          Math.abs(entry.pitchRateDegreesPerSecond)
        );
        maxPelvis = Math.max(
          maxPelvis,
          entry.pelvisRateMillimetersPerSecond
        );
        const magnitude = Math.abs(entry.pitchRateDegreesPerSecond);
        if (magnitude >= REVERSAL_FLOOR_DEGREES_PER_SECOND) {
          const sign = Math.sign(entry.pitchRateDegreesPerSecond);
          if (previousSign !== 0 && sign !== previousSign) reversals += 1;
          previousSign = sign;
        }
        coveredSeconds = Math.max(coveredSeconds, entry.ageSeconds);
      }

      return {
        windowSeconds: coveredSeconds,
        maxLeanRateDegreesPerSecond: maxLean,
        maxPitchRateDegreesPerSecond: maxPitch,
        maxPelvisRateMillimetersPerSecond: maxPelvis,
        pitchReversalsPerSecond:
          coveredSeconds > 0.25 ? reversals / coveredSeconds : 0,
      };
    },
  };
}

export function parseEucRideCamera(raw: string | null): EucRideCameraId {
  return EUC_RIDE_CAMERA_IDS.includes(raw as EucRideCameraId)
    ? (raw as EucRideCameraId)
    : "chase";
}
