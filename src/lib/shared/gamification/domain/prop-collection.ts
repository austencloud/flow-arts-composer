/**
 * Pure helpers over the user's prop collection. No I/O — the manager owns
 * persistence; these functions are deterministic and unit-tested.
 */
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  CORE_PROPS,
  PROP_LOCKING_ENABLED,
  UNLOCKABLE_POOL,
  milestonesReached,
} from "./prop-pool";

export interface PropCollection {
  /** Earned props only — CORE_PROPS are implicit and never stored. */
  unlockedPropTypes: PropType[];
  creationCount: number;
  pendingPicks: number;
}

export function defaultCollection(): PropCollection {
  return { unlockedPropTypes: [], creationCount: 0, pendingPicks: 0 };
}

export function isUnlocked(c: PropCollection, prop: PropType): boolean {
  if (!PROP_LOCKING_ENABLED) return true;
  return CORE_PROPS.includes(prop) || c.unlockedPropTypes.includes(prop);
}

export function remainingLocked(c: PropCollection): PropType[] {
  if (!PROP_LOCKING_ENABLED) return [];
  return UNLOCKABLE_POOL.filter((p) => !c.unlockedPropTypes.includes(p));
}

/** Clamp pending picks so we never owe more than the user can still claim. */
function clampPending(c: PropCollection): PropCollection {
  const claimable = remainingLocked(c).length;
  return c.pendingPicks > claimable ? { ...c, pendingPicks: claimable } : c;
}

/** Count one creation; award a pick for each milestone newly crossed. */
export function recordOne(c: PropCollection): PropCollection {
  const newCount = c.creationCount + 1;
  const earned = milestonesReached(newCount) - milestonesReached(c.creationCount);
  return clampPending({
    ...c,
    creationCount: newCount,
    pendingPicks: c.pendingPicks + earned,
  });
}

/** Claim a locked pool prop, spending one pending pick. No-op otherwise. */
export function applyClaim(c: PropCollection, prop: PropType): PropCollection {
  const inPool = UNLOCKABLE_POOL.includes(prop);
  const already = c.unlockedPropTypes.includes(prop);
  if (!inPool || already || c.pendingPicks <= 0) return c;
  return {
    ...c,
    unlockedPropTypes: [...c.unlockedPropTypes, prop],
    pendingPicks: c.pendingPicks - 1,
  };
}

/** Merge a guest collection into a member collection on account upgrade. */
export function mergeCollections(
  guest: PropCollection,
  member: PropCollection
): PropCollection {
  const union = Array.from(
    new Set([...member.unlockedPropTypes, ...guest.unlockedPropTypes])
  );
  return clampPending({
    unlockedPropTypes: union,
    creationCount: Math.max(guest.creationCount, member.creationCount),
    pendingPicks: guest.pendingPicks + member.pendingPicks,
  });
}
