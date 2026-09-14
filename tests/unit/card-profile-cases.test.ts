import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { pickBestFitLayout } from "$lib/shared/render/services/container-aware-layout";
import { calculatePhysicalCardLayout } from "$lib/features/choreo-card/services/physical-card-layout-calculator";
import { CARD_SIZES } from "$lib/features/choreo-card/domain/card-sizes";
import {
  cardProfileCases,
  VIEWER_LANDSCAPE,
  VIEWER_PORTRAIT,
} from "../render-parity/card-profile-cases";

/**
 * The review page hard-codes each preset's layout so the Node renderer never
 * has to import viewer code. These guards keep those copies honest: when a
 * selector changes its answer, the review page must change with it.
 */

function profile(name: string) {
  const entry = cardProfileCases().find((entry) => entry.name === name);
  if (!entry) throw new Error(`Missing profile case ${name}`);
  return entry;
}

function viewerAuto(stepCount: number, panel: typeof VIEWER_PORTRAIT) {
  return pickBestFitLayout({
    stepCount,
    includeStartPosition: true,
    ...panel,
    showHeader: true,
    showFooter: false,
    showQRCode: false,
  })!;
}

function printLayout(stepCount: number, showFooter: boolean) {
  const poker = CARD_SIZES.poker;
  return calculatePhysicalCardLayout({
    sequence: {
      id: `profile-${stepCount}`,
      word: "W",
      steps: Array.from({ length: stepCount }, () => ({ duration: 1 })),
    } as unknown as SequenceData,
    canvasWidth: poker.canvasWidth,
    canvasHeight: poker.canvasHeight,
    bleedPx: poker.bleedPx,
    includeStartPosition: true,
    showHeader: true,
    showFooter,
    showQRCode: true,
  });
}

describe("card profile cases mirror the real layout selectors", () => {
  it("viewer Auto, portrait panel, four steps", () => {
    const fit = viewerAuto(4, VIEWER_PORTRAIT);
    const options = profile("viewer-auto-portrait-4").options;
    expect(options.columnCount).toBe(fit.cols);
    expect(options.startPositionLayout).toBe(fit.startPlacement);
  });

  it("viewer Auto, landscape panel, four steps", () => {
    const fit = viewerAuto(4, VIEWER_LANDSCAPE);
    const options = profile("viewer-auto-landscape-4").options;
    expect(options.columnCount).toBe(fit.cols);
    expect(options.startPositionLayout).toBe(fit.startPlacement);
  });

  it("poker print, four steps: Start in the top row with two columns, footer or not", () => {
    const options = profile("print-poker-4").options;
    for (const showFooter of [false, true]) {
      const layout = printLayout(4, showFooter);
      expect(layout.startPositionLayout).toBe("row");
      expect(options.columnCount).toBe(layout.totalGridColumns);
      expect(options.startPositionLayout).toBe(layout.startPositionLayout);
    }
  });

  it("poker print, eight steps: Start column with three total columns", () => {
    const options = profile("print-poker-8").options;
    const layout = printLayout(8, true);
    expect(layout.startPositionLayout).toBe("column");
    expect(options.columnCount).toBe(layout.totalGridColumns);
    expect(options.startPositionLayout).toBe(layout.startPositionLayout);
  });

  it("the default export carries no layout override", () => {
    const options = profile("export-composer-default-4").options;
    expect(options.columnCount).toBeUndefined();
    expect(options.startPositionLayout).toBeUndefined();
    expect(options.exportProfile).toBeUndefined();
  });
});
