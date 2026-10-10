/**
 * Deterministic representative picks for the gallery drill's content peeks.
 *
 * The chooser tiles preview REAL sequences from each bucket (Spotify
 * genre-card style). Picks must be deterministic — random rotation reads as
 * instability and causes layout/identity churn between visits — so every
 * picker sorts by the grid's default kinetic-alphabet order and takes the
 * front of the list.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  resolveDifficultyLevel,
  resolveStepCount,
} from "#lib/shared/browse/services/browse-sorter.js";
import {
  compareKineticLetters,
  extractBaseLetter,
  sortSequencesByKineticAlphabet,
} from "#lib/shared/browse/utils/kinetic-alphabet-sort.js";

function firstByAlphabet(pool: SequenceData[]): SequenceData | undefined {
  return sortSequencesByKineticAlphabet([...pool])[0];
}

/** One representative sequence per difficulty level present in the pool. */
export function pickLevelRepresentatives(
  pool: readonly SequenceData[],
  levels: readonly number[]
): Map<number, SequenceData> {
  const reps = new Map<number, SequenceData>();
  for (const level of levels) {
    const rep = firstByAlphabet(
      pool.filter((seq) => resolveDifficultyLevel(seq) === level)
    );
    if (rep) reps.set(level, rep);
  }
  return reps;
}

/**
 * A shortest-bucket and longest-bucket representative. `minCount` mirrors the
 * value screen's bucket floor so the peeks preview buckets that actually
 * appear as choices.
 */
export function pickLengthPair(
  pool: readonly SequenceData[],
  minCount = 3
): { short?: SequenceData; long?: SequenceData; min?: number; max?: number } {
  const buckets = new Map<number, SequenceData[]>();
  for (const seq of pool) {
    const n = resolveStepCount(seq);
    if (n <= 0) continue;
    const bucket = buckets.get(n);
    if (bucket) bucket.push(seq);
    else buckets.set(n, [seq]);
  }
  const eligible = [...buckets.entries()]
    .filter(([, seqs]) => seqs.length >= minCount)
    .map(([n]) => n)
    .sort((a, b) => a - b);
  if (eligible.length === 0) return {};
  const min = eligible[0]!;
  const max = eligible[eligible.length - 1]!;
  return {
    short: firstByAlphabet(buckets.get(min) ?? []),
    long: firstByAlphabet(buckets.get(max) ?? []),
    min,
    max,
  };
}

/** First `n` sequences in the grid's default order — an honest preview of the
 * exact grid "Show all" lands on. */
export function pickCollage(
  pool: readonly SequenceData[],
  n = 4
): SequenceData[] {
  return sortSequencesByKineticAlphabet([...pool]).slice(0, n);
}

/** Distinct creators present in the pool — the legacy author_section, ported
 * to the web data model: `ownerDisplayName` is the human on the card;
 * `author` is legacy metadata (often a tool attribution like "TKA Explore"). */
export function deriveCreators(pool: readonly SequenceData[]): string[] {
  const creators = new Set<string>();
  for (const seq of pool) {
    const name = seq.ownerDisplayName?.trim();
    if (name) creators.add(name);
  }
  return [...creators];
}

/** Each creator's real avatar + owner id, keyed by `ownerDisplayName`. Takes
 * the first non-empty `ownerAvatarUrl`/`ownerId` seen for that creator so the
 * drill row can front a real profile photo (RobustAvatar falls back to a
 * monogram when neither is present). */
export function pickCreatorAvatars(
  pool: readonly SequenceData[]
): Map<string, { avatarUrl?: string; ownerId?: string }> {
  const byCreator = new Map<string, { avatarUrl?: string; ownerId?: string }>();
  for (const seq of pool) {
    const name = seq.ownerDisplayName?.trim();
    if (!name) continue;
    const entry = byCreator.get(name) ?? {};
    // Generated data-URL avatars are initials baked for whoever UPLOADED the
    // sequence, which can differ from the credited creator (a "Christofborkott"
    // row wearing an "AU" disc). Skip them; RobustAvatar regenerates initials
    // from the display name we actually show.
    const avatarUrl = seq.ownerAvatarUrl?.trim();
    if (!entry.avatarUrl && avatarUrl && !avatarUrl.startsWith("data:")) {
      entry.avatarUrl = avatarUrl;
    }
    if (!entry.ownerId && seq.ownerId?.trim()) {
      entry.ownerId = seq.ownerId.trim();
    }
    byCreator.set(name, entry);
  }
  return byCreator;
}

/** Up to `n` of each creator's own sequences (kinetic-alphabet order, so the
 * same work fronts a creator's row every visit). Keyed by ownerDisplayName —
 * the creator screen's row art, so a name is backed by the actual work. */
export function pickCreatorSamples(
  pool: readonly SequenceData[],
  n = 3
): Map<string, SequenceData[]> {
  const byCreator = new Map<string, SequenceData[]>();
  for (const seq of sortSequencesByKineticAlphabet([...pool])) {
    const name = seq.ownerDisplayName?.trim();
    if (!name) continue;
    const bucket = byCreator.get(name);
    if (!bucket) byCreator.set(name, [seq]);
    else if (bucket.length < n) bucket.push(seq);
  }
  return byCreator;
}

