/**
 * Sequence persistence normalizer — the one gate an owner sequence passes
 * through before it is allowed to become stored data.
 *
 * Today nothing combines hydration, composition, exact-word validation,
 * canonical length, and identity hash in one place, so each write path solves a
 * different subset and gets a different subset wrong. Three defects in the live
 * corpus trace directly to that:
 *
 *   - `library-repository.ts:708` does `word: sequence.word || metadata.name`,
 *     which is how auto-titles like "Assemble Sequence" became stored WORDS.
 *   - `public-index-syncer.ts:158` does `sequenceLength: sequence.steps?.length ?? 0`,
 *     which is how three live public documents ended up with length 0: an
 *     unhydrated composition-only sequence has no `steps` array at all.
 *   - a partially-resolved word ("GI" from twelve beats) sailed into Firestore
 *     because the permissive display deriver silently drops unlettered beats.
 *
 * This module fixes the shape of the problem rather than each symptom: one
 * normalization, one fixed operation order, one typed refusal.
 *
 * ## What it is not
 *
 * No Firestore reads or writes, no UI state, no cache updates, no toasts, no
 * error modals. Pure orchestration over already-shared services, so it is safe
 * to run before a transaction, inside one, or from Admin/Node migration tooling
 * (`npx tsx scripts/migrations/*.ts`). Every dependency below was probed under
 * plain tsx and imports cleanly; see the `stripUndefinedDeep` note for the one
 * primitive that could NOT be imported and why.
 *
 * Timestamps and Firestore `FieldValue` sentinels are deliberately absent from
 * the output. `ownerData` is a plain, sentinel-free domain payload with real
 * `Date`s. Substituting `serverTimestamp()` for `updatedAt`/`createdAt` and
 * bumping `_version` are write-time concerns owned by the repository/persister
 * layer, which must stay usable from migration tooling that does not want live
 * sentinels.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { isHandPathSequence } from "$lib/shared/foundation/domain/models/sequence-kind";
import type { LibrarySequence } from "$lib/shared/library/domain/models/library-sequence";
import type { WordDerivationStatus } from "$lib/shared/foundation/services/word-deriver";
import {
  ensureComposition,
  hydrate,
} from "$lib/shared/foundation/services/sequence-hydrator";
import {
  deriveWordStatus,
  IncompleteWordError,
} from "$lib/shared/foundation/services/word-deriver";
import {
  getPersistedStepCount,
  isEmptySequence,
  withCanonicalStepCount,
} from "$lib/shared/library/domain/sequence-min-length";
import {
  CONTENT_HASH_VERSION,
  computeHash,
} from "$lib/shared/library/services/sequence-content-hasher";

// Types

/**
 * Fields that must never reach a stored document.
 *
 * `steps` is derived from the compositional fields on every read and is not
 * persisted. `startingPlacement` / `startingPlacementGroup` are dead legacy
 * aliases. `syncStatus` / `pendingSyncMetadata` are Dexie-local sync bookkeeping
 * that `sequence-data.ts:203-227` documents as browser-only.
 *
 * This is the exact set `library-repository.ts:526-533` nulls out today, so the
 * normalized payload is shape-identical to what already reaches `setDoc`.
 * `startPlacement` is deliberately NOT excluded: it is not derivable from the
 * compositional fields, and dropping it is what produced the empty start cells
 * the 2026-06 backfill had to repair.
 */
type PersistenceExcludedKey =
  | "steps"
  | "startingPlacement"
  | "startingPlacementGroup"
  | "syncStatus"
  | "pendingSyncMetadata";

/**
 * The document payload a normalized sequence writes.
 *
 * Derived from the incoming sequence type rather than hand-listed, so it cannot
 * drift from `SequenceData` / `LibrarySequence` the way a duplicated interface
 * would. The intersection pins the four fields normalization guarantees: after
 * this module runs they are present and exact, never optional.
 */
export type SequenceWritePayload<T extends SequenceData = SequenceData> = Omit<
  T,
  PersistenceExcludedKey
> & {
  /** Strict-derived exact word. Never a name, title, or display label. */
  readonly word: string;
  /** Canonical beat count from the persisted source of truth. */
  readonly sequenceLength: number;
  /** Identity hash of the normalized motion data. */
  readonly contentHash: string;
  /** Basis `contentHash` was computed under. */
  readonly contentHashVersion: number;
};

