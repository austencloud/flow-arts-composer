<script lang="ts">
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { activateWhenNear } from "$lib/actions/activate-when-near";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import Seo from "$lib/shared/components/Seo.svelte";
  import {
    trackCtaClick,
    trackDemoInteraction,
    trackSectionView,
  } from "$lib/shared/analytics/landing-events";
  import { analyticsRoute } from "$lib/shared/analytics/analytics-context";
  import { isWebGL2Available } from "$lib/shared/3d/capabilities/webgl-capabilities";
  import { viewportFits3D } from "$lib/shared/3d/capabilities/viewport-3d-gate.svelte";
  import SequenceHeroDemo from "$lib/shared/landing/components/SequenceHeroDemo.svelte";
  import { createHeroAct } from "$lib/shared/landing/data/hero-act.svelte";
  import { FALLBACK_DEMO } from "$lib/shared/landing/data/per-visit-demo";
  import {
    HERO_TRAIL_PRESET,
    HERO_TIP_EFFECT_MAP,
  } from "$lib/shared/landing/data/hero-trail-preset";
  import { isConstrainedConnection } from "$lib/shared/platform/network-conditions";
  import { runAfterNamedRouteMorphIdle } from "$lib/shared/transitions/named-route-morph-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import ComposerGenerateDemo from "./_components/ComposerGenerateDemo.svelte";
  import ComposerBackgroundCycle from "./_components/ComposerBackgroundCycle.svelte";
  import { resolveComposerCarriedSequence } from "./_components/composer-sequence-ownership";

  const TITLE = "Flow Arts Composer | Free Flow Arts Software for Choreography";
  const DESCRIPTION =
    "Flow Arts Composer is free flow arts software for building, animating, saving, and sharing choreography in your browser with The Kinetic Alphabet.";
  const URL = "https://tkaflowarts.com/composer";
  const ORGANIZATION_ID = "https://tkaflowarts.com/#organization";
  const WEBSITE_ID = "https://tkaflowarts.com/#website";
  const CREATOR_ID = "https://tkaflowarts.com/about#austen-cloud";
  const SOFTWARE_ID = `${URL}#software`;
  const COMPOSER_IMAGE =
    "https://tkaflowarts.com/branding/composer-og-image.png";

  const softwareJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    name: "Flow Arts Composer",
    description: DESCRIPTION,
    url: URL,
    mainEntityOfPage: URL,
    applicationCategory: "EducationalApplication",
    keywords:
      "flow arts software, flow arts choreography software, flow arts app",
    operatingSystem: "Web browser",
    image: COMPOSER_IMAGE,
    inLanguage: "en-US",
    isAccessibleForFree: true,
    featureList: [
      "Build sequences step by step with valid next options",
      "Generate a 16-step sequence from a prepared movement recipe",
      "Animate sequences with pictographs beside the motion",
      "Multiply sequences into tunnels of two, four, or eight copies",
      "View sequences in 3D on supported larger screens",
      "Save up to three sequences on the current device as a guest",
      "Browse public sequences in the Community Gallery",
      "Use cloud saves, publishing, following, and exports with a full account",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://tkaflowarts.com/create",
    },
    author: { "@id": ORGANIZATION_ID },
    creator: { "@id": CREATOR_ID },
    publisher: { "@id": ORGANIZATION_ID },
    isPartOf: { "@id": WEBSITE_ID },
  }).replace(/</g, "\\u003c");

  const breadcrumbJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://tkaflowarts.com/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Composer",
        item: URL,
      },
    ],
  }).replace(/</g, "\\u003c");

  function trackOpenComposer(): void {
    trackCtaClick("hero", {
      page: "composer",
      cta_type: "open_composer",
      destination: "/create",
    });
  }

  // Opens on the baked fixture, exactly as HomeHero does, then rolls live
  // sequences forever. 5d637dc105 dropped the seed here believing that mirrored
  // HomeHero; HomeHero has always passed `initialSequence: FALLBACK_DEMO`, so
  // the unseeded act left this page on "Preparing a live sequence..." for the
  // whole cold generation — measured at 14.1 s in dev. The objection that
  // motivated dropping the seed (the fixture was GGGGGGGG over 8 identical
  // steps) was retired by that same commit, which regenerated it through this
  // exact preset: it is now a 16-count MYΩN draw that passes the quality gate.
  // The first live draw takes over at the next loop boundary via the act's
  // existing prefetch handoff.
  const heroAct = createHeroAct({ initialSequence: FALLBACK_DEMO });

  // A sequence the visitor composed or generated further down the page takes
  // over the carry; until then the bands open on the baked sequence and later
  // adopt the hero's first live draw.
  let visitorSequence = $state<SequenceData | null>(null);

  // The hero keeps auto-advancing every loop pass. The tunnel and the 3D
  // viewer must not follow it: rebuilding a Threlte scene under a reader every
  // ~16 seconds is churn on its own, and a teardown landing mid-compileAsync
  // throws inside three's timer where nothing can catch it. The bands hold the
  // first live hero draw after opening on the baked fixture. Compared by id
  // because `heroAct.sequence` is a $state proxy and never identity-equal to
  // the import.
  let latchedHeroSequence = $state<SequenceData | null>(null);
  $effect(() => {
    const first = heroAct.sequence;
    if (first && first.id !== FALLBACK_DEMO.id && !latchedHeroSequence) {
      latchedHeroSequence = first;
    }
  });
  const carriedSequence = $derived(
    resolveComposerCarriedSequence(
      visitorSequence,
      latchedHeroSequence,
      FALLBACK_DEMO
    )
  );
  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  let constructActive = $state(false);
  let outputsActive = $state(false);
  let shelfActive = $state(false);
  let webglChecked = $state(false);
  let webglAvailable = $state(false);

  const canShow3D = $derived(
    webglChecked && webglAvailable && viewportFits3D()
  );

  onMount(() => {
    webglAvailable = isWebGL2Available();
    webglChecked = true;
    if (isConstrainedConnection()) return;
    return runAfterNamedRouteMorphIdle(heroAct.start);
  });

  function carryVisitorSequence(next: SequenceData): void {
    visitorSequence = next;
  }

  // Same handler HomeHero uses: report the interaction, then roll now.
  function handleReroll(): void {
    trackDemoInteraction("try_another");
    void heroAct.advanceNow();
  }

  function activateConstruct(node: HTMLElement) {
    return activateWhenNear(node, {
      activate: () => {
        trackSectionView("making", analyticsRoute());
        constructActive = true;
      },
      rootMargin: "420px",
      deferUntilIdle: true,
    });
  }

  function activateOutputs(node: HTMLElement) {
    return activateWhenNear(node, {
      activate: () => {
        trackSectionView("changing", analyticsRoute());
        outputsActive = true;
      },
      rootMargin: "420px",
      deferUntilIdle: true,
    });
  }

  function activateShelf(node: HTMLElement) {
    return activateWhenNear(node, {
      activate: () => {
        trackSectionView("keeping", analyticsRoute());
        shelfActive = true;
      },
      rootMargin: "420px",
      deferUntilIdle: true,
    });
  }
