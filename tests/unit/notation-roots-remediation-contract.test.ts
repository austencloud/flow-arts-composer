import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTATION_CATALOG } from "$lib/shared/notation/notation-catalog";

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf-8");

const notationRoute = readSource("src/routes/(public)/history/+page.svelte");
// The hub was gated on 2026-07-26 and rebuilt as a chronological catalog on
// 2026-07-27 (2026-07-26-notation-catalog-design.md). NotationHubDraft.svelte
// is deleted; the copy contracts that guarded it are replaced by contracts on
// the catalog data, which is where the page's factual claims now live.
const notationCatalogData = readSource(
  "src/lib/shared/notation/notation-catalog.ts"
);
const notationCatalogView = readSource(
  "src/routes/(public)/history/_components/archive/PlayableArchive.svelte"
);
const vtgChronicleData = readSource(
  "src/routes/(public)/history/_components/archive/_lib/vtg-chronicle.svelte.ts"
);
const rootRedirect = readSource("src/routes/(public)/roots/+page.ts");
const softwarePage = readSource(
  "src/routes/(public)/roots/software/+page.svelte"
);
const softwareCopy = softwarePage.replace(/\s+/g, " ");
const domains = readSource("src/config/domains.ts");
const rootLayout = readSource("src/routes/+layout.svelte");
const screenshotOrchestrator = readSource(
  "src/lib/features/lab/services/screenshot-orchestrator.ts"
);
const screenshotDevices = readSource("tests/screenshots/devices.ts");
const shapeMatrixDestination = readSource(
  "src/routes/(public)/shape-engine/+page.svelte"
);
const shapeMatrixApp = readSource(
  "src/lib/shared/shape-matrix/app/ShapeMatrixApp.svelte"
);
const shapeMatrixMatrixPane = readSource(
  "src/lib/shared/shape-matrix/app/components/ShapeMatrixMatrixPane.svelte"
);
const sitemap = readSource("src/routes/sitemap.xml/+server.ts");
const componentManifest = readSource("scripts/component-manifest.json");

