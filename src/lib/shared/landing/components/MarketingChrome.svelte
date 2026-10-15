<script lang="ts">
  /**
   * MarketingChrome — persistent cosmic chrome for the marketing pages
   * (landing, /about, /roots, /support). Mounted ONCE by the root layout for
   * marketing routes, it survives client-side navigation among them, so the
   * COSMIC BackgroundHost and SiteHeader never unmount — no flash of the body's
   * saved-theme gradient between pages. Only the page content (the children
   * slot) transitions, keyed on pathname.
   *
   * Replaces the per-page CosmicPageShell / inline background each marketing
   * page used to mount for itself.
   */
  import type { Snippet } from "svelte";
  import type { BackgroundType } from "@austencloud/backgrounds";
  import { onDestroy, onMount } from "svelte";
  import { page } from "$app/state";
  import { isNamedRouteMorphActive } from "#lib/shared/transitions/named-route-morph-state.svelte.js";
  import { opaqueFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { prefersReducedData } from "#lib/shared/platform/network-conditions.js";
  import { marketingBackground } from "../state/marketing-background-state.svelte";
  import { pageSurface } from "../domain/page-surface";
  import ToastContainer from "#lib/shared/toast/components/ToastContainer.svelte";
  import SiteHeader from "./SiteHeader.svelte";
  import SiteFooter from "./SiteFooter.svelte";

  type BackgroundHostComponent =
    (typeof import("#lib/shared/background/shared/components/BackgroundHost.svelte"))["default"];

  let { children }: { children: Snippet } = $props();

  // A type-only import keeps the backgrounds package out of the first-paint
  // module graph. Its public index re-exports every renderer, even though this
  // shell only needs the string value until the live host is loaded.
  let LiveBackground = $state<BackgroundHostComponent | null>(null);
  let applyTheme = $state<((type: BackgroundType) => void) | null>(null);

  // Re-tune the interface colors whenever the chosen background changes, and
  // once when the calculator module finishes loading. A page that drives
  // marketingBackground (the composer showcase) gets the matching theme
  // without knowing when the lazy import resolved.
  $effect(() => {
    const type = marketingBackground.type;
    applyTheme?.(type);
  });

  // Set once the first useful frame has been presented; the live canvas may
  // load from then on, whenever the current page actually shows the sky.
  let firstFramesPresented = $state(false);
  let liveBackgroundRequested = false;
  // True once the live canvas has mounted. It fades in over the placeholder
  // instead of replacing it in one frame.
  let liveBackgroundShown = $state(false);

  onMount(() => {
    let mounted = true;
    let secondFrame = 0;

    // Let the browser present the complete CSS cosmos first. The animated
    // canvas is an enhancement, so its large renderer graph begins loading
    // after that first useful frame instead of blocking it.
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        // A bandwidth estimate cannot tell us whether the GPU can draw stars.
        // Only an explicit data-saver preference keeps the static background.
        if (mounted) firstFramesPresented = !prefersReducedData();

        // Surface colors must match the sky even when data-saver is enabled.
        void import("#lib/shared/settings/utils/background-theme-calculator.js").then(
          ({ applyThemeForBackground }) => {
            if (mounted) applyTheme = applyThemeForBackground;
          }
        );
      });
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  });

  // The animated canvas only loads for a page that floats on the sky. Under a
  // page that paints its own opaque surface (the guide book, the archive) it
  // would be invisible and still burn the GPU for the whole read; it loads the
  // first time the reader reaches a star-field page instead.
  //
  // The chunk is large and fetched on demand, so one failed fetch (a dev server
  // re-bundling its dependencies, a flaky link, a stale chunk name after a
  // deploy) used to leave the placeholder up for the rest of the visit: the
  // request was marked done before it resolved and nothing ever asked again.
  // A failure now backs off and retries, then reopens the request so the next
  // star-field page visit tries once more.
  const RETRY_DELAYS_MS = [800, 2500, 7000];
  let retryTimer = 0;

  function loadLiveBackground(attempt = 0) {
    import("#lib/shared/background/shared/components/BackgroundHost.svelte")
      .then(({ default: BackgroundHost }) => {
        LiveBackground = BackgroundHost;
      })
      .catch((error: unknown) => {
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
          console.warn("[MarketingChrome] Live background failed to load:", error);
          liveBackgroundRequested = false;
          return;
        }
        retryTimer = window.setTimeout(
          () => loadLiveBackground(attempt + 1),
          delay
        );
      });
  }

  $effect(() => {
    if (!firstFramesPresented || pageOwnsSurface || liveBackgroundRequested)
      return;
    liveBackgroundRequested = true;
    loadLiveBackground();
  });

  onDestroy(() => clearTimeout(retryTimer));

  const path = $derived(page.url.pathname);
  const isTimingLesson = $derived(
    path === "/learn/concepts/timing-and-direction"
  );
  // The TnD explorer and articles share one live player through their layout.
  // Guide topics share one shell: a crossfade per topic would remount it and
  // reset the contents rail on every click.
  const contentKey = $derived(
    path === "/timing-and-direction" ||
      path.startsWith("/timing-and-direction/")
      ? "/timing-and-direction"
      : path === "/guide" || path.startsWith("/guide/")
        ? "/guide"
        : path
  );

  // A page that paints its own opaque surface to the viewport edge hands it to
  // the footer, which paints the same surface so the page simply continues.
  // Every other page floats on the star field and the footer stays
  // transparent over it.
  const footerSurface = $derived(pageSurface(path));
  const pageOwnsSurface = $derived(footerSurface !== undefined);

  // Named route morphs suppress the keyed content fade only while that exact
  // allowlisted navigation is active. Ordinary marketing navigation keeps the
  // 200ms fade.
  const suppressContentFade = $derived(isNamedRouteMorphActive());
