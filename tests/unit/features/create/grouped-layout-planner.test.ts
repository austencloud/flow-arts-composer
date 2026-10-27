import { describe, expect, it } from "vitest";
import {
  groupedArrangements,
  planGroupedLayout,
  type GroupedLayoutInput,
} from "#lib/features/create/construct/option-picker/services/grouped-layout-planner.js";

function input(overrides: Partial<GroupedLayoutInput>): GroupedLayoutInput {
  return {
    typeCounts: [
      { type: "Type4", count: 4 },
      { type: "Type5", count: 4 },
      { type: "Type6", count: 2 },
    ],
    width: 800,
    height: 380,
    tileGap: 8,
    sectionGap: 8,
    rowGap: 12,
    gridInset: 8,
    headerHeight: 50,
    headerMinWidth: 168,
    headerMinRowHeight: 200,
    maxSize: 200,
    minSize: 40,
    ...overrides,
  };
}

function usedHeight(plan: ReturnType<typeof planGroupedLayout>, rowGap = 12) {
  return (
    plan.rows.reduce((sum, r) => sum + r.height, 0) +
    (plan.rows.length - 1) * rowGap
  );
}

function rowWidth(
  row: ReturnType<typeof planGroupedLayout>["rows"][number],
  sectionGap = 8
) {
  return (
    row.sections.reduce((sum, s) => sum + s.width, 0) +
    (row.sections.length - 1) * sectionGap
  );
}

describe("groupedArrangements", () => {
  it("keeps type order and lists flatter arrangements first", () => {
    expect(groupedArrangements(3)).toEqual([
      [[0, 1, 2]],
      [[0], [1, 2]],
      [[0, 1], [2]],
      [[0], [1], [2]],
    ]);
    expect(groupedArrangements(1)).toEqual([[[0]]]);
  });
});

describe("planGroupedLayout", () => {
  it("never overflows the panel's width or height", () => {
    for (const [width, height] of [
      [800, 380],
      [560, 300],
      [360, 520],
      [1500, 420],
    ] as const) {
      const plan = planGroupedLayout(input({ width, height }));
      expect(plan.fits).toBe(true);
      expect(usedHeight(plan)).toBeLessThanOrEqual(height);
      for (const row of plan.rows) {
        expect(rowWidth(row)).toBeLessThanOrEqual(width);
      }
    }
  });

  it("grows tiles to fill a compact panel instead of one short row", () => {
    // The old planner put 4, 5 and 6 in one row of ~120px tiles here and
    // left most of the 380px height empty.
    const plan = planGroupedLayout(input({}));
    expect(plan.tileSize).toBeGreaterThan(120);
    const filled = usedHeight(plan) / 380;
    expect(filled >= 0.85 || plan.tileSize === 200).toBe(true);
  });

  it("splits a row's width by option count, not evenly by type", () => {
    const plan = planGroupedLayout(
      input({
        typeCounts: [
          { type: "Type4", count: 6 },
          { type: "Type5", count: 1 },
          { type: "Type6", count: 1 },
        ],
        width: 1100,
        height: 300,
      })
    );
    const sections = plan.rows.flatMap((r) => r.sections);
    const type4 = sections.find((s) => s.type === "Type4")!;
    const type5 = sections.find((s) => s.type === "Type5")!;
    expect(type4.columns).toBeGreaterThan(type5.columns);
  });

  it("caps tiles at maxSize", () => {
    const plan = planGroupedLayout(
      input({
        typeCounts: [{ type: "Type6", count: 1 }],
        width: 1600,
        height: 900,
      })
    );
    expect(plan.tileSize).toBe(200);
  });

  it("drops the headers when rows get too short for them", () => {
    const plan = planGroupedLayout(input({ width: 900, height: 180 }));
    expect(plan.showHeaders).toBe(false);
    expect(usedHeight(plan)).toBeLessThanOrEqual(180);
  });

  it("keeps headers when the rows are tall enough", () => {
    const plan = planGroupedLayout(input({ width: 1400, height: 600 }));
    expect(plan.showHeaders).toBe(true);
    expect(plan.rows.every((r) => r.height >= 200)).toBe(true);
  });

  it("falls back to the smallest tile and reports the overflow", () => {
    const plan = planGroupedLayout(input({ width: 120, height: 60 }));
    expect(plan.fits).toBe(false);
    expect(plan.tileSize).toBe(40);
  });

  it("returns no rows when there are no options", () => {
    const plan = planGroupedLayout(
      input({ typeCounts: [{ type: "Type4", count: 0 }] })
    );
    expect(plan.rows).toEqual([]);
  });
});