/**
 * The Creators module joins gallery work to user profiles by immutable owner
 * ID. Display names are not unique and can change, so the name-keyed gallery
 * drill helper above is deliberately not used for this join.
 */
export function pickCreatorSamplesByOwnerId(
  pool: readonly SequenceData[],
  n = 3
): Map<string, SequenceData[]> {
  const byOwnerId = new Map<string, SequenceData[]>();
  for (const seq of sortSequencesByKineticAlphabet([...pool])) {
    const ownerId = seq.ownerId?.trim();
    if (!ownerId) continue;
    const bucket = byOwnerId.get(ownerId);
    if (!bucket) byOwnerId.set(ownerId, [seq]);
    else if (bucket.length < n) bucket.push(seq);
  }
  return byOwnerId;
}

/** Options for {@link dealByOwner}. */
export interface DealByOwnerOptions {
  /** Max pieces taken from any single owner. Default 4. */
  readonly perOwner?: number;
  /** Max total tiles returned across all owners. Default 25. */
  readonly limit?: number;
}

/**
 * `SequenceData` has no `publishedAt` field of its own. The public-sequences
 * loader folds Firestore's `publishedAt` into `dateAdded`
 * (`birthday ?? publishedAt`) and Firestore's `updatedAt` into `createdAt`
 * (`public-sequences-loader.ts:328,330`). So "newest published" reads as
 * `dateAdded` here, falling back to `createdAt` when `dateAdded` is absent.
 * Returns `undefined`, never throws, when neither is set.
 */
function publishTimeMs(seq: SequenceData): number | undefined {
  return seq.dateAdded?.getTime() ?? seq.createdAt?.getTime();
}

/**
 * Orders sequences newest-published first. Ties (equal or both-missing
 * publish time) break via the deterministic kinetic-alphabet sort, applied
 * as a stable pre-sort so the date comparator never needs to inspect it
 * directly. Pure - never mutates `seqs`.
 */
function sortNewestPublishedFirst(
  seqs: readonly SequenceData[]
): SequenceData[] {
  return sortSequencesByKineticAlphabet([...seqs]).sort((a, b) => {
    const timeA = publishTimeMs(a);
    const timeB = publishTimeMs(b);
    if (timeA !== undefined && timeB !== undefined) return timeB - timeA;
    if (timeA !== undefined) return -1;
    if (timeB !== undefined) return 1;
    return 0; // Neither has a publish time - keep the kinetic-alphabet order.
  });
}

/**
 * The Wall's tile list: every owner's newest work, capped per owner so no
 * single creator can dominate the room, merged back into one newest-first
 * list. `pickCreatorSamplesByOwnerId` above buckets the same way but orders
 * each bucket kinetic-alphabetically and never merges buckets back into a
 * single ranked list - this is the publish-recency sibling that the Wall
 * needs.
 *
 * Deterministic and pure: no `Date.now()`, no `Math.random()`. The same pool
 * (in the same order) always produces the same output.
 */
export function dealByOwner(
  pool: readonly SequenceData[],
  opts: DealByOwnerOptions = {}
): SequenceData[] {
  const perOwner = opts.perOwner ?? 4;
  const limit = opts.limit ?? 25;

  const byOwnerId = new Map<string, SequenceData[]>();
  for (const seq of pool) {
    const ownerId = seq.ownerId?.trim();
    if (!ownerId) continue;
    const bucket = byOwnerId.get(ownerId);
    if (bucket) bucket.push(seq);
    else byOwnerId.set(ownerId, [seq]);
  }

  const takes: SequenceData[] = [];
  for (const bucket of byOwnerId.values()) {
    takes.push(...sortNewestPublishedFirst(bucket).slice(0, perOwner));
  }

  return sortNewestPublishedFirst(takes).slice(0, limit);
}

/** Distinct base letters present in the pool (incl. dash variants like "W-"),
 * in canonical kinetic-alphabet order. */
export function deriveStartingLetters(pool: readonly SequenceData[]): string[] {
  const letters = new Set<string>();
  for (const seq of pool) {
    const letter = extractBaseLetter(seq.word ?? "");
    if (letter) letters.add(letter);
  }
  return [...letters].sort(compareKineticLetters);
}

/** Starting-letter choices that still produce results after every other live
 * gallery rule is applied. Applied letters stay visible at zero so the user
 * can see and remove every part of the current rule. */
export function deriveAvailableStartingLetterOptions(
  pool: readonly SequenceData[],
  getCount: (letter: string) => number,
  isApplied: (letter: string) => boolean = () => false
): Array<{ value: string; count: number }> {
  return deriveStartingLetters(pool)
    .map((letter) => ({ value: letter, count: getCount(letter) }))
    .filter((option) => option.count > 0 || isApplied(option.value));
}