</script>

<div class="mkt-shell">
  <div class="mkt-fallback" aria-hidden="true"></div>
  <div class="mkt-bg" class:mkt-bg-shown={liveBackgroundShown}>
    {#if LiveBackground && !pageOwnsSurface}
      <LiveBackground
        backgroundType={marketingBackground.type}
        onReady={() => (liveBackgroundShown = true)}
      />
    {/if}
  </div>

  <div class="mkt-layer">
    <SiteHeader />

    <div class="mkt-stage">
      {#key contentKey}
        <div
          class="mkt-content"
          in:opaqueFade|global={{
            duration: suppressContentFade ? 0 : DURATION.normal,
          }}
        >
          {@render children()}
        </div>
      {/key}
    </div>

    <!-- Persistent chrome like the header: outside the keyed crossfade, so it
         never re-fades between pages; below the growing stage, so it pins to
         the viewport bottom on short pages (sticky-footer flex column). -->
    <!-- One footer on every page inside this chrome. The timing lesson is a
         full-viewport instrument and keeps none. -->
    {#if !isTimingLesson}
      <SiteFooter surface={footerSurface} />
    {/if}
  </div>
  <ToastContainer />
</div>

<style>
  /* The fixed SiteHeader bar's height, published once so a page that wants
     to own the first viewport can subtract it instead of guessing. It lives
     on the root, and only while this chrome is mounted, so the root scroller
     can read it too: hash targets, scrollIntoView and focus then stop a small
     gap below the header on every marketing page, including a deep link the
     browser scrolls to before hydration. App routes never match. */
  :global(html):has(.mkt-shell) {
    --marketing-header-h: 64px;
    scroll-padding-top: calc(var(--marketing-header-h) + 1rem);
  }

  .mkt-shell {
    position: relative;
    min-height: 100vh;
    /* clip, not hidden: `overflow-x: hidden` computes overflow-y to `auto`,
       which makes this shell a (never-scrolling) scroll container and silently
       disables position:sticky for every descendant on every marketing page.
       `clip` clips decorative horizontal overflow identically without creating
       a scroll container, so sticky elements track the real window scroll. */
    overflow-x: clip;
    color: var(--theme-text, #ffffff);
    /* Two-tier display type, both self-hosted app-wide (app.html):
       --page-title-font  → the brand's Fraunces wonky italic, for each page's
         top-level h1/title (matches the landing hero wordmark). Set italic +
         the wonk variation-settings at the title site (see .page-title).
       --landing-heading-font → Playfair Display 500, for section-level headings
         (h2s) under a page title. Keeps a clear h1 vs h2 hierarchy.
       One token each, so neither face can drift per-page. */
    --page-title-font: "Fraunces", Georgia, serif;
    --landing-heading-font: "Playfair Display", Georgia, serif;
  }

  .mkt-bg {
    position: fixed;
    inset: 0;
    z-index: 1;
    opacity: 0;
    transition: opacity 600ms ease-out;
  }

  .mkt-bg-shown {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .mkt-bg {
      transition: none;
    }
  }

  /* The placeholder under the live sky, shown from the first byte until the
     animated canvas has loaded. It is a plain gradient in the live sky's own
     base colors (sampled from the rendered canvas: near-black violet at the
     top, deep blue at the foot) and carries no stars, so the canvas fading in
     adds the aurora and the stars instead of replacing a different picture.
     It used to carry a CSS dot grid, which read as a fake star field next to
     the real one. */
  .mkt-fallback {
    position: fixed;
    inset: 0;
    z-index: 0;
    background: linear-gradient(
      180deg,
      #0a0a1a 0%,
      #0d0d1f 10%,
      #16142c 25%,
      #1c2538 40%,
      #1b293f 55%,
      #163253 70%,
      #103259 85%,
      #0a2142 100%
    );
  }

  .mkt-layer {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
  }

  /* Both the outgoing and incoming keyed content share a single grid cell so
     they crossfade in place instead of stacking and shoving page height.
     flex: 1 makes the stage absorb spare height so the footer sits at the
     viewport bottom even on short pages (e.g. /shop/success). */
  .mkt-stage {
    display: grid;
    grid-template-columns: 1fr;
    flex: 1;
  }
  .mkt-content {
    grid-area: 1 / 1;
    min-width: 0;
  }

  /* A page that fixes a rail to the left edge (the guide's contents rail)
     publishes the width it reserves as --page-rail-reserved on the root, and
     the footer clears it the same way the page's own content does. */
  .mkt-layer > :global(.site-footer) {
    margin-inline-start: var(--page-rail-reserved, 0px);
    transition: margin-inline-start var(--transition-emphasis);
  }

  @media (prefers-reduced-motion: reduce) {
    .mkt-layer > :global(.site-footer) {
      transition: none;
    }
  }
</style>
