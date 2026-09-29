<script lang="ts">
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
  /**
   * GuidePageHost - ONE guide topic rendered as its own page: the crawlable,
   * prerendered SEO surface AND the interactive reader for that topic, in one
   * component. Replaces the doorway/scroller split (spec:
   * 2026-07-14-guide-crawlable-paginated-reader-design.md).
   *
   * Reflowable topics render as crawlable, mobile-friendly editorial pages:
   * Austen's verbatim prose + every pictograph's synchronous describePictograph
   * aria-label. Topics that have not migrated to the shared content model fall
   * back to the SAME print-faithful built page used by /print and /book.
   *
   * The companion (tap-a-strip-to-animate) reuses GuideReader's exact context
   * wiring, dynamic-imported + client-gated so its canvas player never touches
   * the prerender path. Topic-to-topic movement is real <a href> client nav
   * between sibling prerendered routes.
   */
  import { onMount } from "svelte";
  import { GUIDE_BODY_PAGES } from "../_data/guide-manifest";
  import { BUILT } from "../_data/built-pages";
  import { GUIDE_CONTENT, hasReflowContent } from "../_data/guide-content";
  import { seoForSlug } from "../_data/guide-page-seo";
  import FlowFrame from "./FlowFrame.svelte";
  import GuidePage from "./GuidePage.svelte";
  import GuideCompanionHost from "../../_components/GuideCompanionHost.svelte";
  import { getConceptExperienceForGuideSlug } from "$lib/features/learn/domain/concept-experience-registry";
  import { buildConceptPath } from "$lib/features/learn/domain/concept-routes";
  import { setGuidePrintMode } from "../_data/guide-data-context";
  import { loadOverrides } from "../_data/guide-overrides.svelte";
  import "../_styles/guide.css";

  let { slug }: { slug: string } = $props();

  const meta = $derived(GUIDE_BODY_PAGES.find((p) => p.id === slug));
  const bodyIndex = $derived(GUIDE_BODY_PAGES.findIndex((p) => p.id === slug));
  const seo = $derived(seoForSlug(slug, meta?.title ?? slug));
  const content = $derived(GUIDE_CONTENT[slug] ?? null);
  const Sheet = $derived(BUILT[slug]);
  const canFlow = $derived(hasReflowContent(slug));
  const useFlow = $derived(canFlow);
  const interactiveLesson = $derived(getConceptExperienceForGuideSlug(slug));

  const prev = $derived(bodyIndex > 0 ? GUIDE_BODY_PAGES[bodyIndex - 1] : null);
  const next = $derived(
    bodyIndex >= 0 && bodyIndex < GUIDE_BODY_PAGES.length - 1
      ? GUIDE_BODY_PAGES[bodyIndex + 1]
      : null
  );

  // Pictographs render eagerly (no IntersectionObserver - matches /print, and a
  // scaled/off-screen sheet needs it). getGuidePrintMode() → light ink-on-white.
  setGuidePrintMode();

  // Sheet scale-to-fit for the few topics that do not have reflow content.
  let sheetWrap = $state<HTMLDivElement>();
  let scale = $state(1);
  // .sheet-scale sits centred in .sheet-wrap via `margin: 0 auto` at its OWN
  // unscaled 816px width. Below scale 1, .sheet-wrap is narrower than 816px so
  // the auto margins clamp to 0 (flush-left) and the scaled-down box exactly
  // fills the wrap - no shift needed there. At/above scale 1, .sheet-wrap is
  // wider than 816px so the margins DO centre the unscaled box - but
  // transform-origin: top left then grows it rightward from that already-
  // centred position as scale climbs, not from the wrap's centre. Shifting
  // left by half the EXTRA width the upscale adds (816 * (scale - 1) / 2)
  // re-centres it; max(0, ...) keeps the below-1 case untouched (already
  // correct, needs zero shift).
  const sheetShiftPx = $derived(408 * Math.max(0, scale - 1));

  // Effective page theme (drives dark-mode pictographs in the flow view). Mirrors
  // the CSS resolution: an explicit data-theme wins, else prefers-color-scheme.
  // Client-only - the prerendered HTML carries only pictograph aria-labels (the
  // SVG hydrates), so this never causes an SSR mismatch. Reactive to a theme toggle.
  let isDark = $state(false);

  // Fit lives in an $effect keyed on the bind so route changes between reflow
  // and sheet-only topics cannot leave the sheet stuck at scale 1.
  $effect(() => {
    const el = sheetWrap;
    if (!el) return;
    const fit = () => {
      // Content-box width, not clientWidth: clientWidth includes .sheet-wrap's
      // own inline padding, and a scale derived from it makes the scaled sheet
      // overflow that padding (phantom horizontal scrollbar) - and fires the
      // upscale shift while margin:auto is still clamped flush-left (clipped
      // left edge on ~850px viewports). Content width keeps scale>1 exactly in
      // sync with "margin:auto is actively centering".
      const cs = getComputedStyle(el);
      const inner =
        el.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      const widthScale = inner / 816;
      scale = Math.min(widthScale, 1.9);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  });

  // Per-topic scroll persistence. The topic pages scroll the WINDOW (the route
  // is normal document flow), and SvelteKit's own restore fires before the
  // async pictographs have grown the page, so a dev-server full reload (HMR)
  // used to clamp the position back to the top. Same recipe as GuideReader:
  // persist on scroll (rAF-throttled, guarded during restore), restore with a
  // retry loop that waits for the document to be tall enough to land there.
  const TOPIC_SCROLL_KEY = $derived(`guide-topic-scroll-${slug}`);
  let restoringScroll = false;
  function persistScroll() {
    if (restoringScroll) return;
    try {
      sessionStorage.setItem(TOPIC_SCROLL_KEY, String(window.scrollY));
    } catch {
      // sessionStorage unavailable - position just won't persist.
    }
  }
  onMount(() => {
    let scrollRaf = 0;
    const onWinScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        persistScroll();
      });
    };
    window.addEventListener("scroll", onWinScroll, { passive: true });

    let cancelled = false;
    const target = (() => {
      try {
        return Number(sessionStorage.getItem(TOPIC_SCROLL_KEY) ?? 0);
      } catch {
        return 0;
      }
    })();
    if (target > 0) {
      restoringScroll = true;
      let attempts = 0;
      const park = () => {
        if (cancelled) return;
        const maxScroll =
          document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll >= target || attempts >= 120) {
          window.scrollTo({
            top: Math.min(target, Math.max(0, maxScroll)),
            behavior: "instant",
          });
          restoringScroll = false;
          return;
        }
        attempts += 1;
        requestAnimationFrame(park);
      };
      requestAnimationFrame(park);
    }

    loadOverrides();
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const resolveTheme = () => {
      const attr = root.getAttribute("data-theme");
      isDark = attr ? attr === "dark" : mq.matches;
    };
    resolveTheme();
    mq.addEventListener("change", resolveTheme);
    const themeObs = new MutationObserver(resolveTheme);
    themeObs.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      cancelled = true;
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      window.removeEventListener("scroll", onWinScroll);
      mq.removeEventListener("change", resolveTheme);
      themeObs.disconnect();
    };
  });
