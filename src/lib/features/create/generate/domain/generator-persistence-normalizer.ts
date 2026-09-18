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

  if (value.startPlacement !== undefined) {
    normalized.startPlacement = normalizeLegacyStep(value.startPlacement);
  }
  if (value.endPlacement !== undefined) {
    normalized.endPlacement = normalizeLegacyStep(value.endPlacement);
  }

  // Pre-rename Firestore setups (users/{uid}/generatorSetups via
  // favorite-config-repository.ts, and the legacy favorite recovered by
  // setup-migration.ts) still carry the "position" spellings of the
  // multi-select constraint arrays. Move each onto its "placement" key when
  // that key is absent, then drop the old key.
  if (
    normalized.blockedStartPlacements === undefined &&
    value.blockedStartPositions !== undefined
  ) {
    normalized.blockedStartPlacements = value.blockedStartPositions;
  }
  delete normalized.blockedStartPositions;
  if (
    normalized.endPlacements === undefined &&
    value.endPositions !== undefined
  ) {
    normalized.endPlacements = value.endPositions;
  }
  delete normalized.endPositions;

  // The same pre-rename setups can also carry the single-select legacy
  // fields under their old names, distinct from the startPlacement/
  // endPlacement step objects normalized above.
  if (
    normalized.startPlacement === undefined &&
    value.startPosition !== undefined
  ) {
    normalized.startPlacement = normalizeLegacyStep(value.startPosition);
  }
  delete normalized.startPosition;
  if (
    normalized.endPlacement === undefined &&
    value.endPosition !== undefined
  ) {
    normalized.endPlacement = normalizeLegacyStep(value.endPosition);
  }
  delete normalized.endPosition;

  // Downstream readers (hasAnyConstraints, setOptions) call .length on both
  // arrays unconditionally. A legacy setup that never had either array (they
  // postdate some saved setups) must still produce empty arrays, not
  // `undefined`, so those reads cannot throw.
  if (normalized.blockedStartPlacements === undefined) {
    normalized.blockedStartPlacements = [];
  }
  if (normalized.endPlacements === undefined) {
    normalized.endPlacements = [];
  }

  return normalized as T;
}
