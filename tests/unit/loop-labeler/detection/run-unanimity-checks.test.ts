import { describe, it, expect } from "vitest";
import { runUnanimityChecks } from "#lib/features/loop-labeler/services/detection/run-unanimity-checks.js";
import { LOOP_TYPE_DEFINITIONS } from "#lib/features/loop-labeler/domain/constants/loop-type-definitions.js";
import type { ComparisonMatrix } from "#lib/features/loop-labeler/services/detection/types.js";

function makeMatrix(
  halved: Record<string, string[]>,
  quartered: Record<string, string[]> = {}
): ComparisonMatrix {
  return {
    halvedPairs: new Map(Object.entries(halved)),
    quarteredPairs: new Map(Object.entries(quartered)),
  };
}

describe("runUnanimityChecks", () => {
  it("detects unanimous rotated_90_cw at interval 4", () => {
    const matrix = makeMatrix(
      {},
      {
        "1-3": ["rotated_90_cw"],
        "2-4": ["rotated_90_cw"],
        "3-1": ["rotated_90_cw"],
        "4-2": ["rotated_90_cw"],
      }
    );

    const results = runUnanimityChecks(matrix, LOOP_TYPE_DEFINITIONS);
    const rotated4 = results.find(
      r => r.definition.id === "rotated" && r.interval === 4
    );
    expect(rotated4?.matches).toBe(true);
    expect(rotated4?.matchedTarget).toBe("rotated_90_cw");
    expect(rotated4?.direction).toBe("cw");
  });

  it("detects unanimous mirrored at interval 2", () => {
    const matrix = makeMatrix({
      "1-3": ["mirrored", "mirrored_inverted"],
      "2-4": ["mirrored"],
    });

    const results = runUnanimityChecks(matrix, LOOP_TYPE_DEFINITIONS);
    const mirrored2 = results.find(
      r => r.definition.id === "mirrored" && r.interval === 2
    );
    expect(mirrored2?.matches).toBe(true);
    expect(mirrored2?.matchedTarget).toBe("mirrored");
  });

  it("does not match when not unanimous", () => {
    const matrix = makeMatrix({
      "1-3": ["rotated_90_cw"],
      "2-4": ["mirrored"],
    });

    const results = runUnanimityChecks(matrix, LOOP_TYPE_DEFINITIONS);
    const matches = results.filter(r => r.matches);
    expect(matches).toHaveLength(0);
  });

  it("detects swapped_inverted at interval 2", () => {
    const matrix = makeMatrix({
      "1-5": ["swapped_inverted"],
      "2-6": ["swapped_inverted"],
      "3-7": ["swapped_inverted"],
      "4-8": ["swapped_inverted"],
    });

    const results = runUnanimityChecks(matrix, LOOP_TYPE_DEFINITIONS);
    const si = results.find(
      r => r.definition.id === "swapped_inverted" && r.interval === 2
    );
    expect(si?.matches).toBe(true);
  });

  it("extracts ccw direction for rotated_swapped_inverted", () => {
    const matrix = makeMatrix(
      {},
      {
        "1-3": ["rotated_90_ccw_swapped_inverted"],
        "2-4": ["rotated_90_ccw_swapped_inverted"],
        "3-1": ["rotated_90_ccw_swapped_inverted"],
        "4-2": ["rotated_90_ccw_swapped_inverted"],
      }
    );

    const results = runUnanimityChecks(matrix, LOOP_TYPE_DEFINITIONS);
    const rsi = results.find(
      r => r.definition.id === "rotated_swapped_inverted" && r.interval === 4
    );
    expect(rsi?.matches).toBe(true);
    expect(rsi?.direction).toBe("ccw");
  });

  it("does not extract direction for non-rotated types", () => {
    const matrix = makeMatrix({
      "1-3": ["mirrored_swapped"],
      "2-4": ["mirrored_swapped"],
    });

    const results = runUnanimityChecks(matrix, LOOP_TYPE_DEFINITIONS);
    const ms = results.find(
      r => r.definition.id === "mirrored_swapped" && r.interval === 2
    );
    expect(ms?.matches).toBe(true);
    expect(ms?.direction).toBeNull();
  });

  it("returns empty results for empty matrix", () => {
    const matrix = makeMatrix({});
    const results = runUnanimityChecks(matrix, LOOP_TYPE_DEFINITIONS);
    const matches = results.filter(r => r.matches);
    expect(matches).toHaveLength(0);
  });
});
