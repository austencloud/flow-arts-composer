import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { getTkaGlyphPath, loadTkaWordGlyphs } from "./tka-glyph-loader.js";

const PACKAGE_GLYPHS = join(process.cwd(), "assets/images/letters_trimmed");
const APP_GLYPHS = join(process.cwd(), "../static/images/letters_trimmed");

function glyphFiles(root: string, current = root): string[] {
  return readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(current, entry.name);
      return entry.isDirectory()
        ? glyphFiles(root, path)
        : [relative(root, path)];
    })
    .filter(
      (path) => path.endsWith(".svg") && !path.endsWith(".FAKE_DELETE_ME")
    );
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("packaged TKA word glyphs", () => {
  it("keeps the built renderer on shared composition and package-relative assets", () => {
    const builtRenderer = join(process.cwd(), "dist/index.js");
    expect(existsSync(builtRenderer)).toBe(true);
    const bundle = readFileSync(builtRenderer, "utf8");

    expect(bundle).toContain("function renderStepNumber");
    expect(bundle).toContain("function renderHeader");
    expect(bundle).toContain("function renderFooter");
    expect(bundle).toContain("../assets/images/letters_trimmed");
    expect(bundle).not.toContain('stepNumber === 0 ? "start"');
  });

  it("matches the app's canonical glyph catalog byte-for-byte", () => {
    const appFiles = glyphFiles(APP_GLYPHS).sort();
    const packageFiles = glyphFiles(PACKAGE_GLYPHS).sort();

    expect(packageFiles).toEqual(appFiles);
    for (const file of appFiles) {
      expect(sha256(join(PACKAGE_GLYPHS, file))).toBe(
        sha256(join(APP_GLYPHS, file))
      );
    }
  });

  it("loads canonical glyph images, including dashed and static letters", async () => {
    const loaded: Buffer[] = [];
    const glyphs = await loadTkaWordGlyphs(
      "ALIDτ-",
      async (source) => {
        loaded.push(source);
        return {} as CanvasImageSource;
      },
      true
    );

    expect([...(glyphs?.keys() ?? [])]).toEqual(["A", "L", "I", "D", "τ-"]);
    expect(glyphs?.get("τ-")?.isDash).toBe(true);
    expect(loaded).toHaveLength(5);
    expect(getTkaGlyphPath("τ-")).toMatch(/Type6[\\/]τ\.svg$/);
  });

  it("preserves arbitrary labels as text rather than silently dropping glyphs", async () => {
    await expect(
      loadTkaWordGlyphs("A?", async () => ({}) as CanvasImageSource, true)
    ).resolves.toBeUndefined();
  });
});
