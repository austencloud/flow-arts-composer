import { describe, expect, it } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  CORE_PROPS,
  UNLOCKABLE_POOL,
  milestoneThreshold,
  milestonesReached,
} from "./prop-pool";

describe("prop-pool", () => {
  it("core and pool are disjoint", () => {
    for (const p of CORE_PROPS) {
      expect(UNLOCKABLE_POOL).not.toContain(p);
    }
  });

  it("core holds the everyday props", () => {
    expect(CORE_PROPS).toContain(PropType.STAFF);
    expect(CORE_PROPS).toContain(PropType.CLUB);
    expect(CORE_PROPS).toContain(PropType.FAN);
    expect(CORE_PROPS).toContain(PropType.BUUGENG);
    expect(CORE_PROPS).toContain(PropType.TRIAD);
    expect(CORE_PROPS).toContain(PropType.MINIHOOP);
  });

  it("pool holds the exotic + variant props", () => {
    expect(UNLOCKABLE_POOL).toContain(PropType.SWORD);
    expect(UNLOCKABLE_POOL).toContain(PropType.BIGSTAFF);
    expect(UNLOCKABLE_POOL.length).toBeGreaterThanOrEqual(15);
  });

  it("milestoneThreshold is triangular", () => {
    expect(milestoneThreshold(1)).toBe(1);
    expect(milestoneThreshold(2)).toBe(3);
    expect(milestoneThreshold(3)).toBe(6);
    expect(milestoneThreshold(4)).toBe(10);
    expect(milestoneThreshold(19)).toBe(190);
  });

  it("milestonesReached inverts the triangular thresholds", () => {
    expect(milestonesReached(0)).toBe(0);
    expect(milestonesReached(1)).toBe(1);
    expect(milestonesReached(2)).toBe(1);
    expect(milestonesReached(3)).toBe(2);
    expect(milestonesReached(5)).toBe(2);
    expect(milestonesReached(6)).toBe(3);
    expect(milestonesReached(10)).toBe(4);
    expect(milestonesReached(190)).toBe(19);
  });
});
