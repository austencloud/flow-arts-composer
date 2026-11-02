import { describe, expect, it } from "vitest";
import { calculateOptimalColumnLayout } from "./option-grid-fit-calculator";
import { CONSTRUCT_TYPE_RAIL_COLUMN_OPTIONS } from "../../services/construct-phone-split";

// The unfolded Fold's picker with its type tabs in the left rail: a grid area
// about 650 wide and 350 tall, 8px gaps.
const FOLD_GRID = {
  availableWidth: 650,
  availableHeight: 350,
  gridGap: 8,
  maxSize: 144,
};

describe("calculateOptimalColumnLayout", () => {
  it("picks six columns for 16 options in a wide, short box by default", () => {
    const layout = calculateOptimalColumnLayout({
      ...FOLD_GRID,
      itemCount: 16,
      columnOptions: [4, 6, 8],
    });
    expect(layout.columns).toBe(6);
    expect(layout.rows).toBe(3);
  });

  it("holds the rail tier's 16 Type 1 options to a 4x4 block", () => {
    const layout = calculateOptimalColumnLayout({
      ...FOLD_GRID,
      itemCount: 16,
      columnOptions: CONSTRUCT_TYPE_RAIL_COLUMN_OPTIONS,
    });
    expect(layout.columns).toBe(4);
    expect(layout.rows).toBe(4);
    // Height-bound: four rows and three gaps in 350px.
    expect(layout.pictographSize).toBe(Math.floor((350 - 3 * 8) / 4));
    expect(layout.gridColumns).toBe(`repeat(4, ${layout.pictographSize}px)`);
  });

  it("keeps smaller rail-tier groups four wide", () => {
    const layout = calculateOptimalColumnLayout({
      ...FOLD_GRID,
      itemCount: 8,
      columnOptions: CONSTRUCT_TYPE_RAIL_COLUMN_OPTIONS,
    });
    expect(layout.columns).toBe(4);
    expect(layout.rows).toBe(2);
  });
});
