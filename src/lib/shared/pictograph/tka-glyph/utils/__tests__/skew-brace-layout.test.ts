import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKEW_BRACE_INK,
  getSkewBraceInk,
  getSkewBraceLayout,
  measureSkewBraceInk,
  placeSkewBraceGlyphs,
  SKEW_BRACE_FONT_SCALE,
  SKEW_BRACE_GAP,
  skewBraceInkFontScale,
  skewBraceLineBoxDrop,
  type SkewBraceInk,
} from "../skew-brace-layout";

describe("getSkewBraceLayout", () => {
  it("locks the gap and font scale constants", () => {
    expect(SKEW_BRACE_GAP).toBe(14);
    expect(SKEW_BRACE_FONT_SCALE).toBe(1.15);
  });

  it("puts the braces just outside the letter, centred on its height", () => {
    const layout = getSkewBraceLayout("S", { width: 100, height: 120 });
    expect(layout.openX).toBe(-14);
    expect(layout.closeX).toBe(114);
    expect(layout.y).toBe(60);
    expect(layout.fontSize).toBeCloseTo(138);
  });

  it("clears the dash of a dash letter", () => {
    const plain = getSkewBraceLayout("W", { width: 100, height: 100 });
    const dashed = getSkewBraceLayout("W-", { width: 100, height: 100 });
    expect(plain.closeX).toBe(114);
    expect(dashed.closeX).toBe(194);
    expect(dashed.openX).toBe(plain.openX);
  });

  it("clears the turns column when the closing brace must wrap it too", () => {
    const layout = getSkewBraceLayout(
      "S",
      { width: 75, height: 100 },
      { rightExtent: 30 }
    );
    expect(layout.closeX).toBe(119);
  });

  it("falls back to no extra clearance when nothing renders to the right", () => {
    const layout = getSkewBraceLayout("S", { width: 75, height: 100 });
    expect(layout.closeX).toBe(89);
  });
});

// A system brace glyph does not sit in the middle of its font's em box: its
// ink runs from about 0.70em above the alphabetic baseline to about 0.17em
// below it, while "central" / "middle" baselines centre the whole
// ascent+descent box (about 1.08em over 0.25em for Segoe UI). Centring that
// box dropped the visible brace about 0.15em below the letter. These numbers
// are Segoe UI's, rounded.
const SEGOE_LIKE_INK: SkewBraceInk = {
  open: { left: -0.05, right: 0.3, ascent: 0.7, descent: 0.17 },
  close: { left: -0.03, right: 0.3, ascent: 0.7, descent: 0.17 },
  fontAscent: 1.08,
  fontDescent: 0.25,
};

describe("placeSkewBraceGlyphs", () => {
  const layout = getSkewBraceLayout("S", { width: 75, height: 100 });
  const fontSize = layout.fontSize;

  it("centres each brace's ink on the letter's vertical centre", () => {
    const glyphs = placeSkewBraceGlyphs(layout, SEGOE_LIKE_INK);
    const inkCentre = (baseline: number, ink: { ascent: number; descent: number }) =>
      (baseline - ink.ascent * fontSize + (baseline + ink.descent * fontSize)) / 2;

    expect(inkCentre(glyphs.open.y, SEGOE_LIKE_INK.open)).toBeCloseTo(50);
    expect(inkCentre(glyphs.close.y, SEGOE_LIKE_INK.close)).toBeCloseTo(50);
  });

  it("keeps one gap of clear space between the letter and each brace's ink", () => {
    const glyphs = placeSkewBraceGlyphs(layout, SEGOE_LIKE_INK);

    // Start-anchored text: the opening brace's ink ends right of its origin,
    // the closing brace's ink starts left-bearing-adjusted from its origin.
    expect(glyphs.open.x + SEGOE_LIKE_INK.open.right * fontSize).toBeCloseTo(layout.openX);
    expect(glyphs.close.x - SEGOE_LIKE_INK.close.left * fontSize).toBeCloseTo(layout.closeX);
  });

  it("reports the outer ink edges of the pair so a composite can pad for them", () => {
    const glyphs = placeSkewBraceGlyphs(layout, SEGOE_LIKE_INK);

    expect(glyphs.inkLeft).toBeCloseTo(glyphs.open.x - SEGOE_LIKE_INK.open.left * fontSize);
    expect(glyphs.inkRight).toBeCloseTo(glyphs.close.x + SEGOE_LIKE_INK.close.right * fontSize);
    expect(glyphs.inkLeft).toBeLessThan(layout.openX);
    expect(glyphs.inkRight).toBeGreaterThan(layout.closeX);
  });

  it("uses the default system-font ink when no measurement is given", () => {
    expect(placeSkewBraceGlyphs(layout)).toEqual(
      placeSkewBraceGlyphs(layout, DEFAULT_SKEW_BRACE_INK)
    );
  });
});

