<script lang="ts">
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { activateWhenNear } from "$lib/actions/activate-when-near";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import {
    DEFAULT_FAN_APPEARANCE,
    type FanAppearance,
  } from "$lib/shared/pictograph/prop/domain/fan-appearance";
  import {
    DEFAULT_PROP_LOOK,
    type PropLook,
  } from "$lib/shared/pictograph/prop/domain/prop-look";
  import type { PropChiralitySeam } from "$lib/shared/settings/components/tabs/prop-type/prop-chirality-seam";
  import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
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
  import ComposerBackgroundCycle from "./ComposerBackgroundCycle.svelte";
  import ComposerPropPicker from "./ComposerPropPicker.svelte";
  import { resolveComposerCarriedSequence } from "./composer-sequence-ownership";
  import type { ComposerPropAppearance } from "./composer-prop-appearance";
  import ProjectStory from "./ProjectStory.svelte";

  function trackOpenComposer(): void {
    trackCtaClick("hero", {
      page: analyticsRoute(),
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
  // over the carry; until then the bands hold the hero's FIRST draw.
  let visitorSequence = $state<SequenceData | null>(null);

  // The lower demos hold one live hero draw. Rebuilding their readers on every
  // hero loop is distracting, and a visitor's own sequence always takes over.
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
  let selectedProp = $state<PropType>(PropType.STAFF);
  // Appearance and colors stay with this public page's prop choice. There is
  // no app settings service here, so writing to it would lose these edits.
  let fanAppearance = $state<FanAppearance>(DEFAULT_FAN_APPEARANCE);
  let propLook = $state<PropLook>(DEFAULT_PROP_LOOK);
  let primaryPropColors = $state<ViewerCustomColorPair | null>(null);
  let buugengFlipped = $state({ left: false, right: false });
  const chirality: PropChiralitySeam = {
    hands: [
      {
        hand: "left",
        get flipped() {
          return buugengFlipped.left;
        },
      },
      {
        hand: "right",
        get flipped() {
          return buugengFlipped.right;
        },
      },
    ],
    onChange(hand, flipped) {
      buugengFlipped[hand] = flipped;
    },
  };
  const propAppearance = $derived<ComposerPropAppearance>({
    fanAppearance,
    propLook,
    primaryPropColors,
    leftBuugengFlipped: buugengFlipped.left,
    rightBuugengFlipped: buugengFlipped.right,
  });
  const pickerAppearance = {
    get fanAppearance() {
      return fanAppearance;
    },
    onFanAppearanceChange: (next: FanAppearance) => (fanAppearance = next),
    get propLook() {
      return propLook;
    },
    onPropLookChange: (next: PropLook) => (propLook = next),
    get primaryPropColors() {
      return primaryPropColors;
    },
    onPrimaryPropColorsChange: (next: ViewerCustomColorPair | null) =>
      (primaryPropColors = next),
    chirality,
  };
  let propPickerOpen = $state(false);
  const propName = $derived(getPropTypeDisplayInfo(selectedProp).label);

  function openPropPicker(): void {
    propPickerOpen = true;
  }

  function selectProp(prop: PropType): void {
    // Keep the chooser open so a family pick can reveal its appearance options.
    selectedProp = prop;
  }

  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  let constructActive = $state(false);
  let generateActive = $state(false);
  let tunnelActive = $state(false);
  let viewerActive = $state(false);
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

  // Each stop loads its demonstration as it nears the window and reports the
  // view once. On the stage, a parked stop is off to the side, so it loads
  // when a glide is one stop away.
  function activateNear(section: string, activate: () => void) {
    return (node: HTMLElement) =>
      activateWhenNear(node, {
        activate: () => {
          trackSectionView(section, analyticsRoute());
          activate();
        },
        rootMargin: "420px",
        deferUntilIdle: true,
      });
  }

  const activateConstruct = activateNear(
    "making",
    () => (constructActive = true)
  );
  const activateGenerate = activateNear(
    "generating",
    () => (generateActive = true)
  );
  const activateTunnel = activateNear("changing", () => (tunnelActive = true));
  const activateViewer = activateNear("viewing", () => (viewerActive = true));
  const activateShelf = activateNear("keeping", () => (shelfActive = true));
</script>

{#snippet propControl()}
  <span class="prop-trigger" title={`Change props · ${propName}`}>
    <PanelButton
      onclick={openPropPicker}
      ariaLabel={`Change props. Current: ${propName}`}
      ariaExpanded={propPickerOpen}
    >
      <PropCompositionPreview
        propType={selectedProp}
        size={36}
        useSavedOverrides={false}
        colors={primaryPropColors}
      />
    </PanelButton>
  </span>
{/snippet}

{#snippet pickerPreview()}
  <SequenceHeroDemo
    sequence={heroAct.sequence}
    element={heroAct.element}
    leftPropType={selectedProp}
    rightPropType={selectedProp}
    {...propAppearance}
    note="Current sequence"
    trailSettingsOverride={HERO_TRAIL_PRESET}
    tipEffectMap={HERO_TIP_EFFECT_MAP}
    showCaption={false}
    autoPlay={!reduceMotion.current}
    loadPriority="immediate"
  />
{/snippet}

<ComposerPropPicker
  open={propPickerOpen}
  selectedPropType={selectedProp}
  onSelect={selectProp}
  onOpenChange={(open) => (propPickerOpen = open)}
  preview={pickerPreview}
  {...pickerAppearance}
/>

{#snippet tunnelPlaceholder()}
  <!-- Reserve the stage, toolbar, and seven-card preset bank during lazy load. -->
  <div class="tunnel-placeholder" aria-hidden="true">
    <div class="placeholder-stage-wrap">
      <div class="placeholder-square"></div>
      <div class="placeholder-toolbar">
        <div class="placeholder-tool"></div>
        <div class="placeholder-tool"></div>
        <div class="placeholder-tool"></div>
      </div>
    </div>
    <div class="placeholder-band-controls">
      <div class="placeholder-line placeholder-line-title"></div>
      <div class="placeholder-preset-grid">
        {#each Array(7) as _}<div class="placeholder-control"></div>{/each}
      </div>
    </div>
  </div>
{/snippet}

<!-- Both making stops fill a frame of fixed height, so a skeleton that fills
     the same frame reserves them exactly. -->
{#snippet makingPlaceholder()}
  <div class="making-placeholder" aria-hidden="true">
    <div class="placeholder-pane"></div>
    <div class="placeholder-pane"></div>
  </div>
{/snippet}

{#snippet constructLoadError(_error: unknown, retry: () => void)}
  <div class="demo-load-error making-error" role="alert">
    <p>The step-by-step demonstration did not load.</p>
    <button type="button" onclick={retry}>Try the builder again</button>
  </div>
{/snippet}

{#snippet generateLoadError(_error: unknown, retry: () => void)}
  <div class="demo-load-error making-error" role="alert">
    <p>The generator demonstration did not load.</p>
    <button type="button" onclick={retry}>Try the generator again</button>
  </div>
{/snippet}

{#snippet viewerPlaceholder()}
  <div class="viewer-placeholder">
    {#if viewerActive}
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
      <p class="opening-lede">
        Choose the moves or generate a 16-count loop. Composer is the browser
        app for The Kinetic Alphabet, where notation and movement stay together.
      </p>

      <!-- The demos on this page are real but partial, so the way into the
           app itself has to be the one thing on the first screen nobody can
           mistake for another demo control. -->
      <div class="opening-actions">
        <a
          href="/create"
          class="primary-action open-app"
          data-sveltekit-reload
          onclick={() => trackOpenComposer()}
        >
          Open the app
          <i class="fas fa-arrow-right" aria-hidden="true"></i>
        </a>
      </div>

      <p class="opening-note">
        Free in your browser, no account needed. Guests keep three sequences on
        this device.
      </p>
    </div>

    <div class="opening-player">
      <div class="player-main">
        <SequenceHeroDemo
          sequence={heroAct.sequence}
          element={heroAct.element}
          onReroll={handleReroll}
          rerolling={heroAct.rerolling}
          leftPropType={selectedProp}
          rightPropType={selectedProp}
          {...propAppearance}
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
        <div class="hero-props">
          {@render propControl()}
        </div>
      </div>
      <div class="player-theme"><ComposerBackgroundCycle /></div>
    </div>

    <!-- Absolutely positioned, so revealing it cannot move the hero content.
         It marks where the fold is; the section below starts under it. -->
    <a
      class="scroll-cue"
      href="#construct-title"
      aria-label="Scroll to Construct a sequence"
    >
      <span>Scroll</span>
      <i class="fas fa-chevron-down" aria-hidden="true"></i>
    </a>
  </section>

  <section class="notation-bridge" aria-labelledby="notation-title">
    <h2 id="notation-title">The Kinetic Alphabet</h2>
    <p>
      TKA is a pictographic notation system for flow arts choreography. Each
      picture records a movement step. Arrange the pictures into a sequence,
      then play it in Composer.
    </p>
    <div class="notation-links">
      <PanelButton href="/guide">Read the Guide</PanelButton>
      <PanelButton href="/history">Notation history</PanelButton>
      <PanelButton href="/faq">Common questions</PanelButton>
    </div>
  </section>

  <!-- One stop per thing the visitor can do with a sequence, in the order the
       app offers them: build it, generate it, multiply it, watch it in 3D.
       The way into the app is the header's Open Flow Arts Composer button on
       every page, so no stop ends in its own link. -->
  <section
    class="stop making-stop"
    aria-labelledby="construct-title"
    use:activateConstruct
  >
    <h2 id="construct-title">Construct a sequence</h2>
    <div class="stop-frame construct-frame">
      <LazyMount
        loader={() => import("../_sections/ConstructSection.svelte")}
        active={constructActive}
        props={{
          presentationMode: "guided-build",
          embedded: true,
          leftPropType: selectedProp,
          rightPropType: selectedProp,
          primaryPropColors,
          onVisitorComposed: carryVisitorSequence,
          propControl,
        }}
        error={constructLoadError}
        debugName="composer guided construct"
      >
        {#snippet placeholder()}
          {@render makingPlaceholder()}
        {/snippet}
      </LazyMount>
    </div>
  </section>

  <section
    class="stop making-stop"
    aria-labelledby="generate-title"
    use:activateGenerate
  >
    <h2 id="generate-title">Generate a sequence</h2>
    <div class="stop-frame">
      <LazyMount
        loader={() => import("./ComposerGenerateDemo.svelte")}
        active={generateActive}
        props={{
          sequence: carriedSequence,
          embedded: true,
          leftPropType: selectedProp,
          rightPropType: selectedProp,
          appearance: propAppearance,
          onGenerated: carryVisitorSequence,
          propControl,
        }}
        error={generateLoadError}
        debugName="composer generate"
      >
        {#snippet placeholder()}
          {@render makingPlaceholder()}
        {/snippet}
      </LazyMount>
    </div>
  </section>

  <section
    class="stop tunnel-stop"
    aria-labelledby="tunnel-title"
    use:activateTunnel
  >
    <h2 id="tunnel-title">Put it in a tunnel</h2>

    <!-- The tunnel stage and its seven real presets share this band. -->
    <div class="product-frame band-frame">
      <!-- No {#key}: both demos accept a changing `sequence` prop and swap
           in place, the way SequenceHeroDemo's player deliberately does. -->
      <LazyMount
        loader={() => import("./ComposerTunnelDemo.svelte")}
        active={tunnelActive && !!carriedSequence}
        props={{
          sequence: carriedSequence,
          layout: "band",
          leftPropType: selectedProp,
          rightPropType: selectedProp,
          appearance: propAppearance,
          propControl,
        }}
        error={tunnelLoadError}
        debugName="composer tunnel"
      >
        {#snippet placeholder()}
          {@render tunnelPlaceholder()}
        {/snippet}
      </LazyMount>
    </div>
  </section>

  <!-- Activation sits on the stop, not the viewer, because small screens
       hide the viewer and show only the note. -->
  <section
    class="stop viewer-stop"
    aria-labelledby="viewer-title"
    use:activateViewer
  >
    <h2 id="viewer-title">See it in 3D</h2>

    <div class="viewer-output">
      <div class="product-frame wide-frame">
        {#if webglChecked && !webglAvailable}
          <div class="viewer-unavailable" role="status">
            <i class="fas fa-cube" aria-hidden="true"></i>
            <p>3D is unavailable in this browser.</p>
          </div>
        {:else}
          <LazyMount
            loader={() => import("./Composer3DViewerDemo.svelte")}
            active={viewerActive && canShow3D && !!carriedSequence}
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
          cloud library and collections. Browse other people's sequences below.
        </p>
        <div class="keeping-actions">
          <a href="/browse" class="primary-action">Browse the Gallery</a>
        </div>
      </div>
    </div>

    <div class="keeping-shelf">
      <LazyMount
        loader={() => import("./ComposerGalleryDemo.svelte")}
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

  <ProjectStory />
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
    --hero-card-cap: min(45rem, 47svh);
    min-height: calc(100dvh - var(--marketing-header-h, 64px) - 1.25rem);
    display: grid;
    grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
    align-items: center;
    gap: clamp(2rem, 4.5vw, 80px);
    padding: clamp(0.75rem, 2vw, 28px) 0 clamp(4.5rem, 5vw, 5rem);
  }

  /* Quiet fold marker. Sits in the hero's bottom padding, out of flow. */
  .scroll-cue {
    position: absolute;
    left: 50%;
    bottom: 0.65rem;
    transform: translateX(-50%);
    display: inline-flex;
    min-block-size: var(--min-touch-target, 44px);
    box-sizing: border-box;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.4rem 0.75rem;
    border-radius: var(--settings-radius-lg, 0.85rem);
    color: oklch(0.72 0.018 270);
    font-size: var(--font-size-min, 0.875rem);
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

  /* The way into the app is the first screen's one primary control, sized to
     read against the display title instead of like the demo buttons beside
     the player. Floor in rem, ceiling in px, like the title. */
  .open-app {
    min-height: max(3.5rem, 56px);
    gap: 0.8rem;
    padding: 0.8em 1.6em;
    font-size: clamp(1.0625rem, 0.98rem + 0.3vw, 22px);
    font-weight: 700;
  }

  .open-app i {
    transition: transform 160ms ease;
  }

  .open-app:hover i {
    transform: translateX(0.2em);
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
    --hero-demo-max-width: min(100%, var(--hero-card-cap));
    width: min(100%, 45rem);
    margin-inline: auto;
  }

  .player-main {
    min-width: 0;
  }

  .player-theme {
    min-width: 0;
  }

  .hero-props {
    display: flex;
    justify-content: center;
    margin-top: var(--spacing-md, 16px);
  }

  .prop-trigger {
    display: inline-block;
    width: max(var(--min-touch-target, 48px), 48px);
    height: max(var(--min-touch-target, 48px), 48px);
  }

  .prop-trigger :global(.panel-btn) {
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 5px;
    border-radius: var(--settings-radius-md, 0.65rem);
  }

  .prop-trigger :global(.panel-btn:hover) {
    border-color: var(--theme-stroke-strong);
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
    --composer-gallery-height: 88rem;
  }

  /* px ceiling — see the note on h1. Was 5rem, which the root ramp turned into
     120px at 4K; the old heading ran 1862px wide as a result. */
  h2 {
    margin: 0;
    color: oklch(0.96 0.012 270);
    font-size: clamp(2.45rem, 1.8rem + 2.5vw, 74px);
    line-height: 1;
  }

  .keeping-lede > p {
    margin: 1.25rem 0 0;
    color: oklch(0.76 0.014 270);
    font-size: clamp(1rem, 0.94rem + 0.24vw, 1.18rem);
    line-height: 1.7;
  }

  /* ===== Stops =====
     Each demonstration is a heading over one frame. The stage supplies
     --stop-room, the height between the header and Next, and --stop-pad, and
     the frames are sized from them so a stop fills the window it rests in.
     Without the stage a making stop is about one window tall. The heading's
     line box is its font size (line-height 1), so the space it takes is known
     without measuring. */
  .stop {
    --stop-pad-plain: clamp(2rem, 4vw, 64px);
    --stop-title-size: clamp(2.45rem, 1.8rem + 2.5vw, 74px);
    --stop-gap: var(--spacing-lg, 24px);
    --stop-head: calc(var(--stop-title-size) + var(--stop-gap));
    padding-block: var(--stop-pad, var(--stop-pad-plain));
    border-top: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
  }

  .stop > h2 {
    margin-bottom: var(--stop-gap);
    font-size: var(--stop-title-size);
    text-align: center;
  }

  /* The builder and the generator fill a frame of definite height: both
     size their panels from it, and the skeleton fills the same box. */
  .making-stop {
    container-type: inline-size;
    --making-fill: calc(
      var(
          --stop-room,
          100dvh - var(--marketing-header-h, 64px) - 2 * var(--stop-pad-plain)
        ) -
        var(--stop-head)
    );
  }

  /* The width cap keeps a very tall window (3840 x 2160) from stretching
     the builder into a column of empty space. */
  .stop-frame {
    box-sizing: border-box;
    height: clamp(34rem, var(--making-fill), 62cqw);
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
    border-radius: var(--settings-radius-lg, 0.85rem);
    background: var(--theme-panel-bg, oklch(0.13 0.025 270 / 0.92));
  }

  /* The builder stacks its panels in a narrow stop, and in any window under
     75rem (its own compact query), so it needs a taller frame there. */
  @container (max-width: 69rem) {
    .construct-frame {
      height: clamp(52rem, 110cqw, 62rem);
    }
  }

  @media (max-width: 74.99rem) {
    .construct-frame {
      height: clamp(52rem, 110cqw, 62rem);
    }
  }

  /* Both demos stack here. Last, so it wins over the rules above. */
  @container (max-width: 56rem) {
    .stop-frame {
      height: clamp(52rem, 170cqw, 74rem);
    }
  }

  .making-placeholder,
  .making-error {
    box-sizing: border-box;
    height: 100%;
  }

  .making-placeholder {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: clamp(1.5rem, 3vw, 3rem);
    padding: clamp(1rem, 2.2vw, 1.75rem);
  }

  @container (max-width: 69rem) {
    .making-placeholder {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }
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

  /* The frame hugs the stage-plus-controls composition instead of spanning a
     wide shell with dark margins on both sides of it. On the stage the square
     also fits the room: less the heading, this frame's padding and border,
     and the toolbar under the square. Without the stage the 200vh fallback
     leaves the plain page's own sizing in charge. */
  .band-frame {
    max-width: min(100%, 92rem);
    margin-inline: auto;
    --tunnel-stage-size: min(
      46rem,
      62vh,
      var(--stop-room, 200vh) - var(--stop-head) - 2 * var(--frame-pad) -
        3.75rem - 2px
    );
  }

  /* On the stage the 16:9 viewer takes the width that lets its height fit
     the room under the heading. */
  .viewer-stop .wide-frame {
    max-width: min(
      100%,
      (
          var(--stop-room, 200vh) - var(--stop-head) - 2 * var(--frame-pad) -
            2px
        ) *
        16 / 9 + 2 * var(--frame-pad) + 2px
    );
    margin-inline: auto;
  }

  .product-frame {
    --frame-pad: clamp(0.75rem, 1.7vw, 1.4rem);
    min-width: 0;
    padding: var(--frame-pad);
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

  /* Mirrors ComposerTunnelDemo's band: the stage track (--tunnel-stage-size,
     set on .band-frame), a controls column beside it, stacked under 60rem. */
  .tunnel-placeholder {
    display: grid;
    grid-template-columns:
      minmax(0, var(--tunnel-stage-size, min(46rem, 62vh)))
      minmax(16rem, 30rem);
    gap: clamp(1.5rem, 4vw, 3rem);
    align-items: center;
    justify-content: center;
  }
  .placeholder-stage-wrap {
    min-width: 0;
  }
  .placeholder-toolbar {
    display: flex;
    justify-content: center;
    gap: 0.65rem;
    min-height: 3rem;
    margin-top: 0.75rem;
  }
  .placeholder-tool {
    width: 3rem;
    height: 3rem;
    border-radius: 0.5rem;
    background: var(--theme-card-bg, oklch(0.2 0.025 270 / 0.75));
  }
  .placeholder-preset-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .placeholder-square {
    width: 100%;
    aspect-ratio: 1;
  }

  .placeholder-band-controls {
    display: grid;
    gap: 0.8rem;
    align-content: start;
  }

  .placeholder-line {
    height: 0.9rem;
    width: min(100%, 22rem);
    border-radius: 0.45rem;
    background: var(--theme-card-bg, oklch(0.2 0.025 270 / 0.75));
  }

  .placeholder-line-title {
    height: 1.5rem;
    width: 11rem;
  }

  .placeholder-wide {
    width: 100%;
    aspect-ratio: 16 / 9;
  }

  .placeholder-control {
    width: 100%;
    height: 4.5rem;
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

  .notation-bridge {
    margin: 0 auto;
    padding: clamp(2rem, 4vw, 64px) 0;
    text-align: center;
  }

  .notation-bridge h2 {
    margin: 0 0 1rem;
    font-family: "Fraunces", Georgia, serif;
    font-weight: 650;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .notation-bridge h2 {
    font-size: clamp(2.4rem, 1.9rem + 2.5vw, 72px);
  }

  .notation-bridge p {
    margin: 1.25rem auto 0;
    color: var(--theme-text-secondary, oklch(0.74 0.018 270));
    font-size: clamp(1rem, 0.97rem + 0.18vw, 1.12rem);
    line-height: 1.65;
  }

  .notation-bridge .notation-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    margin-top: 1.4rem;
  }

  /* Same bounded frame ComposerGalleryDemo renders into, so the LazyMount
     swap cannot shift layout. Keep the height in step with its .gallery-frame. */
  .gallery-placeholder,
  .gallery-error {
    box-sizing: border-box;
    height: var(--composer-gallery-height, 80rem);
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
    .opening {
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
  }

  @media (max-width: 60rem) {
    .tunnel-placeholder {
      grid-template-columns: 1fr;
    }

    .placeholder-square {
      width: min(var(--tunnel-stage-size, min(46rem, 62vh)), 100%);
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
    .keeping-shelf {
      --composer-gallery-height: 56rem;
    }

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
      --hero-card-cap: 18rem;
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

    .open-app {
      min-height: max(var(--min-touch-target, 48px), 48px);
      font-size: 1rem;
    }

    .opening-note {
      margin-top: 0.55rem;
      font-size: var(--font-size-min, 0.875rem);
    }

    /* Short and wide: the fold is not worth a shrunken player here, so the
       hero grows past the viewport and the demo keeps a legible size. */
    .opening-player {
      width: min(100%, 18rem);
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
    }
  }

  /* SequenceHeroDemo switches to its wide max-width at this height. */
  @media (min-width: 105rem) and (min-height: 56.25rem) {
    .opening {
      --hero-card-cap: min(52rem, 51svh);
    }

    .opening-player {
      --hero-demo-wide-max-width: min(100%, var(--hero-card-cap));
    }
  }

  /* On wide canvases, center the copy and stage together. */
  @media (min-width: 120rem) {
    .opening {
      grid-template-columns: fit-content(48rem) minmax(0, var(--hero-card-cap));
      justify-content: center;
      column-gap: clamp(5rem, 6vw, 10rem);
    }

    .opening-player {
      width: 100%;
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
    .open-app i,
    .demo-load-error button,
    .opening {
      transition: none;
    }
  }
</style>
