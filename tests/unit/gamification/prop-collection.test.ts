import { describe, expect, it } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  PROP_LOCKING_ENABLED,
  UNLOCKABLE_POOL,
} from "#lib/shared/gamification/domain/prop-pool.js";
import {
  applyClaim,
  defaultCollection,
  isUnlocked,
  mergeCollections,
  recordOne,
  remainingLocked,
} from "#lib/shared/gamification/domain/prop-collection.js";

describe("prop-collection", () => {
  it("defaults to an empty earned set", () => {
    const collection = defaultCollection();
    expect(collection.unlockedPropTypes).toEqual([]);
    expect(collection.creationCount).toBe(0);
    expect(collection.pendingPicks).toBe(0);
  });

  it("applies the current prop-locking policy", () => {
    const collection = defaultCollection();
    expect(isUnlocked(collection, PropType.STAFF)).toBe(true);
    expect(isUnlocked(collection, PropType.SWORD)).toBe(!PROP_LOCKING_ENABLED);
  });

  it("reports only claimable locked props", () => {
    const collection = {
      ...defaultCollection(),
      unlockedPropTypes: [PropType.SWORD],
    };
    const remaining = remainingLocked(collection);

    expect(remaining).not.toContain(PropType.SWORD);
    expect(remaining).toHaveLength(
      PROP_LOCKING_ENABLED ? UNLOCKABLE_POOL.length - 1 : 0
    );
  });

  it("increments creation count without accruing unusable picks", () => {
    const first = recordOne(defaultCollection());
    const second = recordOne(first);
    const third = recordOne(second);

    expect(first.creationCount).toBe(1);
    expect(second.creationCount).toBe(2);
    expect(third.creationCount).toBe(3);
    expect(first.pendingPicks).toBe(PROP_LOCKING_ENABLED ? 1 : 0);
    expect(second.pendingPicks).toBe(PROP_LOCKING_ENABLED ? 1 : 0);
    expect(third.pendingPicks).toBe(PROP_LOCKING_ENABLED ? 2 : 0);
  });

  it("never owes more picks than the remaining pool can satisfy", () => {
    let collection = defaultCollection();
    for (let i = 0; i < 300; i += 1) collection = recordOne(collection);
    expect(collection.pendingPicks).toBeLessThanOrEqual(
      remainingLocked(collection).length
    );
  });

  it("claims a locked prop when a pick is available", () => {
    const collection = {
      unlockedPropTypes: [],
      creationCount: 1,
      pendingPicks: 1,
    };
    const next = applyClaim(collection, PropType.SWORD);
    expect(next.unlockedPropTypes).toContain(PropType.SWORD);
    expect(next.pendingPicks).toBe(0);
  });

  it("does not claim without a pick or for a core prop", () => {
    const noPending = applyClaim(
      { unlockedPropTypes: [], creationCount: 1, pendingPicks: 0 },
      PropType.SWORD
    );
    expect(noPending.unlockedPropTypes).toEqual([]);

    const corePick = applyClaim(
      { unlockedPropTypes: [], creationCount: 1, pendingPicks: 1 },
      PropType.STAFF
    );
    expect(corePick.unlockedPropTypes).toEqual([]);
    expect(corePick.pendingPicks).toBe(1);
  });

  it("merges earned props and clamps pending picks to current policy", () => {
    const guest = {
      unlockedPropTypes: [PropType.SWORD],
      creationCount: 5,
      pendingPicks: 1,
    };
    const member = {
      unlockedPropTypes: [PropType.TORCH],
      creationCount: 3,
      pendingPicks: 1,
    };
    const merged = mergeCollections(guest, member);

    expect(merged.unlockedPropTypes).toContain(PropType.SWORD);
    expect(merged.unlockedPropTypes).toContain(PropType.TORCH);
    expect(merged.creationCount).toBe(5);
    expect(merged.pendingPicks).toBe(PROP_LOCKING_ENABLED ? 2 : 0);
  });
});
