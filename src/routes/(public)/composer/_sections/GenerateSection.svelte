<!--
  GenerateSection (public Composer toy)

  A self-contained Generate loop: the real six-card recipe generates a real
  sequence, the canonical workspace reveals its pictographs one at a time, and
  the visitor explicitly opens the animation with the workspace Play button.
  During playback, the shared StepStrip follows the live animation step.

  All mutable state belongs to this component. Explicit prop, tempo, effort,
  trail, and visibility inputs prevent account settings from changing the
  animation. Browser-only cards have a same-geometry SSR skeleton, so hydration
  does not move the page.
-->
<script lang="ts">
  import { onDestroy, onMount, setContext, tick } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { browser } from "$app/environment";

  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import { runAfterNamedRouteMorphIdle } from "$lib/shared/transitions/named-route-morph-state.svelte";
  import type { TipEffortMap } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
  import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { calculateGridLayout } from "$lib/shared/create/utils/grid-calculations";
  import {
    HERO_TIP_EFFECT_MAP,
    HERO_TRAIL_PRESET,
  } from "$lib/shared/landing/data/hero-trail-preset";
  import WorkspaceGrid from "$lib/features/create/shared/workspace-panel/sequence-display/components/WorkspaceGrid.svelte";
  import WordLabel from "$lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte";
  import { createStepGridDisplayState } from "$lib/features/create/shared/workspace-panel/sequence-display/state/step-grid-display-state.svelte";
  import { createScrollState } from "$lib/features/create/shared/workspace-panel/sequence-display/state/scroll-state.svelte";
  import { createPanelCoordinationState } from "$lib/shared/create/state/panel-coordination-state.svelte";
  import BackButton from "$lib/features/create/shared/workspace-panel/shared/components/buttons/BackButton.svelte";
  import ViewSequenceButton from "$lib/features/create/shared/workspace-panel/shared/components/buttons/ViewSequenceButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import GhostPointer from "$lib/shared/attract/components/GhostPointer.svelte";
  import {
    createGenerateAttractAct,
    type GenerateAttractAct,
  } from "./generate-attract-act.svelte";

  import {
    DifficultyLevel,
    GenerationMode,
  } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import {
    LOOPType,
    Period,
  } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  import LengthCard from "$lib/features/create/generate/components/cards/LengthCard.svelte";
  import LevelCard from "$lib/features/create/generate/components/cards/LevelCard.svelte";
  import TurnIntensityCard from "$lib/features/create/generate/components/cards/TurnIntensityCard.svelte";
  import GridModeCard from "$lib/features/create/generate/components/cards/GridModeCard.svelte";
  import CustomizeCard from "$lib/features/create/generate/components/cards/CustomizeCard.svelte";
  import type { CustomizeStyleBaseline } from "$lib/features/create/generate/components/cards/customize-summary";
  import ConsolidatedLOOPCard from "$lib/features/create/generate/components/cards/ConsolidatedLOOPCard.svelte";
  import CustomizeDrawer from "$lib/features/create/generate/components/modals/CustomizeDrawer.svelte";
  import LOOPDrawer from "$lib/features/create/generate/components/modals/LOOPDrawer.svelte";

  const DEMO_MIN_LENGTH = 8;
  const DEMO_MAX_LENGTH = 16;
  const DEMO_LENGTH_STEP = 4;
  const STEP_COLUMNS = 4;
  const SIDE_STRIP_MIN_REMAINDER = 220;
  const FALLBACK_WORKSPACE_WIDTH = 620;
  const FALLBACK_WORKSPACE_HEIGHT = 360;
  type CompactView = "recipe" | "result";
  const DEMO_TIP_EFFORT_MAP = {
    "*": { effort: "linear" },
  } satisfies TipEffortMap;
  const demoVisibilityManager = new AnimationVisibilityStateManager({
    ephemeral: true,
  });
  const panelState = createPanelCoordinationState();
  setContext("panelState", panelState);

  // This recipe is local to the toy. The opt-in card overrides keep its length
  // choices at 8, 12, and 16 without consulting the visitor's access tier.
  let length = $state(DEMO_MIN_LENGTH);
  let level = $state<DifficultyLevel>(DifficultyLevel.INTERMEDIATE);
  let turnIntensity = $state(3);
  let gridMode = $state<GridMode>(GridMode.DIAMOND);
  let loopType = $state<LOOPType>(LOOPType.ROTATED);
  let period = $state<Period>(Period.QUARTERED);
  // The toy opens on its own style recipe, not the production defaults. The
  // Customize card measures "changed" against THIS, so an untouched visitor
  // isn't told they made two changes they never made.
  const DEMO_STYLE_BASELINE: CustomizeStyleBaseline = {
    constraintPreset: "smooth",
    handPathMode: "smooth",
    motionTypeFilter: "no-dash",
  };

  let constraintPreset = $state<"smooth" | "mixed" | "choppy">(
    DEMO_STYLE_BASELINE.constraintPreset
  );
  let handPathMode = $state<"smooth" | "mixed" | "choppy">(
    DEMO_STYLE_BASELINE.handPathMode
  );
  let motionTypeFilter = $state<"no-dash" | "prefer-dash" | null>(
    DEMO_STYLE_BASELINE.motionTypeFilter
  );

  function allowedTurnsFor(lvl: DifficultyLevel): number[] {
    switch (lvl) {
      case DifficultyLevel.BEGINNER:
        return [0];
      case DifficultyLevel.INTERMEDIATE:
        return [1, 2, 3];
      case DifficultyLevel.ADVANCED:
        return [0.5, 1, 1.5, 2, 2.5, 3];
      default:
        return [1, 2, 3];
    }
  }
  const allowedTurnValues = $derived(allowedTurnsFor(level));

  function handleLengthChange(value: number) {
    length = value;
  }

  function handleLevelChange(value: DifficultyLevel) {
    level = value;
    const allowed = allowedTurnsFor(value);
    if (allowed.length > 0 && !allowed.includes(turnIntensity)) {
      turnIntensity = allowed.reduce((best, candidate) =>
        Math.abs(candidate - turnIntensity) < Math.abs(best - turnIntensity)
          ? candidate
          : best
      );
    }
  }

  function handleTurnIntensityChange(value: number) {
    turnIntensity = value;
  }

  function handleGridModeChange(value: GridMode) {
    gridMode = value;
  }

  function handleLOOPTypeChange(value: LOOPType) {
    loopType = value;
    period = value === LOOPType.ROTATED ? Period.QUARTERED : Period.HALVED;
  }

  function handleMotionTypeFilterChange(
    value: "no-dash" | "mixed" | "prefer-dash"
  ) {
    motionTypeFilter = value === "mixed" ? null : value;
  }

  // The workspace owns its own reveal and scroll state. It never subscribes to
  // the Create module's global generation events or workspace context.
  const workspaceDisplayState = createStepGridDisplayState();
  const workspaceScrollState = createScrollState();
  let workspaceFrameEl = $state<HTMLElement | null>(null);
  let workspaceWidth = $state(0);
  let workspaceHeight = $state(0);
  let playerStageWidth = $state(0);
  let playerStageHeight = $state(0);

  let current = $state<SequenceData | null>(null);
  let generating = $state(false);
  let revealing = $state(false);
  let generationError = $state<string | null>(null);
  let playing = $state(false);
  let playingStepNumber = $state<number | null>(null);
  let reportedStep = $state(0);
  let reportedSequenceId = $state<string | null>(null);
  let compactView = $state<CompactView>("recipe");
  const compactDemoQuery =
    typeof window === "undefined"
      ? null
      : new MediaQuery("(max-width: 74.99rem)");
  const isCompactDemo = $derived(compactDemoQuery?.current ?? false);
  const compactViewOptions = [
    {
      value: "recipe" as const,
      label: "Recipe",
      id: "generate-recipe-tab",
      controls: "generate-recipe-panel",
    },
    {
      value: "result" as const,
      label: "Result",
      id: "generate-result-tab",
      controls: "generate-result-panel",
    },
  ];
  let mounted = false;
  let generationRun = 0;

  const startPlacement = $derived(
    current?.startPlacement ?? current?.startingPlacement ?? null
  );
  const gridLayout = $derived.by(() => {
    const raw = calculateGridLayout(
      current?.steps.length ?? 0,
      workspaceWidth || FALLBACK_WORKSPACE_WIDTH,
      workspaceHeight || FALLBACK_WORKSPACE_HEIGHT,
      null,
      { manualColumnCount: STEP_COLUMNS }
    );
    const availableHeight = (workspaceHeight || FALLBACK_WORKSPACE_HEIGHT) - 40;
    const maxCellSize = Math.max(40, Math.floor(availableHeight / raw.rows));
    return { ...raw, cellSize: Math.min(raw.cellSize, maxCellSize) };
  });
  const notationStep = $derived(
    reportedSequenceId === (current?.id ?? null) ? reportedStep : 0
  );
  const useSideStrip = $derived(
    (playerStageWidth || workspaceWidth || FALLBACK_WORKSPACE_WIDTH) -
      (playerStageHeight || workspaceHeight || FALLBACK_WORKSPACE_HEIGHT) >=
      SIDE_STRIP_MIN_REMAINDER
  );
  const animationSquareSize = $derived(
    playerStageHeight || workspaceHeight || FALLBACK_WORKSPACE_HEIGHT
  );

  let playerToggle: (() => void) | null = null;

  function showSequence() {
    playing = false;
    playingStepNumber = null;
    reportedStep = 0;
    reportedSequenceId = null;
    playerToggle = null;
  }

  function playCurrent() {
    if (!current || generating || revealing) return;
    playing = true;
  }

  function dispatchWorkspaceEvent(event: CustomEvent) {
    workspaceFrameEl?.dispatchEvent(event);
  }

  function handlePlayerStepChange(
    currentStep: number,
    sequenceId: string | null
  ) {
    reportedStep = currentStep;
    reportedSequenceId = sequenceId;
    playingStepNumber = currentStep > 0 ? Math.floor(currentStep) : null;
  }

  function delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  async function generate(revealResult = false) {
    if (generating || !mounted) return;
    const run = ++generationRun;
    const isCurrentRun = () => mounted && generationRun === run;
    generating = true;
    revealing = false;
    generationError = null;
    showSequence();

    try {
      let generationOrchestrator: (typeof import("$lib/shared/create/services/generation-orchestrator"))["generationOrchestrator"];
      try {
        ({ generationOrchestrator } =
          await import("$lib/shared/create/services/generation-orchestrator"));
      } catch (error) {
        if (isCurrentRun())
          generationError = "The generator did not load. Try again.";
        console.error(
          "[composer generate] generator module failed to load",
          error
        );
        return;
      }

      let sequence: SequenceData;
      try {
        sequence = await generationOrchestrator.generateSequence({
          mode: GenerationMode.CIRCULAR,
          loopType,
          period,
          length,
          turnIntensity,
          gridMode,
          propType: PropType.STAFF,
          difficulty: level,
          constraintPreset,
          handPathMode,
          motionTypeFilter,
        });
      } catch (error) {
        if (isCurrentRun()) {
          generationError =
            "That recipe did not produce a sequence. Adjust it or try again.";
        }
        console.error("[composer generate] sequence generation failed", error);
        return;
      }

      if (!isCurrentRun()) return;
      const next = JSON.parse(JSON.stringify(sequence)) as SequenceData;

      try {
        if (current) {
          workspaceDisplayState.handleClearSequence();
          await delay(workspaceDisplayState.animationTiming.clearDuration);
          if (!isCurrentRun()) return;
        }

        workspaceDisplayState.prepareSequenceAnimation(
          next.steps.length,
          "sequential"
        );
        current = next;
        generationError = null;
        revealing = true;
        if (revealResult && isCompactDemo) compactView = "result";

        await tick();
        if (!isCurrentRun()) return;
        await workspaceDisplayState.triggerSequentialAnimation(
          next.steps,
          dispatchWorkspaceEvent
        );
      } catch (error) {
        if (isCurrentRun()) {
          generationError =
            "The sequence is ready, but its preview did not finish. Try again.";
        }
        console.error("[composer generate] workspace preview failed", error);
      }
    } finally {
      if (isCurrentRun()) {
        revealing = false;
        generating = false;
      }
    }
  }

  // Same pause, park, and resume lifecycle as the Construct wing. The ghost
  // manipulates the real controls, waits for the reveal, then presses Play.
  let bandEl = $state<HTMLElement | null>(null);
  let act: GenerateAttractAct | null = $state(null);
  let tookOver = $state(false);
  let io: IntersectionObserver | null = null;

  function takeover(event?: Event) {
    if ((event?.target as HTMLElement | null)?.closest?.(".ghost")) return;
    if (act && !act.dead && !act.paused) {
      act.pause();
      tookOver = true;
    }
  }

  function resumeDemo() {
    if (act && !act.dead) {
      act.resume();
      tookOver = false;
    }
  }

  onMount(() => {
    mounted = true;
    const cancelSeed = runAfterNamedRouteMorphIdle(() => void generate(), {
      timeout: 3000,
      fallbackDelay: 400,
    });

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (!reduced && !isCompactDemo && bandEl) {
      act = createGenerateAttractAct({
        getRoot: () => bandEl,
        togglePlayback: () => playerToggle?.(),
      });
      io = new IntersectionObserver(
        (entries) => {
          const visible = entries.some((entry) => entry.isIntersecting);
          act?.setVisible(visible);
          if (visible) act?.start();
        },
        { threshold: 0.25 }
      );
      io.observe(bandEl);
    }

    return () => {
      mounted = false;
      generationRun += 1;
      cancelSeed();
    };
  });

  $effect(() => {
    if (!isCompactDemo || !act) return;
    act.kill();
    act = null;
    io?.disconnect();
    io = null;
    tookOver = false;
  });

  onDestroy(() => {
    workspaceDisplayState.cleanupAnimation();
    act?.kill();
    io?.disconnect();
  });
