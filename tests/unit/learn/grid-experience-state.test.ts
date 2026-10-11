import { describe, expect, it } from "vitest";
import {
  GRID_LAST_STEP,
  normalizeGridStep,
} from "#lib/features/learn/components/interactive/grid-concept/grid-experience-state.svelte.js";

describe("grid experience persistence migration", () => {
  it("keeps current progress and clamps steps from the removed ending", () => {
    expect(GRID_LAST_STEP).toBe(2);
    expect(normalizeGridStep(0)).toBe(0);
    expect(normalizeGridStep(2)).toBe(2);
    expect(normalizeGridStep(3)).toBe(2);
    expect(normalizeGridStep(4)).toBe(2);
  });

  it("rejects malformed persisted steps", () => {
    expect(normalizeGridStep(-1)).toBe(0);
    expect(normalizeGridStep(Number.NaN)).toBe(0);
    expect(normalizeGridStep(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
