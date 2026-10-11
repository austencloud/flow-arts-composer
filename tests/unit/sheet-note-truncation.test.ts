import { describe, expect, it } from "vitest";
import type { PDFFont } from "pdf-lib";

import { truncateToWidth } from "#lib/features/write/services/sheet-pdf-exporter.js";

// A note gets exactly one line on paper — `estimateBandHeight` budgets the
// strip at one line per note — so a long one has to be cut, not wrapped.
// Monospace stand-in: every glyph is `size` wide, so widths are countable.
function monoFont(): PDFFont {
  return {
    widthOfTextAtSize: (text: string, size: number) => text.length * size,
  } as unknown as PDFFont;
}

describe("truncateToWidth", () => {
  const font = monoFont();
  const size = 1; // 1pt per character keeps the arithmetic readable

  it("leaves a note that already fits completely alone", () => {
    expect(truncateToWidth("left thumb roll", font, size, 100)).toBe("left thumb roll");
  });

  it("keeps a note that exactly fills the space intact", () => {
    expect(truncateToWidth("abcde", font, size, 5)).toBe("abcde");
  });

  it("cuts a long note down and marks it with an ellipsis", () => {
    const out = truncateToWidth("pass behind then rewind", font, size, 10);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toBe("pass behi…");
  });

  it("never returns something wider than the space it was given", () => {
    const text = "a very long choreography note that will not fit";
    for (const maxWidth of [3, 7, 12, 20, 33]) {
      const out = truncateToWidth(text, font, size, maxWidth);
      expect(font.widthOfTextAtSize(out, size)).toBeLessThanOrEqual(maxWidth);
    }
  });

  it("returns nothing when there is no room at all", () => {
    expect(truncateToWidth("anything", font, size, 0)).toBe("");
    expect(truncateToWidth("anything", font, size, -5)).toBe("");
  });

  it("drops the text rather than emit a bare ellipsis it cannot fit", () => {
    // Under 1 glyph of room, even "x…" is too wide — nothing is drawn.
    expect(truncateToWidth("anything", font, size, 1)).toBe("");
  });
});
