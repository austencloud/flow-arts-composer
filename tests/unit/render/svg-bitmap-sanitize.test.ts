import { describe, it, expect } from "vitest";
import { sanitizeSvgForBitmap } from "#lib/shared/render/services/svg-bitmap-sanitize.js";

describe("sanitizeSvgForBitmap", () => {
  // The real letter glyph SVGs (static/images/letters_trimmed/Type1/A.svg) ship
  // this exact malformed attribute, which makes strict parsers (createImageBitmap,
  // iOS data-URL decode) reject the SVG so the glyph silently fails to draw.
  const malformedLetter =
    '<svg xmlns="http://www.w3.org/2000/svg" style="style=&quot;enable-background:new 0 0 200.0 100.0&quot;" viewBox="22.48 0 74.98 99.96"><path fill="#000000" d="M96.6 90.1Z"/></svg>';

  it("strips the malformed double-encoded style attribute", () => {
    const result = sanitizeSvgForBitmap(malformedLetter);
    expect(result).not.toContain("style=");
    expect(result).not.toContain("&quot;");
    expect(result).not.toContain("enable-background");
  });

  it("preserves the actual glyph path so it still renders", () => {
    const result = sanitizeSvgForBitmap(malformedLetter);
    expect(result).toContain("<path");
    expect(result).toContain('fill="#000000"');
  });

  it("injects explicit width/height from the viewBox", () => {
    const result = sanitizeSvgForBitmap(malformedLetter);
    // viewBox="22.48 0 74.98 99.96" → width 74.98, height 99.96
    expect(result).toMatch(/<svg[^>]*\bwidth="74\.98"/);
    expect(result).toMatch(/<svg[^>]*\bheight="99\.96"/);
  });

  it("falls back to 100x100 when there is no viewBox", () => {
    const result = sanitizeSvgForBitmap('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0Z"/></svg>');
    expect(result).toMatch(/<svg[^>]*\bwidth="100"/);
    expect(result).toMatch(/<svg[^>]*\bheight="100"/);
  });

  it("leaves an already-clean SVG with explicit dimensions untouched", () => {
    const clean = '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50"><circle cx="25" cy="25" r="10"/></svg>';
    expect(sanitizeSvgForBitmap(clean)).toBe(clean);
  });
});
