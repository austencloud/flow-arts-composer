/**
 * Static contract test for the Level-2 per-topic crawlable routes
 * (`/guide/level-2/<slug>`, added so each Level-2 topic can rank on its own
 * instead of only existing as one section inside the long `/guide/level-2/turns`
 * / `/guide/level-2/double-turns` pages — see level2-topic-manifest.ts for the
 * section → route mapping and level-1's `guide-manifest.ts` / `[slug]` route
 * for the pattern this mirrors).
 *
 * Vitest here doesn't mount full SvelteKit routes for the guide (see
 * guide-reflow-contract.test.ts for the same source-text-contract style), so
 * this locks the pieces that make each topic crawlable at the source level:
 * every manifest entry is well-formed and unique, the [slug] route prerenders
 * every entry and renders a real <h1> + canonical (via GuideSeo), and every
 * entry is listed in the sitemap.
 *
 * If this test fails, fix the route/manifest — do not loosen the assertions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { LEVEL2_TOPIC_PAGES } from "../../src/routes/(public)/guide/level-2/_data/level2-topic-manifest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

const SLUG_ROUTE_TS =
  "src/routes/(public)/guide/level-2/[slug]/+page.ts";
const SLUG_ROUTE_SVELTE =
  "src/routes/(public)/guide/level-2/[slug]/+page.svelte";
const TOPIC_BODY =
  "src/routes/(public)/guide/level-2/_components/Level2TopicBody.svelte";
const SITEMAP = "src/routes/sitemap.xml/+server.ts";

describe("LEVEL2_TOPIC_PAGES manifest", () => {
  it("has a reasonable number of substantive topics (fewer than the raw section/print-page count, more than the 3 old concatenated routes)", () => {
    expect(LEVEL2_TOPIC_PAGES.length).toBeGreaterThanOrEqual(8);
    expect(LEVEL2_TOPIC_PAGES.length).toBeLessThan(20);
  });

  it("every entry has a non-empty h1, title, description, and at least one section", () => {
    for (const p of LEVEL2_TOPIC_PAGES) {
      expect(p.h1.length, `${p.slug}: h1`).toBeGreaterThan(0);
      expect(p.title.length, `${p.slug}: title`).toBeGreaterThan(0);
      expect(p.description.length, `${p.slug}: description`).toBeGreaterThan(0);
      expect(p.sections.length, `${p.slug}: sections`).toBeGreaterThanOrEqual(1);
      expect(p.anchorIds.length, `${p.slug}: anchorIds`).toBeGreaterThanOrEqual(1);
      expect(p.chapter === "turns" || p.chapter === "double-turns", p.slug).toBe(
        true
      );
    }
  });

  it("has unique slugs", () => {
    const slugs = LEVEL2_TOPIC_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique anchor ids across every page (no section rendered on two routes)", () => {
    const anchors = LEVEL2_TOPIC_PAGES.flatMap((p) => p.anchorIds);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it("every one of the 17 live GuideSection ids from LEVEL2_SECTION_ANCHORS is covered by exactly one topic page", async () => {
    const { LEVEL2_SECTION_ANCHORS } = await import(
      "../../src/routes/(public)/guide/level-2/_data/guide-manifest"
    );
    const covered = new Set(LEVEL2_TOPIC_PAGES.flatMap((p) => p.anchorIds));
    const original = LEVEL2_SECTION_ANCHORS.flatMap(
      (r: { sections: { id: string }[] }) => r.sections.map((s) => s.id)
    );
    for (const id of original) {
      expect(covered.has(id), `original anchor "${id}" is covered`).toBe(true);
    }
  });

  it("both chapters (turns, double-turns) have at least one topic page", () => {
    expect(LEVEL2_TOPIC_PAGES.some((p) => p.chapter === "turns")).toBe(true);
    expect(
      LEVEL2_TOPIC_PAGES.some((p) => p.chapter === "double-turns")
    ).toBe(true);
  });
});

describe("/guide/level-2/[slug] route", () => {
  const routeTs = read(SLUG_ROUTE_TS);
  const routeSvelte = read(SLUG_ROUTE_SVELTE);
  const body = read(TOPIC_BODY);

  it("prerenders", () => {
    expect(routeTs).toMatch(/export const prerender = true/);
  });

  it("generates one prerendered entry per manifest slug", () => {
    expect(routeTs).toContain("LEVEL2_TOPIC_PAGES");
    expect(routeTs).toMatch(/entries.*LEVEL2_TOPIC_PAGES\.map/s);
  });

  it("renders GuideSeo with a canonical path derived from the slug", () => {
    expect(routeSvelte).toContain("<GuideSeo");
    expect(routeSvelte).toMatch(/path=\{`\/guide\/level-2\/\$\{slug\}`\}/);
  });

  it("renders a real <h1> (via Level2TopicBody)", () => {
    expect(body).toMatch(/<h1>\{meta\.h1\}<\/h1>/);
  });

  it("renders every manifest page's sections and prev/next nav", () => {
    expect(body).toMatch(/meta\.sections as Section/);
    expect(body).toContain("topic-nav");
  });
});

describe("chapter hubs (/guide/level-2/turns, /guide/level-2/double-turns)", () => {
  it("both hubs link out to their topic pages instead of concatenating sections", () => {
    for (const [chapterDir, chapter] of [
      ["turns", "turns"],
      ["double-turns", "double-turns"],
    ] as const) {
      const src = read(
        `src/routes/(public)/guide/level-2/${chapterDir}/+page.svelte`
      );
      expect(src, chapterDir).toContain("level2TopicPagesForChapter");
      expect(src, chapterDir).toContain(`"${chapter}"`);
      expect(src, chapterDir).toMatch(/href="\/guide\/level-2\/\{topic\.slug\}"/);
      // The old concatenation imported every ch20/ch21 section component
      // directly; the hub must not still do that.
      expect(src, chapterDir).not.toMatch(/_sections\/ch2[01]\//);
    }
  });
});

describe("sitemap", () => {
  const sitemapSrc = read(SITEMAP);

  it("imports LEVEL2_TOPIC_PAGES and lists a guide/level-2/<slug> entry per topic", () => {
    expect(sitemapSrc).toContain(
      'import { LEVEL2_TOPIC_PAGES } from "../(public)/guide/level-2/_data/level2-topic-manifest";'
    );
    expect(sitemapSrc).toMatch(/guide\/level-2\/\$\{p\.slug\}/);
    expect(sitemapSrc).toMatch(/\.\.\.guideLevel2TopicEntries/);
  });

  it("still lists the two chapter hubs (unchanged existing entries)", () => {
    expect(sitemapSrc).toContain('{ url: "guide/level-2/turns" }');
    expect(sitemapSrc).toContain('{ url: "guide/level-2/double-turns" }');
  });
});
