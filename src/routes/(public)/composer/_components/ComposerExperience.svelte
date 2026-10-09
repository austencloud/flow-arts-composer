<script lang="ts">
  import { flushSync, onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { activateWhenNear } from "$lib/actions/activate-when-near";
  import { observeComposerStopVisibility } from "./observe-composer-stop-visibility";
  import { holdWhenStopLeaves } from "./hold-when-stop-leaves";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import SceneChromeButton from "$lib/shared/3d/components/controls/SceneChromeButton.svelte";
  import { claimedViewTransitionName } from "$lib/shared/transitions/claimed-view-transition-name";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { startMorph } from "$lib/shared/transitions/results-morph";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import {
    DEFAULT_FAN_APPEARANCE,
    type FanAppearance,
  } from "$lib/shared/pictograph/prop/domain/fan-appearance";
  import {
    DEFAULT_PROP_LOOK,
    versionAfterPick,
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
  import {
    carryPageSequence,
    featuredCaption,
    openingPageSequence,
    type PageSequenceSource,
  } from "./composer-sequence-ownership";
  import type { ComposerPropAppearance } from "./composer-prop-appearance";
  import ProjectStory from "./ProjectStory.svelte";
  import ComposerWordRow from "./ComposerWordRow.svelte";

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

  // The page has one sequence. The hero's live draws write it until the
  // visitor builds or generates one further down; after that, last write
  // wins. The baked opening keeps the lower demonstrations usable before the
  // hero has drawn anything live. Raw, not deep: every write replaces the
  // whole object, and the tunnel compares the sequence it receives by
  // reference, so a proxy would make it re-prepare the same sequence.
  let pageSequence = $state.raw(openingPageSequence(FALLBACK_DEMO));

  function carryFrom(source: PageSequenceSource) {
    return (next: SequenceData) => {
      pageSequence = carryPageSequence(pageSequence, source, next);
    };
  }
  const carryConstruct = carryFrom("construct");
  const carryGenerate = carryFrom("generate");
  const carryTunnel = carryFrom("tunnel");

  // Every live hero draw becomes the page's sequence. Before the hold the
  // reader is still at the hero; the lower demos are not active yet, except
  // Construct, which the stage loads early as the neighbour and which only
  // writes the page sequence, never reads it, so the auto-rolls cost nothing
  // downstream. After the hold the hero only changes on Roll. The reducer
  // returns the same object for an unchanged id, and the write is untracked,
  // so this effect cannot feed itself.
  $effect(() => {
    const drawn = heroAct.sequence;
    if (!drawn || drawn.id === FALLBACK_DEMO.id) return;
    untrack(() => {
      pageSequence = carryPageSequence(pageSequence, "hero", drawn);
    });
  });

  // The hero stops rolling on its own once the visitor touches it or leaves
  // it, so the word they saw is the word the page carries.
  function holdHero(): void {
    heroAct.hold();
  }

  // The stage keeps the next stop inside the window so it loads early, so
  // "near Construct" would hold the hero at load. The hero is held instead
  // once its stop is no longer the one being read; see holdWhenStopLeaves.
  function holdWhenHeroLeaves(node: HTMLElement) {
    return holdWhenStopLeaves(node, holdHero);
  }

  let selectedProp = $state<PropType>(PropType.STAFF);
  // The demos draw the canonical hands, blue left and red right, because the
  // public layout pins the settings every public page reads. The picker's
  // choice reaches the demos as explicit overrides.

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

  function selectProp(prop: PropType, look?: PropLook): void {
    // A version belongs to the pick, so a different prop that names none
    // starts at Version 1.
    propLook = versionAfterPick(selectedProp, propLook, prop, look);
    // Keep the chooser open so a family pick can reveal its appearance options.
    selectedProp = prop;
  }

  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  let constructActive = $state(false);
  let generateActive = $state(false);
  let tunnelActive = $state(false);
  let tunnelVisible = $state(false);
  let viewerOpen = $state(false);
  let shelfActive = $state(false);
  let webglChecked = $state(false);
  let webglAvailable = $state(false);

  const canShow3D = $derived(
    webglChecked && webglAvailable && viewportFits3D()
  );

  // ===== 3D portal =====
  // The card's picture of the scene grows into a frame over the dimmed page,
  // and closing carries it back. Each way is one view transition. The card and
  // the frame hold the shared names only while it runs, so no other transition
  // on the page picks them up. The scene mounts once the frame has landed,
  // because building it mid-flight would stall the morph. The picture waits
  // over the stage until it is lit, then dissolves while the camera glides in
  // from the pose the picture was taken at.
  type PortalPhase = "idle" | "opening" | "open" | "closing";
  const PORTAL_NAME = "composer-3d-portal";
  const PORTAL_CAPTION_NAME = "composer-3d-portal-caption";
  const PORTAL_CLOSE_NAME = "composer-3d-portal-close";
  const PORTAL_MORPH_CLASS = "composer-3d-portal-morph";
  const PORTAL_EARLY_CLASS = "composer-3d-portal-early";
  /** Rendered from COMPOSER_3D_ENTRANCE_CAMERA; see composer-3d-demo-state. */
  const PORTAL_STILL = "/images/landing/composer-3d-poster.webp";
  const loadViewer = () => import("./Composer3DViewerDemo.svelte");

  let portalPhase = $state<PortalPhase>("idle");
  let sceneMounted = $state(false);
  let stillShown = $state(false);
  let stillLeaving = $state(false);
  let portalWindow = $state<HTMLElement | null>(null);
  let portalFrame = $state<HTMLElement | null>(null);
  let portalStill = $state<HTMLImageElement | null>(null);
  let stillTimer = 0;
  let viewerWarm: Promise<unknown> | null = null;
  let resolvePortalClosed: (() => void) | null = null;

  const portalMorphing = $derived(
    portalPhase === "opening" || portalPhase === "closing"
  );
  const cardNamed = $derived(portalMorphing && !viewerOpen);
  const frameNamed = $derived(portalMorphing && viewerOpen);

  // Fetch the scene's code before the visitor commits, so the frame does not
  // wait on the network after it lands.
  function warmViewer(): void {
    viewerWarm ??= loadViewer().catch(() => {
      viewerWarm = null;
    });
  }

  function openPortal(): void {
    if (!canShow3D || portalPhase !== "idle") return;
    warmViewer();
    clearTimeout(stillTimer);
    sceneMounted = false;
    stillShown = true;
    stillLeaving = false;
    beginPortalMorph("opening");
    const transition = startMorph(
      () => (viewerOpen = true),
      async () => {
        await settlePortalStill();
        markPortalSwap("opening");
      }
    );
    finishPortalMorph(transition, "open");
  }

  // Escape, the dimmed edge, and the close button all arrive here.
  function closePortal(): void {
    if (portalPhase !== "open") return;
    const closed = new Promise<void>(
      (resolve) => (resolvePortalClosed = resolve)
    );
    beginPortalMorph("closing");
    markPortalSwap("closing");
    const transition = startMorph(
      () => {
        viewerOpen = false;
        sceneMounted = false;
      },
      // The dialog leaves the top layer on the modal's own timer, and the new
      // state is the page without it.
      async () => {
        await closed;
        flushSync();
      }
    );
    finishPortalMorph(transition, "idle");
  }

  function handlePortalClosed(): void {
    if (resolvePortalClosed) {
      resolvePortalClosed();
      resolvePortalClosed = null;
      return;
    }
    // The page closed the frame itself: the window became too small for 3D.
    viewerOpen = false;
    sceneMounted = false;
    portalPhase = "idle";
  }

  // The names have to be on the page before the browser captures the old
  // state.
  function beginPortalMorph(phase: "opening" | "closing"): void {
    document.documentElement.classList.add(PORTAL_MORPH_CLASS);
    flushSync(() => (portalPhase = phase));
  }

  function finishPortalMorph(
    transition: ViewTransition | null,
    next: "open" | "idle"
  ): void {
    const settle = () => {
      document.documentElement.classList.remove(
        PORTAL_MORPH_CLASS,
        PORTAL_EARLY_CLASS
      );
      portalPhase = next;
      if (next === "open") sceneMounted = true;
    };
    if (transition) void transition.finished.then(settle, settle);
    else settle();
  }

  // The frame's picture has to be decoded when the browser captures the new
  // state, or the frame arrives empty. A slow decode gives up after a beat.
  async function settlePortalStill(): Promise<void> {
    const still = portalStill;
    if (!still) return;
    await Promise.race([
      still.decode().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, DURATION.dramatic)),
    ]);
  }

  // Each picture in the flight is cover-fit, so it stays true while the box
  // it travels in is no wider than the shape it was taken at. The wider
  // shape's picture leads, and the other takes over at the end nearest it.
  function markPortalSwap(direction: "opening" | "closing"): void {
    const card = portalWindow?.getBoundingClientRect();
    const frame = portalFrame?.getBoundingClientRect();
    if (!card?.height || !frame?.height) return;
    const frameWider =
      frame.width / frame.height > (card.width / card.height) * 1.1;
    const early = direction === "opening" ? frameWider : !frameWider;
    document.documentElement.classList.toggle(PORTAL_EARLY_CLASS, early);
  }

  // The stage is lit and the camera has started its glide, so the picture
  // dissolves into it. A stage that failed to load is uncovered the same way.
  function revealScene(): void {
    if (stillLeaving) return;
    stillLeaving = true;
    clearTimeout(stillTimer);
    stillTimer = window.setTimeout(
      () => (stillShown = false),
      motionDuration(DURATION.scene)
    );
  }

  // The load-error message uncovers the stage as soon as it mounts.
  function uncoverOnMount(_node: HTMLElement): void {
    revealScene();
  }

  onMount(() => {
    webglAvailable = isWebGL2Available();
    webglChecked = true;
    if (isConstrainedConnection()) return;
    return runAfterNamedRouteMorphIdle(heroAct.start);
  });

  onMount(() => () => clearTimeout(stillTimer));

  // Same handler HomeHero uses: report the interaction, then roll now. The
  // act's draws fall back to the baked demo rather than rejecting, so the
  // failure copy is a safety net, not an expected state. Roll is a touch of
  // the hero even when it arrives without a pointer (keyboard activation
  // through a label, or a script), so it holds the hero itself.
  let rerollFailed = $state(false);
  function handleReroll(): void {
    trackDemoInteraction("try_another");
    holdHero();
    rerollFailed = false;
    heroAct.advanceNow().catch(() => {
      rerollFailed = true;
    });
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
  const observeTunnel = (node: HTMLElement) =>
    observeComposerStopVisibility(node, (visible) => (tunnelVisible = visible));
  // One glide away from 3D, start the viewer's code and the stage model the
  // opening waits on, so the portal opens on downloads already done. Only the
  // reliquary: the manifest's Cosmic list also names the older renderer's
  // 5 MB stage, which the portal's renderer never loads.
  function warmViewerStage(): void {
    if (!viewportFits3D() || (webglChecked && !webglAvailable)) return;
    warmViewer();
    void Promise.all([
      import("$lib/shared/3d/scene-boot/scene-prefetch"),
      import("$lib/shared/3d/environments/worlds/cosmic/cosmic-environment-assets"),
    ])
      .then(([prefetch, cosmic]) => {
        prefetch.warmSceneUrls([cosmic.COSMIC_RELIQUARY_URL]);
        prefetch.warmDecoderRuntimes();
      })
      .catch(() => undefined);
  }
  const activateViewer = activateNear("viewing", warmViewerStage);
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

{#snippet heroToolbar()}
  <PanelButton
    onclick={handleReroll}
    disabled={heroAct.rerolling}
    ariaBusy={heroAct.rerolling}
  >
    <i
      class="fas {heroAct.rerolling
        ? 'fa-circle-notch fa-spin'
        : rerollFailed
          ? 'fa-rotate-right'
          : 'fa-dice'}"
      aria-hidden="true"
    ></i>
    <span class="roll-label"
      >{heroAct.rerolling
        ? rerollFailed
          ? "Trying again..."
          : "Rolling..."
        : rerollFailed
          ? "Try again"
          : "Roll a new one"}</span
    >
  </PanelButton>
  {@render propControl()}
  <ComposerBackgroundCycle />
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
  <!-- Reserve the word row, stage, toolbar, and seven-card preset bank during lazy load. -->
  <div class="tunnel-placeholder" aria-hidden="true">
    <div class="placeholder-stage-wrap">
      <div class="placeholder-word-row"></div>
      <div class="placeholder-square"></div>
      <div class="placeholder-notation"></div>
      <div class="placeholder-toolbar">
        <div class="placeholder-tool"></div>
        <div class="placeholder-tool"></div>
      </div>
    </div>
    <div class="placeholder-band-controls">
      <div class="placeholder-toolbar"></div>
      <div class="placeholder-toolbar"></div>
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
    <span role="status">Loading the 3D viewer…</span>
  </div>
{/snippet}

{#snippet tunnelLoadError(_error: unknown, retry: () => void)}
  <div class="demo-load-error" role="alert">
    <p>The tunnel demonstration did not load.</p>
    <button type="button" onclick={retry}>Try the tunnel again</button>
  </div>
{/snippet}

<!-- The error renders under the frame's picture, so it uncovers the stage. -->
{#snippet viewerLoadError(_error: unknown, retry: () => void)}
  <div class="demo-load-error" role="alert" use:uncoverOnMount>
    <p>The 3D demonstration did not load.</p>
    <button type="button" onclick={retry}>Try the 3D viewer again</button>
  </div>
{/snippet}

{#snippet galleryPlaceholder()}
  <!-- Same bounded frame ComposerGalleryDemo owns, so the swap cannot move
       the footer. Keep the height in step with its .gallery-frame. -->
  <div class="gallery-placeholder" aria-hidden="true">
    {#each Array.from({ length: 4 }, (_, i) => i) as i (i)}
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
    use:holdWhenHeroLeaves
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
        this device. Each step is a letter of The Kinetic Alphabet; the sequence
        is the word they spell.
      </p>
    </div>

    <div
      class="opening-player"
      onpointerdowncapture={holdHero}
      onkeydowncapture={holdHero}
    >
      <div class="player-main">
        <SequenceHeroDemo
          sequence={heroAct.sequence}
          element={heroAct.element}
          toolbar={heroToolbar}
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
          cornerToggleAtRest={true}
          loadPriority="immediate"
        />
      </div>
    </div>

    <!-- Absolutely positioned, so revealing it cannot move the hero content.
         It marks where the fold is; the section below starts under it. -->
    <LinkChip
      class="scroll-cue"
      href="#construct-title"
      aria-label="Scroll to Construct a sequence"
    >
      Scroll
    </LinkChip>
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
          onVisitorComposed: carryConstruct,
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
          sequence: pageSequence.sequence,
          embedded: true,
          leftPropType: selectedProp,
          rightPropType: selectedProp,
          appearance: propAppearance,
          onGenerated: carryGenerate,
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
    use:observeTunnel
  >
    <h2 id="tunnel-title">Put it in a tunnel</h2>

    <!-- The tunnel stage and its seven real presets share this band. -->
    <div class="product-frame band-frame">
      <!-- No {#key}: both demos accept a changing `sequence` prop and swap
           in place, the way SequenceHeroDemo's player deliberately does. -->
      <LazyMount
        loader={() => import("./ComposerTunnelDemo.svelte")}
        active={tunnelActive && tunnelVisible}
        props={{
          sequence: pageSequence.sequence,
          active: tunnelVisible,
          layout: "band",
          onGenerated: carryTunnel,
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
       hide the viewer and show the poster and its note instead. -->
  <section
    class="stop viewer-stop"
    aria-labelledby="viewer-title"
    use:activateViewer
  >
    <h2 id="viewer-title">See it in 3D</h2>

    <!-- The performers carry their own props in 3D, so the row is the word alone. -->
    <ComposerWordRow word={pageSequence.sequence.word ?? ""} />

    <div class="viewer-output">
      <div class="product-frame wide-frame">
        {#if webglChecked && !webglAvailable}
          <div class="viewer-unavailable" role="status">
            <i class="fas fa-cube" aria-hidden="true"></i>
            <p>3D is unavailable in this browser.</p>
          </div>
        {:else}
          <!-- The whole picture is the way in. It grows into the viewer's
               frame, and the hint and cue fade as it lifts. -->
          <button
            type="button"
            class="portal-card"
            disabled={!canShow3D}
            aria-haspopup="dialog"
            aria-label="Enter 3D"
            aria-describedby="viewer-portal-hint"
            onclick={openPortal}
            onpointerenter={warmViewer}
            onfocus={warmViewer}
          >
            <span
              class="portal-window"
              bind:this={portalWindow}
              use:claimedViewTransitionName={{
                name: PORTAL_NAME,
                enabled: cardNamed,
              }}
            >
              <img
                class="portal-picture"
                src={PORTAL_STILL}
                alt=""
                width="2400"
                height="1090"
                loading="lazy"
                decoding="async"
              />
            </span>
            <span
              class="portal-caption"
              use:claimedViewTransitionName={{
                name: PORTAL_CAPTION_NAME,
                enabled: cardNamed,
              }}
            >
              <span id="viewer-portal-hint" class="portal-hint">
                Choose the scene, arrange performers, and explore the camera.
              </span>
              <span class="primary-action portal-cue">
                <i class="fas fa-cube" aria-hidden="true"></i>
                Enter 3D
              </span>
            </span>
          </button>
        {/if}
      </div>
    </div>

    <!-- Small screens cannot run the viewer, so they get the poster the
         portal card shows, plus the reason. -->
    <figure class="small-screen-3d-poster">
      <img
        src={PORTAL_STILL}
        alt="A still from the 3D viewer."
        width="2400"
        height="1090"
        loading="lazy"
        decoding="async"
      />
      <figcaption class="small-screen-3d-note">
        The 3D viewer needs WebGL2 and a screen at least 600px in both
        directions.
      </figcaption>
    </figure>
  </section>

  <section class="keeping" aria-labelledby="keeping-title" use:activateShelf>
    <div class="keeping-intro">
      <div class="keeping-lede">
        <h2 id="keeping-title">Keep this sequence.</h2>
        <p>
          Guests keep three sequences on this device. A full account keeps a
          cloud library and collections.
        </p>
        <div class="keeping-actions">
          <a href="/browse" class="primary-action">Browse the Gallery</a>
        </div>
      </div>
      <!-- The page sequence as the card the app would keep. Rendered from the
           sequence itself, so a hero draw or a fresh build needs no saved
           thumbnail. Its chunk (the card renderer and its QR modules) loads
           when the stop nears, like the gallery, not with the page. The
           preview draws the app's canonical card (staff props), not the
           chosen prop; that is the card the app keeps. -->
      <figure class="keeping-card">
        <div class="keeping-card-art">
          <LazyMount
            loader={() =>
              import("$lib/shared/landing/components/launchpad/ChoreoCardPreview.svelte")}
            active={shelfActive}
            props={{ sequence: pageSequence.sequence }}
            debugName="composer keep card"
          />
        </div>
        <figcaption>{featuredCaption(pageSequence.source)}</figcaption>
      </figure>
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

<!-- The frame leaves a margin of the dimmed page around it, so the visitor
     still sees where they were. The picture from the card covers the stage
     until it is lit. The close button sits outside the frame's name, so it
     fades in where it lands instead of growing with the frame. -->
<BaseModal
  open={viewerOpen && canShow3D}
  onclose={closePortal}
  onclosed={handlePortalClosed}
  animation="morph"
  size="full"
  class="composer-3d-portal"
  labelledBy="composer-3d-dialog-title"
>
  <h2 id="composer-3d-dialog-title" class="sr-only">3D viewer</h2>
  <div
    class="portal-frame"
    bind:this={portalFrame}
    use:claimedViewTransitionName={{ name: PORTAL_NAME, enabled: frameNamed }}
  >
    <div class="portal-stage">
      {#if sceneMounted}
        <LazyMount
          loader={loadViewer}
          active={true}
          props={{
            sequence: pageSequence.sequence,
            fillHeight: true,
            entrance: true,
            railTopOffset: "4.5rem",
            onReveal: revealScene,
          }}
          error={viewerLoadError}
          debugName="composer 3D viewer"
        >
          {#snippet placeholder()}{@render viewerPlaceholder()}{/snippet}
        </LazyMount>
      {/if}
    </div>
    {#if stillShown}
      <div class="portal-still" class:leaving={stillLeaving}>
        <img
          bind:this={portalStill}
          src={PORTAL_STILL}
          alt=""
          width="2400"
          height="1090"
        />
        <span class="portal-loading" aria-hidden="true">
          Loading the 3D viewer…
        </span>
      </div>
    {/if}
  </div>
  <div
    class="portal-close"
    use:claimedViewTransitionName={{
      name: PORTAL_CLOSE_NAME,
      enabled: frameNamed,
    }}
  >
    <SceneChromeButton
      icon="fa-xmark"
      label="Close 3D viewer"
      onclick={closePortal}
    />
  </div>
</BaseModal>

<style>
  /* ===== 3D portal =====
     The card is a window onto the scene, at the shape of the stage it opens.
     On hover its picture leans in, a first step toward the glide the viewer
     opens with. */
  .portal-card {
    --portal-radius: var(--settings-radius-lg, 0.85rem);
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    padding: 0;
    border: 0;
    border-radius: var(--portal-radius);
    background: oklch(0.12 0.02 270);
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .portal-card:disabled {
    cursor: default;
  }

  .portal-card:focus-visible {
    outline: 2px solid var(--theme-accent, #8b8cff);
    outline-offset: 3px;
  }

  .portal-window {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: var(--portal-radius);
    background: oklch(0.12 0.02 270);
  }

  .portal-picture {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform var(--duration-emphasis) var(--ease-out);
  }

  .portal-card:enabled:hover .portal-picture,
  .portal-card:focus-visible .portal-picture {
    transform: scale(1.025);
  }

  /* The hint and cue sit on a shade at the foot of the picture. The shade
     has the card's corners because the morph lifts it out of the card. */
  .portal-caption {
    position: absolute;
    inset: auto 0 0;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.75rem 1.25rem;
    padding: clamp(1rem, 2.4vw, 1.75rem);
    border-end-start-radius: var(--portal-radius);
    border-end-end-radius: var(--portal-radius);
    background: linear-gradient(
      to top,
      oklch(0.08 0.02 270 / 0.88),
      oklch(0.08 0.02 270 / 0.5) 60%,
      transparent
    );
  }

  .portal-hint {
    max-width: 30rem;
    color: oklch(0.9 0.015 270);
    font-size: clamp(1rem, 0.94rem + 0.24vw, 1.18rem);
    line-height: 1.5;
  }

  .portal-card:enabled:hover .portal-cue {
    transform: translateY(-2px);
    box-shadow: 0 1.25rem 3rem oklch(0.38 0.18 278 / 0.4);
  }

  .portal-card:disabled .portal-cue {
    opacity: 0.55;
    box-shadow: none;
  }

  /* The frame stands a gutter in from the window's edges, so a margin of the
     dimmed page stays in view around it, in proportion on a large screen. */
  :global(dialog.base-modal.composer-3d-portal[data-size="full"]) {
    --portal-gutter: clamp(16px, 3vmin, 64px);
    width: calc(100% - 2 * var(--portal-gutter));
    height: calc(100% - 2 * var(--portal-gutter));
    max-width: none;
    max-height: none;
    margin: auto;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    overflow: visible;
  }

  /* Light enough that the page stays recognizable around the frame. */
  :global(dialog.base-modal.composer-3d-portal::backdrop) {
    background: oklch(0.08 0.02 270 / 0.48);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
  }

  /* Child combinators keep this off the dialogs the 3D controls open inside
     the frame (the sequence picker, for one), whose bodies stay blocks. */
  :global(dialog.composer-3d-portal > .modal-content-wrapper > .modal-body) {
    position: relative;
    display: flex;
    flex: 1;
    overflow: visible;
  }

  /* The page behind the frame holds still while it is open, so a scroll on
     the margin cannot carry the stage on to the next section. */
  :global(html:has(dialog.composer-3d-portal[open])) {
    overflow: hidden;
  }

  /* Only the card and the frame travel through the portal. The hero and the
     gallery cards carry transition names of their own, which would lift them
     out of the page picture and draw them undimmed above the backdrop until
     the move ends. Every name on these pages is set inline. */
  :global(
    html.composer-3d-portal-morph
      [style*="view-transition-name"]:not(
        .portal-window,
        .portal-caption,
        .portal-frame,
        .portal-close
      )
  ) {
    view-transition-name: none !important;
  }

  .portal-frame {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid oklch(0.45 0.04 270 / 0.3);
    border-radius: var(--settings-radius-lg, 0.85rem);
    background: oklch(0.12 0.02 270);
  }

  /* Its own stacking context keeps the viewer's controls under the picture
     until the stage is lit. */
  .portal-stage {
    position: absolute;
    inset: 0;
    z-index: 0;
    isolation: isolate;
  }

  .portal-stage .viewer-placeholder,
  .portal-stage .demo-load-error {
    height: 100%;
  }

  .portal-stage .viewer-placeholder {
    display: grid;
    place-items: center;
  }

  .portal-still {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    transition: opacity var(--duration-scene) var(--ease-in-out);
  }

  .portal-still.leaving {
    opacity: 0;
  }

  .portal-still img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Appears only when the stage is slow to arrive. */
  .portal-loading {
    position: absolute;
    left: 50%;
    bottom: 1.25rem;
    translate: -50% 0;
    padding: 0.55rem 1rem;
    border-radius: 999px;
    background: oklch(0.08 0.02 270 / 0.75);
    color: oklch(0.92 0.015 270);
    font-size: var(--font-size-min, 0.875rem);
    white-space: nowrap;
    animation: portal-loading-in var(--duration-normal) var(--ease-out)
      calc(2 * var(--duration-scene)) both;
  }

  @keyframes portal-loading-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* Level with the viewer's control rail, which is lowered to clear it. */
  .portal-close {
    position: absolute;
    top: calc(0.75rem + 1px);
    right: calc(0.75rem + 1px);
    z-index: 2;
  }

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
  .opening :global(.scroll-cue) {
    position: absolute;
    left: 50%;
    bottom: 0.65rem;
    transform: translateX(-50%);
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

  /* The hero's toolbar row is a size container (SequenceHeroDemo). The Theme
     chip shortens first (ComposerBackgroundCycle, under 27rem). In a row too
     narrow for Roll's name beside the two chips (a 1280x720 stage window
     leaves 265px, the 1024x768 plain page 238px) Roll keeps its die and its
     name stays for assistive technology. */
  @container hero-toolbar (max-width: 18.5rem) {
    .roll-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
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
    padding-block: var(--stop-pad, clamp(2.5rem, 4.5vw, 4.5rem));
    --keep-intro-gap: clamp(1.5rem, 2.5vw, 2.5rem);
    /* The gallery's share of the stop. On the stage the intro beside it also
       holds the card, so its budget leaves 14rem more than the lede alone
       needed; without the stage the fallback adds the same 14rem back, so
       the plain page keeps its old height. */
    --composer-gallery-height: clamp(
      360px,
      calc(var(--stop-room, 100dvh + 14rem) - 220px - 14rem),
      480px
    );
  }

  .keeping-intro {
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(18rem, 1.05fr);
    gap: clamp(1.75rem, 4vw, 4rem);
    align-items: start;
    margin-bottom: var(--keep-intro-gap);
  }

  .keeping-lede > p {
    margin: 0;
  }

  /* Full size when the room allows. On the stage the card gives way so the
     intro, its gap and the gallery add up to the stop's room (the 3.25rem is
     the two-line caption); without the stage the fallback room leaves the
     cap in charge. The floor keeps a very short window from erasing the
     card. */
  .keeping-card {
    margin: 0;
    justify-self: end;
    width: min(
      100%,
      18rem,
      max(
        8rem,
        (
            var(--stop-room, 200vh) - var(--composer-gallery-height) -
              var(--keep-intro-gap) - 3.25rem
          ) *
          5 / 7
      )
    );
  }

  /* 5:7 is the card's own 960x1344 ratio; the preview's img already fills
     its box with object-fit: contain, so the box holds the layout while the
     render is in flight. */
  .keeping-card-art {
    aspect-ratio: 5 / 7;
    border-radius: 0.9rem;
    overflow: hidden;
    background: var(--theme-card-bg, oklch(0.2 0.025 270 / 0.75));
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
  }

  .keeping-card figcaption {
    margin-top: 0.6rem;
    color: oklch(0.76 0.014 270);
    font-size: var(--font-size-min, 0.875rem);
    text-align: center;
  }

  .keeping-intro .keeping-actions {
    margin-top: 1.35rem;
  }

  .keeping-shelf {
    container-type: inline-size;
    min-width: 0;
    width: 100%;
    max-width: min(
      900px,
      calc((var(--composer-gallery-height) - 110px) * 2.28 + 80px)
    );
    margin-inline: auto;
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
    /* ComposerWordRow's height on every demo. The stage formulas below
       subtract it, and the row reads the same token. */
    --word-row-h: 3.25rem;
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
    /* On the stage the frames' 34rem floor gives way to the room so a short
       window does not pan Construct and Generate for the floor's sake (a
       720px window leaves 479px); the plain page keeps the floor and
       scrolls. */
    --making-floor: min(34rem, var(--stop-room, 200vh) - var(--stop-head));
  }

  /* The width cap keeps a very tall window (3840 x 2160) from stretching
     a demo into a column of empty space. */
  .stop-frame {
    box-sizing: border-box;
    height: clamp(var(--making-floor), var(--making-fill), 62cqw);
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
    border-radius: var(--settings-radius-lg, 0.85rem);
    background: var(--theme-panel-bg, oklch(0.13 0.025 270 / 0.92));
  }

  /* The builder's option tiles and step cells stop growing at fixed sizes,
     so past the frame it gets in a 1920 x 1080 window more room only reads
     as empty panel. It stops there and sits centered. The generator scales
     its grid and player with its width, so it keeps the whole room. */
  .construct-frame {
    max-width: 108rem;
    height: clamp(var(--making-floor), min(var(--making-fill), 52rem), 62cqw);
    margin-inline: auto;
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
     also fits the room: less the heading, the word row above the square,
     this frame's padding and border, and the notation rail and toolbar under
     the square. Without the stage the 200vh fallback leaves the plain page's
     own sizing in charge. */
  .band-frame {
    max-width: min(100%, 92rem);
    margin-inline: auto;
    --tunnel-stage-size: min(
      46rem,
      62vh,
      var(--stop-room, 200vh) - var(--stop-head) - var(--word-row-h) - 2 *
        var(--frame-pad) - 12.625rem - 2px
    );
  }

  /* On the stage the 16:9 viewer takes the width that lets its height fit
     the room under the heading. */
  .viewer-stop .wide-frame {
    max-width: min(
      100%,
      (
          var(--stop-room, 200vh) - var(--stop-head) - var(--word-row-h) - 2 *
            var(--frame-pad) - 2px
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
  .placeholder-word-row {
    height: var(--word-row-h, 3.25rem);
  }
  .placeholder-notation {
    height: 8.125rem;
    margin-top: 0.75rem;
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

  .small-screen-3d-poster {
    display: none;
    margin: 0;
  }

  .small-screen-3d-poster img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 1rem;
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
  }

  .small-screen-3d-note {
    margin: 1rem 0 0;
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
    height: var(--composer-gallery-height, 36rem);
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

    .keeping-card {
      justify-self: center;
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
    .keeping {
      --composer-gallery-height: 36rem;
    }

    .opening {
      min-height: 0;
    }

    .opening-player {
      --hero-demo-max-width: min(100%, 22rem);
    }

    .opening :global(.scroll-cue) {
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

    .small-screen-3d-poster {
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
    :global(html:has(.composer-page)) {
      scroll-behavior: auto;
    }

    .primary-action,
    .open-app i,
    .demo-load-error button,
    .opening,
    .portal-picture,
    .portal-still {
      transition: none;
    }

    .portal-card:enabled:hover .portal-picture,
    .portal-card:focus-visible .portal-picture {
      transform: none;
    }

    .portal-loading {
      animation: none;
    }
  }
</style>
