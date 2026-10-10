// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { planFestivalSamplerSheetPreview } from "#lib/features/choreo-card/services/festival-sampler-sheet-preview.js";
import type { CardPair } from "#lib/features/choreo-card/services/types.js";

function pair(index: number): CardPair {
  const front = document.createElement("canvas");
  front.width = 822;
  front.height = 1122;
  const back = document.createElement("canvas");
  back.width = 1644;
  back.height = 2244;
  return { front, back, label: String(index) };
}

describe("festival sampler sheet preview", () => {
  const pairs = Array.from({ length: 9 }, (_, index) => pair(index));

  it("uses the canonical Letter poker grid", () => {
    const placements = planFestivalSamplerSheetPreview(pairs, "front");

    expect(placements).toHaveLength(9);
    expect(placements[0]).toMatchObject({
      pair: pairs[0],
      sourceIndex: 0,
      sourceX: 36,
      sourceY: 36,
      sourceWidth: 750,
      sourceHeight: 1050,
      destinationX: 36,
      destinationY: 18,
      destinationWidth: 180,
      destinationHeight: 252,
    });
    expect(placements[8]).toMatchObject({
      destinationX: 396,
      destinationY: 522,
    });
  });

  it("mirrors back columns and scales the bleed crop with the source canvas", () => {
    const placements = planFestivalSamplerSheetPreview(pairs, "back");

    expect(placements.map((placement) => placement.source)).toEqual([
      pairs[2]!.back,
      pairs[1]!.back,
      pairs[0]!.back,
      pairs[5]!.back,
      pairs[4]!.back,
      pairs[3]!.back,
      pairs[8]!.back,
      pairs[7]!.back,
      pairs[6]!.back,
    ]);
    expect(placements.map((placement) => placement.sourceIndex)).toEqual([
      2, 1, 0, 5, 4, 3, 8, 7, 6,
    ]);
    expect(placements[0]).toMatchObject({
      sourceX: 72,
      sourceY: 72,
      sourceWidth: 1500,
      sourceHeight: 2100,
    });
  });

  it("rejects incomplete sheets", () => {
    expect(() =>
      planFestivalSamplerSheetPreview(pairs.slice(0, 8), "front")
    ).toThrow("Festival preview needs 9 cards; received 8");
  });
});
