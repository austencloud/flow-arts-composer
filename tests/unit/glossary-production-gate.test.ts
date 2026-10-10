import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf-8");

const route = readSource("src/routes/(public)/atlas/+page.svelte");
const draft = readSource(
  "src/routes/(public)/atlas/_components/KineticAtlasDraft.svelte"
);
const overview = readSource(
  "src/routes/(public)/atlas/_components/KineticAtlasOverview.svelte"
);
const sitemap = readSource("src/routes/sitemap.xml/+server.ts");

describe("Kinetic Atlas production gate", () => {
  it("keeps the complete Atlas available in development and gates production", () => {
    expect(route).toContain('import { dev } from "$app/env"');
    expect(route).toMatch(/\{#if dev\}\s*<KineticAtlasDraft \{data\} \/>/);
    expect(route).toContain("UnderConstruction");
    expect(route).toContain('eyebrow="Coming soon"');
    expect(route).toContain('content="noindex, follow"');
    expect(route).toContain('style:view-transition-name="launchpad-glossary"');
  });

  it("preserves the complete Atlas at its canonical development URL", () => {
    expect(draft).toContain("KineticAtlasOverview");
    expect(draft).toContain("LetterCodex");
    expect(draft).toContain("GlossaryTermDetail");
    expect(draft).toContain("<svelte:head>");
  });

  it("uses the official concept map instead of decorative region diagrams", () => {
    expect(overview).toContain("ConceptLevelMap");
    expect(overview).toContain("writeConceptPlaceId");
    expect(overview).not.toContain("AtlasRegionDiagram");
    expect(overview).not.toContain("Choose a region");
    expect(draft).not.toContain("regions={data.atlasRegions}");
    expect(draft).toContain("showMap={!filtering}");
  });

  it("keeps the gated Atlas out of the sitemap", () => {
    expect(sitemap).not.toMatch(/\{\s*url:\s*"atlas"\s*\}/);
  });
});
