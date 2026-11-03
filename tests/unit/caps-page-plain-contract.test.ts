import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CAPS_DIR = "src/routes/(public)/notation/caps";

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf-8");

// The 2026-09-29 rewrite (docs/superpowers/specs/2026-09-29-notation-caps-plain-rewrite.md)
// cut the page to plain prose, one CAP figure and one CAP-beside-LOOP pair.
describe("CAPs page stays plain", () => {
  const page = readSource(`${CAPS_DIR}/+page.svelte`);

  it("mounts only the CAP figure and the LOOP comparison", () => {
    const imports = [...page.matchAll(/^\s*import (\w+) from "([^"]+\.svelte)";/gm)].map(
      ([, name]) => name
    );
    expect(imports.sort()).toEqual(
      ["CapsAssembly", "LinkChip", "Seo", "SequenceHeroDemo", "YutaCapLiveDemo"].sort()
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

  it("covers the definition, the origin and the LOOP difference", () => {
    for (const heading of ["What a CAP is", "Where the idea came from", "CAPs and LOOPs", "Sources"]) {
      expect(page).toContain(`>${heading}</h2>`);
    }
  });
});
