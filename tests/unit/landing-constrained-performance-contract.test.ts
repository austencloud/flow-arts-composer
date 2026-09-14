/**
 * Landing constrained-network contract.
 *
 * These are silent regressions: eager imports and SSR preload changes still
 * compile and look correct on a development machine while quietly adding
 * seconds on a slow phone. Keep the routing policy and critical lazy boundaries
 * explicit here.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  createLandingPageTransformer,
  shouldPreloadRouteAsset,
  stripDeferredHomeStylesheets,
  stripRootAppOnlyBlocks,
} from "$lib/server/performance/landing-preload-policy";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const requireScript = createRequire(import.meta.url);
const { gateLandingModules, inlineLandingStyles } = requireScript(
  "../../scripts/inline-landing-critical-css.cjs"
) as {
  gateLandingModules: (html: string) => { html: string; count: number };
  inlineLandingStyles: (
    html: string,
    readCss: (href: string) => string
  ) => { html: string; count: number; deferredCount: number };
};

describe("homepage SSR preload policy", () => {
  it.each([
    "InlineAnimationPlayer.hash.css",
    "AnimatorCanvas.hash.css",
    "ChoreoCard.hash.css",
    "BackgroundHost.hash.css",
    "BrowseModule.hash.css",
    "founding-collections.hash.css",
    "vendor.hash.css",
  ])("defers lazy-only stylesheet %s", (path) => {
    expect(
      shouldPreloadRouteAsset("/", {
        type: "css",
        path: `_app/immutable/assets/${path}`,
      })
    ).toBe(false);
  });

  it.each([
    "app.hash.css",
    "SequenceHeroDemo.hash.css",
    "LaunchpadTile.hash.css",
    "23.hash.css",
  ])("keeps critical stylesheet %s", (path) => {
    expect(
      shouldPreloadRouteAsset("/", {
        type: "css",
        path: `_app/immutable/assets/${path}`,
      })
    ).toBe(true);
  });

  it("does not change JavaScript preloads or other routes", () => {
    const lazyStyle = "_app/immutable/assets/InlineAnimationPlayer.hash.css";
    expect(shouldPreloadRouteAsset("/", { type: "js", path: lazyStyle })).toBe(
      true
    );
    expect(
      shouldPreloadRouteAsset("/notation", {
        type: "css",
        path: lazyStyle,
      })
    ).toBe(true);
  });

  it("removes lazy-only stylesheet links from landing HTML", () => {
    const html = [
      '<link rel="stylesheet" href="/_app/immutable/assets/app.abc.css">',
      '<link rel="stylesheet" href="/_app/immutable/assets/BrowseModule.def.css">',
      '<link rel="modulepreload" href="/_app/immutable/chunks/BrowseModule.js">',
    ].join("");

    expect(stripDeferredHomeStylesheets(html)).toBe(
      '<link rel="stylesheet" href="/_app/immutable/assets/app.abc.css">' +
        '<link rel="modulepreload" href="/_app/immutable/chunks/BrowseModule.js">'
    );
  });

  it("buffers split landing HTML before filtering stylesheet links", () => {
    const transform = createLandingPageTransformer("/");

    expect(
      transform({
        html: '<head><link rel="stylesheet" href="/_app/immutable/assets/Browse',
        done: false,
      })
    ).toBe("");
    expect(
      transform({
        html: 'Module.def.css"></head><body>Ready</body>',
        done: true,
      })
    ).toBe("<head></head><body>Ready</body>");
  });

  it("removes application boot blocks from the root document", () => {
    const html = [
      '<head><meta charset="utf-8">',
      "<!-- tka-root-app-only:start -->",
      "<script>window.bootApplicationShell()</script>",
      "<!-- tka-root-app-only:end -->",
      "</head><body>Landing</body>",
    ].join("");

    expect(stripRootAppOnlyBlocks(html)).toBe(
      '<head><meta charset="utf-8"></head><body>Landing</body>'
    );
  });

  it("passes non-landing HTML through without buffering", () => {
    const transform = createLandingPageTransformer("/learn");
    expect(transform({ html: "<head>", done: false })).toBe("<head>");
  });

  it("inlines header CSS while deferring the footer half of its compiled chunk", () => {
    const sourceHtml = [
      '<link rel="stylesheet" href="/fonts/css/playfair.css">',
      '<link href="/_app/immutable/assets/SiteFooter.abc.css" rel="stylesheet">',
    ].join("");
    const result = inlineLandingStyles(
      sourceHtml,
      () =>
        ".site-header.svelte-head{display:block}.site-footer.svelte-foot{display:block}"
    );

    expect(result.count).toBe(1);
    expect(result.deferredCount).toBe(1);
    expect(result.html).toContain("/fonts/css/playfair.css");
    expect(result.html).toContain(
      '<style data-tka-critical="SiteFooter.abc.css">.site-header.svelte-head{display:block}</style>'
    );
    expect(result.html).not.toContain(".site-footer.svelte-foot");
    expect(result.html).toContain(
      '<link rel="stylesheet" href="/_app/immutable/assets/SiteFooter.abc.css" disabled data-tka-deferred-style>'
    );
    expect(result.html).toContain("<noscript>");
  });

  it("delays below-fold styles until after the constrained first paint", () => {
    const html =
      '<head><link rel="stylesheet" href="/_app/immutable/assets/LaunchpadTile.abc.css"></head>';
    const result = inlineLandingStyles(html, () => ".tile{display:block}");

    expect(result.count).toBe(0);
    expect(result.deferredCount).toBe(1);
    expect(result.html).toContain("data-tka-deferred-style");
    expect(result.html).toContain('window.addEventListener("load"');
    expect(result.html).toContain("requestAnimationFrame");
    expect(result.html).toContain("<noscript>");
    expect(result.html).not.toContain("data-tka-critical");
  });

  it("holds module preloads and hydration until the constrained document loads", () => {
    const html = [
      "<head>",
      '<link rel="modulepreload" href="/_app/immutable/entry/start.js">',
      '<link href="/_app/immutable/chunks/runtime.js" rel="modulepreload">',
      "</head><body><script>",
      'import("/_app/env.js").then(({ env }) => window.start(env));',
      "</script></body>",
    ].join("");
    const result = gateLandingModules(html);

    expect(result.count).toBe(2);
    expect(result.html).not.toContain('<link rel="modulepreload"');
    expect(result.html).toContain("data-tka-module-gate");
    expect(result.html).toContain("window.__tkaLandingConstrained");
    expect(result.html).toContain("window.__tkaPreloadLandingModules");
    expect(result.html).toContain('window.addEventListener("load",start');
    expect(result.html).toContain('return import("/_app/env.js")');
  });
});

describe("homepage constrained enhancement boundaries", () => {
  it("keeps heavy renderers off slow links", () => {
    const layout = source("src/routes/+layout.svelte");
    const landingEvents = source("src/lib/shared/analytics/landing-events.ts");
    const marketingChrome = source(
      "src/lib/shared/landing/components/MarketingChrome.svelte"
    );
    const homeHero = source(
      "src/lib/shared/landing/components/HomeHero.svelte"
    );
    const launchpad = source(
      "src/lib/shared/landing/components/launchpad/LaunchpadGrid.svelte"
    );
    const launchpadTile = source(
      "src/lib/shared/landing/components/launchpad/LaunchpadTile.svelte"
    );
    // Measurement starts after first paint on every connection. Heavy media
    // still respects the constrained-link boundary below, but silently
    // excluding those visitors made first-session funnels unknowable.
    expect(layout).toMatch(
      /const analyticsFrame = isDevelopmentHarness[\s\S]*?\? null[\s\S]*?: requestAnimationFrame/
    );
    expect(landingEvents).toContain("captureWhenReady(eventName, properties)");
    expect(landingEvents).not.toContain(
      "if (isConstrainedConnection()) return;"
    );
    expect(marketingChrome).toContain("if (isConstrainedConnection()) return;");
    expect(homeHero).toContain("if (isConstrainedConnection()) return;");
    expect(homeHero).toContain("connectionAware={true}");
    // The hero is the most above-the-fold element on the site. The default
    // loadPriority is "idle", which routes through requestIdleCallback with a
    // 2500ms timeout — and the landing main thread never idles (measured
    // 2026-08-09: 123 long tasks, ~50-120ms blocked every second from 690ms
    // onward), so the idle callback always waits its full timeout before the
    // player chunk is even requested. That timeout was the placeholder.
    expect(homeHero).toContain('loadPriority="immediate"');
    expect(launchpad).toContain("if (constrainedConnection) return;");
    expect(launchpadTile).toContain("data-tka-static-media");
    expect(launchpadTile).toContain('mediaLoaded = status === "loaded"');
  });

  it("offers live playback on request for data-saver visitors", () => {
    const sequenceHero = source(
      "src/lib/shared/landing/components/SequenceHeroDemo.svelte"
    );

    // Data-saver only, deliberately NOT isConstrainedConnection(): that
    // predicate's bandwidth estimate reports '3g' under 1 Mbps on gigabit
    // desktops, which stranded the hero behind "Play live preview" for
    // everyone instead of only genuine data-saver users.
    expect(sequenceHero).toMatch(
      /connectionAware\s*&&\s*prefersReducedData\(\)/
    );
    expect(sequenceHero).toContain("manualActivationAvailable = true;");
    // The seed is the SERVER's Save-Data reading, never `connectionAware`
    // alone. Seeding it from connectionAware shipped the degraded hero to
    // every visitor at SSR and relied on hydration to undo it, which put
    // "Play live preview" on screen for seconds on a healthy connection.
    expect(sequenceHero).toContain(
      "manualActivationAvailable = $state(connectionAware && serverReducedData);"
    );
    expect(source("src/routes/+layout.server.ts")).toContain(
      'request.headers.get("save-data") === "on"'
    );
    expect(sequenceHero).toContain("manualActivationRequested = true;");
    expect(sequenceHero).toContain("Play live preview");
  });

  it("keeps Firebase behind the incomplete-sequence branch", () => {
    const player = source(
      "src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte"
    );

    expect(player).not.toContain(
      'import { getSequenceRepository } from "$lib/shared/create/get-sequence-repository"'
    );
    expect(player).toMatch(
      /const \{ getSequenceRepository \}\s*=\s*await import\(/
    );
    expect(player.indexOf("if (hasMotionData(seq))")).toBeLessThan(
      player.search(
        /await import\(\s*"\$lib\/shared\/create\/get-sequence-repository"/
      )
    );
  });

  it("uses local/system fonts on the critical landing path", () => {
    const page = source("src/routes/+page.svelte");
    const marketingChrome = source(
      "src/lib/shared/landing/components/MarketingChrome.svelte"
    );
    const appTemplate = source("src/app.html");

    expect(page).not.toContain("fonts.googleapis.com");
    expect(marketingChrome).not.toContain("fonts.googleapis.com");
    expect(appTemplate).toContain("if (constrained) return;");
    expect(appTemplate).toContain("window.__tkaLandingConstrained");
    expect(appTemplate).toContain("window.__tkaLandingConstrained === true");
    expect(appTemplate).not.toMatch(
      /<link\s+rel="preload"\s+href="\/fonts\/webfonts\/fa-solid-900\.woff2"/
    );
  });

  it("runs the critical CSS inliner in both production build commands", () => {
    const packageJson = JSON.parse(source("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.build).toContain(
      "node scripts/inline-landing-critical-css.cjs"
    );
    expect(packageJson.scripts["build:fast"]).toContain(
      "node scripts/inline-landing-critical-css.cjs"
    );
  });
});
