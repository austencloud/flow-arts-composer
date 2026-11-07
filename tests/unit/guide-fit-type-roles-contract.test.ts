import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const GUIDE_DIR = "src/routes/(public)/guide";

const guideStyleFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return guideStyleFiles(path);
    return /\.(svelte|css)$/.test(entry.name) ? [path] : [];
  });

// A zoom or font-size declaration whose value reads the fit scale.
const SCALED_TYPE =
  /(?<![\w-])(?:zoom|font-size|font)\s*:[^;{}]*--(?:card-)?fit\b[^;{}]*/g;

const scaledType = (source: string): string[] =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .match(SCALED_TYPE) ?? [];

// --fit sizes a guide screen's figures so they fill the frame (fit-scale.ts).
// On 2026-11-05 a zoom tied to it drew 17px sentences at 27px and Austen called
// the screen cartoonish. Words and controls keep their type roles at every
// window, and nothing on screen fails if they stop doing so.
describe("guide words stay out of the fit scale", () => {
  it("sees a scaled declaration when one is written", () => {
    expect(
      scaledType(".a { zoom: clamp(0.45, var(--fit, 1), 1.75); }")
    ).toHaveLength(1);
    expect(
      scaledType(
        ".a {\n  font-size: calc(\n    1rem * var(--card-fit)\n  );\n}"
      )
    ).toHaveLength(1);
    expect(
      scaledType(".a { width: calc(7rem * var(--fit, 1)); font-size: 1rem; }")
    ).toEqual([]);
    expect(scaledType("/* font-size: var(--fit) */")).toEqual([]);
  });

  it("no guide zoom or font-size reads --fit or --card-fit", () => {
    const files = guideStyleFiles(GUIDE_DIR);
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.flatMap((file) =>
      scaledType(readFileSync(file, "utf-8")).map(
        (rule) => `${file}: ${rule.trim()}`
      )
    );
    expect(offenders).toEqual([]);
  });
});
