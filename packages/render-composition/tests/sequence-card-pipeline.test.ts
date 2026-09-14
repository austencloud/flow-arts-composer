import { describe, expect, it } from "vitest";
import {
  COMPOSER_CARD_EXPORT_PROFILE_V1,
  calculateSequenceCardCell,
  calculateSequenceCardLayout,
} from "../src/sequence-card-pipeline.js";

describe("sequence card pipeline geometry", () => {
  it("keeps the start cell at the first slot and reserves the first column below it", () => {
    expect(calculateSequenceCardCell(0, 4)).toMatchObject({ row: 0, col: 0 });
    expect(calculateSequenceCardCell(1, 4)).toMatchObject({ row: 0, col: 1 });
    expect(calculateSequenceCardCell(3, 4)).toMatchObject({ row: 0, col: 3 });
    expect(calculateSequenceCardCell(4, 4)).toMatchObject({ row: 1, col: 1 });
    expect(calculateSequenceCardCell(7, 4)).toMatchObject({ row: 2, col: 1 });
  });

  it("uses the canonical column layout for grids and a single row for strips", () => {
    expect(
      calculateSequenceCardLayout(5, {
        layout: "grid",
        cellSize: 100,
        showWord: true,
        showDifficulty: true,
      }),
    ).toMatchObject({
      width: 300,
      height: 247,
      columns: 3,
      rows: 2,
      headerHeight: 33,
      footerHeight: 14,
    });
    expect(
      calculateSequenceCardLayout(5, {
        layout: "strip",
        cellSize: 100,
        showWord: false,
        showDifficulty: false,
      }),
    ).toMatchObject({
      width: 500,
      height: 114,
      columns: 5,
      rows: 1,
      headerHeight: 0,
      footerHeight: 14,
    });
  });
});

describe("Composer export profile", () => {
  it("is explicitly versioned and preserves the existing MCP-compatible defaults", () => {
    expect(COMPOSER_CARD_EXPORT_PROFILE_V1).toEqual({
      version: "composer-card-v1",
      layout: "grid",
      cellSize: 900,
      padding: 8,
      showStepNumbers: true,
      showWord: true,
      darkMode: true,
      showDifficulty: true,
      showReversals: true,
      level: 1,
    });
  });
});
