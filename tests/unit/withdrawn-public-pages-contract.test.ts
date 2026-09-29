import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf-8");

/** Every public href that is currently withdrawn from production. */
const withdrawnHrefs = {
  "staff choreography": "/learn/staff-spinning-choreography",
  "the LOOP algebra": "/notation/loops",
  "the CAPs page": "/notation/caps",
} as const;

const publicLinkSources = [
  "src/lib/shared/landing/components/launchpad/launchpad-tiles.ts",
  "src/lib/shared/landing/components/SiteHeader.svelte",
  "src/lib/shared/landing/components/SiteFooter.svelte",
  "src/routes/(public)/guide/+page.svelte",
  "src/routes/(public)/notation/staves/+page.svelte",
  "src/lib/shared/notation/notation-catalog.ts",
  "src/routes/(public)/about/+page.svelte",
  "src/routes/(public)/composer/+page.svelte",
];

const gatedRoutes = [
  "src/routes/(public)/learn/staff-spinning-choreography/+page.server.ts",
  "src/routes/(public)/notation/loops/+page.server.ts",
  "src/routes/(public)/notation/caps/+page.server.ts",
];

describe("withdrawn public pages", () => {
  it("removes every withdrawn page from public navigation", () => {
    for (const path of publicLinkSources) {
      const source = readSource(path);
      for (const [name, href] of Object.entries(withdrawnHrefs)) {
        expect(source, `${path} still links ${name}`).not.toContain(href);
      }
    }
  });

  it("keeps gated pages out of the sitemap", () => {
    const sitemap = readSource("src/routes/sitemap.xml/+server.ts");
    for (const name of Object.keys(withdrawnHrefs) as Array<
      keyof typeof withdrawnHrefs
    >) {
      const href = withdrawnHrefs[name];
      expect(sitemap, `sitemap still lists ${name}`).not.toContain(
        `{ url: "${href.replace(/^\//, "")}" }`
      );
    }
  });

  it("returns 404 in production while retaining development access", () => {
    for (const path of gatedRoutes) {
      const source = readSource(path);
      expect(source).toContain('import { dev } from "$app/environment"');
      expect(source).toContain("export const prerender = false");
      expect(source).toMatch(/if \(!dev\) error\(404, "Not found"\)/);
    }
  });

  it("preserves every withdrawn page in the repository", () => {
    expect(
      readSource(
        "src/routes/(public)/learn/staff-spinning-choreography/_components/StaffSpinningChoreographyDraft.svelte"
      )
    ).toContain("Learn Staff Choreography");
    expect(
      readSource("src/routes/(public)/notation/loops/+page.svelte")
    ).toContain("The LOOP Algebra");
    expect(
      readSource("src/routes/(public)/notation/caps/+page.svelte")
    ).toContain("Continuous Assembly Patterns");
  });
});
