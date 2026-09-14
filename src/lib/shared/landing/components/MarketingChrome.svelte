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
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { fade } from "svelte/transition";
  import { isNamedRouteMorphActive } from "$lib/shared/transitions/named-route-morph-state.svelte";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { isConstrainedConnection } from "$lib/shared/platform/network-conditions";
  import { marketingBackground } from "../state/marketing-background-state.svelte";
  import { pageSurface } from "../domain/page-surface";
  import ToastContainer from "$lib/shared/toast/components/ToastContainer.svelte";
  import SiteHeader from "./SiteHeader.svelte";
  import SiteFooter from "./SiteFooter.svelte";

  type BackgroundHostComponent =
    (typeof import("$lib/shared/background/shared/components/BackgroundHost.svelte"))["default"];

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

  onMount(() => {
    if (isConstrainedConnection()) return;

    let mounted = true;
    let secondFrame = 0;

    // Let the browser present the complete CSS cosmos first. The animated
    // canvas is an enhancement, so its large renderer graph begins loading
    // after that first useful frame instead of blocking it.
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        void import("$lib/shared/background/shared/components/BackgroundHost.svelte").then(
          ({ default: BackgroundHost }) => {
            if (mounted) LiveBackground = BackgroundHost;
          }
        );

        void import("$lib/shared/settings/utils/background-theme-calculator").then(
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

  const path = $derived(page.url.pathname);
  const isTimingLesson = $derived(
    path === "/learn/concepts/timing-and-direction"
  );
  // The TnD explorer and articles share one live player through their layout.
  const contentKey = $derived(
    path === "/timing-and-direction" ||
      path.startsWith("/timing-and-direction/")
      ? "/timing-and-direction"
      : path
  );
  const footerVariant = $derived(
    path === "/" ||
      path === "/composer" ||
      path === "/history" ||
      path === "/timing-and-direction"
      ? "compact"
      : path === "/about"
        ? "sitemap"
        : "full"
  );

  // A page that paints its own opaque surface to the viewport edge hands it to
  // the footer, which continues that surface instead of settling onto the star
  // field. Without it the footer's standing 4.5rem margin shows a band of sky
  // between the two, and its scrim and hairline finish the job of making the
  // bottom of the page look like a different site.
  const footerSurface = $derived(pageSurface(path));

  // The archive is a single-room research surface on larger viewports. Its
  // header already carries every site destination, while a second navigation
  // slab below a viewport-sized room creates a fake extra page. Phones keep the
  // compact footer after their document-flow chronology; larger tiers omit it.
  const footerImmersive = $derived(path === "/history");

  // Named route morphs suppress the keyed content fade only while that exact
  // allowlisted navigation is active. Ordinary marketing navigation keeps the
  // 200ms fade.
  const suppressContentFade = $derived(isNamedRouteMorphActive());
</script>

<div class="mkt-shell">
  <div class="mkt-fallback" aria-hidden="true"></div>
  <div class="mkt-bg">
    {#if LiveBackground}
      <LiveBackground backgroundType={marketingBackground.type} />
    {/if}
  </div>

  <div class="mkt-layer">
    <SiteHeader />

    <div class="mkt-stage">
      {#key contentKey}
        <div
          class="mkt-content"
          in:fade|global={{
            duration: suppressContentFade ? 0 : motionDuration(200),
          }}
        >
          {@render children()}
        </div>
      {/key}
    </div>

    <!-- Persistent chrome like the header: outside the keyed crossfade, so it
         never re-fades between pages; below the growing stage, so it pins to
         the viewport bottom on short pages (sticky-footer flex column). -->
    <!-- The homepage and archive already carry complete navigation in their
         primary surfaces. The host owns the route decision so SiteFooter also
         remains safe for its independent GuideShell host. -->
    {#if !isTimingLesson}
      <SiteFooter
        variant={footerVariant}
        surface={footerSurface}
        immersive={footerImmersive}
      />
    {/if}
  </div>
  <ToastContainer />
</div>

<style>
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
    /* The fixed SiteHeader bar's height, published once so a page that wants
       to own the first viewport can subtract it instead of guessing. */
    --marketing-header-h: 64px;
  }

  .mkt-bg {
    position: fixed;
    inset: 0;
    z-index: 1;
  }

  .mkt-fallback {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    background:
      radial-gradient(
        ellipse at 72% 24%,
        rgba(92, 72, 170, 0.3),
        transparent 36%
      ),
      radial-gradient(
        ellipse at 20% 78%,
        rgba(32, 85, 144, 0.18),
        transparent 42%
      ),
      radial-gradient(
        130% 100% at 50% -10%,
        #181b3d 0%,
        #0c0e20 48%,
        #06070f 100%
      );
  }

  /* The first response already contains a real star field. Unequal tile sizes
     keep the repeated radial gradients from resolving into a visible grid,
     while remaining cheaper than an image request or a canvas startup. */
  .mkt-fallback::before,
  .mkt-fallback::after {
    content: "";
    position: absolute;
    inset: -15%;
    pointer-events: none;
  }

  .mkt-fallback::before {
    opacity: 0.72;
    background-image:
      radial-gradient(
        circle,
        rgba(255, 255, 255, 0.82) 0 0.7px,
        transparent 1px
      ),
      radial-gradient(
        circle,
        rgba(185, 205, 255, 0.7) 0 0.8px,
        transparent 1.15px
      ),
      radial-gradient(
        circle,
        rgba(255, 255, 255, 0.5) 0 0.55px,
        transparent 0.9px
      );
    background-position:
      7px 13px,
      43px 71px,
      103px 29px;
    background-size:
      83px 89px,
      137px 149px,
      211px 197px;
  }

  .mkt-fallback::after {
    opacity: 0.48;
    background-image:
      radial-gradient(
        circle,
        #ffffff 0 1px,
        rgba(180, 200, 255, 0.45) 1.4px,
        transparent 2px
      ),
      radial-gradient(
        circle,
        rgba(220, 210, 255, 0.9) 0 0.9px,
        transparent 1.5px
      );
    background-position:
      31px 47px,
      149px 91px;
    background-size:
      263px 241px,
      347px 311px;
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
</style>
