import { describe, it, expect } from "vitest";
import {
  pickBestFitLayout,
  pickScrollColumns,
  cardHeightInCells,
  type BestFitInput,
} from "../../src/lib/shared/render/services/container-aware-layout";

/** Step columns implied by a result: row/none use all cols; column reserves col 1. */
function stepCols(r: { cols: number; startPlacement: string }): number {
  return r.startPlacement === "column" ? r.cols - 1 : r.cols;
}

const base = (over: Partial<BestFitInput>): BestFitInput => ({
  stepCount: 4,
  includeStartPosition: true,
  containerWidth: 500,
  containerHeight: 500,
  showHeader: true,
  showFooter: true,
  showQRCode: false,
  ...over,
});

describe("pickBestFitLayout", () => {
  it.each([
    [960, 900],
    [1700, 900],
    [375, 700],
  ])(
    "packs 32 steps into complete four- or eight-column rows at %sx%s",
    (containerWidth, containerHeight) => {
      const layout = pickBestFitLayout(
        base({
          stepCount: 32,
          containerWidth,
          containerHeight,
          showQRCode: true,
        })
      )!;
      const columns = stepCols(layout);
      expect([4, 8]).toContain(columns);
      const rows = layout.rows - (layout.startPlacement === "row" ? 1 : 0);
      expect(columns * rows).toBe(32);
    }
  );
  it("keeps a 16-count on canonical columns in a tall mobile card", () => {
    const r = pickBestFitLayout(
      base({
        stepCount: 16,
        containerWidth: 344,
        containerHeight: 754,
        showQRCode: true,
      })
    );

    expect(r).toEqual({
      cols: 4,
      rows: 5,
      startPlacement: "row",
      widthUnits: 4,
    });
  });

  it("still uses three step columns when three is canonical", () => {
    const r = pickBestFitLayout(
      base({
        stepCount: 9,
        containerWidth: 500,
        containerHeight: 500,
      })
    )!;

    expect(stepCols(r)).toBe(3);
  });

  it("8-count Download Card in a tall preview uses a top row and larger cells", () => {
    const r = pickBestFitLayout(
      base({
        stepCount: 8,
        containerWidth: 744,
        containerHeight: 1500,
        showQRCode: true,
      })
    )!;

    expect(r).toEqual({
      cols: 2,
      rows: 5,
      startPlacement: "row",
      widthUnits: 2,
    });

    const chosenEdge = Math.min(
      744 / r.cols,
      1500 / cardHeightInCells(r.cols, r.rows, true, true)
    );
    const formerFixedEdge = Math.min(
      744 / 5,
      1500 / cardHeightInCells(5, 2, true, true)
    );
    expect(chosenEdge).toBeGreaterThan(formerFixedEdge);
  });

  it("8-count Download Card in a wide preview uses a left column when it wins", () => {
    expect(
      pickBestFitLayout(
        base({
          stepCount: 8,
          containerWidth: 900,
          containerHeight: 500,
          showQRCode: true,
        })
      )
    ).toEqual({
      cols: 5,
      rows: 2,
      startPlacement: "column",
      widthUnits: 5,
    });
  });

  it("scores held-beat rows by their rendered duration width", () => {
    const r = pickBestFitLayout(
      base({
        stepCount: 12,
        stepDurations: [1.5, 1.5, 1, 1, 1.5, 1.5, 1.5, 1.5, 1, 1, 1.5, 1.5],
        containerWidth: 1872,
        containerHeight: 1249,
        showQRCode: true,
      })
    );

    expect(r).toEqual({
      cols: 4,
      rows: 4,
      startPlacement: "column",
      widthUnits: 5,
    });
  });

  it("moves a mixed-duration Start lane to the top when that makes pictographs larger", () => {
    const r = pickBestFitLayout(
      base({
        stepCount: 12,
        stepDurations: [1.5, 1.5, 1, 1, 1.5, 1.5, 1.5, 1.5, 1, 1, 1.5, 1.5],
        containerWidth: 788,
        containerHeight: 1104,
        showQRCode: true,
      })
    );

    expect(r).toEqual({
      cols: 3,
      rows: 5,
      startPlacement: "row",
      widthUnits: 4,
    });
  });

  it("4-count in a tall/narrow container → 2 step columns, not a strip", () => {
    const r = pickBestFitLayout(
      base({ containerWidth: 400, containerHeight: 800 })
    )!;
    expect(r).not.toBeNull();
    expect(stepCols(r)).toBe(2);
    expect(r.startPlacement).toBe("row"); // 2 wide × 3 tall (start row on top)
    expect(r.cols).toBe(2);
    expect(r.rows).toBe(3);
  });

  it("4-count in a very wide/short container → wide grid (max cell edge)", () => {
    const r = pickBestFitLayout(
      base({ containerWidth: 900, containerHeight: 260 })
    )!;
    // A very wide-short pane genuinely fits a single wide row largest.
    expect(stepCols(r)).toBe(4);
    expect(r.rows).toBe(1);
  });

  it("4-count in a square container → balanced (2 step columns, never a strip/tower)", () => {
    const r = pickBestFitLayout(
      base({ containerWidth: 500, containerHeight: 500 })
    )!;
    expect(stepCols(r)).toBe(2);
    expect(r.cols).toBeLessThanOrEqual(3);
    expect(r.rows).toBeLessThanOrEqual(3);
  });

  it("step columns are monotonically non-decreasing as the container widens", () => {
    const widths = [220, 350, 500, 700, 1000, 1500];
    const cols = widths.map((w) =>
      stepCols(
        pickBestFitLayout(base({ containerWidth: w, containerHeight: 600 }))!
      )
    );
    for (let i = 1; i < cols.length; i++) {
      expect(cols[i]).toBeGreaterThanOrEqual(cols[i - 1]!);
    }
    // Sanity: the sweep actually moves from narrow to wide layouts.
    expect(cols[0]).toBeLessThan(cols[cols.length - 1]!);
  });

  it("with QR on, never returns a layout lacking a QR slot", () => {
    for (const [w, h] of [
      [400, 800],
      [800, 300],
      [500, 500],
      [300, 900],
      [1200, 250],
    ]) {
      const r = pickBestFitLayout(
        base({ showQRCode: true, containerWidth: w, containerHeight: h })
      )!;
      expect(r).not.toBeNull();
      if (r.startPlacement === "row") expect(r.cols).toBeGreaterThanOrEqual(2);
      if (r.startPlacement === "column")
        expect(r.rows).toBeGreaterThanOrEqual(2);
    }
  });

  it("hiding Start removes its lane without repacking the step grid", () => {
    for (const [containerWidth, containerHeight] of [
      [400, 800],
      [800, 800],
      [1200, 500],
    ] as const) {
      const shown = pickBestFitLayout(
        base({
          stepCount: 8,
          includeStartPosition: true,
          containerWidth,
          containerHeight,
        })
      )!;
      const hidden = pickBestFitLayout(
        base({
          stepCount: 8,
          includeStartPosition: false,
          containerWidth,
          containerHeight,
        })
      )!;

      expect(hidden.startPlacement).toBe("none");
      expect(hidden.cols).toBe(stepCols(shown));
      expect(hidden.rows).toBe(Math.ceil(8 / hidden.cols));
    }
  });

  it("returns cols/rows that match the render grid-shape convention", () => {
    // row placement: cols = sc, rows = 1 + ceil(steps/sc)
    const tall = pickBestFitLayout(
      base({ stepCount: 6, containerWidth: 300, containerHeight: 900 })
    )!;
    expect(tall.rows).toBe(1 + Math.ceil(6 / tall.cols));
    // column placement: cols = sc + 1
    const wide = pickBestFitLayout(
      base({ stepCount: 6, containerWidth: 1200, containerHeight: 250 })
    )!;
    if (wide.startPlacement === "column") {
      const sc = wide.cols - 1;
      const firstRow = Math.min(sc, 6);
      expect(wide.rows).toBe(1 + Math.ceil((6 - firstRow) / sc));
    }
  });

  it("returns null for degenerate input", () => {
    expect(pickBestFitLayout(base({ stepCount: 0 }))).toBeNull();
    expect(pickBestFitLayout(base({ containerWidth: 0 }))).toBeNull();
    expect(pickBestFitLayout(base({ containerHeight: -5 }))).toBeNull();
  });

  it("larger container yields a larger-or-equal cell edge for the same aspect", () => {
    // Same 2:1 aspect, doubled size → cells at least as large (scale invariance).
    const small = pickBestFitLayout(
      base({ containerWidth: 400, containerHeight: 200 })
    )!;
    const big = pickBestFitLayout(
      base({ containerWidth: 800, containerHeight: 400 })
    )!;
    expect(stepCols(big)).toBe(stepCols(small)); // same aspect → same layout
  });
});

