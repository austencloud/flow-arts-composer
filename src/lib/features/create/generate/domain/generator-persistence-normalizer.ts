import { normalizeLegacyStep } from "@tka/tka-types";
import {
  clampToAvailableLevel,
  type UIGenerationConfig,
} from "../shared/utils/config-mapper";
import { isHandRelationship } from "$lib/shared/create/domain/hand-relationship";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize old localStorage and saved setups before they reach Generate.
 */
export function normalizePersistedGenerationConfig(
  value: unknown
): Partial<UIGenerationConfig> {
  if (!isRecord(value)) return {};

  const normalized: UnknownRecord = { ...value };
  // Generate now uses Level and Turn Intensity only. Old custom patterns must
  // not silently override those controls when a session or setup is restored.
  delete normalized.turnPattern;
  // A setup or session saved by a build that knew a relationship this one
  // does not (or a corrupted value) must not reach the engine. Drop it so the
  // default wins; a well-formed value passes through untouched.
  if (
    value.handRelationship !== undefined &&
    !isHandRelationship(value.handRelationship)
  ) {
    delete normalized.handRelationship;
  }
  if (
    value.handRelationshipInverted !== undefined &&
    typeof value.handRelationshipInverted !== "boolean"
  ) {
    delete normalized.handRelationshipInverted;
  }
  if (
    value.matchHandTurns !== undefined &&
    typeof value.matchHandTurns !== "boolean"
  ) {
    delete normalized.matchHandTurns;
  }
  // Level 4 (SKEWED) pictograph data does not exist yet (see
  // MAX_AVAILABLE_LEVEL in config-mapper.ts). A config saved to localStorage
  // or Firestore before that gate existed can still carry level 4; clamp it
  // here so it degrades to the nearest available level instead of silently
  // asking the generator to build data that isn't there.
  if (typeof value.level === "number") {
    normalized.level = clampToAvailableLevel(value.level);
  }
  return normalized as Partial<UIGenerationConfig>;
}

/** Restores the legacy generator constraint envelope without weakening its live type. */
export function normalizePersistedStartEndOptions<T>(value: T): T {
  if (!isRecord(value)) return value;

  const normalized: UnknownRecord = { ...value };
  if (
    normalized.leftStartOrientation === undefined &&
    value.blueStartOrientation !== undefined
  ) {
    normalized.leftStartOrientation = value.blueStartOrientation;
  }
  if (
    normalized.rightStartOrientation === undefined &&
    value.redStartOrientation !== undefined
  ) {
    normalized.rightStartOrientation = value.redStartOrientation;
  }
  delete normalized.blueStartOrientation;
  delete normalized.redStartOrientation;

  if (value.startPosition !== undefined) {
    normalized.startPosition = normalizeLegacyStep(value.startPosition);
  }
  if (value.endPosition !== undefined) {
    normalized.endPosition = normalizeLegacyStep(value.endPosition);
  }

  return normalized as T;
}