</script>

<GuideCompanionHost pageTitle={meta?.title ?? ""} levelLabel="Level 1">
  <main class="guide-page-route">
    <header class="topic-hero" class:sheet-topic={!canFlow}>
      <!-- Built sheet fallbacks paint their own title. Reflow pages use this
           compact title band so the topic begins without a stack of controls. -->
      <div class="topic-title">
        <h1 class:visually-hidden={!canFlow}>{seo.h1}</h1>
        {#if seo.tagline && canFlow}<p class="hero-tagline">
            {seo.tagline}
          </p>{/if}
      </div>
      {#if interactiveLesson}
        <span class="interactive-lesson">
          <LinkChip href={buildConceptPath(interactiveLesson.conceptId)}
            ><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
            Learn this interactively</LinkChip
          >
        </span>
      {/if}
    </header>

    {#if useFlow && content}
      <FlowFrame
        {content}
        darkMode={isDark}
        tagline={seo.tagline ?? ""}
        layout={slug === "the-grid" ? "grid-reference" : "default"}
      />
    {:else if Sheet}
      <!-- Print-friendly fallback: the SAME built _pages sheet the book uses,
           scaled to fit its available screen footprint. -->
      <div
        class="sheet-wrap"
        bind:this={sheetWrap}
        style="height: {1056 * scale}px"
      >
        <div
          class="sheet-scale"
          style="transform: translateX(-{sheetShiftPx}px) scale({scale})"
        >
          <GuidePage
            title={meta?.title}
            pageNumber={bodyIndex >= 0 ? bodyIndex + 1 : undefined}
            fullBleed={true}
          >
            <Sheet />
          </GuidePage>
        </div>
      </div>
    {/if}

    <nav class="topic-nav" aria-label="Guide navigation">
      {#if prev}
        <a class="nav-link prev" href="/guide/level-1/{prev.id}">
          <span class="nav-dir">Previous</span><span class="nav-title"
            >{prev.title}</span
          >
        </a>
      {:else}
        <span class="nav-spacer"></span>
      {/if}
      <a class="nav-link hub" href="/guide">All guides</a>
      {#if next}
        <a class="nav-link next" href="/guide/level-1/{next.id}">
          <span class="nav-dir">Next</span><span class="nav-title"
            >{next.title}</span
          >
        </a>
      {:else}
        <span class="nav-spacer"></span>
      {/if}
    </nav>
  </main>
</GuideCompanionHost>

<style>
  /* Standalone editorial topic page - owns its light/dark palette (not the app's
     dark-canvas --theme-* vars) and hands FlowFrame the matching --ink. */
  .guide-page-route {
    min-height: 100vh;
    background: #fbfaf7;
    color: #1a1a1a;
    padding-block: 1.5rem 0;
    --ink: #1a1a1a;
    --ink-dim: #555;
    --glyph-invert: 0;
    /* Size container so FlowFrame's card rows can break out to a fraction of THIS
       route's width (cqw) - using wide/4K screens - while the reading column stays
       narrow. inline-size only: block-size (min-height: 100vh) is unaffected. */
    container-type: inline-size;
  }
  .topic-hero {
    max-width: 76rem;
    margin: 0 auto;
    padding: 1rem 1.5rem 0.75rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 1.5rem;
    text-align: left;
  }
  .topic-title {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 1.5rem;
  }
  /* The page title in the guide's signature calligraphic script (the same
     --guide-script the printed sheet uses for its title), so the crawl/flow
     surface opens with the book's identity rather than a plain serif. Sized up
     from the sheet's fixed 48pt to a fluid hero, coloured with the editorial ink
     so it reads on both the warm-white and dark columns. */
  .topic-hero h1 {
    margin: 0;
    padding: 0;
    font-family: var(--guide-script, "Cormorant Garamond", Georgia, serif);
    font-weight: var(--guide-script-weight, 700);
    font-size: clamp(3rem, 6cqw, 4.4rem);
    line-height: 0.95;
    letter-spacing: 0;
    color: var(--ink, #1a1a1a);
  }
  /* Sheet mode: keep the h1 in the a11y tree (page still has one heading) but
     take it out of the visual flow, since the sheet paints its own title. */
  .topic-hero h1.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .hero-tagline {
    margin: 0.2rem 0 0;
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: clamp(1.15rem, 2.6vw, 1.4rem);
    font-style: italic;
    line-height: 1.4;
    color: var(--ink-dim, #555);
  }
  /* This page owns a light and a dark palette, so the chip reads its colors
     from the page's ink rather than the app's dark-canvas theme. */
  .interactive-lesson {
    --theme-text: var(--ink, #1a1a1a);
    --theme-accent: #647ff1;
  }
  /* Print-friendly sheet: fit-to-width scale (up to 1.9x - see sheetShiftPx),
     its own footprint box so the scaled 816×1056 sheet doesn't leave a gap OR
     overlap the nav below (transform doesn't affect layout - .sheet-wrap's
     height is bound to the live scaled height via inline style). Centered,
     horizontal scroll on very narrow screens. max-width raised well past the
     816*1.9=1550px the sheet needs at its cap, so wide/4K viewports actually
     have room to reach it (816px's own max-width alone would cap fit-width
     scale at ~1.1x, never reaching 1.9). */
  .sheet-wrap {
    max-width: 112.5rem;
    margin: 1rem auto 0;
    padding: 0 1rem;
    overflow-x: auto;
  }
  .sheet-scale {
    width: 816px;
    height: 1056px;
    transform-origin: top left;
    /* Reserve the SCALED footprint on .sheet-wrap itself (bound in the markup to
       1056 * scale) - see sheetShiftPx above for why the transform also carries a
       translateX. */
    margin: 0 auto;
  }

  .topic-nav {
    max-width: 44rem;
    margin: 1rem auto 0;
    padding: 1rem 1.5rem 2rem;
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 0.75rem;
    border-top: 1px solid
      color-mix(in oklab, var(--ink, #1a1a1a) 15%, transparent);
  }
  .nav-link {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 44px;
    padding: 0.6rem 1.1rem;
    border-radius: 12px;
    border: 1px solid color-mix(in oklab, var(--ink, #1a1a1a) 25%, transparent);
    color: var(--ink, #1a1a1a);
    text-decoration: none;
    flex: 1 1 0;
    transition: background 120ms ease;
  }
  .nav-link:hover {
    background: color-mix(in oklab, var(--ink, #1a1a1a) 8%, transparent);
  }
  .nav-link.next {
    text-align: right;
  }
  .nav-link.hub {
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    font-weight: 650;
    background: #e8590c;
    color: #fff;
    border-color: transparent;
  }
  .nav-link.hub:hover {
    background: #d24e08;
  }
  .nav-dir {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-dim, #555);
  }
  .nav-title {
    font-size: 0.98rem;
    font-weight: 600;
  }
  .nav-spacer {
    flex: 1 1 0;
  }

  @container (max-width: 44rem) {
    .topic-hero {
      grid-template-columns: 1fr;
      gap: 0.65rem;
      padding: 1rem 1rem 0.5rem;
      position: relative;
      text-align: center;
    }
    .topic-hero h1 {
      font-size: clamp(2.8rem, 15cqw, 3.6rem);
    }
    .topic-title {
      display: block;
    }
    .interactive-lesson {
      justify-self: center;
    }
  }

  @media (prefers-color-scheme: dark) {
    .guide-page-route {
      background: #14141b;
      color: #ececf2;
      --ink: #ececf2;
      --ink-dim: #a8a8b4;
      --glyph-invert: 1;
    }
  }
  :global(:root[data-theme="light"]) .guide-page-route {
    background: #fbfaf7;
    color: #1a1a1a;
    --ink: #1a1a1a;
    --ink-dim: #555;
    --glyph-invert: 0;
  }
  :global(:root[data-theme="dark"]) .guide-page-route {
    background: #14141b;
    color: #ececf2;
    --ink: #ececf2;
    --ink-dim: #a8a8b4;
    --glyph-invert: 1;
  }
</style>
