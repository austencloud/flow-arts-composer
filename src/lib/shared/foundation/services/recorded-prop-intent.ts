import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { parsePropTypeFromURLValue } from "#lib/shared/navigation/services/sequence-encoder.js";

/** A raw, untrusted prop-config shape. Values come from Firestore wire data,
 * URL params, or scan telemetry, so nothing is assumed valid until parsed. */
export interface PropConfigCandidate {
  leftPropType?: unknown;
  rightPropType?: unknown;
  catDogMode?: unknown;
}

export interface ResolvedPropConfig {
  leftPropType: PropType;
  rightPropType: PropType;
  catDogMode: boolean;
}

export function propFromCandidates(
  hand: "leftPropType" | "rightPropType",
  candidates: readonly (PropConfigCandidate | null | undefined)[]
): PropType | undefined {
  for (const candidate of candidates) {
    const raw = candidate?.[hand];
    if (typeof raw !== "string") continue;
    const propType = parsePropTypeFromURLValue(raw);
    if (propType) return propType;
  }
  return undefined;
}

export function catDogFromCandidates(
  candidates: readonly (PropConfigCandidate | null | undefined)[]
): boolean | undefined {
  for (const candidate of candidates) {
    if (typeof candidate?.catDogMode === "boolean") {
      return candidate.catDogMode;
    }
  }
  return undefined;
}

/** Creator-recorded evidence on the sequence itself, strongest first.
 * Deliberately excludes per-motion propType: public-index hydration derives
 * steps with a staff default, so motion data on hydrated public sequences
 * always reads staff and would poison any fallback built on it. */
export function sequenceIntentCandidates(
  sequence: SequenceData | null | undefined
): (PropConfigCandidate | null | undefined)[] {
  return [sequence?.creatorIntent?.propConfig, sequence?.intendedProp];
}

/** The slice of AppSettings that describes the creator's active prop pair. */
export interface ActivePropSettings {
  leftPropType?: PropType;
  rightPropType?: PropType;
  /** Legacy single-prop field, still the only value on old profiles. */
  propType?: PropType;
  catDogMode?: boolean;
}

/**
 * The prop pair a creator is actively looking at, for stamping onto a
 * sequence at a publication moment. Settings always resolve to a pair (staff
 * is the app's render default), so unlike resolveRecordedPropConfig this
 * never returns null.
 */
export function captureActivePropConfig(
  settings: ActivePropSettings
): ResolvedPropConfig {
  const leftPropType =
    settings.leftPropType ?? settings.propType ?? PropType.STAFF;
  const rightPropType =
    settings.rightPropType ?? settings.propType ?? PropType.STAFF;
  return {
    leftPropType,
    rightPropType,
    catDogMode:
      leftPropType !== rightPropType ? true : (settings.catDogMode ?? false),
  };
}

/**
 * The prop pair the creator recorded for this sequence, or null when no valid
 * recording exists. Both hands must parse — a half-valid record is corrupt,
 * not a recording — and null means the caller keeps its own context (public
 * previews fall back to the visitor's props). Never returns a guessed default.
 */
export function resolveRecordedPropConfig(
  sequence: SequenceData | null | undefined
): ResolvedPropConfig | null {
  const candidates = sequenceIntentCandidates(sequence);
  const leftPropType = propFromCandidates("leftPropType", candidates);
  const rightPropType = propFromCandidates("rightPropType", candidates);
  if (!leftPropType || !rightPropType) return null;

  const recordedCatDog = catDogFromCandidates(candidates);
  return {
    leftPropType,
    rightPropType,
    // A mixed pair is cat-dog by construction, even when an older record's
    // sequence-level flag says false — same inference the scan resolver uses.
    catDogMode:
      leftPropType !== rightPropType ? true : (recordedCatDog ?? false),
  };
}
