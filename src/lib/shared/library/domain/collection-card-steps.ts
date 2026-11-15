/**
 * The step counts of a public collection's cards, stored on the collection
 * record so a first-time visitor's placeholders can stand in the cards' own
 * rows before any catalogue or member has loaded.
 *
 * The stored list is a hint with a stamp. `key` fingerprints the ordered
 * `sequenceIds` it was computed for, so any writer that changes membership
 * without knowing about this field (another client, the membership callable,
 * an old app version) invalidates it simply by changing the ids. A reader
 * recomputes the key from the ids it holds and ignores a mismatch.
 */

import {
  isSmartCollection,
  type LibraryCollection,
} from "./models/collection.js";

export interface CollectionCardSteps {
  readonly key: string;
  readonly steps: readonly number[];
}

/** More than this many cards go to the virtualized grid, which has no rows to match. */
const MAX_STORED_STEPS = 500;

/**
 * Short, order-sensitive stamp of a membership list: FNV-1a (32-bit) over the
 * ids, each followed by a separator no id contains, prefixed with the count.
 */
export function cardStepsKey(sequenceIds: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const id of sequenceIds) {
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0x1f;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${sequenceIds.length}-${hash.toString(36)}`;
}

/** A stored field read as data: anything malformed reads as absent. */
export function parseCardSteps(raw: unknown): CollectionCardSteps | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const { key, steps } = raw as Record<string, unknown>;
  if (typeof key !== "string" || key === "") return undefined;
  if (
    !Array.isArray(steps) ||
    steps.length === 0 ||
    steps.length > MAX_STORED_STEPS
  ) {
    return undefined;
  }
  for (const n of steps) {
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
      return undefined;
    }
  }
  return { key, steps: steps as number[] };
}

/**
 * The stored steps, only when they still describe this collection's
 * membership. Null for smart collections, a missing or malformed field, a key
 * mismatch, or a list longer than the count of public members the viewer's
 * record carries (a member went private since the list was stored).
 */
export function storedCardSteps(
  collection: LibraryCollection
): readonly number[] | null {
  if (isSmartCollection(collection)) return null;
  const stored = parseCardSteps(collection.cardSteps);
  if (!stored) return null;
  if (stored.key !== cardStepsKey(collection.sequenceIds)) return null;
  if (stored.steps.length > collection.sequenceCount) return null;
  return stored.steps;
}

export interface CardStepsWriteInput {
  collection: LibraryCollection;
  /** The signed-in viewer, null when nobody is. */
  viewerId: string | null;
  /** The public-view answer from the catalogue; null when not certain. */
  steps: readonly number[] | null;
  online: boolean;
}

/**
 * The value to write to the owner's own public collection, or null when
 * nothing should be written: not the owner, private, smart, a system
 * collection, offline, no certain answer, or the stored value already matches.
 */
export function cardStepsToWrite({
  collection,
  viewerId,
  steps,
  online,
}: CardStepsWriteInput): CollectionCardSteps | null {
  if (!online || !steps || steps.length === 0) return null;
  if (!viewerId || collection.ownerId !== viewerId) return null;
  if (!collection.isPublic || isSmartCollection(collection)) return null;
  if (collection.systemType !== undefined) return null;
  const key = cardStepsKey(collection.sequenceIds);
  const stored = parseCardSteps(collection.cardSteps);
  if (
    stored &&
    stored.key === key &&
    stored.steps.length === steps.length &&
    stored.steps.every((n, i) => n === steps[i])
  ) {
    return null;
  }
  return { key, steps: [...steps] };
}
