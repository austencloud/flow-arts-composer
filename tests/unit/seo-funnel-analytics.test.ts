import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf-8");

describe("SEO acquisition funnel analytics", () => {
  it("captures SvelteKit history navigation after analytics initialization", () => {
    const posthog = read("src/lib/shared/analytics/services/posthog.ts");
    const layout = read("src/routes/+layout.svelte");

    expect(posthog).toContain(
      'capture_pageview: captureEnabled ? "history_change" : false'
    );
    expect(layout).toMatch(
      /const \{ initPostHog \} =\s*await import\("\$lib\/shared\/analytics\/services\/posthog"\)/
    );
    expect(layout).toContain("await initPostHog();");
  });

  it("tracks the Composer launch CTA and the shared footer conversion", () => {
    const composer = read("src/routes/(public)/composer/+page.svelte");
    const footer = read("src/lib/shared/landing/components/SiteFooter.svelte");

    expect(composer).toContain('trackCtaClick("hero"');
    expect(composer).toContain('destination: "/create"');
    expect(composer).toContain("onclick={() => trackOpenComposer()}");
    expect(footer).toContain('trackCtaClick("footer"');
    expect(footer).toContain('destination: "/create"');
  });

  it("counts completed exports and shares without counting canceled share sheets", () => {
    const imageExporter = read(
      "src/lib/shared/sequence-viewer/services/sequence-modal-exporter.svelte.ts"
    );
    const videoExporter = read(
      "src/lib/shared/sequence-viewer/components/export-coordinator.svelte.ts"
    );
    const viewerShareActions = read(
      "src/lib/shared/sequence-viewer/services/viewer-share-actions.ts"
    );

    expect(imageExporter).toContain("if (!shareCanceled)");
    expect(imageExporter).toContain('exportFormat: "png"');
    expect(videoExporter).toContain(
      "result.success && !result.canceled && !measuredVideoUrls.has(url)"
    );
    expect(videoExporter).toContain('exportFormat: "mp4"');
    expect(viewerShareActions).toContain('logShareAction("sequence_share"');
    expect(viewerShareActions).toContain('logShareAction("link_copy"');
  });
});
