// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POI_REVERSAL_CANDIDATES } from "../../src/lib/features/levels/poi-lab/domain/poi-reversal-candidates";
import { createEmptyPoiReversalObservationFile } from "../../src/lib/features/levels/poi-lab/domain/poi-reversal-observations";
import {
  POI_REVERSAL_SITTINGS,
  resolvePoiReversalSitting,
} from "../../src/lib/features/levels/poi-lab/domain/poi-reversal-sittings";
import { createPoiReversalReviewState } from "../../src/lib/features/levels/poi-lab/state/poi-reversal-review-state.svelte";

describe("poi reversal sittings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // A typo in a sitting id would make the page quietly fall back to the
  // open-ended teacher, and Austen would judge the wrong poi.
  it("resolves every listed id to a real candidate, with no repeats", () => {
    for (const [name, ids] of Object.entries(POI_REVERSAL_SITTINGS)) {
      const sitting = resolvePoiReversalSitting(name, POI_REVERSAL_CANDIDATES);
      expect(sitting, `sitting ${name}`).not.toBeNull();
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("walks the sitting in order and stops when all have a verdict", () => {
    const sitting = resolvePoiReversalSitting("1", POI_REVERSAL_CANDIDATES)!;
    const state = createPoiReversalReviewState(
      createEmptyPoiReversalObservationFile(),
      vi.fn(),
      sitting
    );

    const seen: string[] = [];
    while (state.selection) {
      expect(state.selection.reason).toBe("sitting");
      seen.push(state.selection.candidate.id);
      state.selectVerdict("unsure");
      expect(state.recordCurrent().ok).toBe(true);
    }

    expect(seen).toEqual(POI_REVERSAL_SITTINGS["1"]);
    expect(state.sittingJudged).toBe(seen.length);
  });

  it("ignores an unknown sitting name", () => {
    expect(
      resolvePoiReversalSitting("nope", POI_REVERSAL_CANDIDATES)
    ).toBeNull();
  });
});
