import { describe, it, expect } from "vitest";
import {
  calculateLayout,
  calculateGalleryAspectRatio,
} from "../../src/lib/shared/render/services/layout-calculator";

describe("LayoutCalculator", () => {
  describe("calculateLayout with start row", () => {
    it("returns WITHOUT_START columns + 1 extra row for 16 steps", () => {
      const layout = calculateLayout(16, true);
      expect(layout).toEqual([4, 5]);
    });

    it("returns WITHOUT_START columns + 1 extra row for 8 steps", () => {
      const layout = calculateLayout(8, true);
      expect(layout).toEqual([4, 3]);
    });

    it("returns WITHOUT_START columns + 1 extra row for 12 steps", () => {
      const layout = calculateLayout(12, true);
      expect(layout).toEqual([3, 5]);
    });

    it("gives a 10-step sequence five columns and two step rows below Start", () => {
      const layout = calculateLayout(10, true, "row");
      expect(layout).toEqual([5, 3]);
    });

    it("returns WITHOUT_START layout unchanged when no start position", () => {
      const layout = calculateLayout(16, false);
      expect(layout).toEqual([4, 4]);
    });
  });

  describe("calculateGalleryAspectRatio", () => {
    it("uses column-based layout when startPlacementLayout is column", () => {
      // 16 steps → LAYOUT_WITH_START_COLUMN[16] = [5, 4]
      const ar = calculateGalleryAspectRatio(16, "column");
      expect(ar).toBeCloseTo(5 / (4 + 10 / 21), 3);
    });

    it("uses row-based layout by default", () => {
      // 16 steps → LAYOUT_WITH_START_ROW[16] = [4, 5]
      const ar = calculateGalleryAspectRatio(16);
      expect(ar).toBeCloseTo(4 / (5 + 10 / 21), 3);
    });
  });
});
