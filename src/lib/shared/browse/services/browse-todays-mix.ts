/**
 * "Today's mix": one shuffled order of the wall that every visitor sees on a
 * given UTC day, and that changes the next day. It exists so the wall does not
 * open on the A sequences for everyone.
 *
 * Each sequence sorts by a hash of its id and the day, ties by id. A sequence's
 * place depends only on the sequences around it by hash, so cards do not jump
 * when more of the catalogue arrives; new ones slot in.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { hashString } from "#lib/shared/foundation/services/content-hasher.js";

/** The UTC date as YYYY-MM-DD. */
export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// hashString does BigInt arithmetic; typing in the search box re-sorts the
// pool on every keystroke, so remember each id's hash for the day.
let cachedDay = "";
const hashCache = new Map<string, string>();

function mixHash(id: string, day: string): string {
  if (day !== cachedDay) {
    cachedDay = day;
    hashCache.clear();
  }
  let hash = hashCache.get(id);
  if (hash === undefined) {
    // hashString is FNV-1a: a change in the last characters (the day, here)
    // barely moves the leading digits and fully moves the trailing ones, so the
    // key is read from the back. Read from the front the day would hardly
    // reshuffle anything.
    hash = [...hashString(`${id}|${day}`)].reverse().join("");
    hashCache.set(id, hash);
  }
  return hash;
}

/** A new array in today's mix order. `now` is passed in so tests can pick the day. */
export function sortByTodaysMix(
  sequences: readonly SequenceData[],
  now: Date = new Date()
): SequenceData[] {
  const day = utcDayKey(now);
  return sequences
    .map((sequence) => ({ sequence, hash: mixHash(sequence.id, day) }))
    .sort((a, b) =>
      a.hash < b.hash
        ? -1
        : a.hash > b.hash
          ? 1
          : a.sequence.id < b.sequence.id
            ? -1
            : a.sequence.id > b.sequence.id
              ? 1
              : 0
    )
    .map((entry) => entry.sequence);
}
