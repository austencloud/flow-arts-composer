import { HandSide, type HandSide as HandSideValue } from "./hand-side.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function moveLegacyField(
  target: UnknownRecord,
  source: UnknownRecord,
  canonicalKey: string,
  legacyKey: string
): void {
  if (target[canonicalKey] === undefined && source[legacyKey] !== undefined) {
    target[canonicalKey] = source[legacyKey];
  }
  delete target[legacyKey];
}

/**
 * The two-hand "position" (alpha/beta/gamma) field renames: `startPosition`,
 * `endPosition`, `gridPosition`, `isStartPosition` -> `startPlacement`,
 * `endPlacement`, `gridPlacement`, `isStartPlacement`. Applied wherever a
 * pictograph-shaped record (Step, Pictograph, StartPlacement, StepPairing)
 * may still carry the pre-rename keys from documents written before the
 * placement rename shipped. Canonical keys win when both are present,
 * matching `moveLegacyField`.
 */
const LEGACY_PLACEMENT_FIELD_PAIRS: ReadonlyArray<
  readonly [canonicalKey: string, legacyKey: string]
> = [
  ["startPlacement", "startPosition"],
  ["endPlacement", "endPosition"],
  ["gridPlacement", "gridPosition"],
  ["isStartPlacement", "isStartPosition"],
];

function moveLegacyPlacementFields(
  target: UnknownRecord,
  source: UnknownRecord
): void {
  for (const [canonicalKey, legacyKey] of LEGACY_PLACEMENT_FIELD_PAIRS) {
    moveLegacyField(target, source, canonicalKey, legacyKey);
  }
}

/**
 * Renames a legacy `startPosition`/`startingPosition`-style key that holds a
 * STEP-shaped object (whole pictograph record, e.g. `SequenceData`'s start
 * cell) to its "placement" counterpart, recursively normalizing the moved
 * value itself via `normalizeLegacyStep`. Canonical key wins when both are
 * present.
 */
function moveLegacyStepLikeField(
  target: UnknownRecord,
  source: UnknownRecord,
  canonicalKey: string,
  legacyKey: string
): void {
  const winner =
    source[canonicalKey] !== undefined ? source[canonicalKey] : source[legacyKey];
  delete target[legacyKey];
  if (winner !== undefined) {
    target[canonicalKey] = normalizeLegacyStep(winner);
  }
}

export function normalizeLegacyHandSide(
  value: unknown
): HandSideValue | undefined {
  switch (value) {
    case HandSide.LEFT:
    case "blue":
      return HandSide.LEFT;
    case HandSide.RIGHT:
    case "red":
      return HandSide.RIGHT;
    default:
      return undefined;
  }
}

/**
 * Converts the legacy motion `color` field into canonical `hand` identity.
 * Unknown view-layer fields are retained so app data can use this at ingress.
 */
export function normalizeLegacyMotion<T>(value: T): T {
  if (!isRecord(value)) return value;

  const normalized: UnknownRecord = { ...value };
  const hand = normalizeLegacyHandSide(value.hand ?? value.color);
  delete normalized.color;
  if (hand !== undefined) normalized.hand = hand;
  return normalized as T;
}

/** Converts a legacy `{blue, red}` motion record into `{left, right}`. */
export function normalizeLegacyMotionRecord<T>(value: T): T {
  if (!isRecord(value)) return value;

  const left = value.left ?? value.blue;
  const right = value.right ?? value.red;
  return {
    ...(left !== undefined && { left: normalizeLegacyMotion(left) }),
    ...(right !== undefined && { right: normalizeLegacyMotion(right) }),
  } as T;
}

/**
 * Normalizes one persisted step while preserving all non-identity metadata.
 */
export function normalizeLegacyStep<T>(value: T): T {
  if (!isRecord(value)) return value;

  const normalized: UnknownRecord = { ...value };
  if (value.motions !== undefined) {
    normalized.motions = normalizeLegacyMotionRecord(value.motions);
  }

  if (
    normalized.leftReversal === undefined &&
    value.blueReversal !== undefined
  ) {
    normalized.leftReversal = value.blueReversal;
  }
  if (
    normalized.rightReversal === undefined &&
    value.redReversal !== undefined
  ) {
    normalized.rightReversal = value.redReversal;
  }
  delete normalized.blueReversal;
  delete normalized.redReversal;

  moveLegacyPlacementFields(normalized, value);

  return normalized as T;
}

