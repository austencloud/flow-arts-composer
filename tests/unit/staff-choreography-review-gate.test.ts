import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf-8");

const route = readSource(
  "src/routes/(public)/learn/staff-spinning-choreography/+page.svelte"
);
const draft = readSource(
  "src/routes/(public)/learn/staff-spinning-choreography/_components/StaffSpinningChoreographyDraft.svelte"
);
const sitemap = readSource("src/routes/sitemap.xml/+server.ts");

describe("staff choreography human-review gate", () => {
  it("keeps the article reviewable in development and gated in production", () => {
    expect(route).toContain('import { dev } from "$app/env"');
    expect(route).toContain("StaffSpinningChoreographyDraft");
    expect(route).toMatch(/\{#if dev\}\s*<StaffSpinningChoreographyDraft \/>/);
    expect(route).toContain("UnderConstruction");
    expect(route).toContain('eyebrow="Awaiting human review"');
    expect(route).toContain('content="noindex, follow"');
  });

  it("preserves the complete draft at the canonical development URL", () => {
    expect(draft).toContain("<h1");
    expect(draft).toContain("Learn Staff Choreography");
    expect(draft).toContain("<svelte:head>");
  });

  it("keeps the gated route out of the sitemap", () => {
    expect(sitemap).not.toMatch(
      /\{\s*url:\s*"learn\/staff-spinning-choreography"\s*\}/
    );
  });
});
