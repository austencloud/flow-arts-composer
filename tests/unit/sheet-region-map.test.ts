/**
 * sheet-region-map — locks the sprite-crop geometry the play-preview morph
 * depends on to the composer's own layout math.
 *
 * The morph overlays crop the card's baked thumbnail by these rects; if they
 * drift from where ImageComposer actually painted, the morph visibly tears.
 * These tests pin the invariants across step counts × start layouts.
 */
import { describe, it, expect } from "vitest";
import { computeSheetRegionMap } from "../../src/lib/shared/browse/services/sheet-region-map";
import { computeCardFrontLayout } from "../../src/lib/shared/render/services/card-front-assembler";
import type { SequenceData } from "../../src/lib/shared/foundation/domain/models/sequence-data";

function makeSequence(stepCount: number, word = "AB"): SequenceData {
  return {
    id: `seq-${stepCount}`,
    name: word,
    word,
    steps: Array.from({ length: stepCount }, (_, i) => ({
      id: `s${i}`,
      stepNumber: i + 1,
      letter: i % 2 === 0 ? "A" : "B",
    })),
  } as unknown as SequenceData;
}

const STEP_COUNTS = [1, 2, 3, 4, 6, 8, 12, 16];
const LAYOUTS = ["row", "column"] as const;

function inUnitBox(r: { x: number; y: number; w: number; h: number }) {
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.w).toBeGreaterThan(0);
  expect(r.h).toBeGreaterThan(0);
  expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
  expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
}

describe("computeSheetRegionMap", () => {
  for (const layoutMode of LAYOUTS) {
    for (const n of STEP_COUNTS) {
      it(`${layoutMode} layout, ${n} steps: regions are consistent with composer layout`, () => {
        const seq = makeSequence(n);
        const map = computeSheetRegionMap(seq, layoutMode);
        const layout = computeCardFrontLayout(
          seq,
          {
            stepSize: 240,
            addWord: true,
            addStepNumbers: true,
            includeStartPlacement: true,
            addDifficultyLevel: true,
            addUserInfo: false,
            showNotes: true,
            startPlacementLayout: layoutMode,
          },
          { darkMode: true }
        );

        // Every region lives inside the image.
        inUnitBox(map.grid);
        if (map.header) inUnitBox(map.header);
        if (map.start) inUnitBox(map.start);
        map.steps.forEach(inUnitBox);

        expect(map.steps).toHaveLength(n);
        expect(map.canvasAspect).toBeCloseTo(layout.canvasWidth / layout.canvasHeight, 10);

        // Header: gallery defaults always show the word strip, and it spans
        // the full width starting at the top.
        expect(map.header).not.toBeNull();
        expect(map.header!.x).toBe(0);
        expect(map.header!.y).toBe(0);
        expect(map.header!.w).toBe(1);
        expect(map.header!.h).toBeCloseTo(layout.headerHeight / layout.canvasHeight, 10);

        // Grid sits exactly below the header (gallery branch: gridOffsetY ===
        // headerHeight, gridOffsetX === 0) and spans columns × rows cells.
        expect(map.grid.x).toBe(0);
        expect(map.grid.y).toBeCloseTo(layout.headerHeight / layout.canvasHeight, 10);
        expect(map.grid.w).toBeCloseTo(
          (layout.columns * layout.stepSize) / layout.canvasWidth,
          10
        );
        expect(map.grid.h).toBeCloseTo(
          (layout.rows * layout.stepSize) / layout.canvasHeight,
          10
        );

        // Start cell: composer draws it at grid cell (0,0) in both modes.
        expect(map.start).not.toBeNull();
        expect(map.start!.x).toBeCloseTo(map.grid.x, 10);
        expect(map.start!.y).toBeCloseTo(map.grid.y, 10);

        // Step cells replicate the composer's placement loop exactly.
        const cellW = layout.stepSize / layout.canvasWidth;
        const cellH = layout.stepSize / layout.canvasHeight;
        for (let i = 0; i < n; i++) {
          const col = layout.startColumn + (i % layout.stepsPerRow);
          const row = layout.startRow + Math.floor(i / layout.stepsPerRow);
          const s = map.steps[i]!;
          expect(s.x).toBeCloseTo((col * layout.stepSize) / layout.canvasWidth, 10);
          expect(s.y).toBeCloseTo(
            (layout.headerHeight + row * layout.stepSize) / layout.canvasHeight,
            10
          );
          expect(s.w).toBeCloseTo(cellW, 10);
          expect(s.h).toBeCloseTo(cellH, 10);
        }

        // Step 1 never collides with the start cell.
        const first = map.steps[0]!;
        const collides =
          Math.abs(first.x - map.start!.x) < 1e-9 &&
          Math.abs(first.y - map.start!.y) < 1e-9;
        expect(collides).toBe(false);

        // All cells stay inside the grid region.
        for (const s of [map.start!, ...map.steps]) {
          expect(s.x).toBeGreaterThanOrEqual(map.grid.x - 1e-9);
          expect(s.y).toBeGreaterThanOrEqual(map.grid.y - 1e-9);
          expect(s.x + s.w).toBeLessThanOrEqual(map.grid.x + map.grid.w + 1e-9);
          expect(s.y + s.h).toBeLessThanOrEqual(map.grid.y + map.grid.h + 1e-9);
        }
      });
    }
  }

  it("row layout puts step 1 on the row below the start cell", () => {
    const map = computeSheetRegionMap(makeSequence(4), "row");
    expect(map.steps[0]!.y).toBeGreaterThan(map.start!.y);
    expect(map.steps[0]!.x).toBeCloseTo(map.start!.x, 10);
  });

  it("column layout puts step 1 in the column right of the start cell", () => {
    const map = computeSheetRegionMap(makeSequence(4), "column");
    expect(map.steps[0]!.x).toBeGreaterThan(map.start!.x);
    expect(map.steps[0]!.y).toBeCloseTo(map.start!.y, 10);
  });
});
