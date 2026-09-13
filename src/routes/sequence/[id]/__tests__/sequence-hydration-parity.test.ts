import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync(
  resolve(process.cwd(), "src/routes/sequence/[id]/SequenceViewerPage.svelte"),
  "utf8"
);
const routeSource = readFileSync(
  resolve(process.cwd(), "src/routes/sequence/[id]/+page.svelte"),
  "utf8"
);

describe("sequence route hydration parity", () => {
  it("keeps SEO metadata in the document head without duplicating viewer chrome", () => {
    expect(routeSource).toContain("<Seo");
    expect(routeSource).toContain("title={seo.title}");
    expect(routeSource).toContain("description={seo.description}");
    expect(viewerSource).not.toContain("data-sequence-index-content");
    expect(viewerSource).not.toContain("contextContent={routeContext}");
  });

  /**
   * SvelteKit reuses a page component across same-route parameter changes and
   * the viewer resolves once, in `onMount`. Without a key, navigating between
   * two share links leaves the first sequence on screen under the second URL.
   */
  it("keys the viewer on the route id so a same-route navigation remounts it", () => {
    expect(routeSource).toContain("page.params.id");
    expect(routeSource).toMatch(
      /\{#key routeId\}[\s\S]*<SequenceViewerPage[\s\S]*\{\/key\}/
    );
  });

  it("keeps the viewer out of SSR, with the key inside the browser guard", () => {
    const browserGuard = routeSource.indexOf("{#if browser}");
    expect(browserGuard).toBeGreaterThan(-1);
    expect(routeSource.indexOf("{#key routeId}")).toBeGreaterThan(browserGuard);
    expect(routeSource.indexOf("<SequenceViewerPage")).toBeGreaterThan(
      browserGuard
    );
  });

  it("fences the viewer's async bootstrap against a superseded run", () => {
    expect(viewerSource).toContain("createRouteLoadFence");
    expect(viewerSource).toContain("routeLoad.begin()");
    expect(viewerSource).toContain("routeLoad.dispose()");
    // Every awaited leg of the bootstrap re-checks before it assigns.
    expect(
      viewerSource.match(/routeLoad\.isStale\(run\)/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(8);
  });
});
