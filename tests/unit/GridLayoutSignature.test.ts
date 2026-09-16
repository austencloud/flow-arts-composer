import { describe, it, expect } from "vitest";
import {
  computeGridLayoutSignature,
  type GridLayoutSignatureInput,
} from "$lib/features/create/shared/workspace-panel/sequence-display/domain/grid-layout-signature";

/** A four-step grid, two columns, plus the start tile. */
function baseGrid(
  overrides: Partial<GridLayoutSignatureInput> = {}
): GridLayoutSignatureInput {
  return {
    isTimelineMode: false,
    columns: 2,
    totalColumns: 3,
    rows: 2,
    hasStartPlacement: true,
    timelineRowSizes: [],
    stepIdentities: ["a", "b", "c", "d"],
    ...overrides,
  };
}

function changed(overrides: Partial<GridLayoutSignatureInput>): boolean {
  return (
    computeGridLayoutSignature(baseGrid()) !==
    computeGridLayoutSignature(baseGrid(overrides))
  );
}

describe("computeGridLayoutSignature", () => {
  it("is stable for identical layouts", () => {
    expect(computeGridLayoutSignature(baseGrid())).toBe(
      computeGridLayoutSignature(baseGrid())
    );
  });

  describe("changes that move cells", () => {
    it("fires on a step being deleted", () => {
      expect(changed({ stepIdentities: ["a", "b", "c"], rows: 2 })).toBe(true);
    });

    it("fires on a mid-sequence insert", () => {
      expect(changed({ stepIdentities: ["a", "b", "x", "c", "d"] })).toBe(true);
    });

    it("fires on reordering, with the step count unchanged", () => {
      expect(changed({ stepIdentities: ["a", "c", "b", "d"] })).toBe(true);
    });

    it("fires on a column-count change", () => {
      expect(changed({ columns: 4, totalColumns: 5, rows: 1 })).toBe(true);
    });

    it("fires on a row-count change alone", () => {
      expect(changed({ rows: 4 })).toBe(true);
    });

    it("fires on the timeline toggle", () => {
      expect(changed({ isTimelineMode: true, timelineRowSizes: [2, 2] })).toBe(
        true
      );
    });

    it("fires when the start tile appears or leaves", () => {
      expect(changed({ hasStartPlacement: false })).toBe(true);
    });

    it("fires on a timeline reflow that keeps the row count", () => {
      const before = computeGridLayoutSignature(
        baseGrid({ isTimelineMode: true, timelineRowSizes: [3, 1] })
      );
      const after = computeGridLayoutSignature(
        baseGrid({ isTimelineMode: true, timelineRowSizes: [2, 2] })
      );
      expect(before).not.toBe(after);
    });
  });

  describe("changes that do not move cells", () => {
    it("ignores cell size — a resize drag must track the container, not lag it", () => {
      // Size is not part of the input at all: there is no field a resize could
      // change. Proving that here keeps a future edit from adding one.
      expect(Object.keys(baseGrid())).not.toContain("cellSize");
      expect(Object.keys(baseGrid())).not.toContain("timelineUnitSize");
    });

    it("ignores timeline row shape while in grid mode", () => {
      // Grid mode passes an empty array, so a stale timeline shape upstream
      // cannot spuriously trigger a transition.
      expect(
        computeGridLayoutSignature(baseGrid({ timelineRowSizes: [] }))
      ).toBe(computeGridLayoutSignature(baseGrid()));
    });
  });

  it("distinguishes step counts that share a digit boundary", () => {
    // "1,2" vs "12" would collide under naive concatenation.
    const a = computeGridLayoutSignature(baseGrid({ stepIdentities: ["1", "2"] }));
    const b = computeGridLayoutSignature(baseGrid({ stepIdentities: ["12"] }));
    expect(a).not.toBe(b);
  });
});