export function normalizeLegacySteps<T>(values: readonly T[]): T[] {
  return values.map(normalizeLegacyStep);
}

/**
 * Converts legacy position-family keys on a pictograph-shaped record that
 * is not step- or sequence-shaped (a bare `PictographData`/render-layer
 * record). Steps and start-placement objects should go through
 * `normalizeLegacyStep` instead, which also covers this.
 */
export function normalizeLegacyPictograph<T>(value: T): T {
  if (!isRecord(value)) return value;

  const normalized: UnknownRecord = { ...value };
  if (value.motions !== undefined) {
    normalized.motions = normalizeLegacyMotionRecord(value.motions);
  }
  moveLegacyPlacementFields(normalized, value);
  return normalized as T;
}

/** Converts legacy reversal and position-family aliases on a step pairing. */
export function normalizeLegacyStepPairing<T>(value: T): T {
  if (!isRecord(value)) return value;

  const normalized: UnknownRecord = { ...value };
  moveLegacyField(normalized, value, "leftReversal", "blueReversal");
  moveLegacyField(normalized, value, "rightReversal", "redReversal");
  moveLegacyPlacementFields(normalized, value);
  return normalized as T;
}

/** Converts legacy per-color prop configuration into performer-relative keys. */
export function normalizeLegacyPropConfig<T>(value: T): T {
  if (!isRecord(value)) return value;

  const normalized: UnknownRecord = { ...value };
  moveLegacyField(normalized, value, "leftPropType", "bluePropType");
  moveLegacyField(normalized, value, "rightPropType", "redPropType");
  moveLegacyField(
    normalized,
    value,
    "leftPropDimensions",
    "bluePropDimensions"
  );
  moveLegacyField(
    normalized,
    value,
    "rightPropDimensions",
    "redPropDimensions"
  );
  return normalized as T;
}

/** Converts a generic legacy `{ blue, red }` hand pair into `{ left, right }`. */
export function normalizeLegacyHandPair<T>(value: T): T {
  if (!isRecord(value)) return value;

  const hasLegacyKey =
    Object.prototype.hasOwnProperty.call(value, "blue") ||
    Object.prototype.hasOwnProperty.call(value, "red");
  if (!hasLegacyKey) return value;

  const normalized: UnknownRecord = { ...value };
  moveLegacyField(normalized, value, "left", "blue");
  moveLegacyField(normalized, value, "right", "red");
  return normalized as T;
}

/**
 * Normalizes every known persisted hand-identity field on a sequence document.
 * This is deliberately structural and retains unrelated application metadata.
 */
export function normalizeLegacySequence<T>(value: T): T {
  if (!isRecord(value)) return value;

  const normalized: UnknownRecord = { ...value };
  moveLegacyField(normalized, value, "leftSoloProp", "blueSoloProp");
  moveLegacyField(normalized, value, "rightSoloProp", "redSoloProp");
  moveLegacyField(normalized, value, "leftPathHash", "bluePathHash");
  moveLegacyField(normalized, value, "rightPathHash", "redPathHash");
  moveLegacyField(normalized, value, "leftSoloHash", "blueSoloHash");
  moveLegacyField(normalized, value, "rightSoloHash", "redSoloHash");

  if (Array.isArray(value.steps)) {
    normalized.steps = normalizeLegacySteps(value.steps);
  }
  // `startPosition`/`startingPosition` are the pre-rename keys still present
  // on documents written before the placement rename shipped; `startPlacement`/
  // `startingPlacement` are canonical and win when both are present.
  moveLegacyStepLikeField(
    normalized,
    value,
    "startPlacement",
    "startPosition"
  );
  moveLegacyStepLikeField(
    normalized,
    value,
    "startingPlacement",
    "startingPosition"
  );
  if (Array.isArray(value.stepPairings)) {
    normalized.stepPairings = value.stepPairings.map(
      normalizeLegacyStepPairing
    );
  }
  if (value.loopSpec !== undefined) {
    normalized.loopSpec = normalizeLegacyHandPair(value.loopSpec);
  }
  if (value.intendedProp !== undefined) {
    normalized.intendedProp = normalizeLegacyPropConfig(value.intendedProp);
  }
  if (isRecord(value.creatorIntent)) {
    normalized.creatorIntent = {
      ...value.creatorIntent,
      ...(value.creatorIntent.propConfig !== undefined && {
        propConfig: normalizeLegacyPropConfig(value.creatorIntent.propConfig),
      }),
    };
  }

  return normalized as T;
}
