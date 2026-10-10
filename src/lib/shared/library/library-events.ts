/**
 * library-events.ts
 *
 * Lets different parts of the app react when a sequence is added or deleted.
 *
 * THE PROBLEM:
 * The sequence detail panel (the drawer that slides open when you tap a sequence)
 * has a delete button. When you delete a sequence there, any other screen that's
 * showing that same sequence needs to remove it from its list - otherwise the
 * deleted sequence stays visible until the next page refresh.
 *
 * Similarly, the save panel creates new sequences that need to appear in the
 * browse gallery immediately - without a stale cache preventing them from showing.
 *
 * The detail panel / save panel has no direct connection to those other screens,
 * so it can't just tell them directly.
 *
 * THE SOLUTION:
 * The originating panel shouts "a sequence was added/deleted" into a shared channel.
 * Any screen that cares listens to that channel and updates its own list.
 *
 * EVENTS:
 * - tka:library-mutated        - fired after a sequence is deleted
 * - tka:library-sequence-added  - fired after a new sequence is saved
 * - tka:library-sequence-updated - fired after a sequence's metadata changes
 *
 * SCREENS THAT CURRENTLY LISTEN:
 * - browse-state-factory.svelte.ts  - the Browse gallery
 * - SequenceBrowser.svelte (Train)  - the sequence picker in Train mode
 *
 * TO ADD A NEW LISTENER:
 * 1. Call `onLibraryMutated(fn)`, `onLibrarySequenceAdded(fn)`, or
 *    `onLibrarySequenceUpdated(fn)` inside a
 *    `$effect` in your component or state file. The $effect ensures the
 *    listener is cleaned up when the screen is closed.
 *
 *    $effect(() => onLibraryMutated((sequenceId) => removeFromMyList(sequenceId)));
 *    $effect(() => onLibrarySequenceAdded((sequence) => addToMyList(sequence)));
 *
 * 2. Add your file to the SCREENS THAT CURRENTLY LISTEN list above.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export const LIBRARY_MUTATED_EVENT = "tka:library-mutated";
export const LIBRARY_SEQUENCE_ADDED_EVENT = "tka:library-sequence-added";
export const LIBRARY_SEQUENCE_UPDATED_EVENT = "tka:library-sequence-updated";

/**
 * Call this after deleting a sequence. Any screen that's showing that sequence
 * will hear about it and remove it from its list.
 */
export function notifyLibraryMutated(sequenceId: string): void {
  window.dispatchEvent(
    new CustomEvent(LIBRARY_MUTATED_EVENT, { detail: { sequenceId } })
  );
}

/**
 * Listen for deleted sequences. The handler is called with the deleted sequence's ID
 * so you can remove it from your list. Returns a function that stops listening -
 * inside a $effect this cleanup runs automatically when the screen is closed.
 *
 * @example
 * $effect(() => onLibraryMutated((sequenceId) => removeFromList(sequenceId)));
 */
export function onLibraryMutated(
  handler: (sequenceId: string) => void
): () => void {
  const listener = (e: Event) => {
    const sequenceId = (e as CustomEvent<{ sequenceId: string }>).detail
      .sequenceId;
    handler(sequenceId);
  };
  window.addEventListener(LIBRARY_MUTATED_EVENT, listener);
  return () => window.removeEventListener(LIBRARY_MUTATED_EVENT, listener);
}

/**
 * Call this after saving a new sequence. Any screen showing the library
 * will hear about it and add the sequence to its list (or invalidate its cache).
 */
export function notifyLibrarySequenceAdded(sequence: SequenceData): void {
  window.dispatchEvent(
    new CustomEvent(LIBRARY_SEQUENCE_ADDED_EVENT, { detail: { sequence } })
  );
}

/**
 * Listen for newly saved sequences. The handler is called with the full
 * SequenceData so the gallery can insert it without a Firestore round-trip.
 * Returns a cleanup function - inside a $effect this runs automatically.
 *
 * @example
 * $effect(() => onLibrarySequenceAdded((sequence) => addToList(sequence)));
 */
export function onLibrarySequenceAdded(
  handler: (sequence: SequenceData) => void
): () => void {
  const listener = (e: Event) => {
    const sequence = (e as CustomEvent<{ sequence: SequenceData }>).detail
      .sequence;
    handler(sequence);
  };
  window.addEventListener(LIBRARY_SEQUENCE_ADDED_EVENT, listener);
  return () =>
    window.removeEventListener(LIBRARY_SEQUENCE_ADDED_EVENT, listener);
}

/**
 * Call this after updating a sequence's metadata (tags, notes, visibility, favorite).
 * Listeners can patch their caches with the changed fields without a Firestore round-trip.
 */
export function notifyLibrarySequenceUpdated(
  sequenceId: string,
  updates: Record<string, unknown>
): void {
  window.dispatchEvent(
    new CustomEvent(LIBRARY_SEQUENCE_UPDATED_EVENT, {
      detail: { sequenceId, updates },
    })
  );
}

/**
 * Listen for sequence metadata updates. Returns a cleanup function -
 * inside a $effect this runs automatically when the screen is closed.
 *
 * @example
 * $effect(() => onLibrarySequenceUpdated((id, updates) => patchInCache(id, updates)));
 */
export function onLibrarySequenceUpdated(
  handler: (sequenceId: string, updates: Record<string, unknown>) => void
): () => void {
  const listener = (e: Event) => {
    const { sequenceId, updates } = (
      e as CustomEvent<{ sequenceId: string; updates: Record<string, unknown> }>
    ).detail;
    handler(sequenceId, updates);
  };
  window.addEventListener(LIBRARY_SEQUENCE_UPDATED_EVENT, listener);
  return () =>
    window.removeEventListener(LIBRARY_SEQUENCE_UPDATED_EVENT, listener);
}