</script>

<Seo
  title={TITLE}
  description={DESCRIPTION}
  canonical={URL}
  ogImage={COMPOSER_IMAGE}
  ogImageAlt="Flow Arts Composer, flow arts software for choreography"
>
  {@html `<script type="application/ld+json">${softwareJsonLd}</script>`}
  {@html `<script type="application/ld+json">${breadcrumbJsonLd}</script>`}
</Seo>

{#snippet tunnelPlaceholder()}
  <!-- Same two-column band the tunnel renders into (stage left, controls
       right; stacked under 60rem), so the LazyMount swap cannot shift layout. -->
  <div class="tunnel-placeholder" aria-hidden="true">
    <div class="placeholder-square"></div>
    <div class="placeholder-band-controls">
      <div class="placeholder-line placeholder-line-title"></div>
      <div class="placeholder-line"></div>
      <div class="placeholder-control"></div>
      <div class="placeholder-control"></div>
    </div>
  </div>
{/snippet}

{#snippet constructPlaceholder()}
  <div class="construct-placeholder" aria-hidden="true">
    <div class="placeholder-pane"></div>
    <div class="placeholder-pane"></div>
  </div>
{/snippet}

{#snippet constructLoadError(_error: unknown, retry: () => void)}
  <div class="demo-load-error construct-error" role="alert">
    <p>The step-by-step demonstration did not load.</p>
    <button type="button" onclick={retry}>Try the builder again</button>
  </div>
{/snippet}

{#snippet viewerPlaceholder()}
  <div class="viewer-placeholder">
    {#if outputsActive}
      <span class="sr-only" role="status">Loading the live 3D performance.</span
      >
    {/if}
    <!-- The viewer's controls now live on a rail INSIDE the stage, so the
         skeleton reserves the stage alone. Reserving control rows under it
         would leave a gap that collapses on activation. -->
    <div aria-hidden="true">
      <div class="placeholder-wide"></div>
    </div>
  </div>
{/snippet}

{#snippet tunnelLoadError(_error: unknown, retry: () => void)}
  <div class="demo-load-error" role="alert">
    <p>The tunnel demonstration did not load.</p>
    <button type="button" onclick={retry}>Try the tunnel again</button>
  </div>
{/snippet}

{#snippet viewerLoadError(_error: unknown, retry: () => void)}
  <div class="demo-load-error" role="alert">
    <p>The 3D demonstration did not load.</p>
    <button type="button" onclick={retry}>Try the 3D viewer again</button>
  </div>
{/snippet}

{#snippet galleryPlaceholder()}
  <!-- Same bounded frame ComposerGalleryDemo owns, so the swap cannot move
       the footer. Keep the height in step with its .gallery-frame. -->
  <div class="gallery-placeholder" aria-hidden="true">
    {#each Array.from({ length: 12 }, (_, i) => i) as i (i)}
      <div class="placeholder-card"></div>
    {/each}
  </div>
{/snippet}

{#snippet galleryLoadError(_error: unknown, retry: () => void)}
  <div class="demo-load-error gallery-error" role="alert">
    <p>The community gallery did not load.</p>
    <button type="button" onclick={retry}>Try the gallery again</button>
  </div>
{/snippet}

<main class="composer-page">
  <section
    class="opening"
    aria-labelledby="composer-title"
    style:view-transition-name="launchpad-composer"
  >
    <div class="opening-copy">
      <h1 id="composer-title">Flow Arts <span>Composer</span></h1>
      <!-- The cut sentence described where the pictographs sit relative to the
           animation — which the demo two inches to the right is doing. -->
      <p class="opening-lede">
        Choose the moves or generate a 16-count loop. Composer keeps the
        notation and movement together.
      </p>

      <div class="opening-actions">
        <a
          href="/create"
          class="primary-action"
          data-sveltekit-reload
          onclick={() => trackOpenComposer()}
        >
          Start composing
          <i class="fas fa-arrow-right" aria-hidden="true"></i>
        </a>
      </div>

      <p class="opening-note">
        Free in your browser. Guest saves stay on this device.
      </p>
    </div>

    <div class="opening-player">
      <SequenceHeroDemo
        sequence={heroAct.sequence}
        element={heroAct.element}
        onReroll={handleReroll}
        rerolling={heroAct.rerolling}
        leftPropType={heroAct.propType}
        rightPropType={heroAct.propType}
        onSequenceBoundary={heroAct.offerSequenceBoundary}
        note="a real sequence playing in Composer"
        trailSettingsOverride={HERO_TRAIL_PRESET}
        tipEffectMap={HERO_TIP_EFFECT_MAP}
        showNotationStrip={true}
        showWordHeader={true}
        autoPlay={!reduceMotion.current}
        cornerToggle={true}
        loadPriority="immediate"
      />
      <!-- The page background is the app's own. Cycling it here is the one
           place the page shows that the whole interface retunes to it. -->
      <ComposerBackgroundCycle />
    </div>

    <!-- Absolutely positioned, so revealing it cannot move the hero content.
         It marks where the fold is; the section below starts under it. -->
    <a
      class="scroll-cue"
      href="#making-title"
      aria-label="Scroll to Build the sequence"
    >
      <span>Scroll</span>
      <i class="fas fa-chevron-down" aria-hidden="true"></i>
    </a>
  </section>

  <!-- One heading, then the thing itself. An earlier version explained Build and
       Generate in a two-column definition list directly above the two demos that
       ARE build and generate — narration sitting on top of the working control it
       narrates. The demos carry their own labels; the page does not need to
       introduce them twice. -->
  <section class="making" aria-labelledby="making-title">
    <h2 id="making-title" class="making-title">Build the sequence.</h2>
    <p class="section-intro">
      Start with a position. Composer keeps the next move workable.
    </p>

    <div class="making-demos" use:activateConstruct>
      <div class="construct-surface">
        <LazyMount
          loader={() => import("./_sections/ConstructSection.svelte")}
          active={constructActive}
          props={{
            presentationMode: "guided-build",
            onVisitorComposed: carryVisitorSequence,
          }}
          error={constructLoadError}
          debugName="composer guided construct"
        >
          {#snippet placeholder()}
            {@render constructPlaceholder()}
          {/snippet}
        </LazyMount>
      </div>
      <div class="generator-surface">
        <ComposerGenerateDemo
          sequence={carriedSequence}
          onGenerated={carryVisitorSequence}
        />
      </div>
    </div>
  </section>

  <section
    class="changing"
    aria-labelledby="changing-title"
    use:activateOutputs
  >
    <div class="changing-intro">
      <h2 id="changing-title">See what you made.</h2>
      <p>
        The sequence you build above carries into the tunnel and the 3D player
        below. Its notation comes with it.
      </p>
    </div>

    <!-- The tunnel gets its own full-width band: the square stage on the left,
         the performer count and arrangement controls on the right. The 3D
         viewer takes the next band. -->
    <div class="tunnel-band">
      <div class="product-frame band-frame">
        <!-- No {#key}: both demos accept a changing `sequence` prop and swap
             in place, the way SequenceHeroDemo's player deliberately does. -->
        <LazyMount
          loader={() => import("./_components/ComposerTunnelDemo.svelte")}
          active={outputsActive && !!carriedSequence}
          props={{ sequence: carriedSequence, layout: "band" }}
          error={tunnelLoadError}
          debugName="composer tunnel"
        >
          {#snippet placeholder()}
            {@render tunnelPlaceholder()}
          {/snippet}
        </LazyMount>
      </div>
    </div>

    <div class="viewer-output">
      <div class="product-frame wide-frame">
        {#if webglChecked && !webglAvailable}
          <div class="viewer-unavailable" role="status">
            <i class="fas fa-cube" aria-hidden="true"></i>
            <p>3D is unavailable in this browser.</p>
          </div>
        {:else}
          <LazyMount
            loader={() => import("./_components/Composer3DViewerDemo.svelte")}
            active={outputsActive && canShow3D && !!carriedSequence}
            props={{ sequence: carriedSequence }}
            error={viewerLoadError}
            debugName="composer 3D viewer"
          >
            {#snippet placeholder()}
              {@render viewerPlaceholder()}
            {/snippet}
          </LazyMount>
        {/if}
      </div>
    </div>

    <p class="small-screen-3d-note">
      The 3D viewer needs WebGL2 and a screen at least 600px in both directions.
    </p>
  </section>

  <section class="keeping" aria-labelledby="keeping-title" use:activateShelf>
    <div class="keeping-intro">
      <h2 id="keeping-title">Keep the sequence you made.</h2>
      <div class="keeping-lede">
        <p>
          Guests keep three sequences on this device. A full account keeps a
          cloud library and collections. The gallery below is everyone's public
          work, with the same filters the app uses.
        </p>
        <div class="keeping-actions">
          <a href="/browse" class="primary-action">Browse the Gallery</a>
        </div>
      </div>
    </div>

    <div class="keeping-shelf">
      <LazyMount
        loader={() => import("./_components/ComposerGalleryDemo.svelte")}
        active={shelfActive}
        props={{}}
        error={galleryLoadError}
        debugName="composer gallery"
      >
        {#snippet placeholder()}
          {@render galleryPlaceholder()}
        {/snippet}
      </LazyMount>
    </div>
  </section>

  <!-- The "foundation" section that used to close the page is gone (2026-08-25).
       It set "Composer is an instrument built for The Kinetic Alphabet" over a
       paragraph beginning "The notation begins with double staves", and both its
       links pointed at /notation. /notation has not been a TKA explainer since
       it was rebuilt on 2026-07-27 as the Flow Arts Notation Archive — an index
       of eight notation systems, seven of them other people's. So the section
       made a dated claim and then sent the reader somewhere that does not
       explain it. Do not restore it with the copy rewritten in place: any
       replacement is a TKA claim and goes through MCP grounding and Austen's
       approval first (.claude/rules/mcp-ground-truth.md). -->
</main>

<style>
  :global(html:has(.composer-page)) {
    scroll-behavior: smooth;
  }

  .composer-page {
    position: relative;
    width: min(100%, var(--shell-w, min(1720px, 92vw)));
    margin-inline: auto;
    padding: 5.25rem 1rem 5rem;
    color: var(--theme-text, #fff);
    font-family: "Inter", system-ui, sans-serif;
  }

  /* The hero owns the first screen: one viewport minus the fixed marketing
     header and the page's own top padding, so the next section starts below
     the fold instead of peeking in. min-height, never height — short and
     narrow viewports below let it grow rather than clip the player. */
  .opening {
    position: relative;
    min-height: calc(100dvh - var(--marketing-header-h, 64px) - 1.25rem);
    display: grid;
    grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
    align-items: center;
    gap: clamp(2rem, 4.5vw, 80px);
    padding: clamp(0.75rem, 2vw, 28px) 0 clamp(3rem, 4vw, 3.5rem);
  }

  /* Quiet fold marker. Sits in the hero's bottom padding, out of flow. */
  .scroll-cue {
    position: absolute;
    left: 50%;
    bottom: 0.65rem;
    transform: translateX(-50%);
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.4rem 0.75rem;
    border-radius: var(--settings-radius-lg, 0.85rem);
    color: oklch(0.72 0.018 270);
    font-size: var(--font-size-compact, 0.75rem);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    text-decoration: none;
    transition: color 160ms ease;
  }

  .scroll-cue:hover {
    color: oklch(0.88 0.02 270);
  }

  .scroll-cue:focus-visible {
    outline: 2px solid var(--theme-accent, #8b8cff);
    outline-offset: 3px;
  }

  .scroll-cue i {
    animation: scroll-cue-drift 2.4s ease-in-out infinite;
  }

  @keyframes scroll-cue-drift {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(0.28rem);
    }
  }

  .opening-copy {
    position: relative;
    z-index: 1;
  }

  h1,
  h2 {
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-style: italic;
    font-variation-settings:
      "opsz" 144,
      "wght" 700,
      "SOFT" 0,
      "WONK" 1;
    letter-spacing: -0.035em;
  }

  /* Display-type ceilings are in PX, deliberately, and every one of them on this
     page follows this rule. They are art-directed optical caps rather than body
     roles, and remain independent of the surrounding composition band. Nothing
     on a 4K screen needs 156px display type merely because the canvas is wider.

     A px ceiling stops the growth where it should stop. The floor stays in rem
     so a reader who has raised their browser font size still gets it. */
  h1 {
    margin: 0;
    max-width: 10ch;
    color: oklch(0.97 0.012 270);
    font-size: clamp(3rem, 2rem + 4vw, 104px);
    line-height: 0.92;
  }

  h1 span {
    display: block;
    color: oklch(0.79 0.15 278);
  }

  .opening-lede {
    margin: 1.55rem 0 0;
    color: oklch(0.79 0.015 270);
    font-size: clamp(1rem, 0.94rem + 0.32vw, 1.28rem);
    line-height: 1.65;
  }

  .opening-actions,
  .keeping-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.7rem;
    margin-top: 1.55rem;
  }

  .primary-action,
  .demo-load-error button {
    min-height: max(var(--min-touch-target, 48px), 48px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    box-sizing: border-box;
    padding: 0.72em 1.15em;
    border-radius: var(--settings-radius-lg, 0.85rem);
    color: #fff;
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 680;
    text-decoration: none;
    cursor: pointer;
    transition:
      transform 160ms ease,
      border-color 160ms ease,
      background 160ms ease,
      box-shadow 160ms ease;
  }

  .primary-action {
    border: 1px solid oklch(0.73 0.16 277 / 0.9);
    background: oklch(0.54 0.18 278);
    box-shadow: 0 1rem 2.5rem oklch(0.35 0.16 278 / 0.28);
  }

  .demo-load-error button {
    border: 1px solid var(--theme-stroke-strong, oklch(0.58 0.04 270 / 0.34));
    background: var(--theme-card-bg, oklch(0.18 0.025 270 / 0.75));
  }

  .primary-action:hover,
  .demo-load-error button:hover {
    transform: translateY(-2px);
  }

  .primary-action:hover {
    box-shadow: 0 1.25rem 3rem oklch(0.38 0.18 278 / 0.4);
  }

  .demo-load-error button:hover {
    border-color: oklch(0.72 0.12 277 / 0.65);
    background: var(--theme-card-bg-hover, oklch(0.23 0.04 270 / 0.86));
  }

  .primary-action:focus-visible,
  .demo-load-error button:focus-visible {
    outline: 2px solid var(--theme-accent, #8b8cff);
    outline-offset: 3px;
  }

  .opening-note {
    margin: 0.9rem 0 0;
    color: oklch(0.74 0.018 270);
    font-size: var(--font-size-min, 0.875rem);
  }

  /* The svh term is what keeps the hero inside one screen: the player is a
     tall stack (square + notation strip + controls), so on a short desktop
     window its width has to come down or it would push the fold away. */
  /* The svh terms are what keep the hero inside one screen: the demo is a tall
     stack (square + notation strip + controls + background row), so on a short
     desktop window its width has to come down rather than push the fold away.
     Sizing goes through the demo's own max-width tokens, as HomeHero does. */
  .opening-player {
    position: relative;
    width: min(100%, 45rem);
    margin-inline: auto;
    --hero-demo-max-width: min(100%, 45rem, 47svh);
  }

  .opening-player::before {
    content: "";
    position: absolute;
    inset: 12% 10%;
    z-index: -1;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      oklch(0.55 0.18 278 / 0.24),
      transparent 68%
    );
    filter: blur(1.5rem);
  }

  /* px ceilings on section padding and gutters — see the note on h1. Every one
     of these was a rem ceiling riding the root ramp, so the page banked more
     empty space the wider the screen got: 216px of padding per section edge and
     192px between columns at 3840. Section rhythm should be constant once it is
     generous; it is the CONTENT that gets the extra 4K width. */
  .keeping {
    padding-block: clamp(2.5rem, 4.5vw, 4.5rem);
  }

  .keeping-intro {
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(18rem, 1.05fr);
    gap: clamp(1.75rem, 4vw, 4rem);
    align-items: start;
    margin-bottom: clamp(1.5rem, 2.5vw, 2.5rem);
  }

  .keeping-lede > p {
    margin: 0;
  }

  .keeping-intro .keeping-actions {
    margin-top: 1.35rem;
  }

  .keeping-shelf {
    container-type: inline-size;
    min-width: 0;
  }

  .making {
    padding-block: clamp(3rem, 7vw, 112px);
    border-top: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
  }

  .making-title {
    scroll-margin-top: calc(var(--marketing-header-h, 64px) + 1rem);
    max-width: 18ch;
  }

  .section-intro {
    margin: 1.2rem 0 0;
    color: oklch(0.76 0.014 270);
    font-size: var(--font-size-base, 1rem);
    line-height: 1.65;
  }

  /* px ceiling — see the note on h1. Was 5rem, which the root ramp turned into
     120px at 4K; the old heading ran 1862px wide as a result. */
  h2 {
    margin: 0;
    color: oklch(0.96 0.012 270);
    font-size: clamp(2.45rem, 1.8rem + 2.5vw, 74px);
    line-height: 1;
  }

  .changing-intro > p,
  .keeping-lede > p {
    margin: 1.25rem 0 0;
    color: oklch(0.76 0.014 270);
    font-size: clamp(1rem, 0.94rem + 0.24vw, 1.18rem);
    line-height: 1.7;
  }

  .generator-surface {
    container-type: inline-size;
    min-width: 0;
  }

  /* The two demos are separated by a gap, not by a tracked-out uppercase rule
     saying "or draw another". Each panel already says what it is — one has a
     picker and a play button, the other a Generate button. */
  .making-demos {
    display: grid;
    gap: clamp(1.5rem, 3vw, 3rem);
    min-width: 0;
    margin-top: clamp(2rem, 4vw, 4rem);
  }

  .construct-surface {
    min-width: 0;
  }

  .construct-placeholder {
    min-height: clamp(36rem, 52vw, 46rem);
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: clamp(1.5rem, 3vw, 3rem);
    padding: clamp(1rem, 2.2vw, 1.75rem);
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
    border-radius: 1.5rem;
    background: var(--theme-panel-bg, oklch(0.13 0.025 270 / 0.92));
  }

  .placeholder-pane {
    min-width: 0;
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.16));
    border-radius: 1.1rem;
    background: radial-gradient(
      circle at 50% 42%,
      oklch(0.22 0.04 278),
      oklch(0.1 0.02 270) 72%
    );
  }

  .construct-error {
    min-height: clamp(36rem, 52vw, 46rem);
  }

  /* `.making` already ends on 9rem of padding; a matching 8rem here stacked to
     17rem of nothing between the two sections — most of a screen at 4K, where
     the root ramp scales every rem. The seam is one generous gap, not two. */
  .changing {
    padding: clamp(2.75rem, 4vw, 4rem) 0 clamp(3rem, 5vw, 5rem);
  }

  .changing-intro {
    min-width: 0;
  }

  .tunnel-band {
    min-width: 0;
    margin-top: clamp(2rem, 3.5vw, 3.5rem);
  }

  /* The frame hugs the stage-plus-controls composition instead of spanning a
     wide shell with dark margins on both sides of it. */
  .band-frame {
    max-width: min(100%, 92rem);
    margin-inline: auto;
  }

  .viewer-output {
    margin-top: clamp(2rem, 3.5vw, 3.5rem);
  }

  .product-frame {
    min-width: 0;
    padding: clamp(0.75rem, 1.7vw, 1.4rem);
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
    border-radius: clamp(1rem, 1.5vw, 1.5rem);
    background: var(--theme-panel-bg, oklch(0.13 0.025 270 / 0.94));
    box-shadow: 0 1.5rem 4rem oklch(0.04 0.03 270 / 0.3);
  }

  .placeholder-square,
  .placeholder-wide {
    border-radius: 1rem;
    background: radial-gradient(
      circle at 50% 42%,
      oklch(0.24 0.05 278),
      oklch(0.1 0.02 270) 72%
    );
  }

  /* Mirrors ComposerTunnelDemo's band: stage width min(46rem, 62vh), a
     controls column beside it, stacked under 60rem. */
  .tunnel-placeholder {
    display: grid;
    grid-template-columns: minmax(0, min(46rem, 62vh)) minmax(16rem, 30rem);
    gap: clamp(1.5rem, 4vw, 3rem);
    align-items: center;
    justify-content: center;
  }

  .placeholder-square {
    width: 100%;
    aspect-ratio: 1;
  }

  .placeholder-band-controls {
    display: grid;
    gap: 0.9rem;
    align-content: center;
  }

  .placeholder-line {
    height: 0.9rem;
    width: min(100%, 22rem);
    border-radius: 0.45rem;
    background: var(--theme-card-bg, oklch(0.2 0.025 270 / 0.75));
  }

  .placeholder-line-title {
    height: 1.4rem;
    width: 7rem;
  }

  .placeholder-wide {
    width: 100%;
    aspect-ratio: 16 / 9;
  }

  .placeholder-control {
    width: min(100%, 24rem);
    height: 3.25rem;
    border-radius: 0.85rem;
    background: var(--theme-card-bg, oklch(0.2 0.025 270 / 0.75));
  }

  .viewer-unavailable,
  .demo-load-error {
    min-height: clamp(18rem, 34vw, 34rem);
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.8rem;
    text-align: center;
    color: oklch(0.72 0.02 270);
  }

  .viewer-unavailable i {
    color: oklch(0.69 0.11 278);
    font-size: 2.2rem;
  }

  .viewer-unavailable p,
  .demo-load-error p {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
  }

  .small-screen-3d-note {
    display: none;
    margin: 1.4rem 0 0;
    color: oklch(0.74 0.018 270);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.55;
  }

  .keeping {
    border-top: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
    border-bottom: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
  }

  /* Same bounded frame ComposerGalleryDemo renders into, so the LazyMount
     swap cannot shift layout. Keep the height in step with its .gallery-frame. */
  .gallery-placeholder,
  .gallery-error {
    box-sizing: border-box;
    height: min(80vh, 56rem);
    padding: clamp(0.75rem, 1.7vw, 1.4rem);
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
    border-radius: clamp(1rem, 1.5vw, 1.5rem);
    background: var(--theme-panel-bg, oklch(0.13 0.025 270 / 0.94));
    box-shadow: 0 1.5rem 4rem oklch(0.04 0.03 270 / 0.3);
  }

  .gallery-placeholder {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    grid-auto-rows: minmax(0, 1fr);
    gap: clamp(0.8rem, 1.4vw, 1.4rem);
    overflow: hidden;
  }

  .placeholder-card {
    border-radius: 0.9rem;
    background: radial-gradient(
      circle at 50% 42%,
      oklch(0.22 0.04 278),
      oklch(0.1 0.02 270) 72%
    );
  }

  @media (max-width: 70rem) {
    .opening,
    .making {
      grid-template-columns: 1fr;
    }

    .keeping-intro {
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }

    .opening {
      min-height: calc(100dvh - var(--marketing-header-h, 64px) - 1.25rem);
      gap: 2.5rem;
      padding-top: 1.5rem;
    }

    .opening-copy {
      text-align: center;
    }

    h1,
    .opening-lede {
      margin-inline: auto;
    }

    .opening-actions {
      justify-content: center;
    }

    .opening-player {
      width: min(100%, 38rem);
      --hero-demo-max-width: min(100%, 38rem, 31svh);
    }

    .construct-placeholder {
      min-height: 38rem;
      grid-template-columns: 1fr;
    }

    .placeholder-pane:last-child {
      display: none;
    }
  }

  @media (max-width: 60rem) {
    .tunnel-placeholder {
      grid-template-columns: 1fr;
    }

    .placeholder-square {
      width: min(46rem, 62vh, 100%);
      margin-inline: auto;
    }
  }

  @media (max-width: 50rem) {
    .composer-page {
      padding-inline: 0.9rem;
    }
  }

  /* Phones: the player is the whole point of this screen, so it keeps its
     width and the hero grows past the fold instead of shrinking it. */
  @media (max-width: 48rem) {
    .opening {
      min-height: 0;
    }

    .opening-player {
      --hero-demo-max-width: min(100%, 22rem);
    }

    .scroll-cue {
      position: static;
      transform: none;
      justify-self: center;
      margin-top: 0.5rem;
    }
  }

  @media (max-width: 37.4375rem), (max-height: 37.4375rem) {
    .viewer-output {
      display: none;
    }

    .small-screen-3d-note {
      display: block;
    }
  }

  @media (min-width: 48rem) and (max-height: 35rem) {
    .composer-page {
      padding-top: 4.55rem;
    }

    .opening {
      min-height: calc(100dvh - 4.8rem);
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      gap: 1.8rem;
      padding: 0.25rem 0 1rem;
    }

    .opening-copy {
      text-align: left;
    }

    h1 {
      margin-inline: 0;
      font-size: clamp(2.4rem, 6.2vw, 4rem);
    }

    .opening-lede {
      margin: 0.8rem 0 0;
      font-size: var(--font-size-min, 0.875rem);
      line-height: 1.45;
    }

    .opening-actions {
      justify-content: flex-start;
      margin-top: 0.9rem;
    }

    .opening-note {
      margin-top: 0.55rem;
      font-size: var(--font-size-compact, 0.75rem);
    }

    /* Short and wide: the fold is not worth a shrunken player here, so the
       hero grows past the viewport and the demo keeps a legible size. */
    .opening-player {
      width: min(100%, 18rem);
      --hero-demo-max-width: min(100%, 18rem);
    }
  }

  @media (min-width: 105rem) {
    .composer-page {
      padding-inline: 1.5rem;
    }

    .opening {
      min-height: calc(100dvh - var(--marketing-header-h, 64px) - 1.25rem);
    }

    .opening-player {
      width: min(100%, 52rem);
      --hero-demo-wide-max-width: min(52rem, 51svh);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scroll-cue i {
      animation: none;
    }

    :global(html:has(.composer-page)) {
      scroll-behavior: auto;
    }

    .primary-action,
    .demo-load-error button {
      transition: none;
    }
  }
</style>
