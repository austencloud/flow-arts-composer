import { describe, expect, it } from "vitest";
import {
  activeCaptionsAtTime,
  captionAlpha,
  captionCenterY,
  captionFontPx,
  captionFontString,
  captionLineYPositions,
  wrapCaptionText,
  type CaptionLayoutInput,
} from "$lib/shared/media-composition/domain/caption-layout";

function caption(
  overrides: Partial<CaptionLayoutInput> = {}
): CaptionLayoutInput {
  return {
    id: "c1",
    text: "Practice with me!",
    startSeconds: 2,
    endSeconds: 6,
    position: "bottom",
    size: "m",
    ...overrides,
  };
}

describe("captionAlpha", () => {
  it("fades in at the start and out at the end", () => {
    const c = caption({ startSeconds: 2, endSeconds: 6 });
    expect(captionAlpha(c, 2, 0.15)).toBeCloseTo(0);
    expect(captionAlpha(c, 2.075, 0.15)).toBeCloseTo(0.5);
    expect(captionAlpha(c, 2.15, 0.15)).toBeCloseTo(1);
    expect(captionAlpha(c, 4, 0.15)).toBeCloseTo(1);
    expect(captionAlpha(c, 5.85, 0.15)).toBeCloseTo(1);
    expect(captionAlpha(c, 5.925, 0.15)).toBeCloseTo(0.5);
    expect(captionAlpha(c, 6, 0.15)).toBeCloseTo(0);
  });

  it("splits the fade for a caption shorter than two fades", () => {
    // 0.2s span, 0.15s requested fade -> clamps to 0.1s each side.
    const c = caption({ startSeconds: 0, endSeconds: 0.2 });
    expect(captionAlpha(c, 0.1, 0.15)).toBeCloseTo(1);
    expect(captionAlpha(c, 0, 0.15)).toBeCloseTo(0);
  });

  it("never fades a zero-length caption", () => {
    const c = caption({ startSeconds: 1, endSeconds: 1 });
    expect(captionAlpha(c, 1, 0.15)).toBe(1);
  });
});

describe("activeCaptionsAtTime", () => {
  it("includes a caption whose span contains the time, half-open at the end", () => {
    const a = caption({ id: "a", startSeconds: 0, endSeconds: 2 });
    const b = caption({ id: "b", startSeconds: 2, endSeconds: 4 });
    expect(activeCaptionsAtTime([a, b], 1).map((x) => x.caption.id)).toEqual([
      "a",
    ]);
    expect(activeCaptionsAtTime([a, b], 2).map((x) => x.caption.id)).toEqual([
      "b",
    ]);
    expect(activeCaptionsAtTime([a, b], 4)).toEqual([]);
  });

  it("returns more than one caption when their spans overlap", () => {
    const a = caption({ id: "a", startSeconds: 0, endSeconds: 5 });
    const b = caption({ id: "b", startSeconds: 3, endSeconds: 8 });
    const active = activeCaptionsAtTime([a, b], 4);
    expect(active.map((x) => x.caption.id).sort()).toEqual(["a", "b"]);
  });
});

describe("captionFontPx", () => {
  it("scales off the frame width by size", () => {
    expect(captionFontPx("s", 1080)).toBeCloseTo(1080 * 0.055);
    expect(captionFontPx("m", 1080)).toBeCloseTo(1080 * 0.075);
    expect(captionFontPx("l", 1080)).toBeCloseTo(1080 * 0.1);
    expect(captionFontPx("l", 1080)).toBeGreaterThan(captionFontPx("m", 1080));
    expect(captionFontPx("m", 1080)).toBeGreaterThan(captionFontPx("s", 1080));
  });
});

describe("captionCenterY", () => {
  const rect = { x: 0, y: 100, width: 1080, height: 1920 };

  it("places top near the top, middle at center, bottom near the bottom", () => {
    const top = captionCenterY("top", rect);
    const middle = captionCenterY("middle", rect);
    const bottom = captionCenterY("bottom", rect);
    expect(top).toBeLessThan(middle);
    expect(middle).toBeLessThan(bottom);
    expect(middle).toBeCloseTo(rect.y + rect.height * 0.5);
    expect(bottom).toBeLessThan(rect.y + rect.height);
  });
});

describe("captionFontString", () => {
  it("uses the italic display face when it loaded", () => {
    const font = captionFontString(64, true);
    expect(font).toContain("Fraunces");
    expect(font).toContain("italic");
    expect(font).toContain("700");
    expect(font).toContain("64px");
  });

  it("falls back to a heavy system stack when it did not", () => {
    const font = captionFontString(64, false);
    expect(font).not.toContain("Fraunces");
    expect(font).toContain("900");
    expect(font).toContain("64px");
  });
});

describe("wrapCaptionText", () => {
  /** A deterministic stand-in for CanvasRenderingContext2D#measureText: one
   *  fixed width per character, so wrapping is exact math instead of font
   *  metrics. */
  const measure = (line: string) => line.length * 10;

  it("keeps a short caption on one line", () => {
    expect(wrapCaptionText("Practice with me!", measure, 1000)).toEqual([
      "Practice with me!",
    ]);
  });

  it("wraps once the next word would overflow the width", () => {
    // "Go slower to learn faster" - break after "learn" at width 140.
    const lines = wrapCaptionText("Go slower to learn faster", measure, 140);
    expect(lines).toEqual(["Go slower to", "learn faster"]);
    for (const line of lines) {
      expect(measure(line)).toBeLessThanOrEqual(140);
    }
  });

  it("gives an over-wide single word its own line instead of splitting it", () => {
    const lines = wrapCaptionText(
      "Supercalifragilisticexpialidocious",
      measure,
      50
    );
    expect(lines).toEqual(["Supercalifragilisticexpialidocious"]);
  });

  it("collapses repeated whitespace and returns no lines for empty text", () => {
    expect(wrapCaptionText("  a    b  ", measure, 1000)).toEqual(["a b"]);
    expect(wrapCaptionText("   ", measure, 1000)).toEqual([]);
  });
});

describe("captionLineYPositions", () => {
  it("centers a single line on the anchor", () => {
    expect(captionLineYPositions(500, 1, 40)).toEqual([500]);
  });

  it("spreads multiple lines symmetrically around the anchor", () => {
    const ys = captionLineYPositions(500, 3, 40);
    expect(ys).toEqual([460, 500, 540]);
  });
});
