import { describe, it, expect } from "vitest";
import { computeCardFrontLayout } from "$lib/shared/render/services/card-front-assembler";

describe("computeCardFrontLayout", () => {
  it("derives deckCard geometry from contentWidth/Height", () => {
    const seq = { steps: [{ letter: "A" }, { letter: "B" }] } as any;
    const layout = computeCardFrontLayout(
      seq,
      {
        deckCard: { contentWidth: 750, contentHeight: 1050 },
        includeStartPlacement: true,
        addWord: true,
      },
      { showTKA: true } as any
    );
    expect(layout.canvasWidth).toBe(750);
    expect(layout.canvasHeight).toBe(1050);
    expect(layout.columns).toBeGreaterThan(0);
    expect(layout.stepSize).toBeGreaterThan(0);
  });

  it("derives non-deckCard canvas from columns x stepSize", () => {
    const seq = {
      steps: [{ letter: "A" }, { letter: "B" }, { letter: "C" }],
    } as any;
    const layout = computeCardFrontLayout(seq, { stepSize: 100 }, {} as any);
    expect(layout.canvasWidth).toBe(layout.columns * layout.stepSize);
    expect(layout.stepSize).toBe(100);
  });

  it("offsets the grid for a column-mode start position", () => {
    const seq = {
      steps: [{ letter: "A" }, { letter: "B" }],
      startPlacement: {},
    } as any;
    const layout = computeCardFrontLayout(
      seq,
      { includeStartPlacement: true, startPlacementLayout: "column" },
      {} as any
    );
    expect(layout.startColumn).toBe(1);
    expect(layout.stepsPerRow).toBe(layout.columns - 1);
  });

  it("does not reserve a phantom column for a row-mode start", () => {
    const seq = {
      steps: Array.from({ length: 12 }, () => ({ letter: "A" })),
      startPlacement: {},
    } as any;
    const layout = computeCardFrontLayout(
      seq,
      {
        includeStartPlacement: true,
        startPlacementLayout: "row",
        columnCount: 4,
      },
      {} as any
    );
    expect(layout.columns).toBe(4);
    expect(layout.rows).toBe(4);
    expect(layout.startRow).toBe(1);
    expect(layout.stepsPerRow).toBe(4);
  });

  it("reserves one of the explicit columns for a column-mode start", () => {
    const seq = {
      steps: Array.from({ length: 12 }, () => ({ letter: "A" })),
      startPlacement: {},
    } as any;
    const layout = computeCardFrontLayout(
      seq,
      {
        includeStartPlacement: true,
        startPlacementLayout: "column",
        columnCount: 4,
      },
      {} as any
    );
    expect(layout.columns).toBe(4);
    expect(layout.rows).toBe(4);
    expect(layout.startColumn).toBe(1);
    expect(layout.stepsPerRow).toBe(3);
  });

  it("geometrically centers mixed Start and QR grids on physical cards", () => {
    const sequence = {
      steps: Array.from({ length: 4 }, () => ({ letter: "A" })),
      startPlacement: {},
    } as any;
    const baseOptions = {
      deckCard: { contentWidth: 678, contentHeight: 978 },
      includeStartPlacement: true,
      startPlacementLayout: "row" as const,
      columnCount: 2,
      addWord: true,
      leftLabel: "earth",
    };

    const optical = computeCardFrontLayout(sequence, baseOptions, {} as any);
    const geometric = computeCardFrontLayout(
      sequence,
      { ...baseOptions, gridCentering: "geometric" },
      {} as any
    );
    const geometricInset = Math.floor(
      (geometric.canvasWidth - geometric.columns * geometric.stepSize) / 2
    );
    const geometricRightInset =
      geometric.canvasWidth -
      (geometric.gridOffsetX + geometric.columns * geometric.stepSize);

    expect(geometric.gridOffsetX).toBe(58);
    expect(geometric.gridOffsetX).toBe(geometricInset);
    expect(geometricRightInset).toBe(geometricInset);
    expect(optical.gridOffsetX).toBe(76);
  });

  it("lays eight steps out four-wide beside their dedicated start column", () => {
    const sequence = {
      steps: Array.from({ length: 8 }, () => ({ letter: "A" })),
      startPlacement: {},
    } as any;
    const layout = computeCardFrontLayout(
      sequence,
      {
        includeStartPlacement: true,
        startPlacementLayout: "column",
      },
      {} as any
    );

    expect(layout.columns).toBe(5);
    expect(layout.rows).toBe(2);
    expect(layout.startColumn).toBe(1);
    expect(layout.stepsPerRow).toBe(4);
  });

  // Regression: the download-card export dropped the LOOP/Header toggle, so a
  // looped sequence always drew the loop label + its header band even with the
  // header turned off in the preview. The contract: showLoopGlyph:false must
  // collapse the header band to zero height when word + difficulty are also off.
  it("draws the loop header band when showLoopGlyph is omitted (default-on)", () => {
    const seq = {
      steps: [{ letter: "A" }, { letter: "B" }],
      loopType: "rotated",
    } as any;
    const layout = computeCardFrontLayout(
      seq,
      { stepSize: 100, addWord: false, addDifficultyLevel: false },
      {} as any
    );
    expect(layout.headerHeight).toBeGreaterThan(0);
  });

  it("collapses the header band when the LOOP toggle is off and word/level are off", () => {
    const seq = {
      steps: [{ letter: "A" }, { letter: "B" }],
      loopType: "rotated",
    } as any;
    const layout = computeCardFrontLayout(
      seq,
      {
        stepSize: 100,
        addWord: false,
        addDifficultyLevel: false,
        showLoopGlyph: false,
      },
      {} as any
    );
    expect(layout.headerHeight).toBe(0);
  });

  it("does not reserve a footer for a personal name from a stale caller", () => {
    const seq = { steps: [{ letter: "A" }, { letter: "B" }] } as any;
    const layout = computeCardFrontLayout(
      seq,
      {
        deckCard: { contentWidth: 750, contentHeight: 1050 },
        addUserInfo: false,
        showCreatorName: true,
        userName: "Austen Cloud",
        showNotes: false,
        showBirthday: true,
      } as any,
      {} as any
    );

    expect(layout.footerHeight).toBe(0);
  });

  it("preserves explicit printed-card left labels", () => {
    const seq = { steps: [{ letter: "A" }, { letter: "B" }] } as any;
    const layout = computeCardFrontLayout(
      seq,
      {
        deckCard: { contentWidth: 750, contentHeight: 1050 },
        addUserInfo: false,
        leftLabel: "Water",
        showNotes: false,
      },
      {} as any
    );

    expect(layout.footerHeight).toBeGreaterThan(0);
  });
});
