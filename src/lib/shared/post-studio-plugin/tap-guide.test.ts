import { describe, expect, it } from "vitest";
import { nextTapPosition, tapGuidePoses } from "./tap-guide";

describe("nextTapPosition", () => {
  it("starts at the section's first tap position", () => {
    expect(nextTapPosition([], 0, 3)).toBe(0);
    expect(nextTapPosition([], 1, 3)).toBe(1);
  });

  it("moves on one landing after the last tap behind the playhead", () => {
    const labels = [
      { seconds: 2, position: 0 },
      { seconds: 3, position: 1 },
    ];
    expect(nextTapPosition(labels, 0, 3)).toBe(2);
    expect(nextTapPosition(labels, 0, 2.5)).toBe(1);
    expect(nextTapPosition(labels, 0, 1)).toBe(0);
  });
});

describe("tapGuidePoses", () => {
  it("holds the partner on the start position until its turn", () => {
    const at4 = tapGuidePoses(4, [4], 8);
    expect(at4.leader.stepIndex).toBe(3);
    expect(at4.followers[0]).toEqual({ position: 0, stepIndex: null });
    const at5 = tapGuidePoses(5, [4], 8);
    expect(at5.followers[0]).toEqual({ position: 1, stepIndex: 0 });
  });

  it("wraps past the end of the sequence", () => {
    expect(tapGuidePoses(9, [4], 8).leader.stepIndex).toBe(0);
    expect(tapGuidePoses(0, [], 8).leader.stepIndex).toBeNull();
  });
});
