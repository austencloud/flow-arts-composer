import { describe, expect, it } from "vitest";
import { allocatePaneHeight } from "#lib/features/browse/gallery-home/pane-height-allocation.js";

describe("split-pane height allocation", () => {
  it("fits three bounded rows instead of charging each row its maximum", () => {
    const allocation = allocatePaneHeight({
      availableHeight: 935,
      catalogMinimum: 322,
      catalogMaximum: 860,
      editorFixed: 100,
      rowCount: 3,
      rowGap: 10,
      rowMinimum: 128,
      rowMaximum: 288,
    });

    expect(allocation).toEqual({
      catalogHeight: 322,
      editorHeight: 613,
      rowHeight: 164.33333333333334,
      editorScrolls: false,
    });
  });

  it("scrolls only when the rows cannot fit at their minimum", () => {
    const allocation = allocatePaneHeight({
      availableHeight: 500,
      catalogMinimum: 220,
      catalogMaximum: 700,
      editorFixed: 90,
      rowCount: 3,
      rowGap: 10,
      rowMinimum: 80,
      rowMaximum: 240,
    });

    expect(allocation).toEqual({
      catalogHeight: 220,
      editorHeight: 280,
      rowHeight: 80,
      editorScrolls: true,
    });
  });

  it("returns tall-pane surplus to the catalog after rows hit their ceiling", () => {
    const allocation = allocatePaneHeight({
      availableHeight: 1400,
      catalogMinimum: 300,
      catalogMaximum: 760,
      editorFixed: 100,
      rowCount: 2,
      rowGap: 12,
      rowMinimum: 128,
      rowMaximum: 288,
    });

    expect(allocation).toEqual({
      catalogHeight: 712,
      editorHeight: 688,
      rowHeight: 288,
      editorScrolls: false,
    });
  });

  it("gives non-grid editors only their content height before sharing surplus", () => {
    const allocation = allocatePaneHeight({
      availableHeight: 900,
      catalogMinimum: 300,
      catalogMaximum: 650,
      editorFixed: 210,
      rowCount: 0,
      rowGap: 0,
      rowMinimum: 0,
      rowMaximum: 0,
    });

    expect(allocation).toEqual({
      catalogHeight: 650,
      editorHeight: 250,
      rowHeight: 0,
      editorScrolls: false,
    });
  });
});
