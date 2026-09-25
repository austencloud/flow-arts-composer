import { describe, expect, it } from "vitest";
import {
  CATALOG_CAPTION_HEIGHT,
  CATALOG_CAPTION_WIDTH,
  CATALOG_GAP,
  CATALOG_INNER_GAP,
  CATALOG_PORTRAIT_ASPECT,
  CATALOG_TILE_PAD,
  fitEffectCatalog,
  MAX_LIST_ROW,
  MIN_CATALOG_PORTRAIT,
  MIN_LIST_ROW,
  type EffectCatalogFit,
} from "$lib/shared/animation-engine/domain/effect-catalog-fit";

const COUNT = 16;

function tile(fit: EffectCatalogFit, width: number, height: number) {
  return {
    innerW:
      (width - (fit.cols - 1) * CATALOG_GAP) / fit.cols - 2 * CATALOG_TILE_PAD,
    innerH:
      (height - (fit.rows - 1) * CATALOG_GAP) / fit.rows - 2 * CATALOG_TILE_PAD,
  };
}

/** The picture and its name both fit inside the tile the grid hands out. */
function expectContentInside(
  fit: EffectCatalogFit,
  width: number,
  height: number
) {
  const { innerW, innerH } = tile(fit, width, height);
  const portraitH = fit.portrait / CATALOG_PORTRAIT_ASPECT;
  if (fit.orientation === "row") {
    expect(
      fit.portrait + CATALOG_INNER_GAP + CATALOG_CAPTION_WIDTH
    ).toBeLessThanOrEqual(innerW + 0.5);
    expect(portraitH).toBeLessThanOrEqual(innerH + 0.5);
  } else {
    expect(fit.portrait).toBeLessThanOrEqual(innerW + 0.5);
    expect(CATALOG_CAPTION_WIDTH).toBeLessThanOrEqual(innerW + 0.5);
    expect(
      portraitH + CATALOG_INNER_GAP + CATALOG_CAPTION_HEIGHT
    ).toBeLessThanOrEqual(innerH + 0.5);
  }
}

/** Every list row is a full touch target and wide enough for its name. */
function expectListRowsFit(
  fit: EffectCatalogFit,
  width: number,
  height: number
) {
  const rowH = (height - (fit.rows - 1) * fit.gap) / fit.rows;
  const innerW =
    (width - (fit.cols - 1) * fit.gap) / fit.cols - 2 * CATALOG_TILE_PAD;
  expect(Math.min(rowH, MAX_LIST_ROW)).toBeGreaterThanOrEqual(MIN_LIST_ROW);
  expect(CATALOG_CAPTION_WIDTH).toBeLessThanOrEqual(innerW + 0.5);
}

describe("fitEffectCatalog", () => {
  it("puts the name beside the picture in a desktop studio card", () => {
    // The side-by-side studio at 1920x1000: the grid gets about 504x712.
    const fit = fitEffectCatalog({ width: 504, height: 712, count: COUNT });
    expect(fit).toMatchObject({ cols: 2, rows: 8, orientation: "row" });
    expect(fit!.portrait).toBeGreaterThan(120);
    expectContentInside(fit!, 504, 712);
  });

  it("stacks the name under the picture when a column is too narrow", () => {
    const fit = fitEffectCatalog({ width: 300, height: 900, count: COUNT });
    expect(fit).toMatchObject({ orientation: "stack" });
    expectContentInside(fit!, 300, 900);
  });

  it("fills a narrow tall card with a list of names where pictures would be stamps", () => {
    // The studio at 852x833 (a third of a laptop screen at 150%): the card is
    // 305px wide, so the best picture would be about 53px.
    const fit = fitEffectCatalog({ width: 273, height: 390, count: COUNT });
    expect(fit).toMatchObject({
      cols: 2,
      rows: 8,
      orientation: "list",
      portrait: 0,
    });
    expectListRowsFit(fit!, 273, 390);
  });

  it("keeps the compact grid where even the list's rows would be too short", () => {
    // Short landscape (960x412): the compact grid already scrolls.
    expect(fitEffectCatalog({ width: 314, height: 170, count: COUNT })).toBe(
      null
    );
  });

  it("never lets a picture or a name spill out of its tile", () => {
    for (let width = 160; width <= 900; width += 37) {
      for (let height = 200; height <= 1400; height += 53) {
        const fit = fitEffectCatalog({ width, height, count: COUNT });
        if (!fit) continue;
        expect(fit.cols * fit.rows).toBeGreaterThanOrEqual(COUNT);
        if (fit.orientation === "list") {
          expectListRowsFit(fit, width, height);
          continue;
        }
        expect(fit.portrait).toBeGreaterThanOrEqual(MIN_CATALOG_PORTRAIT);
        expectContentInside(fit, width, height);
      }
    }
  });
});