describe("measureSkewBraceInk", () => {
  function metricsCtx(px: number) {
    const metrics: Record<string, Partial<TextMetrics>> = {
      "{": {
        actualBoundingBoxLeft: -0.05 * px,
        actualBoundingBoxRight: 0.3 * px,
        actualBoundingBoxAscent: 0.7 * px,
        actualBoundingBoxDescent: 0.17 * px,
        fontBoundingBoxAscent: 1.08 * px,
        fontBoundingBoxDescent: 0.25 * px,
      },
      "}": {
        actualBoundingBoxLeft: -0.03 * px,
        actualBoundingBoxRight: 0.3 * px,
        actualBoundingBoxAscent: 0.7 * px,
        actualBoundingBoxDescent: 0.17 * px,
        fontBoundingBoxAscent: 1.08 * px,
        fontBoundingBoxDescent: 0.25 * px,
      },
    };
    return {
      font: "",
      textAlign: "start",
      textBaseline: "alphabetic",
      save() {},
      restore() {},
      measureText: (text: string) => metrics[text] as TextMetrics,
    };
  }

  it("normalises the context's own glyph metrics by the font size", () => {
    const ink = measureSkewBraceInk(metricsCtx(200), 200);

    expect(ink).not.toBeNull();
    expect(ink!.open.left).toBeCloseTo(-0.05);
    expect(ink!.open.right).toBeCloseTo(0.3);
    expect(ink!.close.left).toBeCloseTo(-0.03);
    expect(ink!.open.ascent).toBeCloseTo(0.7);
    expect(ink!.open.descent).toBeCloseTo(0.17);
    expect(ink!.fontAscent).toBeCloseTo(1.08);
    expect(ink!.fontDescent).toBeCloseTo(0.25);
  });

  it("returns null when the context cannot measure ink", () => {
    const noMeasure = { font: "", textAlign: "start", textBaseline: "alphabetic", save() {}, restore() {} };
    expect(measureSkewBraceInk(noMeasure, 100)).toBeNull();

    const empty = { ...metricsCtx(100), measureText: () => ({ width: 0 }) as TextMetrics };
    expect(measureSkewBraceInk(empty, 100)).toBeNull();
  });

  it("falls back to the default ink where no canvas exists to measure with", () => {
    // jsdom has no OffscreenCanvas.
    expect(getSkewBraceInk()).toEqual(DEFAULT_SKEW_BRACE_INK);
  });
});

describe("skewBraceLineBoxDrop", () => {
  it("is how far the brace ink centre sits below the middle of a line-height 1 box, in em", () => {
    // A line-height:1 box puts the baseline 0.5 + (fontAscent - fontDescent) / 2
    // below its top; the ink centre sits (ascent - descent) / 2 above that.
    expect(skewBraceLineBoxDrop(SEGOE_LIKE_INK)).toBeCloseTo(
      (1.08 - 0.25) / 2 - (0.7 - 0.17) / 2
    );
  });
});

describe("skewBraceInkFontScale", () => {
  const inkHeight = (ink: SkewBraceInk) => ink.open.ascent + ink.open.descent;

  it("keeps the pictograph scale for the Segoe UI ink it was tuned on", () => {
    expect(skewBraceInkFontScale(DEFAULT_SKEW_BRACE_INK)).toBeCloseTo(SKEW_BRACE_FONT_SCALE);
  });

  it("shrinks a taller-inked face so its brace stands as tall as Segoe UI's", () => {
    // DejaVu Sans, the Linux system-ui fallback: its "{" inks 0.9375em.
    const dejaVu: SkewBraceInk = {
      ...DEFAULT_SKEW_BRACE_INK,
      open: { ...DEFAULT_SKEW_BRACE_INK.open, ascent: 0.76, descent: 0.1775 },
    };
    expect(skewBraceInkFontScale(dejaVu) * inkHeight(dejaVu)).toBeCloseTo(
      SKEW_BRACE_FONT_SCALE * inkHeight(DEFAULT_SKEW_BRACE_INK)
    );
  });
});
