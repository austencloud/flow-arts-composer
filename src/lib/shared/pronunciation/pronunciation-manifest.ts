import { normalizeLetter } from "#lib/shared/foundation/domain/models/letter.js";
import {
  PRONUNCIATION_POSITIONS,
  type AnyPronunciationManifest,
  type PronunciationManifest,
  type PronunciationToken,
  type PronunciationTokenBank,
} from "./pronunciation-plan";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonNegativeNumber(value: unknown): boolean {
  return isFiniteNumber(value) && value >= 0;
}

function isPositiveNumber(value: unknown): boolean {
  return isFiniteNumber(value) && value > 0;
}

function isPosition(value: unknown): boolean {
  return PRONUNCIATION_POSITIONS.includes(
    value as (typeof PRONUNCIATION_POSITIONS)[number]
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * A neighbour must be a canonical letter VALUE, not an asset key. The selector
 * compares these against `PronunciationCue.letter`, whose values are the
 * alphabet itself — `"Σ-"`, `"τ-"`, `"⊕"` — while the same letter's asset key
 * is `"sigma-dash"`. Asset keys are what the bank is keyed by and what appears
 * in every token path, so writing them here is the natural mistake for a bank
 * generator to make. Accepting any non-empty string let that mistake through
 * silently: the manifest parses, playback works, and every token of every word
 * pays a full neighbour mismatch, collapsing selection to length and join cost
 * with no error anywhere.
 */
function isNullableLetter(value: unknown): boolean {
  if (value === null) return true;
  return isNonEmptyString(value) && normalizeLetter(value) !== null;
}

export function isPronunciationManifestV1(
  value: unknown
): value is PronunciationManifest {
  if (!isObject(value) || value.version !== 1 || !isObject(value.recordings)) {
    return false;
  }

  return Object.values(value.recordings).every((recordingSet) => {
    if (!isObject(recordingSet)) return false;
    return Object.entries(recordingSet).every(
      ([position, path]) => isPosition(position) && isNonEmptyString(path)
    );
  });
}

/**
 * `position` and neighbour-nullness encode the same fact. A token that claims
 * to be initial while carrying a previous letter is internally inconsistent,
 * and the selector reads both fields as if they agreed.
 */
function hasCoherentContext(token: Record<string, unknown>): boolean {
  const atStart = token.position === "initial" || token.position === "isolated";
  const atEnd = token.position === "final" || token.position === "isolated";
  return (
    (token.previousLetter === null) === atStart &&
    (token.nextLetter === null) === atEnd
  );
}

function isToken(value: unknown): value is PronunciationToken {
  if (!isObject(value)) return false;
  const fieldsValid =
    isNonEmptyString(value.path) &&
    isPosition(value.position) &&
    isNullableLetter(value.previousLetter) &&
    isNullableLetter(value.nextLetter) &&
    typeof value.sourceWord === "string" &&
    isNonNegativeInteger(value.indexInWord) &&
    isPositiveInteger(value.groupLength) && // a group always holds at least one letter
    isPositiveNumber(value.durationMs) && // a 0 ms token plays nothing, silently dropping a letter
    isFiniteNumber(value.rmsDb) && // dBFS is legitimately negative
    isNonNegativeNumber(value.f0StartHz) && // 0 is the established unvoiced sentinel
    isNonNegativeNumber(value.f0EndHz);
  return fieldsValid && hasCoherentContext(value);
}

export function isPronunciationTokenBank(
  value: unknown
): value is PronunciationTokenBank {
  if (!isObject(value) || value.version !== 2 || !isObject(value.tokens)) {
    return false;
  }

  return Object.values(value.tokens).every(
    (tokens) => Array.isArray(tokens) && tokens.every(isToken)
  );
}

/**
 * Parse either manifest format. Returning null keeps a malformed manifest from
 * silently degrading playback into a half-loaded bank; the player falls through
 * to speech synthesis instead.
 */
export function parsePronunciationManifest(
  value: unknown
): AnyPronunciationManifest | null {
  if (isPronunciationTokenBank(value)) return value;
  if (isPronunciationManifestV1(value)) return value;
  return null;
}