/**
 * The owner-document write shape for a library sequence.
 *
 * The design spec calls this `LibrarySequenceWriteData` and references it as if
 * it already existed. It does not — `grep -rn "LibrarySequenceWriteData" src/`
 * returns nothing, and the real write object at `library-repository.ts:521` is
 * an untyped object literal immediately widened to `Record<string, unknown>` by
 * `stripUndefined` at `:551`. So the name is kept (nothing else claims it) but
 * the TYPE is derived from `LibrarySequence`, which already declares every field
 * the write persists, instead of re-declaring a parallel interface that would
 * silently drift.
 *
 * It lives here rather than beside `LibrarySequence` only because Phase 1 is
 * scoped to new files; it belongs in `library-sequence.ts` when a later phase
 * touches that module.
 */
export type LibrarySequenceWriteData = SequenceWritePayload<LibrarySequence>;

/** Everything a caller needs to write an owner document and derive a mirror. */
export interface NormalizedSequenceWrite<
  T extends SequenceData = SequenceData,
> {
  /**
   * The fully normalized in-memory sequence, steps included. This is what the
   * content hash was computed from and what a projection builder should read.
   */
  readonly hydrated: T;
  /** The document payload, with derived and local-only fields removed. */
  readonly ownerData: SequenceWritePayload<T>;
  /** One notation token per content beat, in beat order. */
  readonly exactWord: string;
  /** Canonical beat count. Never `steps?.length ?? 0`. */
  readonly sequenceLength: number;
  readonly contentHash: string;
  readonly contentHashVersion: number;
  /** The strict derivation that produced `exactWord`, for reporting. */
  readonly wordStatus: WordDerivationStatus;
}

/** Why a sequence could not be normalized, other than an incomplete word. */
export type SequenceNormalizationFailureCode =
  /** Nothing to persist: no beats and no compositional pairings. */
  | "EMPTY_SEQUENCE"
  /**
   * Pairings exist but hydration produced no steps, so there is no motion data
   * to validate, count, or hash. Almost always a document whose
   * `leftSoloProp` / `rightSoloProp` are missing. Failing here is deliberate:
   * hashing zero steps would mint a plausible identity for an empty movement.
   */
  | "UNHYDRATABLE_SEQUENCE"
  /**
   * The sequence contains `isBlank` steps, which the persistence layer cannot
   * round-trip today: `extractStepPairings` (sequence-decomposer.ts:82) does not
   * carry the flag and `step-deriver.ts:156` rebuilds every step with
   * `isBlank: false`. Persisting one would store a word that skips the blank,
   * then rehydrate the blank as an unresolved beat — so the NEXT save throws
   * IncompleteWordError and the identity hash moves (`isBlank` is in the V2
   * hash basis, sequence-content-hasher.ts:132). Refusing loudly beats
   * corrupting silently. No production path creates a blank step today
   * (verified 2026-07-25: the only `isBlank: true` writers are Write-module
   * sheet CELLS, a different type). Lift this only after `stepPairings`
   * persists the flag and `deriveSteps` restores it.
   */
  | "BLANK_STEPS_UNSUPPORTED";

/** Typed refusal. Carries the counts that explain the decision. */
export class SequenceNormalizationError extends Error {
  constructor(
    readonly code: SequenceNormalizationFailureCode,
    message: string,
    /** Hydrated beat count at the moment of refusal. */
    readonly stepCount: number,
    /** `getPersistedStepCount` at the moment of refusal. */
    readonly persistedStepCount: number
  ) {
    super(message);
    this.name = "SequenceNormalizationError";
  }
}

/** Non-throwing form, for migration tooling that classifies instead of failing. */
export type SequenceNormalizationResult<T extends SequenceData = SequenceData> =
  | { readonly ok: true; readonly value: NormalizedSequenceWrite<T> }
  | {
      readonly ok: false;
      readonly code: SequenceNormalizationFailureCode;
      readonly error: SequenceNormalizationError;
    }
  | {
      readonly ok: false;
      readonly code: "INCOMPLETE_WORD";
      readonly error: IncompleteWordError;
    };

// Normalization

