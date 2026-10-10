import { describe, it, expect } from "vitest";
import { applyStrictPrefix } from "#lib/features/loop-labeler/services/detection/apply-strict-prefix.js";
import { LOOP_TYPE_DEFINITIONS } from "#lib/features/loop-labeler/domain/constants/loop-type-definitions.js";
import type { MergedMatch } from "#lib/features/loop-labeler/services/detection/types.js";

const rotatedDef = LOOP_TYPE_DEFINITIONS.find(d => d.id === "rotated")!;
const swappedDef = LOOP_TYPE_DEFINITIONS.find(d => d.id === "swapped")!;
const rotSwapDef = LOOP_TYPE_DEFINITIONS.find(d => d.id === "rotated_swapped")!;

function makeMatch(
  def: typeof rotatedDef,
  interval: 2 | 4,
  matchedTarget: string,
  direction: "cw" | "ccw" | null = null
): MergedMatch {
  return { definition: def, interval, matchedTarget, direction, isStrict: false };
}

describe("applyStrictPrefix", () => {
  it("marks single match as strict", () => {
    const matches = [makeMatch(rotatedDef, 4, "rotated_90_cw", "cw")];
    const result = applyStrictPrefix(matches);
    expect(result).toHaveLength(1);
    expect(result[0]!.isStrict).toBe(true);
  });

  it("does not mark when multiple types match", () => {
    const matches = [
      makeMatch(rotatedDef, 4, "rotated_90_cw", "cw"),
      makeMatch(swappedDef, 2, "swapped"),
    ];
    const result = applyStrictPrefix(matches);
    expect(result.every(m => !m.isStrict)).toBe(true);
  });

  it("marks compound single type as strict", () => {
    const matches = [makeMatch(rotSwapDef, 4, "rotated_90_cw_swapped", "cw")];
    const result = applyStrictPrefix(matches);
    expect(result[0]!.isStrict).toBe(true);
  });

  it("returns empty array unchanged", () => {
    const result = applyStrictPrefix([]);
    expect(result).toHaveLength(0);
  });
});
