import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LAUNCHPAD_TILES,
  STRIP_LINKS,
  HERO_POINTER,
} from "../../src/lib/shared/landing/components/launchpad/launchpad-tiles";

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf-8");

const domains = readSource("src/config/domains.ts");
const rootLayout = readSource("src/routes/+layout.svelte");
const homePage = readSource("src/routes/+page.svelte");
const siteHeader = readSource(
  "src/lib/shared/landing/components/SiteHeader.svelte"
);
const siteFooter = readSource(
  "src/lib/shared/landing/components/SiteFooter.svelte"
);
const marketingChrome = readSource(
  "src/lib/shared/landing/components/MarketingChrome.svelte"
);
const pageSurface = readSource("src/lib/shared/landing/domain/page-surface.ts");
const historyPage = readSource("src/routes/(public)/history/+page.svelte");

interface HrefEntry {
  href: string;
  source: string;
}

function collectHrefs(): HrefEntry[] {
  const entries: HrefEntry[] = [];
  for (const tile of LAUNCHPAD_TILES) {
    entries.push({ href: tile.href, source: `tile:${tile.id}` });
    for (const chip of tile.chips ?? []) {
      entries.push({
        href: chip.href,
        source: `tile:${tile.id}>chip:${chip.label}`,
      });
    }
  }
  for (const link of STRIP_LINKS) {
    entries.push({ href: link.href, source: `strip:${link.label}` });
  }
  entries.push({ href: HERO_POINTER.href, source: "hero-pointer" });
  return entries;
}

const hrefEntries = collectHrefs();

// --- Extract the site-mode / chrome registries from raw source -------------

/**
 * Strip `//` line comments before regex-matching array literals below —
 * inline comments in domains.ts/+layout.svelte reference bracket syntax
 * (e.g. "the [...appPath] shell") that would otherwise close the outer
 * `[...]` match early via a naive non-greedy regex.
 */
function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      // Only strip `//` that isn't inside a string literal is overkill here —
      // none of the target arrays contain `//` inside their string values,
      // so a straightforward split on the first `//` per line is safe.
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

function extractArrayLiteral(source: string, arrayName: string): string[] {
  const cleaned = stripLineComments(source);
  // Matches: const NAME = [ ... ]  or  const NAME = new Set([ ... ])
  const re = new RegExp(
    `${arrayName}\\s*(?::[^=]+)?=\\s*(?:new Set\\()?\\[([\\s\\S]*?)\\]`
  );
  const match = cleaned.match(re);
  if (!match) {
    throw new Error(`Could not find array literal for ${arrayName} in source`);
  }
  const body = match[1];
  const strings: string[] = [];
  const strRe = /"([^"]*)"|'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = strRe.exec(body)) !== null) {
    strings.push(m[1] ?? m[2]);
  }
  return strings;
}

const publicPathPrefixes = extractArrayLiteral(domains, "PUBLIC_PATH_PREFIXES");
const landingPaths = extractArrayLiteral(domains, "LANDING_PATHS");
const marketingExact = extractArrayLiteral(rootLayout, "MARKETING_EXACT");
const marketingSubtrees = extractArrayLiteral(rootLayout, "MARKETING_SUBTREES");

function resolvesInLandingMode(href: string): boolean {
  if (landingPaths.includes(href)) return true;
  if (marketingExact.includes(href)) return true;
  if (
    marketingSubtrees.some(
      (root) => href === root || href.startsWith(root + "/")
    )
  ) {
    return true;
  }
  if (publicPathPrefixes.some((prefix) => href.startsWith(prefix))) return true;
  return false;
}

