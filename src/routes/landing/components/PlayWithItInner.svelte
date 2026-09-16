<!--
  PlayWithItInner.svelte

  The heavy inner component for the Infinite Spinner section. Dynamically
  imported by PlayWithItSection when scrolled into view. Renders the endless
  spinner through the SAME control surface the app uses: AnimatorCanvas plus
  the real AnimationPanel (pill-nav sidebar on desktop, ControlDock bottom bar
  on mobile). No hand-rolled controls — effects, props, effort, display, and
  tempo are all the shared components, scoped to this section via the
  effects-config and animation-visibility contexts.
-->
<script lang="ts">

import { createAnimationPlaybackController } from "$lib/features/compose/services/animation-playback-controller-factory";
import { sequenceTransformer } from "$lib/shared/create/services/sequence-transformer";
  import { onMount, onDestroy } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import AnimationPanel from "$lib/shared/animation-panel/components/AnimationPanel.svelte";
  import { createEndlessPlayback, type EndlessPlaybackState } from "$lib/shared/animation-engine/state/endless-playback-state.svelte";
  import * as propTypeApplier from "$lib/shared/landing/services/prop-type-applier";
  import { EndlessSpinnerOrchestrator } from "$lib/features/landing/services/endless-spinner-orchestrator";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import { startPlacementDeriver as startPlacementDeriverInstance } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
  import { generationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
  import { TrackingMode } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { createAnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";
  import { setAnimationScopeContext } from "$lib/shared/animation-engine/state/animation-scope-context";
  import { setAnimationVisibilityContext } from "$lib/shared/animation-engine/state/animation-visibility-context";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { SequenceViewerVisibilityState } from "$lib/shared/sequence-viewer/state/viewer-visibility-state.svelte";
  import { setViewerVisibilityContext } from "$lib/shared/sequence-viewer/context/viewer-visibility-context";
  import StepStrip from "$lib/shared/timeline/StepStrip.svelte";
  import { buildNotationCells, type NotationCell } from "$lib/shared/timeline/notation-cell";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { foldTrailIntentIntoSettings } from "$lib/shared/effects/translators/canvas2d-translator";
  import { trackDemoInteraction } from "$lib/shared/analytics/landing-events";

  let playback = $state<EndlessPlaybackState | null>(null);
  let animationReady = $state(false);
  let animationError = $state(false);

  // Prop state
  let currentPropType = $state<PropType>(PropType.STAFF);

  // Per-surface animation state: one ephemeral AnimationScope owns this player's
  // visibility, settings, and effects so nothing persists to localStorage and
  // nothing leaks into (or from) the signed-in user's global app settings.
  // The visibility + effects sub-contexts point at the scope's instances so the
  // AnimationPanel sections (Effort/Display/Paths/Effects) drive THIS scope.
  const scope = setAnimationScopeContext(createAnimationScope({ persistence: "ephemeral" }));
  const visibilityManager = setAnimationVisibilityContext(scope.visibility);
  const effectsConfigState = setEffectsConfigContext(scope.effects);
  visibilityManager.effectsConfigState = effectsConfigState;

  // Per-color PROP visibility (the spinning prop + its trail), independent of
  // the path-line chips. Reuses the sequence viewer's exact mechanism:
  // CanvasSurface reads this context and calls engine.setMotionVisibility, and
  // the render loop gates each prop + its trail on it. allowNone=true so a
  // visitor can hide both props (path lines still available) — the landing
  // wants prop existence as its own free variable.
  setViewerVisibilityContext(new SequenceViewerVisibilityState(true));

  // BPM state - local to this landing section
  let bpm = $state(60);

  let isPlaying = $derived(playback?.animationState?.isPlaying ?? false);

  // Trail VISUALS (thickness, brightness, colors) live on the effects config
  // (scope.effects.trails); rendering params (mode, fade, length, tracking) stay
  // on scope.settings.trail. The 2D trail overlay reads only TrailSettings, so
  // fold the effects-config visuals in here — without this, a trail preset patches
  // scope.effects.trails but the renderer keeps reading the untouched settings
  // store. Same fold the Tunnel art view does.
  let trailSettings = $derived(
    foldTrailIntentIntoSettings(scope.settings.trail, effectsConfigState.trails)
  );

  // ── Responsive layout: sidebar panel beside the canvas on wide screens,
  //    ControlDock bottom bar inside the showcase on narrow ones. ─────────────
  let isDesktopLayout = $state(
    typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(min-width: 920px)").matches
  );
  $effect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 920px)");
    const handler = (e: MediaQueryListEvent) => { isDesktopLayout = e.matches; };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  });

  onMount(async () => {
    try {
      scope.settings.setTrackingMode(TrackingMode.BOTH_ENDS);
      // Set landing-page default BPM (60 feels comfortable for visitors)
      scope.settings.setBpm(bpm);

      // Dark mode on for visual impact
      visibilityManager.setDarkMode(true);
      // Trails on by default
      effectsConfigState.setActiveEffect("trails");
      // The mandala guide rides under the props, the same overlay the viewer's
      // Display > Mandala toggle turns on. It crossfades itself whenever the
      // prepared paths change — a sequence swap or a prop swap — so the shape
      // dissolves toward the next one instead of cutting. The Display chip in
      // the panel still lets a visitor turn it off.
      visibilityManager.setVisibility("mandala", true);

      const browseLoader = getBrowseLoader();
      // Pass the scope's visibility manager so prop interpolation (path shape /
      // motion-aware paths) reads from THIS surface's scope — keeps the spinning
      // props on the same path the path-line overlay draws, scoped + ephemeral.
      const pc = createAnimationPlaybackController(scope.visibility);

      const spinnerOrch = new EndlessSpinnerOrchestrator(
        browseLoader as any,
        generationOrchestrator,
        sequenceTransformer as any,
        startPlacementDeriverInstance
      );

      // Noop infinite generator (this surface is library-only)
      const noopInfinite = {
        generateInitial: async () => null,
        generateFromEndState: async () => null,
        getSessionCount: () => 0,
      };

      playback = createEndlessPlayback({
        modes: ["library"],
        defaultMode: "library",
        propType: currentPropType,
        spinnerOrchestrator: spinnerOrch,
        infiniteGenerator: noopInfinite,
        playbackController: pc,
      });

      await playback.initialize();
      animationReady = true;
    } catch (err) {
      console.error("[PlayWithIt] Failed to load animation:", err);
      animationError = true;
    }
  });

  onDestroy(() => {
    playback?.dispose();
  });

  // ── Prop switching (AnimationPanel Props section) ───────────────────────────
  function handlePropChange(newProp: PropType) {
    if (newProp === currentPropType) return;
    // After the no-op guard, so re-picking the prop you're already on doesn't
    // register as a swap. The route id rides along automatically — this player
    // is embedded on /composer, the landing page, and /embed/spinner.
    trackDemoInteraction("change_prop", { prop_type: newProp });
    currentPropType = newProp;
    playback?.setPropType(newProp);

    // Hot-swap prop in the running animation
    const animState = playback?.animationState;
    if (animState?.sequenceData) {
      const updated = propTypeApplier.applyToSequence(
        animState.sequenceData,
        newProp
      );
      animState.setSequenceData(updated);
    }
  }

  // Sequence and prop are independent: any sequence can be done with any prop.
  // Two buttons that each change exactly one of them make that legible in a way
  // a buried prop grid never did — click either one and only that thing moves.
  const PROP_CYCLE: PropType[] = [
    PropType.STAFF,
    PropType.CLUB,
    PropType.FAN,
    PropType.BUUGENG,
    PropType.MINIHOOP,
    PropType.TRIAD,
    PropType.POI,
  ];

  let isSwappingSequence = $state(false);

  function nextSequence() {
    if (!playback || isSwappingSequence) return;
    isSwappingSequence = true;
    trackDemoInteraction("try_another");
    playback.skip();
    // The swap is synchronous into the orchestrator but the mandala crossfade
    // runs on the render loop; hold the button briefly so a double-click can't
    // outrun the fade.
    setTimeout(() => { isSwappingSequence = false; }, 400);
  }

  function nextProp() {
    const at = PROP_CYCLE.indexOf(currentPropType);
    const next = PROP_CYCLE[(at + 1) % PROP_CYCLE.length];
    if (next) handlePropChange(next);
  }

  // ── Play / Pause (AnimationPanel Effects section transport) ─────────────────
  // Three affordances funnel through here: tap-to-toggle on the canvas, the
  // sidebar transport, and the mobile ControlDock. One handler, one event.
  function togglePlayPause() {
    if (!playback?.playbackController) return;
    // `isPlaying` still holds the pre-toggle value here, so send its inverse —
    // the state the visitor is moving INTO is what the metric wants.
    trackDemoInteraction("toggle_play", { is_playing: !isPlaying });
    playback.playbackController.togglePlayback();
  }

  // ── BPM control ─────────────────────────────────────────────────────────────
  function handleBpmChange(newBpm: number) {
    bpm = newBpm;
    scope.settings.setBpm(newBpm);
  }

  let notationCells = $derived<NotationCell[]>(
    buildNotationCells(playback?.animationState?.sequenceData)
  );

  // A repeating word always reads in its smallest form (FΨ, never FΨFΨFΨFΨ),
  // and the endless spinner leans on LOOPs, so this is the common case.
  let currentWord = $derived(
    simplifyRepeatedWord(
      playback?.animationState?.sequenceData?.intendedWord ??
        playback?.animationState?.sequenceData?.word ??
        ""
    )
  );
  let currentPropLabel = $derived(getPropTypeDisplayInfo(currentPropType).label);

