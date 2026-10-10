/**
 * A preview box takes one of three shapes, and scenes fit their cells to it.
 * The Generate scene staggers its cells with the step grid's wave bands.
 */
import { describe, expect, it } from "vitest";
import {
  classifyPreviewShape,
  gridCellSize,
  rowOfCells,
  slotWaveBand,
} from "#lib/features/create/shared/components/method-previews/method-preview-layout.js";

describe("preview box shapes", () => {
  it("calls a short wide box a strip", () => {
    expect(classifyPreviewShape(146, 44)).toBe("strip");
  });

  it("calls a tall enough wide box a roomy strip", () => {
    expect(classifyPreviewShape(308, 96)).toBe("roomy");
  });

  it("calls a box near one to one a square", () => {
    expect(classifyPreviewShape(144, 144)).toBe("square");
    expect(classifyPreviewShape(150, 100)).toBe("square");
  });

  it("treats an unsized box as a strip", () => {
    expect(classifyPreviewShape(0, 40)).toBe("strip");
    expect(classifyPreviewShape(120, Number.NaN)).toBe("strip");
  });
});

describe("cell fitting", () => {
  it("fills a strip with full-height cells up to the cap", () => {
    expect(rowOfCells(300, 60, 4, 3, 4)).toEqual({ count: 4, size: 60 });
    expect(rowOfCells(200, 60, 4, 3, 5)).toEqual({ count: 3, size: 60 });
  });

  it("stops at the cap when more cells would fit", () => {
    expect(rowOfCells(400, 48, 4, 3, 4)).toEqual({ count: 4, size: 48 });
  });

  it("shrinks cells so the minimum count still fits", () => {
    expect(rowOfCells(146, 60, 4, 3, 4)).toEqual({ count: 3, size: 46 });
  });

  it("keeps the minimum count even when its cells shrink to nothing", () => {
    expect(rowOfCells(6, 60, 4, 3, 4)).toEqual({ count: 3, size: 0 });
  });

  it("sizes square grid cells by the tighter side", () => {
    expect(gridCellSize(144, 144, 2, 2, 4)).toBe(70);
    expect(gridCellSize(200, 144, 3, 3, 4)).toBe(45);
  });

  it("returns nothing for an unsized box", () => {
    expect(rowOfCells(0, 60, 4, 3, 4)).toEqual({ count: 0, size: 0 });
    expect(gridCellSize(0, 144, 2, 2, 4)).toBe(0);
  });
});

describe("wave bands for a lead slot and its cells", () => {
  it("runs along a strip one band per slot", () => {
    expect([0, 1, 2, 3].map((slot) => slotWaveBand(slot, 4))).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("runs diagonally through a square grid", () => {
    expect(
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map((slot) => slotWaveBand(slot, 3))
    ).toEqual([0, 1, 2, 1, 2, 3, 2, 3, 4]);
  });
});