/**
 * Normalize a sequence for persistence, or refuse with a typed error.
 *
 * The operation order is fixed and load-bearing — reordering any pair
 * reintroduces a shipped defect:
 *
 *   1. Hydrate when `steps` are absent — a composition-only document has no
 *      beats to read until it is hydrated. Counting or hashing first is what
 *      produced `sequenceLength: 0`.
 *   2. Strip legacy inline start entries (`stepNumber === 0`) — BEFORE anything
 *      counts, composes, or hashes. Legacy raw-`steps` documents carry the
 *      start position as a letterless step 0; `extractStepPairings` and
 *      `extractSoloProp` map `steps` 1:1, so leaving it in mints a pairing and
 *      a solo-prop beat for a non-beat: `sequenceLength` disagrees with the
 *      word by one, and the next pairings-only republish throws
 *      IncompleteWordError on the letterless leading pairing — a locked
 *      document. The stripped entry's data is not lost: `ensureComposition`
 *      derives `startPlacement` from the first content beat's start locations,
 *      which the start entry duplicates by construction. This also normalizes
 *      the V2 content hash to the content-beats-only basis, so a legacy-shape
 *      document and its modern twin share one identity (the hasher maps
 *      `sequence.steps` verbatim; the version-aware lazy-rehash seam absorbs
 *      the correction exactly as it did the V1→V2 flip).
 *   3. Reject empty data — before deriving anything from nothing.
 *   4. Refresh compositional fields from the hydrated sequence — so the stored
 *      composition matches the stored motion data, not a stale earlier edit.
 *   5. Validate one exact token per beat — BEFORE stamping, so a partial word
 *      can never be written. Blank (`isBlank`) steps are refused here too; see
 *      BLANK_STEPS_UNSUPPORTED for why they cannot round-trip yet.
 *   6. Stamp the exact word.
 *   7. Stamp the canonical count — from the persisted source of truth.
 *   8. Hash the normalized data — after every field it covers is final, so the
 *      stored hash describes the stored document.
 *   9. Strip `undefined` last — a cleanup pass, never a validation pass.
 *
 * @throws {SequenceNormalizationError} when there is nothing to persist, or
 *   when the sequence contains blank steps the layer cannot round-trip.
 * @throws {IncompleteWordError} when any content beat resolved no token.
 */
export async function normalizeSequenceForPersistence<T extends SequenceData>(
  sequence: T
): Promise<NormalizedSequenceWrite<T>> {
  // 1. Hydrate when steps are absent. A sequence that already carries steps is
  //    the authority on its own beats; re-hydrating would discard in-flight
  //    edits that have not been decomposed yet.
  const asHydrated =
    sequence.steps && sequence.steps.length > 0
      ? sequence
      : (hydrate(sequence) as T);

  // 2. Strip legacy inline start entries. Only legacy raw-`steps` blobs carry
  //    one (`stepNumber === 0`, letterless by design); the modern write path
  //    never emits it — `startPlacement` is its own field, derived from the
  //    first CONTENT beat. Downstream, everything (pairings, solo props,
  //    counts, hash, word gate) must see content beats only.
  const hasStartEntry = asHydrated.steps?.some((step) => step.stepNumber === 0);
  const hydrated = hasStartEntry
    ? ({
        ...asHydrated,
        steps: asHydrated.steps.filter((step) => step.stepNumber !== 0),
      } as T)
    : asHydrated;

  // 3. Reject empty data.
  const persistedStepCount = getPersistedStepCount(hydrated);
  const stepCount = hydrated.steps?.length ?? 0;

  // `isEmptySequence` reads `getPersistedStepCount`, which prefers a present
  // `stepPairings` array even when it is empty. A steps-only input that carries
  // an explicit `stepPairings: []` is therefore "empty" by that measure while
  // holding real motion data that step 4 is about to decompose. Require BOTH
  // measures to be empty before refusing, so the only rejected input is one
  // with genuinely nothing in it. (A document holding ONLY a start entry has
  // stepCount 0 after the strip and is rejected here — a start position with
  // no beats is not a sequence.)
  if (isEmptySequence(hydrated) && stepCount === 0) {
    throw new SequenceNormalizationError(
      "EMPTY_SEQUENCE",
      "Sequence has no beats and no compositional pairings; there is nothing to persist.",
      stepCount,
      persistedStepCount
    );
  }

  if (stepCount === 0) {
    throw new SequenceNormalizationError(
      "UNHYDRATABLE_SEQUENCE",
      `Sequence has ${persistedStepCount} persisted pairing(s) but hydration produced no steps; ` +
        "its compositional prop paths are missing or malformed.",
      stepCount,
      persistedStepCount
    );
  }

  // 4. Derive or refresh compositional fields from the hydrated sequence.
  //    Deliberately NOT wrapped in try/catch: `library-repository.ts:502-507`
  //    swallows every composition failure and saves anyway, which is how
  //    documents reach Firestore without the fields their readers require. A
  //    failure here must surface with its cause intact.
  const composed = ensureComposition(hydrated) as T;

  // 5 + 6. Validate one exact token per beat, then stamp it. Strict derivation
  //    never consults `word`, `name`, `displayName`, or `intendedWord`, so an
  //    auto-title has no path into this field. Refusals fire before anything
  //    is stamped. Same semantics as `requireCompleteWord`, derived once so the
  //    blank gate reads the same status.
  const wordStatus = deriveWordStatus(composed);
  if (
    !isHandPathSequence(composed) &&
    (!wordStatus.complete || wordStatus.word.length === 0)
  ) {
    throw new IncompleteWordError(wordStatus);
  }
  if (wordStatus.blankStepIndexes.length > 0) {
    throw new SequenceNormalizationError(
      "BLANK_STEPS_UNSUPPORTED",
      `Sequence has ${wordStatus.blankStepIndexes.length} blank (isBlank) step(s) at ` +
        `content index(es) ${wordStatus.blankStepIndexes.join(", ")}. The persistence ` +
        "layer cannot round-trip the blank flag yet (stepPairings does not carry it), " +
        "so storing this sequence would corrupt its word and identity hash on the next " +
        "save. Remove the blank steps, or persist isBlank in stepPairings first.",
      stepCount,
      persistedStepCount
    );
  }
  // A hand path has a literal title, not a notation word.
  const exactWord = isHandPathSequence(composed) ? "" : wordStatus.word;
  const worded = { ...composed, word: exactWord } as T;

  // 7. Stamp the canonical sequence length from the persisted source of truth.
  const counted = withCanonicalStepCount(worded);
  const sequenceLength = getPersistedStepCount(counted);

  // 8. Compute the active-version content hash from the normalized data, so the
  //    stored identity describes exactly the document being stored.
  const contentHash = await computeHash(counted);
  const contentHashVersion = CONTENT_HASH_VERSION;

  // 9. Strip undefined — only now that every validation above has passed.
  const payload = {
    ...counted,
    contentHash,
    contentHashVersion,
    steps: undefined,
    startingPlacement: undefined,
    startingPlacementGroup: undefined,
    syncStatus: undefined,
    pendingSyncMetadata: undefined,
  } as unknown as Record<string, unknown>;

  const ownerData = stripUndefinedDeep(
    payload
  ) as unknown as SequenceWritePayload<T>;

  return {
    hydrated: counted,
    ownerData,
    exactWord,
    sequenceLength,
    contentHash,
    contentHashVersion,
    wordStatus,
  };
}