</script>

{#snippet lengthCard()}
  <div class="card-cell">
    <LengthCard
      currentLength={length}
      currentMode={GenerationMode.CIRCULAR}
      loopEnabled={true}
      minOverride={DEMO_MIN_LENGTH}
      maxOverride={DEMO_MAX_LENGTH}
      stepOverride={DEMO_LENGTH_STEP}
      onLengthChange={handleLengthChange}
    />
  </div>
{/snippet}

{#snippet levelCard()}
  <div class="card-cell">
    <LevelCard
      currentLevel={level}
      brightBackgroundOverride={false}
      onLevelChange={handleLevelChange}
    />
  </div>
{/snippet}

{#snippet gridCard()}
  <div class="card-cell">
    <GridModeCard currentMode={gridMode} onModeChange={handleGridModeChange} />
  </div>
{/snippet}

{#snippet turnsCard()}
  {#if level !== DifficultyLevel.BEGINNER}
    <div class="card-cell">
      <TurnIntensityCard
        currentIntensity={turnIntensity}
        allowedValues={allowedTurnValues}
        brightBackgroundOverride={false}
        onIntensityChange={handleTurnIntensityChange}
      />
    </div>
  {/if}
{/snippet}

{#snippet customizeCard()}
  <div class="card-cell">
    <CustomizeCard
      {constraintPreset}
      {handPathMode}
      {motionTypeFilter}
      {gridMode}
      isFreeformMode={false}
      styleBaseline={DEMO_STYLE_BASELINE}
      onConstraintPresetChange={(value) => (constraintPreset = value)}
      onHandPathModeChange={(value) => (handPathMode = value)}
      onMotionTypeFilterChange={handleMotionTypeFilterChange}
    />
  </div>
{/snippet}

{#snippet loopCard()}
  <div
    class="card-cell loop-cell"
    class:wide-loop={level === DifficultyLevel.BEGINNER}
  >
    <ConsolidatedLOOPCard
      loopEnabled={true}
      currentLOOPType={loopType}
      {period}
      onLOOPTypeChange={handleLOOPTypeChange}
    />
  </div>
{/snippet}

{#snippet playerPlaceholder()}
  <div class="player-placeholder" aria-hidden="true">
    <i class="fas fa-circle-notch fa-spin"></i>
  </div>
{/snippet}

{#snippet playerLoadError(_error: unknown, retry: () => void)}
  <div class="embedded-load-error" role="alert">
    <span>The animation did not load.</span>
    <button type="button" onclick={retry}>Try again</button>
  </div>
{/snippet}

{#snippet stripLoadError(_error: unknown, retry: () => void)}
  <div class="embedded-load-error strip-error" role="alert">
    <span>The pictograph strip did not load.</span>
    <button type="button" onclick={retry}>Try again</button>
  </div>
{/snippet}

<section
  class="generate-section"
  class:compact-demo={isCompactDemo}
  bind:this={bandEl}
  onpointerdowncapture={takeover}
  onfocusincapture={takeover}
>
  <div class="demo-shell">
    {#if browser}
      {#if isCompactDemo}
        <div class="compact-view-switch">
          <SegmentedControl
            options={compactViewOptions}
            value={compactView}
            onchange={(view) => (compactView = view)}
            color="accent"
            size="sm"
            semantics="tabs"
            ariaLabel="Generate demo view"
          />
        </div>
      {/if}

      <div class="demo-grid" class:compact-layout={isCompactDemo}>
        <div
          class="result-col"
          id={isCompactDemo ? "generate-result-panel" : undefined}
          role={isCompactDemo ? "tabpanel" : undefined}
          aria-labelledby={isCompactDemo ? "generate-result-tab" : undefined}
          hidden={isCompactDemo && compactView !== "result"}
        >
          <div class="sequence-card">
            <header
              class="sequence-heading word-label-area"
              aria-live={tookOver ? "polite" : "off"}
            >
              {#if current}
                <WordLabel
                  word={current.word}
                  activeStepNumber={playing ? playingStepNumber : null}
                />
              {:else}
                <p class="stage-hint">
                  {generating
                    ? "Building your sequence..."
                    : "Choose a recipe, then generate."}
                </p>
              {/if}
            </header>

            <div class="visual-stage">
              {#if playing && current}
                <div
                  class="player-stage"
                  data-demo-stage
                  bind:clientWidth={playerStageWidth}
                  bind:clientHeight={playerStageHeight}
                >
                  <div
                    class="playback-layout"
                    class:side-strip={useSideStrip}
                    class:bottom-strip={!useSideStrip}
                    style:--animation-square-size="{animationSquareSize}px"
                  >
                    <div class="animation-stage">
                      {#key current.id}
                        <LazyMount
                          loader={() =>
                            import("$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte")}
                          active={true}
                          props={{
                            sequence: current,
                            autoPlay: true,
                            chrome: "minimal",
                            fill: true,
                            scrubbable: true,
                            leftPropType: PropType.STAFF,
                            rightPropType: PropType.STAFF,
                            externalBpm: 60,
                            trailSettingsOverride: HERO_TRAIL_PRESET,
                            tipEffectMap: HERO_TIP_EFFECT_MAP,
                            tipEffortMap: DEMO_TIP_EFFORT_MAP,
                            visibilityManagerOverride: demoVisibilityManager,
                            onStepChange: handlePlayerStepChange,
                            onTogglePlaybackRef: (fn: () => void) =>
                              (playerToggle = fn),
                          }}
                          placeholder={playerPlaceholder}
                          error={playerLoadError}
                        />
                      {/key}
                    </div>

                    <div
                      class="playback-strip"
                      role="group"
                      aria-label="Playback pictographs"
                    >
                      <LazyMount
                        loader={() =>
                          import("$lib/shared/timeline/StepStrip.svelte")}
                        active={true}
                        props={{
                          sequence: current,
                          currentStep: notationStep,
                          bpm: 60,
                          density: "compact",
                          fillHeight: true,
                          anchor: "center",
                          orientation: "horizontal",
                          loop: true,
                          stepPulse: false,
                          leftPropType: PropType.STAFF,
                          rightPropType: PropType.STAFF,
                        }}
                        error={stripLoadError}
                      />
                    </div>
                  </div>
                </div>
              {:else}
                <div
                  class="workspace-frame"
                  data-demo-workspace
                  bind:this={workspaceFrameEl}
                  bind:clientWidth={workspaceWidth}
                  bind:clientHeight={workspaceHeight}
                >
                  {#if current}
                    <WorkspaceGrid
                      steps={current.steps}
                      {startPlacement}
                      {gridLayout}
                      displayState={workspaceDisplayState}
                      scrollState={workspaceScrollState}
                      getStepKey={(step, index) =>
                        step.id ?? `${current?.id ?? "generated"}-${index}`}
                      getDurationDisplay={(stepIndex) => String(stepIndex + 1)}
                      leftPropTypeOverride={PropType.STAFF}
                      rightPropTypeOverride={PropType.STAFF}
                      sequenceWord={current.word}
                    />
                  {:else}
                    <div class="workspace-empty" aria-hidden="true">
                      <i class="fas fa-wand-magic-sparkles"></i>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            <div class="workspace-action">
              {#if playing}
                <BackButton onclick={showSequence} />
              {:else if current && !generating && !revealing}
                <span data-demo-play>
                  <ViewSequenceButton purpose="play" onclick={playCurrent} />
                </span>
              {:else}
                <span class="action-placeholder" aria-hidden="true"></span>
              {/if}
            </div>
          </div>
        </div>

        <div
          class="controls"
          id={isCompactDemo ? "generate-recipe-panel" : undefined}
          role={isCompactDemo ? "tabpanel" : undefined}
          aria-labelledby={isCompactDemo ? "generate-recipe-tab" : undefined}
          hidden={isCompactDemo && compactView !== "recipe"}
        >
          {#if isCompactDemo}
            <div class="compact-core-grid">
              {@render lengthCard()}
              {@render levelCard()}
              {@render turnsCard()}
              {@render loopCard()}
            </div>

            <details class="more-settings">
              <summary>More settings</summary>
              <div class="compact-advanced-grid">
                {@render gridCard()}
                {@render customizeCard()}
              </div>
            </details>
          {:else}
            <div class="card-grid">
              {@render lengthCard()}
              {@render levelCard()}
              {@render gridCard()}
              {@render turnsCard()}
              {@render customizeCard()}
              {@render loopCard()}
            </div>
          {/if}

          <div class="generate-action">
            <button
              type="button"
              class="generate-button"
              onclick={() => void generate(true)}
              disabled={generating}
            >
              <i
                class="fas {generating ? 'fa-circle-notch fa-spin' : 'fa-dice'}"
                aria-hidden="true"
              ></i>
              <span>{generating ? "Generating..." : "Generate"}</span>
            </button>
            <span
              class="retry-note"
              class:shown={!!generationError}
              aria-live="polite"
            >
              {generationError ?? ""}
            </span>
          </div>
        </div>
      </div>
    {:else}
      <div class="demo-grid" aria-hidden="true">
        <div class="result-col">
          <div class="sequence-card">
            <div class="sequence-heading skeleton-line"></div>
            <div class="visual-stage skeleton"></div>
            <div class="workspace-action">
              <span class="action-placeholder"></span>
            </div>
          </div>
        </div>
        <div class="controls">
          <div class="card-grid">
            <div class="card-cell skeleton"></div>
            <div class="card-cell skeleton"></div>
            <div class="card-cell skeleton"></div>
            <div class="card-cell skeleton"></div>
            <div class="card-cell skeleton"></div>
            <div class="card-cell skeleton"></div>
          </div>
          <div class="generate-action">
            <div class="generate-button skeleton-button"></div>
            <span class="retry-note">&nbsp;</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  {#if act}
    <GhostPointer
      x={act.ghost.x}
      y={act.ghost.y}
      pressed={act.ghost.pressed}
      visible={act.ghost.visible}
      parked={act.ghost.parked}
      onResume={resumeDemo}
    />
  {/if}
</section>

{#if browser}
  <LOOPDrawer
    isOpen={panelState.isLOOPPanelOpen}
    currentType={panelState.loopCurrentType}
    selectedComponents={panelState.loopSelectedComponents}
    onChange={panelState.loopOnChange}
    onClose={() => panelState.closeLOOPPanel()}
  />
  <CustomizeDrawer
    isOpen={panelState.isCustomizeOverlayOpen}
    overlayProps={panelState.customizeOverlayProps}
    onClose={() => panelState.closeCustomizeOverlay()}
  />
{/if}

<style>
  .generate-section {
    container-type: inline-size;
    position: relative;
    width: 100%;
    margin-inline: auto;
    color: var(--theme-text, oklch(0.9 0.02 270));
  }

  .demo-shell {
    width: 100%;
    max-width: var(--shell-w, min(1280px, 92vw));
    margin-inline: auto;
    padding: clamp(16px, 2.2cqw, 28px);
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 24px;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(16, 16, 26, 0.55)) 85%,
      transparent
    );
  }

  /* The compact demo is a single stage with two related views. This keeps the
     recipe beside its action and the generated sequence beside its player,
     while preserving one shared state model underneath both tabs. */
  .compact-demo .demo-shell {
    padding: 12px;
    border-radius: 20px;
  }

  .compact-view-switch {
    width: min(100%, 28rem);
    margin: 0 auto 12px;
  }

  .compact-view-switch :global(.segmented-control) {
    width: 100%;
  }

  .demo-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.18fr) minmax(320px, 0.82fr);
    gap: clamp(1.2rem, 2.2cqw, 2rem);
    align-items: center;
    width: 100%;
  }

  .demo-grid.compact-layout {
    display: block;
    min-height: 30rem;
  }

  .demo-grid.compact-layout > [hidden] {
    display: none;
  }

  .compact-layout > .result-col,
  .compact-layout > .controls {
    min-height: 30rem;
  }

  .result-col,
  .controls {
    min-width: 0;
  }

  .sequence-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: clamp(12px, 1.5cqw, 20px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 20px;
    background: color-mix(
      in srgb,
      var(--theme-card-bg, rgba(12, 12, 20, 0.8)) 88%,
      transparent
    );
    box-shadow: 0 18px 48px var(--theme-shadow, rgba(0, 0, 0, 0.24));
  }

  .sequence-heading {
    min-height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    --text-color: var(--theme-text, #fff);
  }

  .stage-hint {
    margin: 0;
    text-align: center;
    font-size: clamp(0.9rem, 0.86rem + 0.12cqw, 1rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
  }

  .visual-stage,
  .workspace-frame,
  .player-stage {
    height: clamp(300px, 30cqw, 390px);
    min-width: 0;
    min-height: 0;
  }

  .visual-stage {
    position: relative;
    overflow: hidden;
    border: 1px solid
      color-mix(in srgb, var(--theme-stroke, #fff) 70%, transparent);
    border-radius: 16px;
    background: var(--dm-pictograph-bg, oklch(0.12 0.018 270));
  }

  .workspace-frame {
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 100%;
  }

  .player-stage {
    width: 100%;
    background: oklch(0.12 0.018 270);
  }

  .playback-layout {
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .playback-layout.side-strip {
    grid-template-columns:
      minmax(0, var(--animation-square-size))
      minmax(0, 1fr);
  }

  .playback-layout.bottom-strip {
    grid-template-rows: minmax(0, 1fr) 4.75rem;
  }

  .animation-stage,
  .playback-strip {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .animation-stage {
    display: grid;
    place-items: center;
  }

  .side-strip .animation-stage {
    width: var(--animation-square-size);
    height: var(--animation-square-size);
  }

  .bottom-strip .animation-stage {
    justify-self: center;
    height: 100%;
    aspect-ratio: 1;
  }

  .playback-strip {
    background: color-mix(
      in srgb,
      var(--theme-card-bg, oklch(0.13 0.018 270)) 72%,
      transparent
    );
  }

  .side-strip .playback-strip {
    align-self: center;
    height: clamp(6rem, 32%, 8rem);
    border: 1px solid
      color-mix(in srgb, var(--theme-stroke, #fff) 70%, transparent);
    border-left: none;
    border-radius: 0 12px 12px 0;
  }

  .bottom-strip .playback-strip {
    border-top: 1px solid
      color-mix(in srgb, var(--theme-stroke, #fff) 70%, transparent);
  }

  .player-placeholder,
  .workspace-empty {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
  }

  .embedded-load-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    padding: 1rem;
    color: var(--theme-text, oklch(0.9 0.02 270));
    text-align: center;
    background: color-mix(
      in srgb,
      var(--theme-card-bg, oklch(0.13 0.018 270)) 88%,
      transparent
    );
  }

  .embedded-load-error button {
    min-height: var(--min-touch-target, 44px);
    padding-inline: 0.9rem;
    color: inherit;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
    border-radius: 9px;
    background: color-mix(
      in srgb,
      var(--theme-card-bg-hover, oklch(0.25 0.04 270)) 85%,
      transparent
    );
  }

  .strip-error {
    flex-direction: row;
    flex-wrap: wrap;
    font-size: var(--font-size-min, 0.875rem);
  }

  .workspace-empty i {
    font-size: clamp(2rem, 4cqw, 3.4rem);
  }

  .workspace-action {
    min-height: 52px;
    display: grid;
    place-items: center;
  }

  .action-placeholder {
    display: block;
    width: var(--min-touch-target, 48px);
    height: var(--min-touch-target, 48px);
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  .card-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .compact-core-grid,
  .compact-advanced-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .card-cell {
    flex: 1 1 calc((100% - 1.5rem) / 3);
    min-width: 140px;
    height: clamp(118px, 10cqw, 148px);
    min-height: 0;
  }

  .compact-core-grid .card-cell,
  .compact-advanced-grid .card-cell {
    min-width: 0;
    height: 7.5rem;
  }

  .compact-core-grid .wide-loop {
    grid-column: 1 / -1;
  }

  .more-settings {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    background: color-mix(
      in srgb,
      var(--theme-card-bg, rgba(12, 12, 20, 0.8)) 66%,
      transparent
    );
  }

  .more-settings summary {
    min-height: var(--min-touch-target, 48px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-inline: 1rem;
    color: var(--theme-text, #fff);
    font-weight: 650;
    cursor: pointer;
    list-style: none;
  }

  .more-settings summary::-webkit-details-marker {
    display: none;
  }

  .more-settings summary::after {
    content: "+";
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: 1.25rem;
    font-weight: 450;
  }

  .more-settings[open] summary::after {
    content: "−";
  }

  .compact-advanced-grid {
    padding: 0 0.75rem 0.75rem;
  }

  /* Most cards set their own height:100%, but the LOOP card's outer wrapper
     doesn't — in the app it gets its size from the card grid's equivalent
     rule, and without a match here it collapsed to 2px and spilled its label
     over the panel. */
  .card-cell > :global(*) {
    height: 100%;
    min-height: 0;
    min-width: 0;
  }

  .generate-action {
    min-height: 74px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .generate-button {
    min-height: var(--min-touch-target, 48px);
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0 1.8rem;
    border: none;
    border-radius: 13px;
    color: #fff;
    background: linear-gradient(135deg, #ec4899, #8b5cf6);
    box-shadow: 0 14px 32px oklch(0.5 0.2 340 / 0.35);
    font-family: inherit;
    font-size: clamp(1.02rem, 0.97rem + 0.12cqw, 1.18rem);
    font-weight: 650;
    cursor: pointer;
    transition:
      transform 160ms ease,
      box-shadow 160ms ease,
      opacity 160ms ease;
  }

  .generate-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 20px 44px oklch(0.5 0.2 340 / 0.5);
  }

  .generate-button:focus-visible {
    outline: 2px solid var(--theme-accent, #ec4899);
    outline-offset: 3px;
  }

  .generate-button:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .retry-note {
    visibility: hidden;
    min-height: 1.25em;
    font-size: clamp(0.82rem, 0.78rem + 0.1cqw, 0.95rem);
    font-style: italic;
    color: var(--theme-text-dim, oklch(0.65 0.02 270));
  }

  .retry-note.shown {
    visibility: visible;
  }

  .generate-section :global(.ghost-hover) {
    filter: brightness(1.2);
  }

  .generate-section :global(button.ghost-hover) {
    scale: 1.04;
  }

  .skeleton {
    border-radius: 16px;
    background: oklch(0.2 0.02 270 / 0.5);
  }

  .skeleton-line {
    width: min(55%, 220px);
    height: 20px;
    min-height: 20px;
    margin: 16px auto;
    border-radius: 999px;
    background: oklch(0.25 0.02 270 / 0.55);
  }

  .skeleton-button {
    width: 12rem;
    box-shadow: none;
    opacity: 0.5;
  }

  @container (max-width: 720px) {
    .demo-grid {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .controls {
      order: -1;
    }

    .visual-stage,
    .workspace-frame,
    .player-stage {
      height: clamp(280px, 78cqw, 390px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .generate-section :global(.fa-spin) {
      animation: none !important;
    }

    .generate-button {
      transition: none;
    }

    .generate-button:hover:not(:disabled) {
      transform: none;
    }
  }
</style>
