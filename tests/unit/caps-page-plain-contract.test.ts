import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CAPS_DIR = "src/routes/(public)/notation/caps";

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf-8");

// The 2026-09-29 rewrite (docs/superpowers/specs/2026-09-29-notation-caps-plain-rewrite.md)
// cut the page to plain prose. The 2026-11-02 rewrite added the three reverse
// settings and Gage DeMello's two-hand catalogue, still as figures, not widgets.
describe("CAPs page stays plain", () => {
  const page = readSource(`${CAPS_DIR}/+page.svelte`);

  it("mounts only the CAP figures, the hand tile and the LOOP demo", () => {
    const imports = [...page.matchAll(/^\s*import (\w+) from "([^"]+\.svelte)";/gm)].map(
      ([, name]) => name
    );
    expect(imports.sort()).toEqual(
      ["CapTrace", "CapsAssembly", "HandTile", "LinkChip", "Seo", "SequenceHeroDemo"].sort()
    );
  });

  it("keeps the retired widgets deleted", () => {
    for (const file of [
      "CapsHub.svelte",
      "CurveAtlas.svelte",
      "FocusedConstruction.svelte",
      "construction",
    ]) {
      expect(existsSync(resolve(process.cwd(), `${CAPS_DIR}/_components/${file}`))).toBe(false);
    }
  });

  it("has no section kickers or per-section accent colors", () => {
    expect(page).not.toContain("section-kicker");
    expect(page).not.toMatch(/style="--accent/);
  });

  it("covers the definition, reversal, two hands, the origin and the LOOP difference", () => {
    for (const heading of [
      "What a CAP is",
      "Where you reverse",
      "Two hands",
      "Where the idea came from",
      "CAPs and LOOPs",
      "Sources",
    ]) {
      expect(page).toContain(`>${heading}</h2>`);
    }
  });
});
