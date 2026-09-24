import { describe, expect, it } from "vitest";
import { drillFillLayout } from "./drill-fill-layout";

// A drilled family's tile box on the Props page at 2560x1440: the whole
// picker card, and one hand's half of it in Cat Dog.
const WIDE = { width: 1427, height: 1194 };
const HAND = { width: 696, height: 1160 };

describe("drillFillLayout", () => {
  it("sets two styles side by side in a wide pane, without towers", () => {
    const layout = drillFillLayout(2, WIDE.width, WIDE.height);
    expect(layout?.cols).toBe(2);
    const colWidth = (WIDE.width - 10) / 2;
    expect(layout!.rowHeight).toBeLessThanOrEqual(colWidth * 1.25);
  });

  it("stacks two styles in one hand's tall column instead of a thin strip", () => {
    const layout = drillFillLayout(2, HAND.width, HAND.height);
    expect(layout?.cols).toBe(1);
    // Together the rows take the whole height.
    expect(layout!.rowHeight * 2 + 10).toBeGreaterThan(HAND.height - 2);
  });

  it("centres a short last row", () => {
    expect(drillFillLayout(5, WIDE.width, WIDE.height)).toMatchObject({
      cols: 3,
      orphanIndex: 3,
      orphanStart: 2,
    });
    expect(drillFillLayout(5, HAND.width, HAND.height)).toMatchObject({
      cols: 2,
      orphanIndex: 4,
      orphanStart: 2,
    });
  });

  it("marks no orphan when every row is full", () => {
    expect(drillFillLayout(4, HAND.width, HAND.height)?.orphanIndex).toBe(-1);
  });

  it("waits for a measured box", () => {
    expect(drillFillLayout(3, 0, 600)).toBeNull();
    expect(drillFillLayout(0, 600, 600)).toBeNull();
  });
});
