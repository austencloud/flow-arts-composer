import { describe, expect, it } from "vitest";
import {
  COMPACT_MAX_ART,
  COMPACT_MIN_ART,
  COMPACT_MIN_TILE_WIDTH,
  compactDisplayArt,
  compactDisplayColumns,
  DISPLAY_GROUP_GAP,
  fitDisplayGrid,
  MIN_FIT_ART,
} from "$lib/shared/animation-engine/domain/display-grid-fit";

// Metrics as DisplayPanel's chips render them: 10px side padding, 12px top
// and bottom, a 7px gap and an 11px label.
const CHIP = { padX: 20, chromeY: 42, gapX: 6, gapY: 6, count: 8 };

function gridSize(
  fit: { cols: number; tile: number },
  count = 8,
  grouped = true
) {
  const rows = Math.ceil(count / fit.cols);
  return {
    width:
      fit.cols * fit.tile +
      CHIP.gapX * (fit.cols - 1) +
      (grouped && rows === 1 ? DISPLAY_GROUP_GAP : 0),
    height:
      rows * fit.tile +
      CHIP.gapY * (rows - 1) +
      (grouped && rows > 1 ? DISPLAY_GROUP_GAP : 0),
  };
}

describe("fitDisplayGrid", () => {
  it("keeps square tiles inside a box whose width binds", () => {
    // Four columns in a wide, short box: the tile's side is its picture plus
    // the label chrome, which is wider than the side padding alone.
    const fit = fitDisplayGrid({ ...CHIP, width: 420, height: 330 });
    expect(fit).not.toBeNull();
    const size = gridSize(fit!);
    expect(size.width).toBeLessThanOrEqual(420);
    expect(size.height).toBeLessThanOrEqual(330);
  });

  it("falls back to the width-only layout where pictures would be stamps", () => {
    // The side-by-side studio on a phone held sideways.
    expect(fitDisplayGrid({ ...CHIP, width: 255, height: 213 })).toBeNull();
  });

  it("keeps a free-standing rail's pictures modest", () => {
    const fit = fitDisplayGrid({ ...CHIP, width: 831, height: 2186 });
    expect(fit!.art).toBeLessThanOrEqual(176);
  });

  it("lets a host-bounded box spend its height", () => {
    const box = { ...CHIP, width: 504, height: 830 };
    const capped = fitDisplayGrid(box)!;
    const grown = fitDisplayGrid({ ...box, grow: true })!;
    expect(grown.art).toBeGreaterThan(capped.art);
    expect(gridSize(grown).height).toBeGreaterThan(830 - grown.tile / 2);
    expect(gridSize(grown).height).toBeLessThanOrEqual(830);
    expect(grown.art).toBeGreaterThanOrEqual(MIN_FIT_ART);
  });

  it("keeps grouped tiles fitted when the optional word is hidden", () => {
    const fit = fitDisplayGrid({
      ...CHIP,
      count: 7,
      width: 480,
      height: 800,
      grow: true,
    });
    expect(fit).not.toBeNull();
    const size = gridSize(fit!, 7);
    expect(size.width).toBeLessThanOrEqual(480);
    expect(size.height).toBeLessThanOrEqual(800);
  });

  it.each([
    { width: 480, height: 800, cols: 2, binding: "height" },
    { width: 800, height: 480, cols: 5, binding: "width" },
  ] as const)(
    "fits ten ungrouped hand tiles in a $width x $height bounded panel",
    ({ width, height, cols, binding }) => {
      const fit = fitDisplayGrid({
        ...CHIP,
        width,
        height,
        count: 10,
        grow: true,
        groupBoundary: null,
      });
      expect(fit).not.toBeNull();
      expect(fit!.cols).toBe(cols);
      const size = gridSize(fit!, 10, false);
      expect(size.width).toBeLessThanOrEqual(width);
      expect(size.height).toBeLessThanOrEqual(height);
      expect(size[binding]).toBeGreaterThan(
        (binding === "width" ? width : height) * 0.95
      );
    }
  );
});

describe("compactDisplayColumns", () => {
  it("lays ten tiles in two rows of five wherever five columns fit", () => {
    expect(compactDisplayColumns({ width: 403, count: 10, gap: 6 })).toBe(5);
    expect(compactDisplayColumns({ width: 358, count: 10, gap: 6 })).toBe(5);
  });

  it("adds rows rather than letting a tile fall under its minimum width", () => {
    const gap = 6;
    for (const width of [300, 250, 200, 130]) {
      const cols = compactDisplayColumns({ width, count: 10, gap });
      const tile = (width - gap * (cols - 1)) / cols;
      expect(tile).toBeGreaterThanOrEqual(COMPACT_MIN_TILE_WIDTH);
    }
    expect(compactDisplayColumns({ width: 250, count: 10, gap })).toBeLessThan(
      5
    );
  });

  it("never returns an empty row or an impossible column count", () => {
    expect(compactDisplayColumns({ width: 10, count: 10, gap: 6 })).toBe(1);
    expect(compactDisplayColumns({ width: 400, count: 1, gap: 6 })).toBe(1);
    expect(compactDisplayColumns({ width: 400, count: 0, gap: 6 })).toBe(1);
  });
});

describe("compactDisplayArt", () => {
  it("keeps the largest picture when the content already fits", () => {
    expect(compactDisplayArt({ probeArt: 64, rows: 2, overflow: 0 })).toBe(
      COMPACT_MAX_ART
    );
    expect(compactDisplayArt({ probeArt: 64, rows: 2, overflow: -40 })).toBe(
      COMPACT_MAX_ART
    );
  });

  it("shrinks every row by the share of the overflow it has to absorb", () => {
    // 20px over with two rows: each row gives up 10px of picture.
    expect(compactDisplayArt({ probeArt: 64, rows: 2, overflow: 20 })).toBe(54);
    // An odd overflow rounds the shrink up, so the content never stays over.
    expect(compactDisplayArt({ probeArt: 64, rows: 2, overflow: 21 })).toBe(53);
  });

  it("stops at the readable minimum when the box is too short", () => {
    expect(compactDisplayArt({ probeArt: 64, rows: 2, overflow: 400 })).toBe(
      COMPACT_MIN_ART
    );
  });
});
