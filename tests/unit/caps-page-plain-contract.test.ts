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
  // The page's words moved to src/routes/(public)/notation/caps/copy.json so
  // Austen can retype them in place.
  const copy: Record<string, string> = JSON.parse(
    readSource(`${CAPS_DIR}/copy.json`)
  );
  const copyText = Object.values(copy)
    .join(" ")
    .replace(/\{\d+\}/g, "");

  it("mounts only the CAP figures, the hand tile and the LOOP demo", () => {
    const imports = [
      ...page.matchAll(/^\s*import (\w+) from "([^"]+\.svelte)";/gm),
    ].map(([, name]) => name);
    expect(imports.sort()).toEqual(
      [
        "CapTrace",
        "CapsAssembly",
        "CopyText",
        "HandTile",
        "LazyMount",
        "LinkChip",
        "Seo",
        "SequenceHeroDemo",
      ].sort()
    );
  });

  it("keeps the retired widgets deleted", () => {
    for (const file of [
      "CapsHub.svelte",
      "CurveAtlas.svelte",
      "FocusedConstruction.svelte",
      "construction",
    ]) {
      expect(
        existsSync(resolve(process.cwd(), `${CAPS_DIR}/_components/${file}`))
      ).toBe(false);
    }
  });

  it("has no section kickers or per-section accent colors", () => {
    expect(page).not.toContain("section-kicker");
    expect(page).not.toMatch(/style="--accent/);
  });

  it("covers the definition, reversal, two hands and the LOOP difference", () => {
    for (const heading of [
      "What a CAP is",
      "Where you reverse",
      "Two hands",
      "CAPs and LOOPs",
      "Sources",
    ]) {
      expect(Object.values(copy)).toContain(heading);
    }
  });

  // Austen, 2026-11-02: the page is about the patterns, not a history of
  // people the reader does not know.
  it("leaves out the people history", () => {
    for (const name of ["Burning Man", "Alien Jon", "Noel", "Charlie"]) {
      expect(page).not.toContain(name);
      expect(copyText).not.toContain(name);
    }
  });

  it("renders its words from copy.json, every key used and none missing", () => {
    expect(page).toContain("createPageCopy");
    const used = [
      ...page.matchAll(/\bkey="([^"]+)"/g),
      ...page.matchAll(/\bcaptionKey: "([^"]+)"/g),
    ].map(([, key]) => key);
    expect([...used].sort()).toEqual(Object.keys(copy).sort());
  });

  it("keeps the lede sentence in its copy", () => {
    expect(copyText).toContain(
      "What a CAP is, where you reverse, the two-hand version, and how it differs from a LOOP."
    );
  });

  it("gives each placeholder an island the page passes", () => {
    const islandCounts: Record<string, number> = {};
    for (const [, key, list] of page.matchAll(
      /\bkey="([^"]+)"\s+islands=\{\[([^\]]+)\]\}/g
    )) {
      islandCounts[key!] = list!.split(",").length;
    }
    for (const [key, value] of Object.entries(copy)) {
      const slots = [...value.matchAll(/\{\d+\}/g)];
      expect(slots.length, key).toBe(islandCounts[key] ?? 0);
    }
  });

  it("never caps the reading width", () => {
    expect(page).not.toMatch(/max-inline-size:\s*\d+ch/);
  });
});
