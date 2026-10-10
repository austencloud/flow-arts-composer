import { describe, it, expect } from "vitest";
import {
  joinedLabel,
  activeLabel,
  hasProfileWork,
} from "#lib/features/creators/domain/profile-tenure.js";

describe("joinedLabel", () => {
  it("names the month and year, without the day", () => {
    // The day is noise for tenure — "Joined March 2026" is the claim, not the
    // 15th. Asserted loosely on locale so a non-en CI locale can't fail it.
    const label = joinedLabel(new Date(2026, 2, 15));
    expect(label).toMatch(/2026/);
    expect(label).not.toMatch(/15/);
  });

  it("is stable across every day of the same month", () => {
    expect(joinedLabel(new Date(2026, 6, 1))).toBe(
      joinedLabel(new Date(2026, 6, 28))
    );
  });
});

describe("activeLabel", () => {
  it("returns null when activity was never recorded", () => {
    // The whole point: `getUserProfile` used to substitute joinedDate here,
    // which rendered "Member since July 2026 / Active July 2026" and looked
    // broken. Absent must stay absent so the line can be omitted.
    expect(activeLabel(undefined, new Date(2026, 6, 1))).toBeNull();
    expect(activeLabel(null, new Date(2026, 6, 1))).toBeNull();
  });

  it("returns null when activity is indistinguishable from joining", () => {
    // Same instant means the record carries no information beyond the join
    // date, whether that came from a real write or a stale fallback upstream.
    const joined = new Date(2026, 6, 1, 12, 0, 0);
    expect(activeLabel(new Date(joined), joined)).toBeNull();
  });

  it("describes real activity relative to now", () => {
    const joined = new Date(2026, 0, 1);
    const label = activeLabel(new Date(Date.now() - 3 * 86400000), joined);
    expect(label).toBeTruthy();
    expect(label).not.toBe("");
  });
});

describe("hasProfileWork", () => {
  it("is false only when every band is empty", () => {
    expect(hasProfileWork({ showcase: 0, sequences: 0, collections: 0 })).toBe(
      false
    );
  });

  it("is true when any single band has something", () => {
    expect(hasProfileWork({ showcase: 1, sequences: 0, collections: 0 })).toBe(
      true
    );
    expect(hasProfileWork({ showcase: 0, sequences: 1, collections: 0 })).toBe(
      true
    );
    expect(hasProfileWork({ showcase: 0, sequences: 0, collections: 1 })).toBe(
      true
    );
  });

  it("ignores negative counts rather than treating them as content", () => {
    expect(hasProfileWork({ showcase: -1, sequences: 0, collections: 0 })).toBe(
      false
    );
  });
});
