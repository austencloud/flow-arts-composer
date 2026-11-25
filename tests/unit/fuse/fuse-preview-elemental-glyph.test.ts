import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const fusePreview = readSource(
  "src/lib/features/fuse/components/FuseAnimationPreview.svelte"
);
const glyphOverlay = readSource(
  "src/lib/shared/animation-engine/components/layers/GlyphOverlay.svelte"
);

describe("Fuse preview elemental glyph", () => {
  it("draws the canvas from Fuse's own display choices", () => {
    expect(fusePreview).toContain("const fuseDisplay = getFuseDisplay();");
    expect(fusePreview).toContain("visibilityManagerOverride={fuseDisplay}");
  });

  it("allows geometry-derived elements before fused letter lookup finishes", () => {
    expect(glyphOverlay).toContain(
      "{#if elementalGlyphVisible && elementalInfo.elementalType}"
    );
    expect(glyphOverlay).not.toContain(
      "elementalInfo.elementalType && elementalLetter"
    );
  });
});
