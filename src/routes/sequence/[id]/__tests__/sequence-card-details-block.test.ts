import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  resolve(process.cwd(), "src/routes/sequence/[id]/+page.svelte"),
  "utf8"
);

describe("curated sequence card SSR details block", () => {
  it("renders only for an indexable (curated) card, outside the client-only viewer guard", () => {
    const browserGuard = routeSource.indexOf("{#if browser}");
    const detailsBlock = routeSource.indexOf('{#if seo.indexable}');
    expect(browserGuard).toBeGreaterThan(-1);
    expect(detailsBlock).toBeGreaterThan(browserGuard);
    // Not nested inside the browser-only await block, so it is present in the
    // server-rendered HTML response for a curated card, unlike the viewer.
    expect(routeSource.indexOf("{/if}", browserGuard)).toBeLessThan(
      detailsBlock
    );
  });

  it("surfaces word, deck, creator, step count, letters, and a thumbnail from real Firestore data only", () => {
    expect(routeSource).toContain("<h1>{seo.heading}</h1>");
    expect(routeSource).toContain("data.meta.word");
    expect(routeSource).toContain("data.meta.deckName");
    expect(routeSource).toContain("data.meta.creator");
    expect(routeSource).toContain("data.meta.stepCount");
    expect(routeSource).toContain("data.meta.letters");
    expect(routeSource).toContain("data.meta.thumbnailUrl");
    expect(routeSource).toContain("alt={seo.ogImageAlt}");
  });
});
