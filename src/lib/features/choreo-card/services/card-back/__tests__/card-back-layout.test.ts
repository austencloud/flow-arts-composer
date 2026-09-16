/**
 * Tests for computeCardBackLayout().
 *
 * Concrete case: render dims 1644×2244 (scale-2 card back), proof-mode
 * borderWidth = 8.759cqi (wide colored border, matches the card-front frame for
 * back-to-back cut symmetry). CRITICAL: cqi resolves against the border-frame
 * CONTENT-box (card inset by the borderWidth-cqi padding), and all boxes are
 * offset by that border inset. Mandala centered at x≈822, center-y≈986,
 * extent ≈976px (content reflows inward + smaller vs the prior 3.5cqi border).
 */

import { describe, it, expect } from "vitest";
import { computeCardBackLayout } from "../card-back-layout";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { CardBackData } from "../../../components/card-back/card-back-data";

// ── Render geometry (proof mode) ────────────────────────────────────────────
const WIDTH = 1644;
const HEIGHT = 2244;
const BORDER_CQI = 8.759;
const DIMS = { width: WIDTH, height: HEIGHT, borderWidthCqi: BORDER_CQI };

// Border-aware basis (mirrors computeCardBackLayout):
const BORDER_PX = BORDER_CQI * (WIDTH / 100);      // ≈144.0
const OX = BORDER_PX;
const OY = BORDER_PX;
const INNER_W = WIDTH - 2 * BORDER_PX;             // ≈1356.0
const INNER_H = HEIGHT - 2 * BORDER_PX;            // ≈1956.0
const CQI = INNER_W / 100;                         // ≈13.56

function makeData(loopComponents: Set<LOOPComponent>): CardBackData {
  return {
    word: "TEST",
    stepCount: 8,
    level: { number: 1, name: "Base Motions", detail: "", reason: "All motions at 0 turns", gradient: "linear-gradient(135deg, #1a1a2e, #16213e)", textColor: "#ffffff" },
    anatomy: { placements: new Set(["alpha"]), motions: new Set(["shift"]), rotations: new Set(["cw"]), orientations: new Set(["in"]), turns: new Set(["0"]) },
    hasLoop: loopComponents.size > 0,
    loopComponents,
    rotationPeriod: undefined,
    loopLabel: null, loopExplanation: null, sliceName: null, sliceDetail: null, isRotated: false,
    startPlacement: null, tndRatio: null,
    turnGlyphEntries: [{ left: 0, right: 0 }], turnLabel: "0", startPlacementLabel: null,
    reversalSequence: "----", reversalPeriod: 1, reversalLabel: "Cont.",
    handPathFamily: null, tkaDesignation: null, tndDesignation: null,
  };
}

