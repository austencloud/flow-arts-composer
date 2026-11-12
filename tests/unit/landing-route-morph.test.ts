// @vitest-environment jsdom
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  navigationMorphs,
  RESIDENT_HOST_PATHS,
} from "../../src/lib/shared/transitions/navigation-morphs";
import { TILE_FLIGHT_PATHS } from "../../src/lib/shared/landing/components/launchpad/launchpad-tiles";
import { tileFlight } from "../../src/lib/shared/transitions/tile-flight.svelte";
import {
  isNamedRouteMorphActive,
  NAMED_ROUTE_MORPH_CLASS,
  runAfterNamedRouteMorph,
  runAfterNamedRouteMorphIdle,
  runNamedRouteMorph,
} from "../../src/lib/shared/transitions/named-route-morph-state.svelte";

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf-8");

// 453be00df6 and b11df1a24d moved Guide and Composer copy into the message
// catalog. The English there is still the wording these contracts guard.
const readEnglishMessages = (): Record<string, string> =>
  JSON.parse(readSource("messages/en.json")) as Record<string, string>;

const location = (pathname: string, routeId = pathname) => ({
  url: { pathname },
  route: { id: routeId },
});

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: () => void;
} {
  let resolvePromise!: () => void;
  let rejectPromise!: () => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = () => reject(new Error("transition failed"));
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

afterEach(() => {
  document.documentElement.classList.remove(NAMED_ROUTE_MORPH_CLASS);
  vi.unstubAllGlobals();
});

describe("landing route morph allowlist", () => {
  it("lets the resident player glide between every pair of its hosts", () => {
    for (const a of RESIDENT_HOST_PATHS) {
      for (const b of RESIDENT_HOST_PATHS) {
        if (a === b) continue;
        expect(navigationMorphs(location(a), location(b))).toBe(true);
      }
    }
  });

  // tile-flight.test.ts holds the arm and disarm rules. This is the wiring: a
  // tile destination morphs only because the flight owner says so.
  it("morphs a tile destination only while the flight owner allows it", () => {
    expect(TILE_FLIGHT_PATHS.length).toBeGreaterThan(0);

    for (const pathname of TILE_FLIGHT_PATHS) {
      if (RESIDENT_HOST_PATHS.includes(pathname)) continue;
      expect(navigationMorphs(location("/"), location(pathname))).toBe(false);
      expect(navigationMorphs(location(pathname), location("/"))).toBe(false);

      tileFlight.arm(pathname);
      expect(navigationMorphs(location("/"), location(pathname))).toBe(true);
      tileFlight.navigationSettled("/", pathname);
      expect(navigationMorphs(location(pathname), location("/"))).toBe(true);
      tileFlight.navigationSettled(pathname, "/");
    }
  });

  it("preserves the browse and sequence shared-thumbnail pair", () => {
    expect(
      navigationMorphs(location("/browse/community"), location("/sequence/abc"))
    ).toBe(true);
    expect(
      navigationMorphs(location("/sequence/abc"), location("/browse"))
    ).toBe(true);
  });

  // Bespoke product routes joined the pair in 21d0bcba85: every shipped
  // product has its own route rather than going through /shop/[productId], so
  // a route-id test matched nothing real and no shop transition ever started.
  // The assertion below still guarded the old, narrower rule and had been red
  // since that commit.
  it("pairs the shop index with every product route, bespoke or generic", () => {
    const shop = location("/shop", "/(public)/shop");
    const product = location(
      "/shop/level-1-guide",
      "/(public)/shop/[productId]"
    );

    expect(navigationMorphs(shop, product)).toBe(true);
    expect(navigationMorphs(product, shop)).toBe(true);
    expect(
      navigationMorphs(
        shop,
        location("/shop/loop-deck", "/(public)/shop/loop-deck")
      )
    ).toBe(true);
    // /shop/success carries no product art, so it stays out of the pair.
    expect(
      navigationMorphs(
        shop,
        location("/shop/success", "/(public)/shop/success")
      )
    ).toBe(false);
  });

  it("rejects same-page, unrelated, and destination-to-destination navigation", () => {
    expect(navigationMorphs(null, location("/composer"))).toBe(false);
    expect(navigationMorphs(location("/"), undefined)).toBe(false);
    expect(navigationMorphs(location("/"), location("/"))).toBe(false);
    expect(navigationMorphs(location("/atlas"), location("/composer"))).toBe(
      false
    );
    expect(navigationMorphs(location("/composer"), location("/faq"))).toBe(
      false
    );
    expect(navigationMorphs(location("/browse"), location("/history"))).toBe(
      false
    );
    expect(
      navigationMorphs(location("/browse-old"), location("/sequence/abc"))
    ).toBe(false);
  });
});

describe("landing shared-element contract", () => {
  // The shell's content region is the only thing a flight names, so no page has
  // to carry a name of its own and the tile stays out of it.
  it("pushes every tile's page through names on the shell's content region", () => {
    const tile = readSource(
      "src/lib/shared/landing/components/launchpad/LaunchpadTile.svelte"
    );
    const chrome = readSource(
      "src/lib/shared/landing/components/MarketingChrome.svelte"
    );
    const css = readSource("src/lib/shared/transitions/view-transitions.css");

    expect(tile).not.toContain("view-transition-name");
    expect(chrome).toContain(
      "style:view-transition-name={tileFlight.arrivingContentName(path)}"
    );
    expect(css).toContain("::view-transition-group(page-arriving)");
    expect(css).not.toContain("tile-window");
    expect(css).not.toMatch(/launchpad-/);

    for (const page of [
      "src/routes/(public)/composer/_components/ComposerExperience.svelte",
      "src/routes/(public)/faq/+page.svelte",
      "src/routes/(public)/atlas/+page.svelte",
      "src/routes/(public)/guide/+page.svelte",
      "src/lib/features/learn/components/ConceptPathView.svelte",
      "src/lib/features/store/components/front-door/ShopFrontDoorHero.svelte",
    ]) {
      expect(readSource(page), page).not.toContain("launchpad-");
    }
  });

  // The Composer morph participant, hero act, and demo load recovery checked
  // in this file all live in ComposerExperience. /about renders that component
  // too, so its source says nothing about /composer unless the route renders it.
  it("renders the shared Composer body on /composer", () => {
    const route = readSource("src/routes/(public)/composer/+page.svelte");

    expect(route).toContain(
      'import ComposerExperience from "./_components/ComposerExperience.svelte";'
    );
    expect(route).toMatch(/<ComposerExperience\b[^>]*\/>/);
  });

  it("suppresses only the scoped root capture", () => {
    const namedMorphCss = readSource(
      "node_modules/@austencloud/motion/css/named-route-morph.css"
    );
    expect(namedMorphCss).toMatch(
      /html\.named-route-morph\s*\{\s*view-transition-name:\s*none;/
    );
    expect(namedMorphCss).toMatch(
      /html\.named-route-morph::view-transition\s*\{\s*background:\s*transparent;/
    );
  });

  it("delegates route motion decisions to the shared package", () => {
    const layout = readSource("src/routes/+layout.svelte");

    expect(layout).toContain(
      'import { installRouteMotion } from "@austencloud/motion";'
    );
    expect(layout).toContain("installRouteMotion({");
    expect(layout).toContain("morphs: navigationMorphs,");
    expect(layout).toContain("isShallow: isShallowGoto,");
    expect(layout).not.toContain("runNamedRouteMorph(() =>");
  });

  it("links the shop book listing and detail cover with one named participant", () => {
    const listing = readSource("src/lib/features/store/StorePage.svelte");
    const detail = readSource(
      "src/lib/features/store/ProductDetailPage.svelte"
    );
    const cover = readSource(
      "src/lib/features/store/components/BookCoverArt.svelte"
    );
    const css = readSource("src/lib/shared/transitions/view-transitions.css");

    expect(listing).toContain(
      '<BookCoverArt viewTransitionName="shop-book-cover" />'
    );
    expect(detail).toContain('viewTransitionName="shop-book-cover"');
    expect(cover).toContain("style:view-transition-name={viewTransitionName}");
    expect(css).toContain("::view-transition-group(shop-book-cover)");
  });

  it("suppresses the marketing fade only during an active named morph", () => {
    const chrome = readSource(
      "src/lib/shared/landing/components/MarketingChrome.svelte"
    );
    expect(chrome).toContain("isNamedRouteMorphActive()");
    // The opening page, already drawn by the server, never fades in; every
    // navigation that changes the content key does.
    expect(chrome).toMatch(
      /duration:\s*suppressContentFade\s*\|\|\s*!navigated\s*\?\s*0\s*:\s*DURATION\.normal/
    );
    expect(chrome).toContain(
      "if (contentKey !== openingKey) navigated = true;"
    );
    expect(chrome).toContain(
      'import { DURATION } from "#lib/shared/transitions/transitions.js";'
    );
    expect(chrome).not.toContain("MORPH_PATHS.has(path)");
  });

  it("keeps every Guide reading page inside persistent root chrome", () => {
    const layout = readSource("src/routes/+layout.svelte");
    const guidePage = readSource("src/routes/(public)/guide/+page.svelte");
    const guideShell = readSource(
      "src/routes/(public)/guide/_components/GuideShell.svelte"
    );
    const guideCss = readSource(
      "src/routes/(public)/guide/level-1/_styles/guide.css"
    );

    expect(layout).toMatch(/MARKETING_SUBTREES[\s\S]*"\/guide"/);
    // Print, book, handbook and cover-lab sheets and the codex viewer keep
    // their own full-page layouts.
    expect(layout).toContain("MARKETING_EXCLUDE_PATTERN");
    // MarketingChrome owns header, footer and theme; the shell owns neither.
    expect(guideShell).not.toContain("<SiteHeader");
    expect(guideShell).not.toContain("<SiteFooter");
    expect(guideShell).not.toContain("applyThemeForBackground");
    expect(guideShell).toContain("<GuideRail");
    expect(guideShell).toContain("<GuideTocList");
    expect(guidePage).not.toContain("joinWaitlist");
    // Lesson first: the primary action opens the first lesson from step one.
    expect(guidePage).toContain("buildConceptStartPath(firstLessonId)");
    expect(guidePage).toContain("href={firstLessonHref}");
    expect(readEnglishMessages().guide_hub_start_lesson).toBeTruthy();
    expect(guideCss).not.toContain(".guide-sidebar");
    expect(guideCss).toContain("--page-rail-reserved");
  });

  it("keeps development morph probes out of the console POST bridge", () => {
    const layout = readSource("src/routes/+layout.svelte");
    const appShell = readSource("src/app.html");
    expect(layout).toContain("console.debug(`[morph]");
    expect(layout).not.toContain("console.log(`[morph]");
    expect(layout).toContain("po?.takeRecords()");
    expect(appShell).toContain("/^\\[morph\\]/");
    expect(appShell).toContain("/^\\[FrameStats\\]/");
  });

  it("keeps heavy landing and destination media out of the morph window", () => {
    const homeHero = readSource(
      "src/lib/shared/landing/components/HomeHero.svelte"
    );
    const sequenceHero = readSource(
      "src/lib/shared/landing/components/SequenceHeroDemo.svelte"
    );
    const launchpad = readSource(
      "src/lib/shared/landing/components/launchpad/LaunchpadGrid.svelte"
    );
    // The Composer page body lives in ComposerExperience since f64350ce63.
    const composer = readSource(
      "src/routes/(public)/composer/_components/ComposerExperience.svelte"
    );
    const archive = readSource("src/routes/(public)/history/+page.svelte");
    // The Choreo Cards tile lands on /shop now; the print pipeline behind the
    // front door's card art is the media that has to stay out of the morph.
    const choreoCards = readSource(
      "src/lib/features/store/components/ShopEntryArt.svelte"
    );
    const anatomyExplainer = readSource(
      "src/lib/features/store/components/CardAnatomyExplainer.svelte"
    );
    const anatomy = readSource(
      "src/lib/features/store/components/CardAnatomy.svelte"
    );

    expect(homeHero).toContain("runAfterNamedRouteMorphIdle(heroAct.start)");
    expect(sequenceHero).toContain("use:activatePlayerWhenNear");
    expect(sequenceHero).toContain("!isNamedRouteMorphActive()");
    expect(launchpad).toContain("runAfterNamedRouteMorph(() =>");
    expect(launchpad).toContain("new Set(tiles.map((tile) => tile.id))");
    expect(launchpad).toContain("runAfterNamedRouteMorphIdle(mountNext");
    expect(launchpad).toContain("mediaLoadingId");
    expect(launchpad).toContain('typeof IntersectionObserver === "undefined"');
    expect(launchpad).toContain("active={mediaActive.has(tile.id)}");
    expect(launchpad).toContain("visible={visible.has(tile.id)}");
    // /composer opens on the baked fixture exactly as the home hero does
    // (21c54ab457): only the live generation itself, not the synchronous
    // seed, has to stay behind the morph.
    expect(composer).toContain("const heroAct = getResidentHeroAct();");
    expect(composer).toContain("runAfterNamedRouteMorphIdle(heroAct.start)");
    // The tunnel and 3D bands open on the baked fixture; every live hero
    // draw becomes the page sequence, written untracked, and the hero is
    // held once the reader leaves it, so a Threlte scene is never torn down
    // under a reader.
    expect(composer).toContain("sequence={heroAct.sequence}");
    expect(composer).toContain("FALLBACK_DEMO");
    expect(composer).toContain(
      "let pageSequence = $state.raw(openingPageSequence(FALLBACK_DEMO));"
    );
    expect(composer).toContain(
      'pageSequence = carryPageSequence(pageSequence, "hero", drawn);'
    );
    expect(composer).toContain("use:holdWhenHeroLeaves");
    expect(composer).toContain("heroAct.hold();");
    expect(composer).not.toContain("{#key pageSequence");
    // Construct and Generate are separate stops; each demo still arrives
    // through its own lazy loader.
    expect(composer).toContain(
      'loader={() => import("../_sections/ConstructSection.svelte")}'
    );
    expect(composer).toContain(
      'loader={() => import("./ComposerGenerateDemo.svelte")}'
    );
    // The 3D portal shares its lazy import with hover warming, then mounts
    // the scene only after the opening morph has finished.
    expect(composer).toContain(
      'const loadViewer = () => import("./Composer3DViewerDemo.svelte");'
    );
    expect(composer).toContain("loader={loadViewer}");
    expect(composer).toContain("{#if sceneMounted}");
    expect(composer).toContain('if (next === "open") sceneMounted = true;');
    expect(composer).toContain("showNotationStrip={true}");
    expect(composer).toContain("showWordHeader={true}");
    expect(composer).toContain('loadPriority="immediate"');
    expect(sequenceHero).toContain(".with-notation-strip .demo-media");
    expect(choreoCards).toContain("runAfterNamedRouteMorphIdle(() =>");
    expect(anatomyExplainer).toContain("use:activateCardsWhenNear");
    expect(anatomyExplainer).toContain("deferUntilIdle: true");
    expect(anatomyExplainer).toContain(
      'loader={() => import("./CardAnatomy.svelte")}'
    );
    expect(anatomy).not.toContain(
      'import { loadActiveProducts } from "../services/product-loader"'
    );
    expect(anatomy).toContain('await import("../services/product-loader")');
    // The archive used to lazy-load a shape-matrix teaser to keep it out of
    // the morph window. The 2026-07-27 rebuild dropped that component
    // entirely, so there is no heavy media left on the page to defer.
    expect(archive).not.toContain("ShapeMatrixTeaser");
  });

  it("keeps the Choreo Card preview truthful through catalog loading and failure", () => {
    const anatomyExplainer = readSource(
      "src/lib/features/store/components/CardAnatomyExplainer.svelte"
    );
    const anatomy = readSource(
      "src/lib/features/store/components/CardAnatomy.svelte"
    );

    expect(anatomyExplainer).toContain(
      'import SkeletonLoader from "#lib/shared/foundation/ui/SkeletonLoader.svelte"'
    );
    expect(anatomyExplainer).toContain('role="alert"');
    expect(anatomyExplainer).toContain('disabled={cardStatus !== "ready"}');
    expect(anatomyExplainer).toContain('class="card-placeholder-stack"');
    // 09622f6cb2 moved the placeholder captions into the catalog. A missing
    // key renders as the raw key, so English still has to read Front and Back.
    expect(anatomyExplainer).toContain(
      '<figcaption>{tDynamic("learn_card_anatomy_front")}</figcaption>'
    );
    expect(anatomyExplainer).toContain(
      '<figcaption>{tDynamic("learn_card_anatomy_back")}</figcaption>'
    );
    const english = readEnglishMessages();
    expect(english.learn_card_anatomy_front).toBe("Front");
    expect(english.learn_card_anatomy_back).toBe("Back");
    expect(anatomyExplainer).toContain("card-placeholder-shuffle");
    expect(anatomyExplainer).toContain(".card-load-failure :global(.skeleton)");
    expect(anatomyExplainer).toContain(".legend-row:hover:not(:disabled)");
    expect(anatomy).toContain("previewState");
    expect(anatomy).toContain('setPreviewState("loading")');
    expect(anatomy).toContain('setPreviewState("ready")');
    expect(anatomy).toContain('setPreviewState("error")');
    expect(anatomy).toContain("No active product has a baked card preview");
    expect(anatomy).toContain("retryCatalogExample");
    expect(anatomy).toContain("previewFootprint(false)");
    expect(anatomy).toContain(".preview-load-failure :global(.skeleton)");
  });

  it("gives the promoted Composer demonstrations local loading recovery", () => {
    const composer = readSource(
      "src/routes/(public)/composer/_components/ComposerExperience.svelte"
    );
    const generate = readSource(
      "src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte"
    );
    const sequenceHero = readSource(
      "src/lib/shared/landing/components/SequenceHeroDemo.svelte"
    );

    expect(composer).toContain("error={constructLoadError}");
    expect(composer).toContain("error={tunnelLoadError}");
    expect(composer).toContain("error={viewerLoadError}");
    expect(composer).toContain("error={galleryLoadError}");
    expect(composer).toContain("The step-by-step demonstration did not load.");
    expect(composer).toContain("The tunnel demonstration did not load.");
    expect(composer).toContain("The 3D demonstration did not load.");
    expect(composer).toContain("The community gallery did not load.");
    expect(generate).toContain("classifyComposerGenerationFailure(error)");
    expect(generate).toContain('result === "no-result"');
    // b11df1a24d moved the failure line into the catalog; English keeps the
    // retry wording.
    expect(generate).toContain('t("composer_demo_generate_failed")');
    expect(readEnglishMessages().composer_demo_generate_failed).toBe(
      "The generator couldn't run. Try again."
    );
    expect(sequenceHero).toContain("placeholder={playerPlaceholder}");
    expect(sequenceHero).toContain("onStatusChange={(status) =>");
  });

  it("keeps public Composer turn examples within the 1.5-turn ceiling", () => {
    const generate = readSource(
      "src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte"
    );
    // The demo draws through the hero's shared roll, which owns the recipe.
    const demoGeneration = readSource(
      "src/routes/(public)/composer/_components/composer-demo-generation.ts"
    );
    const recipe = readSource(
      "src/lib/shared/landing/data/per-visit-demo-core.ts"
    );
    const construct = readSource(
      "src/routes/(public)/composer/_sections/ConstructSection.svelte"
    );

    expect(generate).toContain("generateComposerDemoSequence()");
    expect(demoGeneration).toContain("rollInWorker(");
    expect(demoGeneration).toContain("rollPerVisitDemo(");
    expect(recipe).toContain("turnIntensity: 1.5");
    expect(construct).toContain('{ value: "1.5", label: "1.5" }');
    expect(construct).not.toContain('{ value: "2", label: "2" }');
    expect(construct).not.toContain('{ value: "3", label: "3" }');
  });

  it("keeps compact Composer demos in state-sharing tab panels", () => {
    const construct = readSource(
      "src/routes/(public)/composer/_sections/ConstructSection.svelte"
    );
    const generate = readSource(
      "src/routes/(public)/composer/_sections/GenerateSection.svelte"
    );

    for (const source of [construct, generate]) {
      expect(source).toContain('new MediaQuery("(max-width: 74.99rem)")');
      expect(source).toContain('semantics="tabs"');
      expect(source).toMatch(/role=\{isCompactDemo[\s\S]*?"tabpanel"/);
    }

    expect(construct).toContain(
      "const usesFocusedLayout = $derived(isGuidedBuild || isContinuous)"
    );
    expect(construct).toMatch(
      /hidden=\{isCompactDemo\s*&&\s*!usesFocusedLayout\s*&&\s*compactPane !== "sequence"\}/
    );
    expect(construct).toMatch(
      /hidden=\{isCompactDemo\s*&&\s*!usesFocusedLayout\s*&&\s*compactPane !== "build"\}/
    );
    expect(generate).toContain(
      'hidden={isCompactDemo && compactView !== "result"}'
    );
    expect(generate).toContain(
      'hidden={isCompactDemo && compactView !== "recipe"}'
    );
    expect(generate).toContain("<summary>More settings</summary>");
    expect(generate).toContain("onclick={() => void generate(true)}");
  });

  it("keeps the verification corpus out of the archive and loops chunks", () => {
    const archive = readSource("src/routes/(public)/history/+page.svelte");
    const loops = readSource("src/routes/(public)/notation/loops/+page.svelte");

    // The catalog stopped rendering a loop teaser when the archive was
    // rebuilt as a text catalog on 2026-07-27. Only the loops page still
    // shows one — but the corpus must stay out of BOTH chunks, which is the
    // actual guard here.
    expect(loops).toContain("notation-loop-teaser");
    for (const source of [archive, loops]) {
      expect(source).not.toContain(
        'from "#lib/shared/loop-explorer/domain/curated-seeds.js"'
      );
    }
    expect(loops).toContain(
      'import("#lib/shared/loop-explorer/components/LoopExplorer.svelte")'
    );
    expect(loops).not.toContain(
      'import LoopExplorer from "#lib/shared/loop-explorer/components/LoopExplorer.svelte"'
    );

    // The corpus is served from `static/` rather than bundled — see
    // curated-seeds.ts. Its size is still the reason this guard exists.
    const corpusBytes = statSync(
      resolve(process.cwd(), "static/data/loop-explorer/curated-seeds.json")
    ).size;
    const teaserBytes = statSync(
      resolve(
        process.cwd(),
        "src/lib/shared/loop-explorer/domain/notation-loop-teaser-seed.json"
      )
    ).size;

    expect(corpusBytes).toBeGreaterThan(1_000_000);
    expect(teaserBytes).toBeLessThan(12_000);
  });
});

describe("named route morph lifecycle", () => {
  it("queues nonessential work until the final active morph finishes", async () => {
    const first = deferred();
    const second = deferred();
    const work = vi.fn();

    runNamedRouteMorph(() => ({ finished: first.promise }));
    runNamedRouteMorph(() => ({ finished: second.promise }));
    runAfterNamedRouteMorph(work);

    first.resolve();
    await first.promise;
    await Promise.resolve();
    expect(work).not.toHaveBeenCalled();

    second.resolve();
    await second.promise;
    await Promise.resolve();
    expect(work).toHaveBeenCalledOnce();
  });

  it("runs immediately without a morph and honors cancellation while queued", async () => {
    const immediate = vi.fn();
    runAfterNamedRouteMorph(immediate);
    expect(immediate).toHaveBeenCalledOnce();

    const finish = deferred();
    const cancelled = vi.fn();
    runNamedRouteMorph(() => ({ finished: finish.promise }));
    const cancel = runAfterNamedRouteMorph(cancelled);
    cancel();

    finish.resolve();
    await finish.promise;
    await Promise.resolve();
    expect(cancelled).not.toHaveBeenCalled();
  });

  it("keeps expensive work behind both the morph and an idle turn", async () => {
    const finish = deferred();
    const work = vi.fn();
    let idleCallback: (() => void) | undefined;
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((callback: () => void) => {
        idleCallback = callback;
        return 1;
      })
    );
    vi.stubGlobal("cancelIdleCallback", vi.fn());

    runNamedRouteMorph(() => ({ finished: finish.promise }));
    runAfterNamedRouteMorphIdle(work);
    expect(work).not.toHaveBeenCalled();

    finish.resolve();
    await finish.promise;
    await Promise.resolve();
    expect(work).not.toHaveBeenCalled();

    idleCallback?.();
    expect(work).toHaveBeenCalledOnce();
  });

  it("re-arms queued idle work behind a newer morph", async () => {
    const idleCallbacks: Array<() => void> = [];
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((callback: () => void) => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      })
    );
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    const work = vi.fn();

    runAfterNamedRouteMorphIdle(work);
    expect(idleCallbacks).toHaveLength(1);

    const newerMorph = deferred();
    runNamedRouteMorph(() => ({ finished: newerMorph.promise }));
    idleCallbacks.shift()?.();
    expect(work).not.toHaveBeenCalled();
    expect(idleCallbacks).toHaveLength(0);

    newerMorph.resolve();
    await newerMorph.promise;
    await Promise.resolve();
    expect(idleCallbacks).toHaveLength(1);
    expect(work).not.toHaveBeenCalled();

    idleCallbacks.shift()?.();
    expect(work).toHaveBeenCalledOnce();
  });

  it("isolates deferred subscribers so one failure does not block the rest", async () => {
    const finish = deferred();
    const first = vi.fn(() => {
      throw new Error("deferred enhancement failed");
    });
    const second = vi.fn();
    const queuedErrors: Array<() => void> = [];
    vi.stubGlobal(
      "queueMicrotask",
      vi.fn((callback: () => void) => queuedErrors.push(callback))
    );

    runNamedRouteMorph(() => ({ finished: finish.promise }));
    runAfterNamedRouteMorph(first);
    runAfterNamedRouteMorph(second);
    finish.resolve();
    await finish.promise;
    await Promise.resolve();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(queuedErrors.length).toBeGreaterThan(0);
  });

  it("holds the root guard and chrome ownership until the transition finishes", async () => {
    const finish = deferred();
    runNamedRouteMorph(() => ({ finished: finish.promise }));

    expect(isNamedRouteMorphActive()).toBe(true);
    expect(
      document.documentElement.classList.contains(NAMED_ROUTE_MORPH_CLASS)
    ).toBe(true);

    finish.resolve();
    await finish.promise;
    await Promise.resolve();

    expect(isNamedRouteMorphActive()).toBe(false);
    expect(
      document.documentElement.classList.contains(NAMED_ROUTE_MORPH_CLASS)
    ).toBe(false);
  });

  it("releases ownership after asynchronous rejection or synchronous startup failure", async () => {
    const finish = deferred();
    runNamedRouteMorph(() => ({ finished: finish.promise }));
    finish.reject();
    await finish.promise.catch(() => undefined);
    await Promise.resolve();
    expect(isNamedRouteMorphActive()).toBe(false);

    expect(() =>
      runNamedRouteMorph(() => {
        throw new Error("startViewTransition failed");
      })
    ).toThrow("startViewTransition failed");
    expect(isNamedRouteMorphActive()).toBe(false);
    expect(
      document.documentElement.classList.contains(NAMED_ROUTE_MORPH_CLASS)
    ).toBe(false);
  });

  it("does not let a superseded transition release a newer morph", async () => {
    const first = deferred();
    const second = deferred();
    runNamedRouteMorph(() => ({ finished: first.promise }));
    runNamedRouteMorph(() => ({ finished: second.promise }));

    first.resolve();
    await first.promise;
    await Promise.resolve();
    expect(isNamedRouteMorphActive()).toBe(true);
    expect(
      document.documentElement.classList.contains(NAMED_ROUTE_MORPH_CLASS)
    ).toBe(true);

    second.resolve();
    await second.promise;
    await Promise.resolve();
    expect(isNamedRouteMorphActive()).toBe(false);
  });

  it("keeps an older morph guarded when a newer start fails synchronously", async () => {
    const first = deferred();
    runNamedRouteMorph(() => ({ finished: first.promise }));

    expect(() =>
      runNamedRouteMorph(() => {
        throw new Error("second transition failed");
      })
    ).toThrow("second transition failed");
    expect(isNamedRouteMorphActive()).toBe(true);
    expect(
      document.documentElement.classList.contains(NAMED_ROUTE_MORPH_CLASS)
    ).toBe(true);

    first.resolve();
    await first.promise;
    await Promise.resolve();
    expect(isNamedRouteMorphActive()).toBe(false);
  });
});
