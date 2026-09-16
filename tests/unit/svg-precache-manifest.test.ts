/**
 * Guards the SW precache manifest generator (scripts/generate-svg-precache-manifest.cjs)
 * that feeds the install-time pictograph SVG precache (offline audit 2026-06-30 fix #1).
 * A silent regression here (wrong path separators, missing the grid probe) would
 * leave pictographs blank offline without any visible error.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { collectAssets } = require("../../scripts/generate-svg-precache-manifest.cjs") as {
  collectAssets: (imagesDir?: string) => string[];
};

describe("svg precache manifest generator", () => {
  const assets = collectAssets();

  it("collects the essential pictograph asset set", () => {
    // grid(7) + pictograph props(~46) + arrows(~63) + letters(~60) + numbers(7)
    // + vtg(7) + root glyphs(4) + element PNGs(6)
    expect(assets.length).toBeGreaterThan(150);
  });

  it("includes the offline-render probe grid SVG", () => {
    // checkPropSvgsCached() probes this exact path to gauge offline readiness.
    expect(assets).toContain("/images/grid/diamond_grid.svg");
  });

  it("includes the arrow split manifest requested by the renderer", () => {
    expect(assets).toContain("/images/arrows/arrow-split-manifest.json");
  });

  it("emits only root-relative, forward-slashed /images URLs", () => {
    for (const a of assets) {
      expect(a.startsWith("/images/")).toBe(true);
      expect(a).not.toContain("\\");
    }
  });

  it("is sorted and deduped", () => {
    expect(assets).toEqual([...assets].sort());
    expect(new Set(assets).size).toBe(assets.length);
  });

  it("includes the root-level glyph SVGs", () => {
    // Fetched directly by glyph-cache.ts, PlacementGlyph.svelte, and
    // canvas-2d-glyph-renderer.ts — omitting them leaves glyphs blank offline.
    expect(assets).toContain("/images/arrow.svg");
    expect(assets).toContain("/images/blank.svg");
    expect(assets).toContain("/images/dash.svg");
    expect(assets).toContain("/images/same_opp_dot.svg");
  });

  it("includes the six shipped elemental glyph WebPs, not the print PNGs", () => {
    // Mirrors ELEMENT_IMAGE_FILE in pictograph-enums.ts — these exact variants
    // are what getElementImagePath() fetches at runtime. The lossless PNGs stay
    // on disk for the print/card pipeline and must NOT be precached (4.4 MB).
    expect(assets).toContain("/images/elements/water-v2.webp");
    expect(assets).toContain("/images/elements/fire-v2.webp");
    expect(assets).toContain("/images/elements/earth-v2.webp");
    expect(assets).toContain("/images/elements/air-v2.webp");
    expect(assets).toContain("/images/elements/sun-v4.webp");
    expect(assets).toContain("/images/elements/moon-v2.webp");
    expect(assets).not.toContain("/images/elements/water-v2.png");
    expect(assets).not.toContain("/images/elements/sun-v4.png");
  });

  it("excludes the build-time arrow sprite files", () => {
    // Source metadata for tooling, never fetched at runtime — 41KB each of
    // dead precache weight if they slip in.
    expect(assets).not.toContain("/images/arrows-sprite.svg");
    expect(assets).not.toContain("/images/_arrows-sprite.svg");
  });

  it("fails loudly when a load-bearing explicit file is missing", () => {
    // Silent omission is the exact bug the explicit lists exist to close.
    expect(() => collectAssets("Z:/nonexistent/images")).toThrow(/arrow\.svg/);
  });
});
