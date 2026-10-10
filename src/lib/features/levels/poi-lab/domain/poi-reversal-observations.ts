import type { PositionValue } from "#lib/shared/notation/qft/qft-model.js";
import type { QftPropRateProfile } from "#lib/shared/notation/qft/qft-trajectory.js";
import type {
  PoiReversalCalibration,
  PoiReversalCandidate,
  PoiReversalVerdict,
} from "./poi-reversal-candidates";

export const POI_REVERSAL_GENERATOR_VERSION = 1;
export const POI_REVERSAL_FILE_VERSION = 1;
export const POI_REVERSAL_REASON_LIMIT = 2_000;

export interface PoiReversalObservation {
  id: string;
  candidate: PoiReversalCandidate;
  verdict: PoiReversalVerdict;
  firstIllegalStep: PositionValue | null;
  reason: string;
}

export interface PoiReversalObservationFile {
  version: 1;
  generatorVersion: 1;
  observations: PoiReversalObservation[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is PositionValue {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 8;
}

function isRateProfile(value: unknown): value is QftPropRateProfile {
  return (
    Array.isArray(value) &&
    value.length === 8 &&
    value.every((rate) => typeof rate === "number" && Number.isFinite(rate))
  );
}

function isCalibration(
  value: unknown
): value is PoiReversalCalibration | undefined {
  return value === undefined || value === "pendulum" || value === "extendulum";
}

function assertCandidate(
  value: unknown,
  path: string
): asserts value is PoiReversalCandidate {
  if (!isRecord(value)) throw new Error(`${path}: expected candidate object`);
  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new Error(`${path}.id: expected non-empty string`);
  }
  if (!isRecord(value.trajectory))
    throw new Error(`${path}.trajectory: expected object`);
  const { trajectory } = value;
  if (
    typeof trajectory.radius !== "number" ||
    !Number.isFinite(trajectory.radius)
  ) {
    throw new Error(`${path}.trajectory.radius: expected finite number`);
  }
  if (trajectory.handDirection !== 1 && trajectory.handDirection !== -1) {
    throw new Error(`${path}.trajectory.handDirection: expected 1 or -1`);
  }
  if (!isRateProfile(trajectory.propRate)) {
    throw new Error(`${path}.trajectory.propRate: expected eight finite rates`);
  }
  if (
    typeof trajectory.propPhase !== "number" ||
    !Number.isFinite(trajectory.propPhase)
  ) {
    throw new Error(`${path}.trajectory.propPhase: expected finite number`);
  }
  if (!isPosition(value.reversalStep)) {
    throw new Error(`${path}.reversalStep: expected 1 through 8`);
  }
  if (!isPosition(value.reversalPropPosition)) {
    throw new Error(`${path}.reversalPropPosition: expected 1 through 8`);
  }
  if (!isCalibration(value.calibration)) {
    throw new Error(`${path}.calibration: unrecognized value`);
  }
}

function assertObservation(
  value: unknown,
  index: number
): asserts value is PoiReversalObservation {
  const path = `observations[${index}]`;
  if (!isRecord(value)) throw new Error(`${path}: expected object`);
  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new Error(`${path}.id: expected non-empty string`);
  }
  assertCandidate(value.candidate, `${path}.candidate`);
  if (
    value.verdict !== "legal" &&
    value.verdict !== "illegal" &&
    value.verdict !== "unsure"
  ) {
    throw new Error(`${path}.verdict: unrecognized value`);
  }
  if (value.firstIllegalStep !== null && !isPosition(value.firstIllegalStep)) {
    throw new Error(`${path}.firstIllegalStep: expected null or 1 through 8`);
  }
  if (
    typeof value.reason !== "string" ||
    value.reason.length > POI_REVERSAL_REASON_LIMIT
  ) {
    throw new Error(
      `${path}.reason: expected at most ${POI_REVERSAL_REASON_LIMIT} characters`
    );
  }
  if (
    value.verdict === "illegal" &&
    (value.firstIllegalStep === null || value.reason.trim().length === 0)
  ) {
    throw new Error(
      `${path}: illegal observations require a first step and reason`
    );
  }
  if (value.verdict !== "illegal" && value.firstIllegalStep !== null) {
    throw new Error(
      `${path}: only illegal observations may carry a failure step`
    );
  }
}

export function parsePoiReversalObservationFile(
  data: unknown
): PoiReversalObservationFile {
  if (!isRecord(data)) throw new Error("poi reversal data: expected object");
  if (data.version !== POI_REVERSAL_FILE_VERSION) {
    throw new Error(
      `poi reversal data: expected version ${POI_REVERSAL_FILE_VERSION}`
    );
  }
  if (data.generatorVersion !== POI_REVERSAL_GENERATOR_VERSION) {
    throw new Error(
      `poi reversal data: expected generator version ${POI_REVERSAL_GENERATOR_VERSION}`
    );
  }
  if (!Array.isArray(data.observations)) {
    throw new Error("poi reversal data: expected observations array");
  }

  const ids = new Set<string>();
  data.observations.forEach((observation, index) => {
    assertObservation(observation, index);
    if (ids.has(observation.id)) {
      throw new Error(
        `observations[${index}].id: duplicate "${observation.id}"`
      );
    }
    ids.add(observation.id);
  });

  return data as unknown as PoiReversalObservationFile;
}

export function createEmptyPoiReversalObservationFile(): PoiReversalObservationFile {
  return {
    version: POI_REVERSAL_FILE_VERSION,
    generatorVersion: POI_REVERSAL_GENERATOR_VERSION,
    observations: [],
  };
}

export function createPoiReversalObservation(
  candidate: PoiReversalCandidate,
  verdict: PoiReversalVerdict,
  firstIllegalStep: PositionValue | null,
  reason: string,
  existing: readonly PoiReversalObservation[]
): PoiReversalObservation {
  const normalizedReason = reason.trim();
  if (normalizedReason.length > POI_REVERSAL_REASON_LIMIT) {
    throw new Error(
      `Reason must be ${POI_REVERSAL_REASON_LIMIT} characters or fewer`
    );
  }
  if (
    verdict === "illegal" &&
    (firstIllegalStep === null || normalizedReason.length === 0)
  ) {
    throw new Error("Choose the first illegal step and explain what breaks");
  }

  const reviewNumber =
    existing.filter((observation) => observation.candidate.id === candidate.id)
      .length + 1;
  const observation: PoiReversalObservation = {
    id: `${candidate.id}@${String(reviewNumber).padStart(2, "0")}`,
    candidate: structuredClone(candidate),
    verdict,
    firstIllegalStep: verdict === "illegal" ? firstIllegalStep : null,
    reason: normalizedReason,
  };

  assertObservation(observation, existing.length);
  return observation;
}
