import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LAUNCHPAD_TILES } from "../../src/lib/shared/landing/components/launchpad/launchpad-tiles";

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf-8");

describe("Kinetic Atlas public entry points", () => {
  it("names the Atlas consistently at its canonical route", () => {
    expect(
      LAUNCHPAD_TILES.find((tile) => tile.href === "/atlas")
    ).toMatchObject({
      heading: "Kinetic Atlas",
      descriptor: "Explore letters, motion, notation, and technique.",
      icon: "fa-compass",
    });

    const header = readSource(
      "src/lib/shared/landing/components/SiteHeader.svelte"
    );
    const footer = readSource(
      "src/lib/shared/landing/components/SiteFooter.svelte"
    );
    for (const source of [header, footer]) {
      expect(source).toContain('label: "Kinetic Atlas"');
      expect(source).toContain('href: "/atlas"');
      expect(source).not.toContain('label: "Glossary"');
    }
  });

  it("keeps the gated Atlas out of the prop notation page", () => {
    // The Atlas is still Coming Soon, so the prop page must not promise it
    // "defines every term". Restore the link when the Atlas opens.
    for (const path of [
      "src/routes/(public)/notation/props/+page.svelte",
      "src/routes/(public)/notation/props/props-content.ts",
    ]) {
      expect(readSource(path), `${path} links /atlas`).not.toContain("/atlas");
    }
  });

  it("uses the Atlas name in accessibility labels", () => {
    const atlas = readSource(
      "src/routes/(public)/atlas/_components/KineticAtlasDraft.svelte"
    );
    const atlasNav = readSource(
      "src/routes/(public)/atlas/_components/GlossaryNav.svelte"
    );
    expect(atlas).toContain('aria-label="Atlas navigation"');
    expect(atlas).toContain('aria-label="Atlas contents"');
    expect(`${atlas}\n${atlasNav}`).not.toMatch(
      /aria-label="[^"]*Glossary[^"]*"/
    );
  });
});
