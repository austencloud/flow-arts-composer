import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FULL_BLEED_DRAWER_QUERY } from "#lib/shared/inbox/domain/full-bleed-drawer.js";

const DRAWER = "src/lib/shared/inbox/components/InboxDrawer.svelte";

/** Media queries are formatted across lines by the formatter; compare shape. */
function normalize(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

describe("full-bleed drawer contract", () => {
  const source = readFileSync(DRAWER, "utf8");

  it("uses the shared query in JS rather than an inline one", () => {
    expect(source).toContain("matchMedia(FULL_BLEED_DRAWER_QUERY)");
    // The literal that this replaced. Reintroducing it anywhere in this file
    // means one half of the seam moved without the other.
    expect(source).not.toContain('matchMedia("(max-width: 768px)")');
  });

  it("declares the identical condition in CSS", () => {
    // CSS cannot import the constant, so this is the only thing keeping the two
    // halves together. They govern the same layout from opposite sides: JS owns
    // placement, the drag handle and the keyboard inset; CSS owns width, radius
    // and height. Drift gives a side panel stretched to full height, or a
    // full-bleed sheet with no handle.
    const mediaRules = [...source.matchAll(/@media([^{]+)\{/g)].map((match) =>
      normalize(match[1]!)
    );

    expect(mediaRules).toContain(normalize(FULL_BLEED_DRAWER_QUERY));
  });

  it("keeps a foldable full-bleed in BOTH orientations", () => {
    // The regression this exists to prevent. A Galaxy Z Fold unfolded is
    // 707x823 portrait / 823x707 landscape (1856x2160 @ 420dpi, measured on
    // device 2026-07-30). A width-only test passes one and fails the other.
    const query = FULL_BLEED_DRAWER_QUERY;

    expect(query).toContain("hover: none");
    expect(query).toContain("pointer: coarse");
    // Wide enough to cover the 823px landscape case...
    expect(query).toMatch(/max-width:\s*1024px/);
    // ...while still admitting plain narrow viewports on any device.
    expect(query).toMatch(/max-width:\s*768px/);
  });
});
