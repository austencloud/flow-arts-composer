import { describe, it, expect } from "vitest";
import {
  aggregateTurns,
  formatTurn,
} from "#lib/features/create/shared/services/step-operations/turns-aggregation.js";

describe("aggregateTurns", () => {
  it("reports a shared value when all steps agree", () => {
    const agg = aggregateTurns([1, 1, 1]);
    expect(agg.mixed).toBe(false);
    expect(agg.value).toBe(1);
    expect(agg.min).toBe(1);
    expect(agg.max).toBe(1);
  });

  it("reports mixed with a range when steps disagree", () => {
    const agg = aggregateTurns([0.5, 2, 1]);
    expect(agg.mixed).toBe(true);
    expect(agg.value).toBeNull();
    expect(agg.min).toBe(0.5);
    expect(agg.max).toBe(2);
  });

  it("normalizes float ('fl') to -0.5 for comparison", () => {
    const mixed = aggregateTurns(["fl", 0]);
    expect(mixed.mixed).toBe(true);
    expect(mixed.min).toBe(-0.5);
    expect(mixed.max).toBe(0);
  });

  it("reports a shared float value when every step is float", () => {
    const agg = aggregateTurns(["fl", "fl"]);
    expect(agg.mixed).toBe(false);
    expect(agg.value).toBe("fl");
    expect(agg.min).toBe(-0.5);
  });

  it("treats undefined turns as 0", () => {
    const agg = aggregateTurns([undefined, 0]);
    expect(agg.mixed).toBe(false);
    expect(agg.value).toBe(0);
  });

  it("handles an empty selection", () => {
    const agg = aggregateTurns([]);
    expect(agg.mixed).toBe(false);
    expect(agg.value).toBeNull();
  });

  it("formatTurn renders -0.5 as 'fl' and integers plainly", () => {
    expect(formatTurn(-0.5)).toBe("fl");
    expect(formatTurn(0)).toBe("0");
    expect(formatTurn(2.5)).toBe("2.5");
  });
});
