import { describe, it, expect } from "vitest";
import { mergeIntervals } from "#lib/features/loop-labeler/services/detection/merge-intervals.js";
import { LOOP_TYPE_DEFINITIONS } from "#lib/features/loop-labeler/domain/constants/loop-type-definitions.js";
import type { UnanimityResult } from "#lib/features/loop-labeler/services/detection/types.js";

const rotatedDef = LOOP_TYPE_DEFINITIONS.find(d => d.id === "rotated")!;
const swappedDef = LOOP_TYPE_DEFINITIONS.find(d => d.id === "swapped")!;
const mirroredDef = LOOP_TYPE_DEFINITIONS.find(d => d.id === "mirrored")!;

function makeResult(
  def: typeof rotatedDef,
  interval: 2 | 4,
  matches: boolean,
  matchedTarget: string | null = null,
  direction: "cw" | "ccw" | null = null
): UnanimityResult {
  return { definition: def, interval, matches, matchedTarget, direction, beatPairCount: 4 };
}

describe("mergeIntervals", () => {
  it("prefers interval 4 when type matches at both intervals", () => {
    const results: UnanimityResult[] = [
      makeResult(rotatedDef, 2, true, "rotated_180"),
      makeResult(rotatedDef, 4, true, "rotated_90_cw", "cw"),
    ];

    const merged = mergeIntervals(results);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.interval).toBe(4);
    expect(merged[0]!.matchedTarget).toBe("rotated_90_cw");
  });

  it("keeps different types at different intervals", () => {
    const results: UnanimityResult[] = [
      makeResult(rotatedDef, 4, true, "rotated_90_cw", "cw"),
      makeResult(swappedDef, 2, true, "swapped"),
    ];

    const merged = mergeIntervals(results);
    expect(merged).toHaveLength(2);
    expect(merged.find(m => m.definition.id === "rotated")?.interval).toBe(4);
    expect(merged.find(m => m.definition.id === "swapped")?.interval).toBe(2);
  });

  it("filters out non-matches", () => {
    const results: UnanimityResult[] = [
      makeResult(rotatedDef, 2, false),
      makeResult(rotatedDef, 4, false),
      makeResult(mirroredDef, 2, true, "mirrored"),
    ];

    const merged = mergeIntervals(results);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.definition.id).toBe("mirrored");
  });

  it("returns empty for no matches", () => {
    const results: UnanimityResult[] = [
      makeResult(rotatedDef, 2, false),
    ];

    const merged = mergeIntervals(results);
    expect(merged).toHaveLength(0);
  });
});