describe("homepage public-links contract", () => {
  it("extracted non-empty registries from domains.ts and +layout.svelte", () => {
    expect(publicPathPrefixes.length).toBeGreaterThan(0);
    expect(landingPaths.length).toBeGreaterThan(0);
    expect(marketingExact.length).toBeGreaterThan(0);
    expect(marketingSubtrees.length).toBeGreaterThan(0);
  });

  it("every launchpad href resolves in landing/public mode", () => {
    for (const entry of hrefEntries) {
      expect(
        resolvesInLandingMode(entry.href),
        `href "${entry.href}" (from ${entry.source}) does not resolve to landing mode via LANDING_PATHS, MARKETING_EXACT, MARKETING_SUBTREES, or PUBLIC_PATH_PREFIXES`
      ).toBe(true);
    }
  });

  it("every linked route is a real page, not a redirect stub", () => {
    for (const entry of hrefEntries) {
      const cleanPath = entry.href.replace(/^\//, "");
      const publicDir = resolve(
        process.cwd(),
        `src/routes/(public)/${cleanPath}`
      );
      const rootDir = resolve(process.cwd(), `src/routes/${cleanPath}`);

      const publicPageSvelte = resolve(publicDir, "+page.svelte");
      const rootPageSvelte = resolve(rootDir, "+page.svelte");
      const publicPageTs = resolve(publicDir, "+page.ts");
      const rootPageTs = resolve(rootDir, "+page.ts");

      if (existsSync(publicPageSvelte) || existsSync(rootPageSvelte)) {
        // Real page — passes.
        continue;
      }

      if (existsSync(publicPageTs)) {
        const text = readFileSync(publicPageTs, "utf-8");
        expect(
          text,
          `href "${entry.href}" (from ${entry.source}) resolves only to a +page.ts that redirects (3xx) — links a retired route`
        ).not.toContain("redirect(3");
        continue;
      }

      if (existsSync(rootPageTs)) {
        const text = readFileSync(rootPageTs, "utf-8");
        expect(
          text,
          `href "${entry.href}" (from ${entry.source}) resolves only to a +page.ts that redirects (3xx) — links a retired route`
        ).not.toContain("redirect(3");
        continue;
      }

      expect.fail(
        `href "${entry.href}" (from ${entry.source}) has no +page.svelte or +page.ts at src/routes/(public)/${cleanPath} or src/routes/${cleanPath}`
      );
    }
  });

  it("tile headings are unique and non-empty, descriptors are non-empty", () => {
    const headings = LAUNCHPAD_TILES.map((t) => t.heading);
    expect(new Set(headings).size).toBe(headings.length);
    for (const tile of LAUNCHPAD_TILES) {
      expect(tile.heading.trim().length).toBeGreaterThan(0);
      expect(tile.descriptor.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps front doors in the grid and withdrawn pages out of the Notation menu", () => {
    expect(LAUNCHPAD_TILES.map((tile) => tile.id)).toEqual([
      "composer",
      "choreo-cards",
      "guide",
      "notation",
      "faq",
      "glossary",
    ]);
    expect(LAUNCHPAD_TILES.find((tile) => tile.id === "guide")?.span).toBe(
      "2x1"
    );
    expect(LAUNCHPAD_TILES.find((tile) => tile.id === "faq")).toMatchObject({
      href: "/faq",
      span: "1x1",
    });

    const occupiedCells = LAUNCHPAD_TILES.reduce(
      (total, tile) =>
        total + ({ "2x2": 4, "2x1": 2, "1x1": 1 } as const)[tile.span],
      0
    );
    expect(occupiedCells).toBe(12);
    expect(STRIP_LINKS).toEqual([]);
    expect(hrefEntries.some(({ href }) => href === "/notation/letters")).toBe(
      false
    );
    // /notation/loops is withdrawn from production (its +page.server.ts
    // 404s outside dev), so the Notation menu must NOT link it. That href's
    // status is owned by withdrawn-public-pages-contract.test.ts.
    expect(siteHeader).not.toContain("/notation/loops");
  });

  it("keeps the homepage and Composer compact and hands About directly to the sitemap", () => {
    // The compact list is a multi-line `||` chain that Prettier reflows as
    // routes join it, so match the two anchors across whitespace.
    expect(marketingChrome).toMatch(
      /path === "\/" \|\|\s+path === "\/composer" \|\|/
    );
    expect(marketingChrome).toContain('path === "/about"');
    expect(marketingChrome).toContain('"sitemap"');
    expect(marketingChrome).toContain('"full"');
    expect(marketingChrome).toContain("<SiteFooter");
    expect(marketingChrome).toContain("variant={footerVariant}");
    expect(marketingChrome).toContain("surface={footerSurface}");
    expect(marketingChrome).toContain("immersive={footerImmersive}");
    // A page that paints its own opaque surface to the viewport edge hands it
    // to the footer, which continues it instead of settling onto the star
    // field. Without that the 4.5rem handoff gap shows a band of sky, and the
    // footer's scrim and hairline finish making the bottom of the page look
    // like a different site.
    expect(marketingChrome).toContain("pageSurface(path)");
    expect(pageSurface).toContain('path === "/history" ? ARCHIVE_INK');
    expect(siteFooter).toContain("surface?: string");
    expect(siteFooter).toContain("immersive?: boolean");
    expect(siteFooter).toContain("class:surfaced={Boolean(surface)}");
    expect(siteFooter).toContain("style:background={surface}");
    expect(siteFooter).toContain(".site-footer.surfaced");
    expect(siteFooter).toContain(".site-footer.immersive");
    // The surfaced footer drops all three: gap, scrim, hairline.
    expect(siteFooter).toMatch(
      /\.site-footer\.surfaced \{[^}]*margin-top: 0;[^}]*border-top: 0;/
    );
    // One definition of the archive ink, so the room and the footer beneath it
    // cannot drift apart.
    expect(historyPage).toContain("ARCHIVE_INK");
    expect(historyPage).not.toContain("background: oklch(0.115 0.008 270)");
    expect(siteFooter).toContain('variant?: "full" | "compact" | "sitemap"');
    expect(siteFooter).toContain('variant = "full"');
    expect(siteFooter).toContain('class:sitemap={variant === "sitemap"}');
    expect(siteFooter).toContain('{#if variant !== "sitemap"}');
    expect(siteFooter).toContain('{#if variant !== "compact"}');
    // Prettier puts the nav's attributes on their own lines once the
    // translated aria-label makes the tag too long, so match across whitespace.
    expect(siteFooter).toMatch(/<nav\s+class="col col-static"/);
    expect(siteFooter).toContain('<details class="col col-disclosure">');
    expect(siteFooter).toContain(".col-disclosure[open] .col-chevron");
    expect(siteFooter).not.toContain("MediaQuery");
    expect(siteFooter).not.toContain("disclosureMode");
  });

  it("no manifest string contains an em dash", () => {
    const strings: string[] = [];
    for (const tile of LAUNCHPAD_TILES) {
      strings.push(tile.heading, tile.descriptor);
      for (const chip of tile.chips ?? []) strings.push(chip.label);
    }
    for (const link of STRIP_LINKS) strings.push(link.label);
    strings.push(HERO_POINTER.prefix, HERO_POINTER.label);

    for (const s of strings) {
      expect(s, `string "${s}" contains an em dash (U+2014)`).not.toContain(
        "—"
      );
    }
  });

  it("+page.svelte wires HomeHero + LaunchpadGrid and drops the retired funnel sections", () => {
    expect(homePage).toContain("HomeHero");
    expect(homePage).toContain("LaunchpadGrid");
    for (const retired of [
      "HeroCarouselSection",
      "LazyHowTkaWorksSection",
      "PlayWithItSection",
      "GuidesSection",
      "ShopCtaSection",
    ]) {
      expect(
        homePage,
        `+page.svelte still references retired section "${retired}"`
      ).not.toContain(retired);
    }
  });
});