describe("cardHeightInCells", () => {
  it("adds header (1/3) and footer (1/7) fractions at cols>=3", () => {
    expect(cardHeightInCells(4, 2, true, true)).toBeCloseTo(
      2 + 1 / 3 + 1 / 7,
      5
    );
  });
  it("scales the fractions down for narrow grids (cols<3)", () => {
    expect(cardHeightInCells(2, 3, true, true)).toBeCloseTo(
      3 + (1 / 3) * (2 / 3) + (1 / 7) * (2 / 3),
      5
    );
  });
  it("omits header/footer when hidden", () => {
    expect(cardHeightInCells(4, 3, false, false)).toBe(3);
  });
});

describe("container-aware Auto coverage", () => {
  it("returns valid, non-clipping geometry across lengths and preview shapes", () => {
    const viewports = [
      [744, 1500],
      [900, 500],
      [800, 800],
    ] as const;

    for (let stepCount = 1; stepCount <= 64; stepCount++) {
      for (const [containerWidth, containerHeight] of viewports) {
        const layout = pickBestFitLayout({
          stepCount,
          includeStartPosition: true,
          containerWidth,
          containerHeight,
          showHeader: true,
          showFooter: true,
          showQRCode: stepCount > 1,
        });
        expect(
          layout,
          `missing ${containerWidth}×${containerHeight} layout for ${stepCount} steps`
        ).not.toBeNull();

        const stepColumns =
          layout!.startPlacement === "column" ? layout!.cols - 1 : layout!.cols;
        const stepRows =
          layout!.startPlacement === "row" ? layout!.rows - 1 : layout!.rows;
        expect(
          stepColumns * stepRows,
          `clipped step region for ${stepCount} steps`
        ).toBeGreaterThanOrEqual(stepCount);

        const withoutStart = pickBestFitLayout({
          stepCount,
          includeStartPosition: false,
          containerWidth,
          containerHeight,
          showHeader: true,
          showFooter: true,
          showQRCode: stepCount > 1,
        });
        expect(withoutStart?.startPlacement).toBe("none");
        expect(withoutStart?.cols).toBe(stepColumns);
        expect(
          (withoutStart?.cols ?? 0) * (withoutStart?.rows ?? 0),
          `clipped hidden-Start grid for ${stepCount} steps`
        ).toBeGreaterThanOrEqual(stepCount);
      }
    }
  });
});

describe("pickScrollColumns", () => {
  it("returns the legacy default of 5 when width is unknown", () => {
    expect(pickScrollColumns(0)).toBe(5);
    expect(pickScrollColumns(-100)).toBe(5);
  });
  it("scales the column count with container width", () => {
    expect(pickScrollColumns(650)).toBe(5); // 650/130 = 5
    expect(pickScrollColumns(780)).toBe(6); // 780/130 = 6
  });
  it("clamps to [min, max]", () => {
    expect(pickScrollColumns(300)).toBe(4); // 300/130 ≈ 2.3 → clamp 4
    expect(pickScrollColumns(2000)).toBe(7); // 2000/130 ≈ 15 → clamp 7
  });
  it("honors custom bounds and target", () => {
    expect(pickScrollColumns(600, { min: 2, max: 10, targetCellPx: 100 })).toBe(
      6
    );
  });
});
