import { describe, expect, it } from "vitest";
import {
  FILL_MAX_TILE,
  balancedCount,
  centeredOrphan,
  sectionFillExtent,
  sectionFillLayout,
} from "./section-fill-layout";

// The Props page catalogue as it renders: Standard, Novelty, Premium.
const COUNTS = [10, 7, 2];
const LABELS = 105;

// The picker's grid box on the Props page at each side-by-side viewport.
const BOXES = {
  "1440x900": { width: 775, height: 710 },
  "1920x1080": { width: 895, height: 890 },
  "2560x1440": { width: 1427, height: 1250 },
  "3840x2160": { width: 1775, height: 1970 },
};

describe("sectionFillLayout", () => {
  for (const [viewport, box] of Object.entries(BOXES)) {
    it(`fits the catalogue inside the picker at ${viewport}`, () => {
      const layout = sectionFillLayout({
        counts: COUNTS,
        labels: LABELS,
        ...box,
      });
      expect(layout).not.toBeNull();
      const extent = sectionFillExtent(
        COUNTS,
        layout!.cols,
        layout!.tile,
        LABELS
      );
      expect(extent.width).toBeLessThanOrEqual(box.width);
      expect(extent.height).toBeLessThanOrEqual(box.height);
    });
  }

  it("fills a roomy card instead of leaving the tiered tile size", () => {
    const box = BOXES["2560x1440"];
    const layout = sectionFillLayout({
      counts: COUNTS,
      labels: LABELS,
      ...box,
    })!;
    const extent = sectionFillExtent(COUNTS, layout.cols, layout.tile, LABELS);
    expect(layout.tile).toBeGreaterThan(112);
    expect(extent.height / box.height).toBeGreaterThan(0.95);
  });

  it("stops at the tile cap on a wall-sized pane and leaves a centred block", () => {
    const layout = sectionFillLayout({
      counts: COUNTS,
      labels: LABELS,
      ...BOXES["3840x2160"],
    })!;
    expect(layout.tile).toBe(FILL_MAX_TILE);
  });

  it("keeps the tiered grid when the host is too short for readable tiles", () => {
    expect(
      sectionFillLayout({
        counts: COUNTS,
        labels: LABELS,
        width: 775,
        height: 380,
      })
    ).toBeNull();
  });

  it("waits for a measured box", () => {
    expect(
      sectionFillLayout({
        counts: COUNTS,
        labels: LABELS,
        width: 0,
        height: 890,
      })
    ).toBeNull();
    expect(
      sectionFillLayout({ counts: [], labels: 0, width: 895, height: 890 })
    ).toBeNull();
  });
});

describe("balancedCount", () => {
  it("drops columns that would only leave a short last row", () => {
    expect(balancedCount(10, 8)).toBe(5);
    expect(balancedCount(7, 5)).toBe(4);
    expect(balancedCount(7, 7)).toBe(7);
    expect(balancedCount(2, 5)).toBe(2);
  });
});

describe("centeredOrphan", () => {
  it("starts a short last row far enough in to centre it", () => {
    // Seven in four columns: the last three start one track (half a tile) in.
    expect(centeredOrphan(7, 4)).toEqual({ index: 4, start: 2 });
    // Ten in four columns: the last two start one whole tile in.
    expect(centeredOrphan(10, 4)).toEqual({ index: 8, start: 3 });
  });

  it("leaves full rows alone", () => {
    expect(centeredOrphan(10, 5)).toBeNull();
    expect(centeredOrphan(2, 2)).toBeNull();
  });
});