/**
 * Non-throwing normalization.
 *
 * The corpus-repair migration has to classify and report records it cannot fix
 * rather than abort on the first bad one, so it needs the failure as a value.
 * Only the two known typed failures are converted; anything else rethrows with
 * its cause intact — an unexpected error must never be laundered into a tidy
 * "this record was skipped".
 */
export async function trySequenceNormalization<T extends SequenceData>(
  sequence: T
): Promise<SequenceNormalizationResult<T>> {
  try {
    return { ok: true, value: await normalizeSequenceForPersistence(sequence) };
  } catch (error) {
    if (error instanceof IncompleteWordError) {
      return { ok: false, code: "INCOMPLETE_WORD", error };
    }
    if (error instanceof SequenceNormalizationError) {
      return { ok: false, code: error.code, error };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Deep `undefined` removal for a validated domain payload.
 *
 * This is NOT a duplicate of `stripUndefined` in
 * `$lib/shared/firestore/firestore-helpers` — it is the same cleanup at a
 * different layer, and it cannot import that one:
 *
 *   1. Layer. The Firestore helper's one distinguishing behavior is preserving
 *      `FieldValue` sentinels (`serverTimestamp()`, `increment()`), which a
 *      normalized owner payload never contains by construction — sentinels are
 *      substituted by the persister AFTER normalization. That helper cleans a
 *      Firestore payload; this cleans validated domain data.
 *   2. Node safety, verified not assumed. Importing it pulls
 *      `firestore-helpers.ts:9` -> `auth/state/auth-state.svelte` ->
 *      `auth/get-user-document-manager` -> `$app/*`. Probed under `npx tsx`:
 *      `ERR_MODULE_NOT_FOUND: Cannot find package '$app'`. That import would
 *      make this module unloadable from every migration script.
 *
 * Semantics match the canonical helper otherwise: recurse into plain objects,
 * map over arrays, and leave `Date` instances intact (a `Date` has no own
 * enumerable keys, so recursing into one would flatten it to `{}`). Firestore
 * timestamps get converted through their shared `toDate()` contract first.
 * Browser and Admin timestamps are different classes, so an `instanceof`
 * check would protect one write path while leaving the other corruptible.
 */
function normalizePersistenceValue(value: unknown): unknown {
  if (value instanceof Date) return value;

  if (
    value !== null &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = (value as { toDate(): unknown }).toDate();
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new TypeError("Timestamp-like value returned an invalid Date");
    }
    return date;
  }

  if (Array.isArray(value)) return value.map(normalizePersistenceValue);
  if (value !== null && typeof value === "object") {
    return stripUndefinedDeep(value as Record<string, unknown>);
  }
  return value;
}

function stripUndefinedDeep<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    result[key] = normalizePersistenceValue(value);
  }
  return result as T;
}
