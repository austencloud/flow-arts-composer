import { describe, expect, it } from "vitest";
import { calculateCardSurface } from "../src/card-surface-layout.js";
import {
  calculateSequenceCardLayout,
  calculateSequenceCardCell,
} from "../src/sequence-card-pipeline.js";

describe("portable card surface geometry", () => {
  it("uses the printed card's 48px indicators and centers the actual cell grid", () => {
    const surface = calculateCardSurface({
      columns: 3,
      rows: 4,
      cellSize: 300,
      showHeader: true,
      showFooter: false,
      deckCard: { contentWidth: 678, contentHeight: 978 },
    });
    expect(surface.headerHeight).toBe(90);
    expect(surface.headerHeight * surface.indicatorSizeScale!).toBe(48);
    expect(surface.cellSize).toBe(222);
    expect(surface.gridStartY).toBe(90);
    expect(surface.gridStartX).toBe(21);
  });

  it("reserves a header for a LOOP-only card and applies narrow-grid scaling", () => {
    const layout = calculateSequenceCardLayout(5, {
      layout: "grid",
      cellSize: 300,
      showWord: false,
      showDifficulty: false,
      showFooter: false,
      showLoopGlyph: true,
      startPlacementLayout: "row",
    });
    expect(layout.headerHeight).toBe(66);
    expect(layout.height).toBe(966);
  });

  it("keeps every strip cell in one row", () => {
    expect(calculateSequenceCardCell(4, 5, "row", "strip")).toMatchObject({
      col: 4,
      row: 0,
    });
  });
});
