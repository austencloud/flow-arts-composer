/**
 * Letter images are placed by their viewBox. TKAGlyph draws the image at the
 * glyph frame origin, left-aligned; the skew braces, dash, and turns column
 * lay themselves out against the viewBox width; the TKA Letters font takes
 * each glyph's advance from it. A letter exported centred on a padded
 * 200-wide artboard instead of trimmed to its ink renders shifted right, with
 * everything around it pushed out by the padding: a skewed start position
 * showed "{    η    }".
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LETTERS_DIR = resolve("static/images/letters_trimmed");

function viewBox(file: string): number[] {
  const svg = readFileSync(join(LETTERS_DIR, file), "utf8");
  const match = /viewBox="([^"]+)"/.exec(svg);
  if (!match) throw new Error(`${file} has no viewBox`);
  return match[1]!.trim().split(/\s+/).map(Number);
}

// The root element's declared size, where it declares one.
function declaredSize(file: string): { width?: number; height?: number } {
  const svg = readFileSync(join(LETTERS_DIR, file), "utf8");
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
  const attr = (name: string) => {
    const value = new RegExp(`\\s${name}="([^"]+)"`).exec(root)?.[1];
    return value === undefined ? undefined : Number(value);
  };
  return { width: attr("width"), height: attr("height") };
}

describe("letter image assets", () => {
  const files = readdirSync(LETTERS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((dir) =>
      readdirSync(join(LETTERS_DIR, dir.name))
        .filter((name) => name.endsWith(".svg"))
        .map((name) => `${dir.name}/${name}`)
    );

  it("trims each letter to its ink rather than centring it on a padded artboard", () => {
    const padded = files.filter((file) => {
      const [minX, , width] = viewBox(file);
      return width === 200 && minX! < 0;
    });
    expect(padded).toEqual([]);
  });

  // A declared width that disagrees with the viewBox scales the letter when an
  // <img> or the font pipeline honours the attribute instead of the viewBox.
  it("declares the same size on the root element as its viewBox", () => {
    const mismatched = files.filter((file) => {
      const [, , vbWidth, vbHeight] = viewBox(file);
      const { width, height } = declaredSize(file);
      return (
        (width !== undefined && width !== vbWidth) ||
        (height !== undefined && height !== vbHeight)
      );
    });
    expect(mismatched).toEqual([]);
  });

  it("trims the once-padded letters to their ink", () => {
    // Ink bounds of the single path in each file, from Chromium's getBBox.
    expect(viewBox("Type6/η.svg")).toEqual([0, 0, 74.11, 100]);
    expect(viewBox("Type6/ζ.svg")).toEqual([0, 0, 52.29, 100]);
    expect(viewBox("Type2/μ.svg")).toEqual([0, 0, 72.06, 100]);
    expect(viewBox("Type2/ν.svg")).toEqual([0, 0, 79.67, 100]);
    expect(viewBox("Type6/τ.svg")).toEqual([0, 0, 85.87, 100]);
    // ⊕ is a 90-tall circle centred in the shared 100-tall letter box, with 5
    // units above and below. Only its sides are trimmed, so it keeps the same
    // midline as every other letter and the font's 0-100 vertical canvas.
    expect(viewBox("Type6/⊕.svg")).toEqual([0, -5, 89.99, 100]);
  });
});
