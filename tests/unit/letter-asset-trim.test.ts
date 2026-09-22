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

// Still exported centred on a padded artboard. Delete an entry once its
// asset is trimmed to its ink; this list only shrinks.
const KNOWN_PADDED = ["Type2/μ.svg", "Type2/ν.svg", "Type6/τ.svg", "Type6/⊕.svg"];

function viewBox(file: string): number[] {
  const svg = readFileSync(join(LETTERS_DIR, file), "utf8");
  const match = /viewBox="([^"]+)"/.exec(svg);
  if (!match) throw new Error(`${file} has no viewBox`);
  return match[1]!.trim().split(/\s+/).map(Number);
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
    expect(padded.sort()).toEqual([...KNOWN_PADDED].sort());
  });

  it("trims the skewed-frame static letters to their ink", () => {
    // Ink bounds of the single path in each file.
    expect(viewBox("Type6/η.svg")).toEqual([0, 0, 74.11, 100]);
    expect(viewBox("Type6/ζ.svg")).toEqual([0, 0, 52.29, 100]);
  });
});