describe("notation catalog", () => {
  it("is un-gated: no dev branch, no noindex, and back in the sitemap", () => {
    expect(notationRoute).not.toContain('from "$app/environment"');
    expect(notationRoute).not.toContain("UnderConstruction");
    expect(notationRoute).not.toContain('content="noindex');
    expect(sitemap).toMatch(/\{ url: "history" \}/);
  });

  it("gives every entry at least one source", () => {
    expect(NOTATION_CATALOG.length).toBeGreaterThan(0);
    for (const entry of NOTATION_CATALOG) {
      expect(entry.sources.length, `${entry.id} has no source`).toBeGreaterThan(
        0
      );
      for (const source of entry.sources) {
        if (entry.id === "lorq" && source.href === entry.explore?.href)
          continue;
        expect(source.href, `${entry.id} source href`).toMatch(
          /^(https:\/\/|\/)/
        );
        expect(source.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("never ships an unsourced or invented date", () => {
    // A year is either a real one, an explicit approximation, or open-ended.
    // "?" and empty strings are the shapes a guess hides in.
    for (const entry of NOTATION_CATALOG) {
      expect(entry.year, `${entry.id} year`).toMatch(
        /^(c\. )?(19|20)\d{2}(–)?$/
      );
      expect(Number.isFinite(entry.sortYear)).toBe(true);
    }
  });

  it("stays a catalog: no embeds, and video strips are the creator's own", () => {
    // The site CSP blocks frame-src for YouTube, and an inline player would make
    // the page a viewer rather than a record.
    expect(notationCatalogView).not.toMatch(
      /<iframe|frame-src|youtube\.com\/embed/
    );
    for (const entry of NOTATION_CATALOG) {
      for (const video of entry.videos ?? []) {
        expect(video.id, `${entry.id} video id`).toMatch(/^[A-Za-z0-9_-]{11}$/);
        expect(video.creator.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("does not expand an acronym the sources do not expand", () => {
    // QFT's expansion IS in the archived 2011 primer, so it may be used in the
    // source comment; what the page must not do is invent one for anything else.
    expect(notationCatalogData).not.toMatch(/Continuous Assembly Patterns \(/);
  });

  it("carries no em dashes in anything the reader sees", () => {
    // CLAUDE.md bans them in shipped copy and the ai-bust skill rates them a
    // dead giveaway. The en dash in an open-ended year ("2012–") is a date
    // range and stays.
    const rendered = NOTATION_CATALOG.flatMap((entry) => [
      entry.system,
      entry.people,
      entry.records,
      ...entry.sources.map((source) => source.label),
      ...(entry.subWorks ?? []).flatMap((work) => [work.name, work.note]),
      ...(entry.videos ?? []).flatMap((video) => [video.title, video.note]),
    ]);
    for (const line of rendered) {
      expect(line, `em dash in: ${line}`).not.toContain("—");
    }
    // The view's own copy and separators, minus its comments and CSS.
    const markup = notationCatalogView
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<style[\s\S]*$/, "");
    expect(markup).not.toContain("—");
  });

  it("keeps the interactive Shape Engine at the /shape-engine destination", () => {
    expect(shapeMatrixDestination).toContain(
      "$lib/shared/shape-matrix/app/ShapeMatrixApp.svelte"
    );
    expect(shapeMatrixDestination).toContain(
      "<ShapeMatrixApp {persistence} />"
    );
    expect(shapeMatrixApp).toContain("loadShapeMatrix");
    expect(shapeMatrixMatrixPane).toContain(
      "$lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte"
    );
  });

  it("explains nothing and claims no relationship between systems", () => {
    // The two failures that took the old hub down: teaching someone else's
    // system in our own words, and inventing a lineage between systems. The
    // catalog states what each one records and stops.
    const prose = [
      notationCatalogView,
      ...NOTATION_CATALOG.map((entry) => entry.records),
    ].join(" ");
    expect(prose).not.toMatch(
      /successor to|built on|evolved (from|into)|inspired by|precursor to|replaced by|improves on/i
    );
    // No how-to register. A catalog says what a system records, never how to
    // use it.
    expect(prose).not.toMatch(/here's how|step 1|to do this|try it yourself/i);
  });

  it("names another system only where the connection is documented", () => {
    // The catalog has exactly one cross-entry mention: the printed title of the
    // volume that contains Lorq Nichols' Shape Matrix. This is a publication
    // fact, not an influence or lineage claim.
    //
    // This pins the exception at one. A second entry naming another system is
    // the drift this whole contract exists to catch, and it should fail here
    // until someone brings sources and updates this test deliberately.
    const otherSystems = NOTATION_CATALOG.map((entry) => entry.system);
    const crossReferencing = NOTATION_CATALOG.filter((entry) =>
      otherSystems.some(
        (system) => system !== entry.system && entry.records.includes(system)
      )
    ).map((entry) => entry.id);

    expect(crossReferencing).toEqual(["lorq"]);

    const lorq = NOTATION_CATALOG.find((entry) => entry.id === "lorq");
    expect(lorq?.records).toContain("Vulcan Tech Gospel");
    expect(lorq?.sources.length).toBeGreaterThan(0);
  });

  it("credits the people who developed the notation, not its logo artwork", () => {
    // Jordan Campbell was previously removed because his name is absent from
    // the V.1 contents page. Noel Yee's own retrospective explicitly credits
    // Campbell with developing Transition Theory, so the archive must preserve
    // the distinction between a printed chapter byline and theory authorship.
    const vtg = NOTATION_CATALOG.find((entry) => entry.id === "vtg");
    expect(vtg?.people).toContain("Jordan Campbell");
    expect(vtgChronicleData).toContain("Jordan Campbell");

    // The visual artist's logo credit belongs to the publication colophon, not
    // the archive's list of people who developed movement theory.
    expect(vtg?.people).not.toMatch(/Forest (?:Sterns|Stearns)/);
    expect(vtgChronicleData).not.toMatch(/Forest (?:Sterns|Stearns)/);
  });

  it("links each entry out to its creator's own material", () => {
    // DrexFactor appears once for Drexler's own QFT primer and once as the
    // surviving host of Zaltymbunk's model. The latter must name Zaltymbunk so
    // hosting can never silently turn into authorship.
    const drexCitations = NOTATION_CATALOG.filter((entry) =>
      entry.sources.some((source) => /drexfactor/i.test(source.href))
    );
    expect(drexCitations.map((entry) => entry.id)).toEqual(["trochoid", "qft"]);
    const trochoid = NOTATION_CATALOG.find((entry) => entry.id === "trochoid");
    expect(trochoid?.sources[0]?.label).toContain("Zaltymbunk");
    // /notation/caps is gated in production, so the row links out only.
    expect(trochoid?.explore).toBeUndefined();
    // The TKA row points at this site because that is its creator's own
    // material — the same rule as every other row, not a funnel.
    const tka = NOTATION_CATALOG.find((entry) => entry.id === "tka");
    expect(tka?.sources[0]?.href).toBe("/guide");
    expect(notationCatalogView).not.toContain("cta-button");
  });

  it("keeps Lorq’s source distinct from Austen’s extension", () => {
    const lorq = NOTATION_CATALOG.find((entry) => entry.id === "lorq");
    const tka = NOTATION_CATALOG.find((entry) => entry.id === "tka");
    expect(lorq?.explore?.href).toBe(
      "http://spinscience.xyz/2014/07/10/144-shape-matrix-even-petaled-flowers-rework/"
    );
    expect(
      NOTATION_CATALOG.filter((entry) =>
        entry.applications?.some((app) => app.href === "/shape-engine")
      ).map((entry) => entry.id)
    ).toEqual(["tka"]);
    expect(
      tka?.applications?.find((app) => app.role === "tool")?.description
    ).toContain("Lorq Nichols");
  });

  it("keeps only substantiated systems and exposes every built destination", () => {
    expect(NOTATION_CATALOG.map((entry) => entry.id)).not.toContain(
      "unit-circle"
    );
    for (const entry of NOTATION_CATALOG.filter((item) => item.explore)) {
      expect(["original", "explanation", "tool"]).toContain(
        entry.explore?.kind
      );
      if (entry.explore?.kind !== "original")
        expect(entry.explore?.href).toMatch(/^\/(notation\/|guide)/);
    }
  });

  it("avoids universal and conqueror framing on the retained software page", () => {
    expect(softwareCopy).toMatch(
      /<strong>Flow Arts Composer<\/strong> is Austen Cloud's browser-based workspace/
    );
    expect(softwareCopy).toContain("TKA takes a different route");
    expect(softwarePage).not.toMatch(
      /No software company was ever going to|The one thing missing|never shipped as a tool|stayed an open problem|problem The Kinetic Alphabet solves/i
    );
    expect(softwarePage).not.toContain(
      '<section class="editorial-section panel"'
    );
  });
});

describe("roots-to-archive route migration", () => {
  it("keeps a permanent root redirect and public chrome for software history", () => {
    expect(rootRedirect).toContain('redirect(301, "/history")');
    expect(rootRedirect).toContain("export const prerender = false");
    expect(domains).toMatch(/PUBLIC_PATH_PREFIXES[\s\S]*?"\/roots"/);
    expect(rootLayout).toMatch(/MARKETING_EXACT[\s\S]*?"\/roots\/software"/);
  });

  it("keeps the history archive in capture registries", () => {
    expect(screenshotOrchestrator).toContain(
      '{ label: "history", moduleId: "public", requiresAuth: false }'
    );
    expect(screenshotDevices).toMatch(
      /path: "\/history",\s*label: "history",[\s\S]*?waitSelector: "\.playable-viewport \.room-title"/
    );
  });

  it("keeps canonical sitemap and breadcrumb labels without a stale Roots page", () => {
    // The hub is back in the sitemap now that the catalog has shipped
    // (asserted in the catalog block above); its sub-pages stay listed.
    expect(sitemap).not.toContain('{ url: "notation/letters" }');
    expect(sitemap).toContain('{ url: "roots/software" }');
    expect(sitemap).not.toMatch(/\{ url: "roots",/);
    expect(softwarePage).toMatch(
      /name:\s*"Flow Arts History",\s*item:\s*"https:\/\/tkaflowarts\.com\/history"/
    );
    // The source wraps this LinkChip across lines (f13606f440 reformatted it as
    // an incidental side effect of an unrelated edit further down the file),
    // which leaves whitespace between the closing quote and `>` once this
    // raw-source check collapses runs of whitespace to one space.
    expect(softwareCopy).toMatch(
      /href="\/history#archive-record-vtg"\s*>VTG record in the history archive<\/LinkChip\s*>/
    );
    expect(componentManifest).not.toContain(
      '"file": "routes/(public)/roots/+page.svelte"'
    );
    expect(componentManifest).toContain(
      '"file": "routes/(public)/history/+page.svelte"'
    );
  });
});
