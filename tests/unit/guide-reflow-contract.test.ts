import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  blockProseText,
  type GuideBlock,
} from "../../src/routes/(public)/guide/level-1/_data/guide-content-blocks";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

describe("blockProseText", () => {
  it("concatenates heading + prose text, stripping HTML", () => {
    const blocks: GuideBlock[] = [
      { kind: "heading", level: 2, text: "Alpha" },
      {
        kind: "prose",
        html: "In <strong>Alpha</strong>, the hands occupy the points across from each other.",
      },
      { kind: "rule", sheet: { x: 0, y: 0 } },
    ];
    expect(blockProseText(blocks)).toBe(
      "Alpha In Alpha, the hands occupy the points across from each other."
    );
  });
});

describe("SheetFrame", () => {
  const src = read(
    "src/routes/(public)/guide/level-1/_components/SheetFrame.svelte"
  );
  it("keeps the 816/612 pt→px scale and absolute positioning", () => {
    expect(src).toContain("816 / 612");
    expect(src).toContain("position: absolute");
  });
});

describe("FlowFrame", () => {
  const src = read(
    "src/routes/(public)/guide/level-1/_components/FlowFrame.svelte"
  );
  it("renders semantic headings + prose and uses GuidePictograph for figures", () => {
    expect(src).toContain("GuidePictograph");
    expect(src).toMatch(/<h2|<h3/);
    expect(src).not.toContain("position: absolute");
  });
});

describe("GUIDE_CONTENT registry", () => {
  it("registers hand-placements", async () => {
    const { GUIDE_CONTENT, hasReflowContent } =
      await import("../../src/routes/(public)/guide/level-1/_data/guide-content");
    expect(hasReflowContent("hand-placements")).toBe(true);
    expect(GUIDE_CONTENT["hand-placements"]!.length).toBeGreaterThan(0);
  }, 20_000);

  it("models The Grid as one reflow source with one canonical mode explorer", async () => {
    const { GUIDE_CONTENT, hasReflowContent } =
      await import("../../src/routes/(public)/guide/level-1/_data/guide-content");
    const content = GUIDE_CONTENT["the-grid"]!;

    expect(hasReflowContent("the-grid")).toBe(true);
    expect(
      content.filter((block) => block.kind === "gridExplorer")
    ).toHaveLength(1);
    expect(content.filter((block) => block.kind === "gridFigure")).toHaveLength(
      0
    );
    expect(blockProseText(content)).toContain(
      "Together, diamond and box form an 8-point grid:"
    );
  }, 20_000);
});

describe("frame toggle wiring", () => {
  it("GuideDocument routes the flow frame via GUIDE_CONTENT", () => {
    const src = read(
      "src/routes/(public)/guide/level-1/_components/GuideDocument.svelte"
    );
    expect(src).toContain("FlowFrame");
    expect(src).toContain('frame === "flow"');
  });
  it("GuideReader renders the sheet/flow SegmentedControl and a full-width flow page", () => {
    const src = read(
      "src/routes/(public)/guide/level-1/_components/GuideReader.svelte"
    );
    expect(src).toContain("SegmentedControl");
    expect(src).toContain("guideFramePrefs.frame");
    expect(src).toContain("reader-flow-page");
  });
});

describe("crawl route (paginated, one surface)", () => {
  // Each Level-1 topic is a single prerendered /guide/level-1/<slug> route that is
  // BOTH the crawlable page and the interactive reader (no doorway/funnel).
  // Spec: 2026-07-14-guide-crawlable-paginated-reader-design.md.
  const slugRoute = "src/routes/(public)/guide/level-1/[slug]/+page.svelte";
  const host =
    "src/routes/(public)/guide/level-1/_components/GuidePageHost.svelte";

  it("the [slug] route renders GuideSeo + GuidePageHost", () => {
    const src = read(slugRoute);
    expect(src).toContain("GuideSeo");
    expect(src).toContain("GuidePageHost");
  });
  it("prerenders every body page via entries()", () => {
    const ts = read("src/routes/(public)/guide/level-1/[slug]/+page.ts");
    expect(ts).toContain("prerender = true");
    expect(ts).toContain("entries");
    expect(ts).toContain("GUIDE_BODY_PAGES");
  });
  it("the host renders crawlable flow content with a sheet fallback but no topic mode switch", () => {
    const src = read(host);
    expect(src).toContain("FlowFrame"); // flow (mobile-first, crawlable) view
    expect(src).toContain("BUILT"); // fallback for topics not migrated to reflow
    expect(src).toContain("GUIDE_CONTENT"); // single-source content lookup
    expect(src).not.toContain("SegmentedControl");
    expect(src).not.toContain("guideFramePrefs");
    expect(src).toContain('slug === "the-grid" ? "grid-reference"');
  });
  it("does not fork The Grid into fixed-sheet and compact web DOMs", () => {
    const src = read(host);
    expect(src).toContain("const useFlow = $derived(canFlow)");
    expect(src).not.toContain("TheGridCompactPage");
    expect(src).not.toContain("isAuthoredGrid");
    expect(src).not.toContain("grid-sheet-view");
  });
  it("reuses the canonical grid renderer and shared interaction primitives", () => {
    const src = read(
      "src/routes/(public)/guide/level-1/_components/GuideGridExplorer.svelte"
    );
    expect(src).toContain("GridSvg");
    expect(src).toContain("SegmentedControl");
    expect(src).toContain("Crossfade");
    expect(src).not.toContain("<circle");
  });
  it("delegates companion wiring to the shared GuideCompanionHost (also used by level-2)", () => {
    const src = read(host);
    expect(src).toContain("GuideCompanionHost");
  });
  it("GuideCompanionHost keeps the companion off the prerender path (dynamic-imported, client-gated)", () => {
    const src = read(
      "src/routes/(public)/guide/_components/GuideCompanionHost.svelte"
    );
    expect(src).toContain("browser");
    expect(src).toMatch(/import\(["'][^"']*GuideCompanion/); // dynamic import
  });
  it("links to sibling topics + the guide hub (internal-link graph)", () => {
    const src = read(host);
    expect(src).toContain("/guide/level-1/"); // prev/next sibling routes
    expect(src).toContain('href="/guide"'); // hub
  });
});

describe("PDF indexing", () => {
  it("lists the downloadable guide PDFs in the sitemap", () => {
    const src = read("src/routes/sitemap.xml/+server.ts");
    expect(src).toContain("guides/level-1.pdf");
  });
});

describe("sitemap", () => {
  it("enumerates the Level-1 topic routes dynamically from the manifest", () => {
    const src = read("src/routes/sitemap.xml/+server.ts");
    expect(src).toContain("guide/level-1/${p.id}");
    expect(src).toContain("GUIDE_BODY_PAGES");
  });
});
