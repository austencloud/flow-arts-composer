import { describe, expect, it } from "vitest";
import {
  COMPOSER_CARD_EXPORT_PROFILE_V1,
  calculateSequenceCardCell,
  calculateSequenceCardLayout,
  calculateSequenceCardMandalaPlacements,
  composeSequenceCard,
} from "../src/sequence-card-pipeline.js";

describe("sequence card pipeline geometry", () => {
  it("rejects incomplete card exports instead of returning a success image with an error tile", async () => {
    let encoded = false;
    await expect(
      composeSequenceCard({
        steps: [{ stepNumber: 0 }],
        word: "A",
        options: { ...COMPOSER_CARD_EXPORT_PROFILE_V1 },
        createCanvas: () => ({}),
        getContext: () =>
          ({ fillRect() {} }) as unknown as CanvasRenderingContext2D,
        toPng: () => {
          encoded = true;
          return Buffer.from("incomplete");
        },
        getStepNumber: (step) => step.stepNumber,
        calculateDifficultyLevel: () => 1,
        renderPictograph: async () => {
          throw new Error("Missing canonical asset");
        },
        buildHeader: () => ({ word: "A" }),
      })
    ).rejects.toThrow("Missing canonical asset");
    expect(encoded).toBe(false);
  });
  it("keeps the start cell at the first slot and reserves the first column below it in column mode", () => {
    expect(calculateSequenceCardCell(0, 4)).toMatchObject({ row: 0, col: 0 });
    expect(calculateSequenceCardCell(1, 4)).toMatchObject({ row: 0, col: 1 });
    expect(calculateSequenceCardCell(3, 4)).toMatchObject({ row: 0, col: 3 });
    expect(calculateSequenceCardCell(4, 4)).toMatchObject({ row: 1, col: 1 });
    expect(calculateSequenceCardCell(7, 4)).toMatchObject({ row: 2, col: 1 });
  });

  it("puts each subsequent step on the row below the start row in row mode", () => {
    expect(calculateSequenceCardCell(0, 3, "row")).toMatchObject({
      row: 0,
      col: 0,
    });
    expect(calculateSequenceCardCell(1, 3, "row")).toMatchObject({
      row: 1,
      col: 0,
    });
    expect(calculateSequenceCardCell(3, 3, "row")).toMatchObject({
      row: 1,
      col: 2,
    });
    expect(calculateSequenceCardCell(4, 3, "row")).toMatchObject({
      row: 2,
      col: 0,
    });
  });

  it("uses the canonical column layout for grids and a single row for strips", () => {
    expect(
      calculateSequenceCardLayout(5, {
        layout: "grid",
        cellSize: 100,
        showWord: true,
        showDifficulty: true,
        showFooter: true,
        startPlacementLayout: "column",
      })
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
        showFooter: true,
        startPlacementLayout: "row",
      })
    ).toMatchObject({
      width: 500,
      height: 114,
      columns: 5,
      rows: 1,
      headerHeight: 0,
      footerHeight: 14,
    });
  });

  it("adds the start row but no footer for the Composer export profile", () => {
    expect(
      calculateSequenceCardLayout(5, {
        layout: "grid",
        cellSize: 100,
        showWord: true,
        showDifficulty: false,
        showFooter: false,
        startPlacementLayout: "row",
      })
    ).toMatchObject({
      width: 200,
      height: 322,
      columns: 2,
      rows: 3,
      headerHeight: 22,
      footerHeight: 0,
    });
  });
});

describe("Composer export profile", () => {
  it("is explicitly versioned and matches the current Composer export contract", () => {
    expect(COMPOSER_CARD_EXPORT_PROFILE_V1).toEqual({
      version: "composer-card-v1",
      layout: "grid",
      cellSize: 300,
      padding: 8,
      showStepNumbers: true,
      showWord: true,
      darkMode: false,
      showDifficulty: false,
      showFooter: false,
      showMandala: true,
      showReversals: true,
      startPlacementLayout: "row",
      level: 1,
    });
  });
});

describe("sequence card mandala placement", () => {
  it("fills the single info cell beside the start position with a full mandala", () => {
    const layout = calculateSequenceCardLayout(5, {
      layout: "grid",
      cellSize: 300,
      showWord: true,
      showDifficulty: false,
      showFooter: false,
      startPlacementLayout: "row",
    });

    expect(
      calculateSequenceCardMandalaPlacements(
        layout,
        {
          layout: "grid",
          cellSize: 300,
          showMandala: true,
          startPlacementLayout: "row",
        },
        new Set(["0,0", "0,1", "1,1", "0,2", "1,2"])
      )
    ).toEqual([
      {
        col: 1,
        row: 0,
        x: 300,
        y: layout.gridStartY,
        cellSize: 300,
        variant: "full",
      },
    ]);
  });

  it("keeps strip layouts and explicitly disabled cards mandala-free", () => {
    const layout = {
      width: 900,
      height: 300,
      columns: 3,
      rows: 1,
      headerHeight: 0,
      footerHeight: 0,
      gridStartY: 0,
    };
    const occupied = new Set(["0,0"]);

    expect(
      calculateSequenceCardMandalaPlacements(
        layout,
        {
          layout: "strip",
          cellSize: 300,
          showMandala: true,
          startPlacementLayout: "row",
        },
        occupied
      )
    ).toEqual([]);
    expect(
      calculateSequenceCardMandalaPlacements(
        { ...layout, rows: 3 },
        {
          layout: "grid",
          cellSize: 300,
          showMandala: false,
          startPlacementLayout: "column",
        },
        occupied
      )
    ).toEqual([]);
  });
});