</script>

<!-- Beat strip: one definition shared by both layouts. Lives inside the stage
     column on mobile (under the canvas, above the dock) and full-width below
     the stage row on desktop so the whole sequence is visible without scroll. -->
{#snippet stepStripBlock()}
  <!-- The reserve box holds the strip's fixed 124px frame (StepStrip
       viewportHeight) from first paint, so the strip landing after playback
       init never reflows the showcase (no-layout-shift). -->
  <div class="strip-reserve">
    {#if playback?.animationState?.sequenceData && notationCells.length > 0}
      <StepStrip
        cells={notationCells}
        currentStep={playback?.animationState?.currentStep ?? 0}
        {bpm}
        leftPropType={currentPropType}
        rightPropType={currentPropType}
      />
    {/if}
  </div>
{/snippet}

<div class="play-inner">
  <!-- Unified showcase: stage row (canvas + AnimationPanel sidebar on desktop,
       ControlDock bottom bar on mobile) with a full-width beat strip below. -->
  <div class="showcase" class:with-sidebar={isDesktopLayout}>
    <div class="stage-row">
      <div class="stage-column">
        <div class="canvas-area">
          {#if animationReady}
            <div class="canvas-wrapper">
              <AnimatorCanvas
                leftProp={playback?.animationState?.leftPropState ?? null}
                rightProp={playback?.animationState?.rightPropState ?? null}
                gridVisible={true}
                gridMode={playback?.gridMode ?? null}
                letter={playback?.currentLetter ?? null}
                stepData={playback?.currentStepData}
                sequenceData={playback?.animationState?.sequenceData}
                currentStep={playback?.animationState?.currentStep ?? 0}
                isPlaying={isPlaying}
                trailSettings={trailSettings}
                leftPropType={currentPropType}
                rightPropType={currentPropType}
                word={playback?.animationState?.sequenceData?.intendedWord ?? playback?.animationState?.sequenceData?.word ?? null}
                previewDarkMode={true}
                visibilityManagerOverride={visibilityManager}
                effectsConfigState={effectsConfigState}
                onPlaybackToggle={togglePlayPause}
                tapToToggle={true}
                progressLine={true}
              />
            </div>
          {:else if animationError}
            <div class="canvas-placeholder">
              <div class="placeholder-icon">🌀</div>
              <span>Animation preview unavailable</span>
            </div>
          {:else}
            <div class="canvas-placeholder">
              <ProgressRing percent={-1} size={32} strokeWidth={3} />
              <span>Initializing...</span>
            </div>
          {/if}
        </div>

        <!-- The two peer controls. Deliberately equals, side by side: the
             sequence and the prop are independent, so each button moves exactly
             one of them. Labels are static so the row can't reflow; the caption
             below is centred and alone on its line, so its own width changes
             move nothing else. -->
        <div class="swap-controls">
          <div class="swap-buttons">
            <button
              class="swap-btn"
              onclick={nextSequence}
              disabled={!animationReady || isSwappingSequence}
            >
              <i class="fas fa-shuffle" aria-hidden="true"></i>
              <span>Next sequence</span>
            </button>
            <button
              class="swap-btn"
              onclick={nextProp}
              disabled={!animationReady}
            >
              <i class="fas fa-rotate" aria-hidden="true"></i>
              <span>Next prop</span>
            </button>
          </div>
          <p class="swap-caption" aria-live="polite">
            {#if currentWord}<span class="swap-word">{currentWord}</span>
              <span class="swap-sep" aria-hidden="true">·</span>{/if}
            <span class="swap-prop">{currentPropLabel}</span>
          </p>
        </div>

        <!-- Mobile: strip under the canvas, then the ControlDock bottom bar -->
        {#if !isDesktopLayout}
          {@render stepStripBlock()}
          <AnimationPanel
            isExporting={false}
            canvasReady={animationReady}
            layout="bottom"
            {bpm}
            {isPlaying}
            renderMode="2d"
            selectedPropType={currentPropType}
            onPropChange={handlePropChange}
            onBpmChange={handleBpmChange}
            onPlaybackToggle={togglePlayPause}
            showMotionVisibility={true}
          />
        {/if}
      </div>

      {#if isDesktopLayout}
        <div class="panel-slot">
          <AnimationPanel
            isExporting={false}
            canvasReady={animationReady}
            layout="sidebar"
            {bpm}
            {isPlaying}
            renderMode="2d"
            selectedPropType={currentPropType}
            onPropChange={handlePropChange}
            onBpmChange={handleBpmChange}
            onPlaybackToggle={togglePlayPause}
            showMotionVisibility={true}
          />
        </div>
      {/if}
    </div>

    <!-- Desktop: full-width strip spanning canvas + panel below the stage row -->
    {#if isDesktopLayout}
      {@render stepStripBlock()}
    {/if}
  </div>
</div>

<style>
  .play-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    width: 100%;
  }

  /* ── Showcase: framed container ──────────────────────────────────────────── */
  .showcase {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.35);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  /* Desktop: the showcase stays a column so the beat strip can sit full-width
     below the stage row. Scales with the viewport on large/4K displays instead
     of pinning to a narrow cap (the old 1140px left the spinner cramped and
     clipped the props sidebar under .showcase's overflow:hidden). */
  .showcase.with-sidebar {
    max-width: min(1600px, 94vw);
  }
  /* Stage row holds the spinner + the AnimationPanel sidebar side by side.
     On mobile it collapses (display:contents) so the stage column flows
     directly in the showcase's column, preserving the bottom-dock layout. */
  .stage-row {
    display: contents;
  }
  .showcase.with-sidebar .stage-row {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    width: 100%;
  }

  .stage-column {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
  }

  .panel-slot {
    flex: 0 0 380px;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }


  .swap-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.875rem 1rem 0.5rem;
    flex-shrink: 0;
  }

  .swap-buttons {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  /* Sized to its label, never stretched — two short labels must not span the
     showcase. flex-basis stays auto and no width is set. */
  .swap-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    flex: 0 0 auto;
    min-height: 44px;
    padding: 0.6875rem 1.25rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.07);
    color: #e8e6f4;
    font-family: var(--font-body, system-ui, sans-serif);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1),
      background 0.18s ease,
      border-color 0.18s ease;
  }

  .swap-btn:hover:not(:disabled),
  .swap-btn:focus-visible:not(:disabled) {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.3);
    color: #fff;
    outline: none;
  }

  .swap-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .swap-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .swap-btn i {
    font-size: 0.85rem;
    opacity: 0.8;
  }

  /* Centred and alone on its row, so a longer word or prop name re-centres
     without displacing anything. */
  .swap-caption {
    margin: 0;
    min-height: 1.2em;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: var(--font-size-compact, 0.75rem);
    letter-spacing: 0.02em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .swap-word {
    font-family: var(--font-tka, inherit);
    color: rgba(255, 255, 255, 0.72);
  }

  .swap-sep {
    opacity: 0.4;
  }

  @media (min-width: 1680px) {
    .swap-btn {
      font-size: 1rem;
      padding: 0.8125rem 1.5rem;
    }

    .swap-caption {
      font-size: 0.875rem;
    }
  }

  /* Phones: the canvas is the point, so the control block gives back every
     pixel it can. Two equal halves on one row — wrapping to two rows cost the
     spinner ~60px of height at 375. */
  @media (max-width: 600px) {
    .swap-controls {
      padding: 0.5rem 0.75rem 0.375rem;
      gap: 0.3125rem;
    }

    .swap-buttons {
      width: 100%;
      flex-wrap: nowrap;
      gap: 0.5rem;
    }

    .swap-btn {
      flex: 1 1 0;
      min-width: 0;
      padding: 0.625rem 0.5rem;
      font-size: 0.8125rem;
    }
  }

  /* Below the iPhone SE width the icons stop earning their space. */
  @media (max-width: 360px) {
    .swap-btn i {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .swap-btn {
      transition: none;
    }

    .swap-btn:hover:not(:disabled),
    .swap-btn:focus-visible:not(:disabled) {
      transform: none;
    }
  }

  /* StepStrip renders at its fixed 124px viewportHeight; this box owns that
     height even before the sequence lands. */
  .strip-reserve {
    min-height: 124px;
    flex-shrink: 0;
  }

  .canvas-area {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    /* Grow the spinner with the screen: as tall as 70% of the viewport, capped
       so it never gets absurd on ultra-tall displays. The square size also
       drives the showcase width (shrink-to-fit), so a bigger canvas widens the
       full-width beat strip below it too. */
    max-height: min(1100px, 70vh);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Ultrawide: step up with the composer/landing 4K bands — the canvas is
     height-keyed so the whole showcase scales with the screen, and the panel
     widens so it doesn't read skinny beside a ~1500px spinner. Sits AFTER the
     base .panel-slot/.canvas-area rules so it wins by source order. Keep in
     sync with PlayWithItSkeleton (the shared structural placeholder). */
  @media (min-width: 1680px) {
    .showcase.with-sidebar {
      /* Aligns to the composer/landing cinema band cap (175rem == 2800px) so
         the showcase never limits the band; the canvas height cap below is the
         real size governor. */
      max-width: min(2800px, 94vw);
    }
    .canvas-area {
      max-height: min(1500px, 72vh);
    }
    .panel-slot {
      flex: 0 0 440px;
      max-width: 440px;
    }
  }

  .canvas-wrapper {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .canvas-placeholder {
    width: 100%;
    height: 100%;
    min-height: 300px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
  }

  .placeholder-icon {
    font-size: 3rem;
    opacity: 0.4;
  }

  @media (max-width: 600px) {
    /* Full-viewport fit: the showcase fills the height the section gives it, and
       the canvas-area flexes to take whatever the fixed-height beat strip +
       control dock leave — so the whole player lands on one screen. Dropping the
       forced square lets the canvas square to the available height instead of
       being width-locked and pushing the dock off-screen. */
    .play-inner {
      flex: 1 1 auto;
      min-height: 0;
      gap: 10px;
    }

    .showcase {
      flex: 1 1 auto;
      min-height: 0;
      max-width: 100%;
      border-radius: 12px;
    }

    .stage-column {
      min-height: 0;
    }

    .canvas-area {
      aspect-ratio: auto;
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
    }

    /* Absolutely fill the flexed area — a percentage-height chain collapses to 0
       once the square aspect-ratio is gone, so the AnimatorCanvas gets a definite
       box this way and the WebGL canvas actually sizes/renders. */
    .canvas-wrapper {
      position: absolute;
      inset: 0;
    }
  }

</style>
