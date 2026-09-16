<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import type { SourceMode } from "$lib/shared/animation-engine/domain/chaining-types";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { TrackingMode } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { createAnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";
  import { setAnimationScopeContext } from "$lib/shared/animation-engine/state/animation-scope-context";
  import { setAnimationVisibilityContext } from "$lib/shared/animation-engine/state/animation-visibility-context";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import StepGrid from "$lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  // Mode toggle and infinite generation
  import type {
    SpinnerMode,
    GeneratedSequenceInfo,
  } from "$lib/features/landing/domain/models/spinner-models";
  import SpinnerModeToggle from "$lib/features/landing/components/SpinnerModeToggle.svelte";

  import Crossfade from "$lib/shared/components/Crossfade.svelte";

  // Local extracted components and services
  import SpinnerControls from "./components/SpinnerControls.svelte";
  import SpinnerHistoryPanel from "./components/SpinnerHistoryPanel.svelte";
  import SpinnerNowPlaying from "./components/SpinnerNowPlaying.svelte";
  import SpinnerStepLane from "./components/SpinnerStepLane.svelte";
  import {
    createSpinnerSession,
    type SpinnerSession,
  } from "./services/create-spinner-session";

  // Page-scoped animation state: an ephemeral AnimationScope owns this route's
  // visibility, settings, and effects, so the immersive defaults set below
  // (dark mode, both-ends tracking) never write into the signed-in user's
  // persisted app settings — and nothing another surface persisted leaks in.
  const scope = setAnimationScopeContext(
    createAnimationScope({ persistence: "ephemeral" })
  );
  const visibilityManager = setAnimationVisibilityContext(scope.visibility);
  const effectsConfigState = setEffectsConfigContext(scope.effects);
  visibilityManager.effectsConfigState = effectsConfigState;

  // Factory state
  let session = $state<SpinnerSession | null>(null);
  let playback = $derived(session?.playback ?? null);
  let animationReady = $state(false);
  let animationError = $state(false);

  // UI state
  let viewMode = $state<"strip" | "grid">("strip");

  // Side-by-side tiers size the square canvas hero from the stage row's height,
  // so the card is exactly its (square) content and the notation column gets
  // every remaining pixel of the band. CSS can't express that: aspect-ratio
  // needs a definite height to transfer a width from, and neither a grid `auto`
  // track nor a flex item's basis provides one before main-size resolution
  // (both measured collapsing the card to ~2px). Measuring is exact and cannot
  // loop — the row's height is the column's leftover and never depends on the
  // canvas's width.
  let stageHeight = $state(0);

  // The read-ahead lane's cell size, derived from the pane box. The pane's size
  // always comes from layout (a foot clamp when stacked, the column's leftover
  // when side-by-side) and never from the cell, so measuring it cannot loop.
  let paneWidth = $state(0);
  let paneHeight = $state(0);
  let rootFontPx = $state(16);
  $effect(() => {
    const read = () => {
      rootFontPx =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  });

  // Tall side-by-side tiers run the lane VERTICALLY so it fills the column
  // beside the stage. Everything else runs it as a horizontal foot — including
  // the short-horizontal (folded-phone landscape) tier, whose notation column is
  // wide and only ~150px tall, where a vertical rail would show 66px cells.
  // Same seam the CSS uses, so the strip's geometry matches the box it is given.
  let laneVertical = $state(false);
  $effect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function")
      return;
    const mq = window.matchMedia(
      "(min-width: 1050px) and (min-height: 601px), (min-width: 601px) and (min-height: 601px) and (orientation: landscape)"
    );
    laneVertical = mq.matches;
    const on = () => (laneVertical = mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  });

  // Horizontal-foot cell size (the vertical rail ignores it and derives its own
  // from the column). ~4.5 cells across, capped by the pane's height via
  // StepStrip's own geometry (1.32 hero scale + 3px frame border + 26px
  // headroom) so the lane always fits its box, and by 10rem so it rides the root
  // ramp without the foot's focus cell growing to rival the hero — at 12rem
  // across 3 cells it reached 256px beside a 295px canvas on tablet.
  // Grid view sizing for this route's pane shapes.
  //
  // Columns: the tall rail column fits exactly two step columns beside
  // StepGrid's start column. Everywhere else StepGrid's own choice is right.
  // (Asking for more than 4 in a sub-650px pane is pointless — it caps there.)
  let gridColumnCount = $derived(laneVertical ? 2 : null);

  // Any pane under StepGrid's 650px "narrow container" threshold must be
  // width-sized and allowed to scroll. Left to fit its rows into the pane's
  // height instead, it crushes cells to 44px on the folded-landscape pane
  // (588×204) and 40px on a phone foot, then centres the shrunken grid in a
  // pool of empty pane. A row threshold of 1 forces the width path.
  let gridWidthSized = $derived(paneWidth > 0 && paneWidth < 650);

  let laneCellSize = $derived(
    Math.max(
      48,
      Math.round(
        Math.min(
          10 * rootFontPx,
          (paneWidth || 320) / 4.5 - 6,
          ((paneHeight || 180) - 29) / 1.32
        )
      )
    )
  );

  // A sequence's word IS its letter string. Library sequences carry it, but
  // generated ones ship with an empty/whitespace word — so fall back to
  // joining the step letters (dash letters like "W-" already include their
  // dash), then simplify repeats. Without this, the canvas word header
  // reserved space and drew nothing in Infinite mode.
  let displayWord = $derived.by(() => {
    const seq = playback?.currentSequence;
    if (!seq) return "";
    const raw =
      seq.word?.trim() ||
      seq.name?.trim() ||
      (seq.steps ?? []).map((s) => s.letter ?? "").join("");
    return simplifyRepeatedWord(raw);
  });
  let showHistory = $state(false);

  let spinnerMode = $state<SpinnerMode>("infinite");
  let currentGeneratedInfo = $state<GeneratedSequenceInfo | null>(null);

  let modeRevision = 0;

  // Derived
  let currentStepNumber = $derived(
    Math.floor(playback?.animationState?.currentStep ?? 0)
  );

  // One number that changes every time a fresh sequence lands — skip, natural
  // chain-over, or a history replay. Everything that should visibly react to
  // "new sequence" keys off this: the chips row, the notation pane, and the
  // canvas pulse.
  let swapKey = $derived(playback?.sequenceSwapCount ?? 0);
  $effect(() => {
    const swapCount = playback?.sequenceSwapCount ?? 0;
    const currentSequence = playback?.currentSequence ?? null;

    if (swapCount === 0 || !currentSequence) return;

    currentGeneratedInfo =
      spinnerMode === "infinite" && session
        ? session.infiniteGenerator.getInfoForSequence(currentSequence)
        : null;
  });

  onMount(async () => {
    try {
      scope.settings.setTrackingMode(TrackingMode.BOTH_ENDS);
      visibilityManager.setDarkMode(true);

      session = createSpinnerSession(scope);

      await session.playback.initialize();
      // A resolved initialize with no sequence is still a failed boot — the
      // canvas would sit empty behind live-looking controls. Show the error
      // state (with retry) instead of marking the page ready.
      if (session.playback.currentSequence) {
        animationReady = true;
      } else {
        animationError = true;
      }
    } catch (err) {
      console.error("Initialization failed:", err);
      animationError = true;
    }
  });

  onDestroy(() => {
    modeRevision++;
    playback?.dispose();
  });

  async function handleModeChange(newMode: SpinnerMode) {
    if (!playback) return;

    const revision = ++modeRevision;
    const previousMode = spinnerMode;
    spinnerMode = newMode;

    try {
      await playback.setSourceMode(newMode as SourceMode);
    } catch (error) {
      if (revision !== modeRevision) return;

      spinnerMode = previousMode;
      const failure = error instanceof Error ? error : new Error(String(error));
      getErrorHandler().showUserError({
        message: t("landing_spinner_source_error"),
        technicalDetails: failure.message,
        error: failure,
        severity: "error",
        context: {
          module: "endless-spinner",
          action: "changeSequenceSource",
        },
      });

      try {
        await playback.setSourceMode(previousMode as SourceMode);
      } catch (recoveryError) {
        console.error(
          "Failed to restore the previous spinner mode:",
          recoveryError
        );
      }
      return;
    }

    if (revision !== modeRevision) return;

    // Reset generated info when switching to library mode
    if (newMode === "library") {
      currentGeneratedInfo = null;
    }
  }

  function handleSkip() {
    playback?.skip();
  }

  function handleTogglePause() {
    playback?.playbackController?.togglePlayback();
  }

  function handleProgressBarSeek(targetStep: number) {
    playback?.animationState?.setCurrentStep(targetStep);
  }

  async function handleRetry() {
    animationError = false;
    animationReady = false;
    try {
      if (playback) {
        await playback.initialize();
        if (playback.currentSequence) {
          animationReady = true;
        } else {
          animationError = true;
        }
      } else {
        animationError = true;
      }
    } catch {
      animationError = true;
    }
  }

  function replayHistoryEntry(index: number) {
    const entry = playback?.history[index];
    if (entry) playback?.hotSwapSequence(entry.sequence);
  }
</script>

<svelte:head>
  <title>Endless Spinner | The Kinetic Alphabet</title>
  <meta
    name="description"
    content="Watch TKA LOOPs chain endlessly, generated on the spot or drawn from the library."
  />
</svelte:head>

<div class="page endless-spinner-page">
  <!-- Ambient background -->
  <div class="ambient-bg"></div>

  <!-- Main content -->
  <div class="content">
    <!-- The page is deliberately chrome-less (an immersive stage), but the
         footer and FAQ link the public here, so those visitors need one
         obvious way back into the site. -->
    <a class="home-link" href="/">← {t("landing_spinner_home")}</a>

    <!-- Header -->
    <header class="header">
      <h1 class="title">{t("landing_spinner_title")}</h1>
      <p class="subtitle">{t("landing_spinner_subtitle")}</p>

      <!-- Mode toggle -->
      <div class="mode-toggle-container">
        <SpinnerModeToggle mode={spinnerMode} onModeChange={handleModeChange} />
      </div>
    </header>

    <!-- Screen reader announcements -->
    <div class="sr-only" aria-live="polite" aria-atomic="true">
      {#if playback?.currentSequence}
        {t("landing_spinner_now_playing", {
          word: displayWord,
        })}
      {/if}
    </div>

    <!-- Animation showcase -->
    <main class="showcase">
      <!-- Animation area. The chips row lives INSIDE it so the wide tier can
           place it at the top of the notation column (side-by-side), while the
           stacked tiers keep it as the first row above the canvas. -->
      <div
        class="animation-area"
        class:strip-view={viewMode === "strip"}
        class:grid-view={viewMode === "grid"}
        bind:clientHeight={stageHeight}
        style="--stage-h: {stageHeight}px"
      >
        <div class="canvas-container">
          {#if animationReady}
            <AnimatorCanvas
              leftProp={playback?.animationState?.leftPropState ?? null}
              rightProp={playback?.animationState?.rightPropState ?? null}
              gridVisible={true}
              gridMode={playback?.gridMode ?? null}
              letter={playback?.currentLetter ?? null}
              stepData={playback?.currentStepData ?? null}
              sequenceData={playback?.animationState?.sequenceData}
              currentStep={playback?.animationState?.currentStep ?? 0}
              isPlaying={playback?.animationState?.isPlaying ?? false}
              trailSettings={scope.settings.trail}
              visibilityManagerOverride={visibilityManager}
              {effectsConfigState}
              leftPropType={PropType.STAFF}
              rightPropType={PropType.STAFF}
              word={displayWord}
              progressBarVariant="minimal"
              hideProgressBar={true}
              previewDarkMode={true}
              tapToToggle={true}
              onPlaybackToggle={handleTogglePause}
              onProgressBarSeek={handleProgressBarSeek}
            />
          {:else if animationError}
            <div class="state-message error" role="alert">
              <span class="icon" aria-hidden="true">!</span>
              <span>{t("landing_spinner_load_error")}</span>
              <button type="button" class="retry-btn" onclick={handleRetry}>
                {t("landing_spinner_try_again")}
              </button>
            </div>
          {:else}
            <div class="state-message loading">
              <div class="loading-spinner"></div>
              <span>{t("landing_spinner_loading")}</span>
            </div>
          {/if}

          <!-- One-shot accent flash when a fresh sequence lands. The #key
               remounts the overlay so the animation replays per swap; the
               > 1 guard keeps the boot sequence from pulsing. Absolutely
               positioned: it can never move the layout. -->
          {#if animationReady && swapKey > 1}
            {#key swapKey}
              <div class="swap-pulse" aria-hidden="true"></div>
            {/key}
          {/if}
        </div>

        <!-- Notation column: identity chips over the lane. Grouped so the wide
             tier can stack them beside a full-height canvas; dissolves back to
             the page flow (display: contents) in the stacked tiers. -->
        <div class="notation-col">
          <!-- Current sequence identity -->
          <div class="mode-info">
            <Crossfade key={`${spinnerMode}:${swapKey}`} fill>
              <div class="mode-info-layer">
                <SpinnerNowPlaying
                  sequence={playback?.currentSequence ?? null}
                  generatedInfo={spinnerMode === "infinite"
                    ? currentGeneratedInfo
                    : null}
                />
              </div>
            </Crossfade>
          </div>

          {#if playback?.animationState?.sequenceData}
            <div
              class="playback-pane"
              bind:clientWidth={paneWidth}
              bind:clientHeight={paneHeight}
            >
              <!-- Keyed on the view AND the sequence: toggling views and a
                   fresh sequence landing both read as one clean reel swap
                   instead of cells silently repainting in place. -->
              <Crossfade key={`${viewMode}:${swapKey}`} fill>
                {#if viewMode === "strip"}
                  <div class="strip-layer">
                    <SpinnerStepLane
                      sequence={playback.animationState.sequenceData}
                      currentStep={playback.animationState.currentStep}
                      bpm={scope.settings.bpm}
                      cellSize={laneCellSize}
                      orientation={laneVertical ? "vertical" : "horizontal"}
                      anchor={laneVertical ? "start" : "center"}
                      onSeek={handleProgressBarSeek}
                    />
                  </div>
                {:else}
                  <!-- Columns and sizing are chosen per pane shape — see
                       gridColumnCount / gridWidthSized. -->
                  <div class="grid-layer themed-scrollbar">
                    <StepGrid
                      steps={playback.animationState.sequenceData.steps}
                      startPlacement={playback.derivedStartPlacement}
                      selectedStepNumber={currentStepNumber}
                      manualColumnCount={gridColumnCount}
                      heightSizingRowThreshold={gridWidthSized ? 1 : undefined}
                    />
                  </div>
                {/if}
              </Crossfade>
            </div>
          {/if}

          <div class="transport-bar">
            <SpinnerControls
              isPlaying={playback?.animationState?.isPlaying ?? false}
              {animationReady}
              {viewMode}
              {showHistory}
              onToggleView={() =>
                (viewMode = viewMode === "grid" ? "strip" : "grid")}
              onTogglePause={handleTogglePause}
              onSkip={handleSkip}
              onToggleHistory={() => (showHistory = !showHistory)}
            />
          </div>
        </div>
      </div>

      {#if showHistory}
        <SpinnerHistoryPanel
          entries={playback?.history ?? []}
          onReplayEntry={replayHistoryEntry}
        />
      {/if}
    </main>

  </div>
</div>

<style>
  /* The site-wide continuous 4K ramp (src/app.css) is scoped to the marketing
     and legal shells, which this standalone route never mounts. Opt in with the
     identical 1680→3840 formula so every rem measure on the page scales in
     lockstep and 2560px is never an unscaled seam (4k-native-layout.md). */
  @media (min-width: 1680px) {
    :global(html:has(.endless-spinner-page)) {
      font-size: clamp(16px, calc(16px + (100vw - 1680px) * 8 / 2160), 24px);
    }
  }

  .page {
    min-height: 100vh;
    min-height: 100dvh;
    background: #030308;
    color: #fff;
    font-family: var(--font-body, system-ui, -apple-system, sans-serif);
    position: relative;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .ambient-bg {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(
        ellipse 80% 50% at 50% 0%,
        color-mix(in srgb, var(--theme-accent, #6366f1) 15%, transparent),
        transparent
      ),
      radial-gradient(
        ellipse 60% 40% at 80% 100%,
        color-mix(in srgb, var(--semantic-success, #22c55e) 10%, transparent),
        transparent
      ),
      radial-gradient(
        ellipse 50% 30% at 20% 80%,
        rgba(236, 72, 153, 0.08),
        transparent
      );
    pointer-events: none;
  }

  .content {
    position: relative;
    width: min(calc(100% - clamp(2rem, 5vw, 6rem)), var(--shell-w, 108rem));
    margin: 0 auto;
    padding: clamp(1.25rem, 3dvh, 3rem) 0;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .home-link {
    position: absolute;
    top: clamp(1rem, 2dvh, 1.5rem);
    left: 0;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 0.875rem;
    box-sizing: border-box;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 0.875rem);
    text-decoration: none;
    transition: all var(--duration-normal);
  }

  .home-link:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
  }

  .home-link:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Header */
  .header {
    text-align: center;
    margin-bottom: clamp(1rem, 2.5dvh, 2rem);
  }

  .title {
    margin: 0;
    font-size: clamp(2rem, 3vw, 3.5rem);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.05;
    background: linear-gradient(135deg, #fff 0%, rgba(255, 255, 255, 0.7) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    margin: 0.625rem 0 0;
    font-size: var(--font-size-min, 0.875rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.56));
    font-weight: 400;
  }

  .mode-toggle-container {
    margin-top: 1rem;
  }

  /* Showcase */
  .showcase {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: clamp(0.75rem, 1.4vw, 1.5rem);
    width: 100%;
    padding: clamp(0.75rem, 1.4vw, 1.5rem);
    box-sizing: border-box;
    background: var(--theme-panel-bg, rgba(8, 8, 18, 0.86));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: clamp(1rem, 1.5vw, 1.75rem);
    box-shadow:
      0 1.5rem 5rem rgba(0, 0, 0, 0.32),
      0 0 0 1px rgba(99, 102, 241, 0.04);
  }

  /* Fixed-height stage keeps sequence and mode swaps from moving the canvas
     and controls below. The Crossfade fills this box. */
  .mode-info {
    height: 3.5rem;
    padding: 0 1rem;
    box-sizing: border-box;
  }

  .mode-info-layer {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Base (stacked: phones + tablet portrait). Both wrappers dissolve so the
     rows land directly in the showcase column (order set on children). */
  .animation-area,
  .notation-col {
    display: contents;
  }

  .mode-info {
    order: 0;
  }

  .canvas-container {
    order: 1;
    align-self: center;
  }

  .playback-pane {
    order: 2;
    width: 100%;
    min-width: 0;
  }

  .transport-bar {
    order: 3;
  }

  .showcase > :global(.history-panel) {
    order: 4;
  }

  .strip-layer,
  .grid-layer {
    height: 100%;
    box-sizing: border-box;
  }

  .grid-layer {
    overflow-y: auto;
    padding: clamp(0.5rem, 0.8vw, 0.875rem);
    /* Short sequences center in the tall pane; `safe` keeps the top of a
       LONG grid reachable when it overflows into scroll instead. */
    display: flex;
    flex-direction: column;
    justify-content: safe center;
  }

  /* Stacked strip foot: a definite band under the canvas. The lane sizes its
     cells to fit this box (see laneCellSize), rather than the box being sized
     from the cells — that direction is what keeps the measurement loop-free. */
  .animation-area.strip-view .playback-pane {
    height: clamp(8rem, 22dvh, 15rem);
    border-radius: clamp(0.625rem, 0.9vw, 1rem);
    overflow: hidden;
  }

  .strip-layer {
    height: 100%;
    display: flex;
    align-items: center;
  }

  /* Tablet portrait: the stacked column must fit canvas + strip foot +
     transport in ONE viewport, so the canvas width is derived from the
     height budget left over after the fixed chrome (header, chips row,
     strip foot, transport, gaps ≈ 36rem). */
  @media (min-width: 601px) and (max-width: 1049px) and (min-height: 601px) and (orientation: portrait) {
    /* Tablet PORTRAIT only — the min-height keeps folded-phone landscape
       (short-horizontal tier) out of this block, and the orientation guard
       keeps landscape mid-size windows (e.g. ~900×780) on the side-by-side
       composition instead of a shrunken stacked column.

       The stacked column must fit canvas + chips + lane foot + transport in ONE
       viewport, so the square canvas is sized from the height the fixed chrome
       leaves (~42rem: header, chips row, lane foot, transport, gaps, padding).

       It has to be a definite square, not `flex: 1` with a transferred width:
       flexing the card's height collapsed AnimatorCanvas's own content box to
       0×0 (measured — the stage rendered empty). Both views share the value, so
       toggling views never resizes the stage. */
    .animation-area .canvas-container {
      width: min(100%, 42rem, max(16rem, calc(100dvh - 42rem)));
    }

    /* The notation pane gets what the budget leaves, scrolling inside
       itself — the transport must stay in the first viewport. (.showcase
       prefix outranks the base grid-view height, which follows this block
       in source order.) */
    .showcase .animation-area.grid-view .playback-pane {
      height: clamp(11rem, 20dvh, 16rem);
    }
  }

  /* Stacked grid pane. 62dvh left a 16-step grid (~244px tall on a phone)
     floating in a 414px box with ~85px of empty pane above and below it; 40dvh
     is about what the card field actually occupies. It stays a definite height
     because the Crossfade between views fills it. */
  .animation-area.grid-view .playback-pane {
    height: clamp(11rem, 40dvh, 22rem);
  }

  .canvas-container {
    position: relative;
    width: min(100%, 42rem);
    /* AnimatorCanvas lays its content out as a SQUARE (measured: a 727×585 card
       held 568×568 of content, wasting 159px of card width). Matching the card
       to the content is what removes that pool. */
    aspect-ratio: 1 / 1;
    justify-self: center;
    min-width: 0;
    overflow: hidden;
    background: #05050b;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: clamp(0.875rem, 1.2vw, 1.5rem);
    box-shadow:
      0 1rem 3rem rgba(0, 0, 0, 0.36),
      0 0 5rem rgba(99, 102, 241, 0.08);
  }

  .transport-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 0.25rem;
    box-sizing: border-box;
  }

  .state-message {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .state-message.error {
    /* Error token lightened toward white for legibility on the dark stage. */
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 65%, white);
  }

  .state-message .icon {
    width: 3rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 700;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    border-radius: 50%;
  }

  .loading-spinner {
    width: 2.5rem;
    height: 2.5rem;
    border: 0.1875rem solid rgba(255, 255, 255, 0.1);
    border-top-color: var(--theme-accent, #6366f1);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Retry button */
  .retry-btn {
    margin-top: 0.5rem;
    padding: 0.625rem 1.25rem;
    min-height: var(--min-touch-target, 44px);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 20%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
    border-radius: 0.5rem;
    color: var(--theme-accent-text, #a5b4fc);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .retry-btn:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 30%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 60%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent-text, #a5b4fc) 70%, white);
  }

  .retry-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Screen reader only */
  .sr-only {
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

  /* The "fresh sequence" beat: an accent frame blooms on the stage and
     settles as the new reel crossfades in beside it. Inner glow only — the
     card clips overflow, so an outer shadow would never show. */
  .swap-pulse {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    border-radius: inherit;
    opacity: 0;
    border: 2px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 85%, white);
    box-shadow: inset 0 0 3.5rem
      color-mix(in srgb, var(--theme-accent, #6366f1) 32%, transparent);
    animation: swap-pulse 640ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  @keyframes swap-pulse {
    0% {
      opacity: 0;
      transform: scale(1.02);
    }
    18% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .swap-pulse {
      animation: none;
    }
  }

  /* Responsive */
  @media (min-width: 1050px), (min-width: 601px) and (min-height: 601px) and (orientation: landscape) {
    /* Side-by-side composition. Fires on real desktops (≥1050) AND on
       landscape mid-size windows (601–1049 wide but wider than tall, e.g. a
       ~900×780 restored window) — a stacked column there shrinks the canvas
       into a pool of side margin. Matches the laneVertical matchMedia seam. */
    /* Compact product header: the stage owns the fold, so the title stops
       being a 10rem centered stack. Home pill stays absolute at the left, so
       the title band is inset past it. */
    .header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        "title mode"
        "subtitle mode";
      align-items: center;
      column-gap: 2rem;
      padding-left: 8.5rem;
      margin-bottom: clamp(0.75rem, 1.6dvh, 1.25rem);
      text-align: left;
    }

    .title {
      grid-area: title;
      font-size: clamp(1.75rem, 2.1vw, 2.5rem);
    }

    .subtitle {
      grid-area: subtitle;
      margin-top: 0.25rem;
    }

    .mode-toggle-container {
      grid-area: mode;
      margin-top: 0;
    }

    /* Wide: the canvas is a square hero at the full stage height; the notation
       column takes everything the band has left, stacking chips over the lane.

           ┌────────────┬──────────────┐
           │            │  chips       │
           │   canvas   ├──────────────┤
           │            │  lane / grid │
           └────────────┴──────────────┘
                    transport

       Flex, not grid: the hero's width is TRANSFERRED from its stretched height
       by aspect-ratio, and a grid `auto` track resolves that contribution to
       ~0 (measured: the card overflowed 250px past the panel). Flex sizes it
       correctly. */
    .animation-area {
      display: flex;
      align-items: stretch;
      /* The pair centres as a unit; surplus band width becomes page margin
         around two TIGHT surfaces instead of dead framing inside the card. */
      justify-content: center;
      gap: clamp(0.75rem, 1.4vw, 1.5rem);
      width: 100%;
      min-width: 0;
      flex: 1 1 auto;
      min-height: 24rem;
      /* Shared geometry. The card's width takes whichever constraint binds:
         the row height (normal desktops) or the width left beside the rail
         (landscape mid-size windows). Its height then FOLLOWS the width, so
         the drawing fills the card exactly in both regimes — AnimatorCanvas
         draws a square capped by (card height − ~53px word-header band).
         Both dimensions stay definite: an auto height here collapses
         AnimatorCanvas's content box to 0×0 (measured, twice now). cqw, not
         %, for the row width: a % inside the shared var would re-resolve
         against the container HEIGHT when used in the height calc. */
      container-type: inline-size;
      --rail-w: clamp(
        20rem,
        calc((var(--stage-h, 40rem) - 9.5rem) * 0.5),
        46rem
      );
      --card-w: min(
        calc(var(--stage-h, 40rem) - 53px),
        calc(100cqw - var(--rail-w) - clamp(0.75rem, 1.4vw, 1.5rem))
      );
    }

    .canvas-container {
      order: 0;
      flex: 0 0 auto;
      align-self: center;
      width: var(--card-w);
      height: calc(var(--card-w) + 53px);
      min-width: 0;
      aspect-ratio: auto;
    }

    /* Three anchored rows own this column — identity at the top, notation in
       the middle, controls at the foot. That is what keeps the column from
       reading as one short lane adrift in a tall void: the shared StepStrip
       pins its focus cell to half its container height, so a lane stretched to
       a 775px column is 50% air by construction. */
    /* One pane width has to serve both views — the hero's width is the band
       minus this column, so a per-view width would slide the hero on a view
       switch. Sized for the rail, which is the default view: a vertical
       StepStrip sizes its cell to min(colW/1.32, colH/3.4), so a column much
       wider than ~0.4 × its own height can only centre a thin ribbon of cells.

       Widening it to suit grid view instead (41rem, StepGrid's narrow-container
       threshold) was tried and looked worse everywhere: the rail ended up
       marooned between two ~200px bands of bare panel and the hero lost 54px.
       Grid view adapts to this column instead — see its props in the markup. */
    .notation-col {
      display: flex;
      flex-direction: column;
      /* Chips pin to the hero's top edge, controls to its bottom. Also keeps the
         controls in place during a mode switch, when the pane unmounts for a beat
         while the next sequence resolves — otherwise they jump up and back. */
      justify-content: space-between;
      flex: 0 0 var(--rail-w);
      min-width: 0;
      min-height: 0;
      gap: clamp(0.5rem, 0.9vw, 1rem);
    }

    .mode-info {
      order: 0;
      flex: 0 0 auto;
      /* Left-aligned against the lane it labels. Centred over a 900px column
         reads as two chips marooned in a void. */
      padding: 0;
    }

    .mode-info-layer {
      justify-content: flex-start;
    }

    .transport-bar {
      order: 0;
      flex: 0 0 auto;
    }

    /* Both views fill the column: the vertical rail runs its full height, and
       grid view lays out a 2D card field. Match the base tier's 3-class
       specificity, or the stacked strip foot's height wins here.  */
    .showcase .animation-area.strip-view .playback-pane,
    .showcase .animation-area.grid-view .playback-pane {
      order: 0;
      flex: 1 1 auto;
      height: auto;
      min-height: 0;
      border-radius: clamp(0.75rem, 1vw, 1.25rem);
    }

    /* Both panes are real surfaces here — a full-height rail and a scrolling
       card field. Framing them makes the stage row read as two side-by-side
       surfaces with no gap between them. */
    .playback-pane {
      border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
      border-radius: clamp(0.75rem, 1vw, 1.25rem);
      overflow: hidden;
      background: rgba(0, 0, 0, 0.18);
    }

    /* Side-by-side column: the strip fills the pane's full height again
       (the base tier's auto height is the stacked-foot behavior only —
       left as auto here, the fill-height StepStrip collapses to nothing). */
    .strip-layer {
      height: 100%;
    }
  }

  @media (max-width: 600px) {
    /* Everything below is budgeted so the phone NEVER scrolls: the stage, the
       lane and the docked transport all fit one viewport. The canvas absorbs
       whatever the fixed chrome leaves (see its height calc), so the budget only
       has to be spent honestly — every rem reclaimed here is canvas. */
    .content {
      width: calc(100% - 1rem);
      /* No bottom padding: the transport is fixed, and .showcase already
         reserves the dock's height as its own padding-bottom. */
      padding: 0.875rem 0 0;
    }

    .header {
      margin-bottom: 0.5rem;
    }

    /* Compact pill so it clears the centered title on narrow phones. */
    .home-link {
      top: 0.25rem;
      padding: 0.375rem 0.625rem;
      font-size: var(--font-size-compact, 0.75rem);
    }

    .title {
      font-size: 1.5rem;
    }

    /* Dropped, not shrunk: every pixel the header gives back is a pixel of the
       read-ahead lane visible above the docked transport, and the title plus the
       chips row already say what this page is. */
    .subtitle {
      display: none;
    }

    .mode-toggle-container {
      margin-top: 0.5rem;
    }

    /* Hug the chips. The row is a fixed-height Crossfade stage sized for the
       worst case, and at 2.5rem a single ~22px pill sat in a 40px band with a
       12px gap under it — 52px of the viewport for one small indicator, which is
       the height the stage should be getting. */
    .mode-info {
      height: 1.75rem;
      padding-inline: 0.25rem;
    }

    .showcase {
      gap: 0.5rem;
      padding: 0.625rem;
      /* Reserves the fixed dock's height (plus a little) so the lane ends just
         above it rather than under it. */
      padding-bottom: 5rem;
      border-radius: 1rem;
    }

    /* Stacked strip foot: exactly the band the cells the pane's WIDTH allows
       (~69px) need, so it is neither cramped nor padded with empty air. */
    .animation-area.strip-view .playback-pane {
      height: clamp(6.5rem, 18dvh, 12rem);
    }

    .canvas-container {
      width: 100vw;
      margin-inline: calc(50% - 50vw);
      /* The stage takes the height the rest of the phone layout leaves, capped
         at 4:5 of the width so it never gets gangly on a tall phone. An explicit
         height (not flex) — AnimatorCanvas collapses its content to 0×0 if its
         card's height comes from the flex line rather than a definite value.

         The 23.5rem reserve is this tier's measured chrome: content padding,
         header + margin, showcase padding + gaps, chips row, lane foot, and the
         dock's reservation. Short phones shrink the stage instead of scrolling. */
      height: min(80vw, calc(100dvh - 23.5rem));
      aspect-ratio: auto;
      border-radius: 0;
      border-inline: none;
    }

    /* With the transport docked, the in-flow history panel would open below
       the fold where nobody sees it — on phones it becomes a bottom sheet
       layered above the dock instead. */
    .showcase > :global(.history-panel) {
      position: fixed;
      left: 0.5rem;
      right: 0.5rem;
      width: auto; /* the component's own width:100% would overflow the inset */
      bottom: calc(5rem + env(safe-area-inset-bottom));
      z-index: 6;
      max-height: 48dvh;
      /* Opaque: the sheet floats over the live canvas here, and the shared
         panel's translucent card token lets the animation bleed through. */
      background: #0a0a14;
      box-shadow: 0 -0.5rem 2rem rgba(0, 0, 0, 0.5);
    }

    .transport-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 5;
      padding: 0.5rem max(0.75rem, env(safe-area-inset-left))
        calc(0.5rem + env(safe-area-inset-bottom))
        max(0.75rem, env(safe-area-inset-right));
      background: color-mix(in srgb, #05050b 88%, transparent);
      backdrop-filter: blur(12px);
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    }

  }

  @media (min-width: 700px) and (max-height: 600px) {
    .content {
      width: calc(100% - 1.5rem);
      padding-block: 0.5rem;
    }

    .header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        "title mode"
        "subtitle mode";
      align-items: center;
      column-gap: 1.5rem;
      margin-bottom: 0.5rem;
      /* Clears the absolute Home pill, which sits left of the left-aligned
         title in this tier. */
      padding-left: 6.75rem;
      text-align: left;
    }

    .home-link {
      top: 0.5rem;
    }

    .title {
      grid-area: title;
      font-size: 1.5rem;
    }

    .subtitle {
      grid-area: subtitle;
      margin-top: 0.2rem;
      font-size: var(--font-size-compact, 0.75rem);
    }

    .mode-toggle-container {
      grid-area: mode;
      margin-top: 0;
    }

    .showcase {
      gap: 0.5rem;
      padding: 0.5rem;
      border-radius: 0.875rem;
    }

    .mode-info {
      height: 2.25rem;
    }

    /* Short-horizontal: side-by-side is mandatory — stacking dies at 412px tall.
       Same flex row as the wide tier (chips over lane over controls beside a
       square hero), but the lane stays HORIZONTAL: this notation column is wide
       and only ~150px tall, where a vertical rail would show 66px cells. */
    .animation-area {
      display: flex;
      align-items: stretch;
      width: 100%;
      min-width: 0;
      /* Flex, not a dvh clamp: the clamp under-filled the panel and left a
         ~40px band of empty surface under the transport. */
      flex: 1 1 auto;
      min-height: 12rem;
      gap: 0.625rem;
    }

    .canvas-container {
      order: 0;
      flex: 0 0 auto;
      align-self: stretch;
      /* Height-bound, minus the word-header band so the drawing fills the
         card's width exactly (no side framing); the notation column gets the
         rest of a very wide, very short stage. */
      width: calc(var(--stage-h, 14rem) - 53px);
      max-width: 45%;
      height: auto;
      aspect-ratio: auto;
    }

    .notation-col {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      gap: 0.375rem;
    }

    .mode-info {
      order: 0;
      flex: 0 0 auto;
      padding: 0;
    }

    .mode-info-layer {
      justify-content: flex-start;
    }

    .transport-bar {
      order: 0;
      flex: 0 0 auto;
    }

    .showcase .animation-area.strip-view .playback-pane,
    .showcase .animation-area.grid-view .playback-pane {
      order: 0;
      flex: 1 1 auto;
      height: auto;
      min-height: 0;
      border-radius: 0.625rem;
    }

    .playback-pane {
      border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
      overflow: hidden;
      background: rgba(0, 0, 0, 0.18);
    }

    .strip-layer {
      height: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-spinner {
      animation: none;
    }
  }
</style>