describe("computeCardBackLayout (border-frame aware)", () => {
  it("topLeftGlyph: 10cqi×6cqi at (3.2cqi,3.2cqi) offset by the border inset", () => {
    const l = computeCardBackLayout(makeData(new Set()), DIMS);
    expect(l.topLeftGlyph.x).toBeCloseTo(OX + 3.2 * CQI, 3);
    expect(l.topLeftGlyph.y).toBeCloseTo(OY + 3.2 * CQI, 3);
    expect(l.topLeftGlyph.w).toBeCloseTo(10 * CQI, 3);
    expect(l.topLeftGlyph.h).toBeCloseTo(6 * CQI, 3);
  });

  it("topRightGlyph: right-aligned within the inner content box", () => {
    const l = computeCardBackLayout(makeData(new Set()), DIMS);
    // right edge sits 3.2cqi from the inner content-box right edge (= card edge - border)
    expect(l.topRightGlyph.x + l.topRightGlyph.w).toBeCloseTo(OX + INNER_W - 3.2 * CQI, 3);
    expect(l.topRightGlyph.w).toBeCloseTo(10 * CQI, 3);
  });

  describe("mandala (validated against live DOM)", () => {
    it("is a 72cqi (content-box) square", () => {
      const l = computeCardBackLayout(makeData(new Set()), DIMS);
      expect(l.mandala.w).toBeCloseTo(72 * CQI, 3);   // ≈976.3
      expect(l.mandala.h).toBeCloseTo(72 * CQI, 3);
    });
    it("is horizontally centered on the full card (x+w/2 ≈ 822)", () => {
      const l = computeCardBackLayout(makeData(new Set()), DIMS);
      expect(l.mandala.x + l.mandala.w / 2).toBeCloseTo(WIDTH / 2, 2); // 822
    });
    it("center-y matches the DOM-validated ≈986", () => {
      const l = computeCardBackLayout(makeData(new Set()), DIMS);
      expect(l.mandala.y + l.mandala.h / 2).toBeCloseTo(986, 0);
    });
  });

  describe("loopRow with 3 components", () => {
    const three = new Set([LOOPComponent.ROTATED, LOOPComponent.MIRRORED, LOOPComponent.FLIPPED]);
    it("produces 3 items, each 9cqi square", () => {
      const l = computeCardBackLayout(makeData(three), DIMS);
      expect(l.loopRow.items).toHaveLength(3);
      for (const it of l.loopRow.items) { expect(it.w).toBeCloseTo(9 * CQI, 3); expect(it.h).toBeCloseTo(9 * CQI, 3); }
    });
    it("items separated by 6cqi gaps", () => {
      const l = computeCardBackLayout(makeData(three), DIMS);
      const g = l.loopRow.items[1]!.x - (l.loopRow.items[0]!.x + l.loopRow.items[0]!.w);
      expect(g).toBeCloseTo(6 * CQI, 3);
    });
    it("group horizontally centered on the full card", () => {
      const l = computeCardBackLayout(makeData(three), DIMS);
      const items = l.loopRow.items;
      const avg = ((items[0]!.x + items[0]!.w / 2) + (items[2]!.x + items[2]!.w / 2)) / 2;
      expect(avg).toBeCloseTo(WIDTH / 2, 2);
    });
    it("bottom:28cqi from the inner content-box bottom", () => {
      const l = computeCardBackLayout(makeData(three), DIMS);
      expect(l.loopRow.items[0]!.y + l.loopRow.items[0]!.h).toBeCloseTo(OY + INNER_H - 28 * CQI, 3);
    });
  });

  it("loopRow with 0 components → empty", () => {
    expect(computeCardBackLayout(makeData(new Set()), DIMS).loopRow.items).toHaveLength(0);
  });

  describe("levelBadge", () => {
    it("centered, 7cqi square, bottom:18cqi from inner box", () => {
      const l = computeCardBackLayout(makeData(new Set()), DIMS);
      expect(l.levelBadge.x + l.levelBadge.w / 2).toBeCloseTo(WIDTH / 2, 2);
      expect(l.levelBadge.w).toBeCloseTo(7 * CQI, 3);
      expect(l.levelBadge.y + l.levelBadge.h).toBeCloseTo(OY + INNER_H - 18 * CQI, 3);
    });
  });

  describe("startPos", () => {
    it("12cqi square, bottom:2cqi left:3.2cqi within inner box", () => {
      const l = computeCardBackLayout(makeData(new Set()), DIMS);
      expect(l.startPos.x).toBeCloseTo(OX + 3.2 * CQI, 3);
      expect(l.startPos.y + l.startPos.h).toBeCloseTo(OY + INNER_H - 2 * CQI, 3);
      expect(l.startPos.w).toBeCloseTo(12 * CQI, 3);
    });
  });

  describe("stepCount", () => {
    it("right-aligned at 3.2cqi, height 9cqi, bottom:2cqi", () => {
      const l = computeCardBackLayout(makeData(new Set()), DIMS);
      expect(l.stepCount.x + l.stepCount.w).toBeCloseTo(OX + INNER_W - 3.2 * CQI, 3);
      expect(l.stepCount.h).toBeCloseTo(9 * CQI, 3);
      expect(l.stepCount.y + l.stepCount.h).toBeCloseTo(OY + INNER_H - 2 * CQI, 3);
    });
  });

  describe("url", () => {
    it("full inner width, near bottom:2.8cqi", () => {
      const l = computeCardBackLayout(makeData(new Set()), DIMS);
      expect(l.url.x).toBeCloseTo(OX, 3);
      expect(l.url.w).toBeCloseTo(INNER_W, 3);
      expect(l.url.y + l.url.h).toBeCloseTo(OY + INNER_H - 2.8 * CQI, 0);
    });
  });

  it("loopRow follows canonical display order (ascending x)", () => {
    const l = computeCardBackLayout(makeData(new Set([LOOPComponent.REWOUND, LOOPComponent.ROTATED, LOOPComponent.FLIPPED])), DIMS);
    const items = l.loopRow.items;
    expect(items).toHaveLength(3);
    expect(items[1]!.x).toBeGreaterThan(items[0]!.x);
    expect(items[2]!.x).toBeGreaterThan(items[1]!.x);
  });
});
