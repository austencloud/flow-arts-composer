/**
 * Reactive mirror of the user's prop collection. The PropUnlockManager is the
 * writer; UI reads these values. Follows the "export $state + action
 * functions" rune-state pattern.
 */
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  defaultCollection,
  isUnlocked as isUnlockedPure,
  remainingLocked as remainingLockedPure,
  type PropCollection,
} from "../domain/prop-collection";

export const propCollection = $state<PropCollection>(defaultCollection());

/** Replace the mirrored collection (called by the manager after every change). */
export function setPropCollection(next: PropCollection): void {
  // Defensive copy of the array so the rune never aliases the manager's live
  // collection — a future in-place mutation there can't silently bypass reactivity.
  propCollection.unlockedPropTypes = [...next.unlockedPropTypes];
  propCollection.creationCount = next.creationCount;
  propCollection.pendingPicks = next.pendingPicks;
}

export function isPropUnlocked(prop: PropType): boolean {
  return isUnlockedPure(propCollection, prop);
}

export function remainingLockedProps(): PropType[] {
  return remainingLockedPure(propCollection);
}
