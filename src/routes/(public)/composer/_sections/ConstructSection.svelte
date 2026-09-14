<!--
  ConstructSection.svelte — live construct demo for the composer-wings TEST page.
  Spec: docs/superpowers/specs/2026-07-19-construct-attract-demo-design.md

  Toolbar strip (prop picker + turns picker) above two panes, like the real
  Create tab: the REAL WorkspaceGrid (start position in its own column, steps
  flowing beside it — the canonical workspace layout) beside the REAL
  StartPositionPicker / OptionPicker. Building ends in a PLAY phase: the right
  pane swaps to the real AnimationPlayer and the workspace highlights the
  currently-playing step via the canonical selection mechanism.

  While nobody touches it, the Construct Attract Act builds a random valid walk
  on loop with a ghost pointer — including pressing Play and letting the
  sequence animate — and the first real pointerdown or focusin kills the act
  for the visit. Reduced motion: no act, no ghost, plain interactive.

  Prop policy: this surface pins its own prop via the canonical-five PropPicker
  (staff default) and passes leftPropTypeOverride/rightPropTypeOverride down the
  whole chain — the user's global prop setting (which may be poi) never reaches
  this demo. Poi is deliberately impossible here. Turns policy is the same
  move: the demo pins its available turn values via per-hand pickers (left/right) and
  passes leftTurnsOverride/rightTurnsOverride, so the user's sticky Create-tab
  turns (localStorage) never leak in. Every visible demo value stays at or
  below 1.5 turns, so the public examples do not imply a higher ceiling.

  Fully self-contained — owns its own local $state and deliberately does NOT
  touch the shared create-tutorial singleton, so this preview can never collide
  with a real build in progress. Marketing-demo surface, not shipping chrome.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { createSimplifiedStartPositionState } from "$lib/shared/create/state/start-position-state.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { pictographDataToStepData } from "$lib/shared/pictograph/shared/domain/utils/step-pictograph-conversion";
  import { calculateGridLayout } from "$lib/shared/create/utils/grid-calculations";
  import WorkspaceGrid from "$lib/features/create/shared/workspace-panel/sequence-display/components/WorkspaceGrid.svelte";
  import StepGrid from "$lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte";
  import { createStepGridDisplayState } from "$lib/features/create/shared/workspace-panel/sequence-display/state/step-grid-display-state.svelte";
  import { createScrollState } from "$lib/features/create/shared/workspace-panel/sequence-display/state/scroll-state.svelte";
  import WordLabel from "$lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte";
  import ViewSequenceButton from "$lib/features/create/shared/workspace-panel/shared/components/buttons/ViewSequenceButton.svelte";
  import HorizontalTransportRow from "$lib/shared/sequence-viewer/components/HorizontalTransportRow.svelte";
  import ClearSequenceButton from "$lib/features/create/shared/workspace-panel/shared/components/buttons/ClearSequenceButton.svelte";
  import UndoGlyph from "$lib/features/create/shared/workspace-panel/shared/components/buttons/UndoGlyph.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { slide } from "svelte/transition";
  import PropPicker from "$lib/features/store/components/PropPicker.svelte";
  import {
    SHOP_PROP_OPTIONS,
    DEFAULT_SHOP_PROP,
  } from "$lib/features/store/domain/shop-prop-options";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import {
    HERO_TIP_EFFECT_MAP,
    HERO_TRAIL_PRESET,
  } from "$lib/shared/landing/data/hero-trail-preset";
  import GhostPointer from "$lib/shared/attract/components/GhostPointer.svelte";
  import {
    createConstructAttractAct,
    type ConstructAttractAct,
  } from "./construct-attract-act.svelte";
  import { isVisitorOwnedConstructSequence } from "../_components/composer-sequence-ownership";

  type ConstructPresentationMode = "full" | "guided-build" | "continuous";

  let {
    presentationMode = "full",
    onVisitorComposed,
  }: {
    presentationMode?: ConstructPresentationMode;
    onVisitorComposed?: (sequence: SequenceData) => void;
  } = $props();

  const isGuidedBuild = $derived(presentationMode === "guided-build");
  const isContinuous = $derived(presentationMode === "continuous");
  const usesFocusedLayout = $derived(isGuidedBuild || isContinuous);

  // Visitors can click up to 8 steps (a full 8-count); the attract act builds
  // a quicker 4 so cycles stay snappy. Steps flow 4 per row beside the start
  // column, so 8 steps = two clean rows.
  const MAX_STEPS = 8;
  const STEP_COLUMNS = 4;
  const ATTRACT_STEPS = 4;
  type CompactPane = "build" | "sequence";

  // Keep the public demo inside the same 1.5-turn ceiling as the generated
  // examples. The real Create tab remains the place for the wider turn system.
  const TURN_OPTIONS = [
    { value: "0", label: "0" },
    { value: "0.5", label: "0.5" },
    { value: "1", label: "1" },
    { value: "1.5", label: "1.5" },
  ];

  // Isolated demo state — start position + picked steps. The full sequence and
  // display word are derived from these two, so the UI stays in lockstep.
  let startPosition = $state<PictographData | null>(null);
  let gridMode = $state<GridMode>(GridMode.DIAMOND);
  let steps = $state<PictographData[]>([]);
  let playing = $state(false);
  let playingStepNumber = $state<number | null>(null);
  let editingStepNumber = $state<number | null>(null);

  // The demo's pinned prop — canonical five only, staves first. Never poi, and
  // never the user's global setting.
  let demoProp = $state<PropType>(DEFAULT_SHOP_PROP);

  // The demo's pinned turns — one picker PER HAND (blue/red), overriding the
  // picker's sticky localStorage turns (same leak-proofing as the prop
  // override).
  let leftTurnsValue = $state<string>("0");
  let rightTurnsValue = $state<string>("0");
  const leftTurns = $derived(Number(leftTurnsValue));
  const rightTurns = $derived(Number(rightTurnsValue));

  // The player's playback-toggle fn (via onTogglePlaybackRef). The attract act
  // calls it to demonstrate tap-to-pause/tap-to-play on the canvas — the real
  // tap listener is pointer-based, and the act must never dispatch synthetic
  // pointer events (they'd trip the takeover listener).
  let playerToggle: (() => void) | null = null;

  // The player's playback controller (via onControllerReady) — powers the
  // viewer-parity seek affordances: click a workspace cell to snap the
  // animation to that step, click the start cell to restart.
  let playerController: AnimationPlaybackController | null = null;
  let playerIsPlaying = $state(false);
  let startHoldTimer: ReturnType<typeof setTimeout> | null = null;
  let compactPane = $state<CompactPane>("build");
  const compactDemoQuery =
    typeof window === "undefined"
      ? null
      : new MediaQuery("(max-width: 74.99rem)");
  const isCompactDemo = $derived(compactDemoQuery?.current ?? false);

  // The real start-position picker drives its own state object; we subscribe to
  // the user's pick and lift it into our local demo state (source "sync" changes
  // — e.g. our own clear on reset — are ignored, exactly like the tutorial step).
  const startPositionState = createSimplifiedStartPositionState();
  let unsubscribe: (() => void) | null = null;

  // Attract act wiring (spec §Attract loop / §Takeover).
  let bandEl = $state<HTMLElement | null>(null);
  let act: ConstructAttractAct | null = $state(null);
  let tookOver = $state(false);
  let visitorOwnsBuild = $state(false);
  let io: IntersectionObserver | null = null;

  onMount(() => {
    unsubscribe = startPositionState.onSelectedPositionChange(
      (position, source) => {
        if (source === "user" && position) {
          recordHistory();
          startPosition = position;
          gridMode = startPositionState.currentGridMode;
          steps = [];
          playing = false;
          editingStepNumber = null;
          dropPlayerRefs();
        }
      }
    );

    // Reduced motion → never create the act; section is plainly interactive.
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (!reduced && !isCompactDemo && !isContinuous && bandEl) {
      act = createConstructAttractAct({
        getRoot: () => bandEl,
        resetBoard: reset,
        getBoardProgress: () => ({ phase, stepCount: steps.length }),
        togglePlayback: () => playerToggle?.(),
        stepsPerCycle: ATTRACT_STEPS,
        focused: isGuidedBuild,
      });
      io = new IntersectionObserver(
        (entries) => {
          const visible = entries.some((e) => e.isIntersecting);
          act?.setVisible(visible);
          if (visible) act?.start();
        },
        { threshold: 0.25 }
      );
      io.observe(bandEl);
    }
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
    unsubscribe?.();
    act?.kill();
    io?.disconnect();
    clearStartHold();
  });

  // Grab the wheel: first REAL interaction pauses the act — the ghost glides
  // to the pane's corner and parks as a clickable "watch it again" button.
  // The act's programmatic click() fires no pointerdown and never focuses, so
  // it can't trip this. Events from the parked ghost itself are exempt (its
  // resume button lives inside the section and would otherwise re-pause).
  function takeover(e?: Event) {
    if ((e?.target as HTMLElement | null)?.closest?.(".ghost")) return;
    visitorOwnsBuild = true;
    if (act && !act.dead && !act.paused) {
      act.pause();
      tookOver = true;
    }
  }

  // The parked ghost was clicked: hand the live build back so it can continue.
  function resumeDemo() {
    if (act && !act.dead) {
      act.resume();
      tookOver = false;
      visitorOwnsBuild = false;
    }
  }

  // Full sequence fed to the option picker: start position + every picked step.
  const currentSequence = $derived<PictographData[]>(
    startPosition ? [startPosition, ...steps] : []
  );
  const pickerSequence = $derived<PictographData[]>(
    isContinuous && editingStepNumber
      ? currentSequence.slice(0, editingStepNumber)
      : currentSequence
  );

  // Three phases, derived straight from state. Hitting the 8-step cap plays
  // automatically; before that, the Play button flips `playing`.
  const phase = $derived<"pick-start" | "add-step" | "play">(
    !startPosition
      ? "pick-start"
      : !isContinuous && (playing || steps.length >= MAX_STEPS)
        ? "play"
        : "add-step"
  );
  const compactPaneOptions = $derived(
    phase === "play"
      ? [
          {
            value: "build" as const,
            label: "Player",
            id: "construct-build-tab",
            controls: "construct-build-panel",
          },
          {
            value: "sequence" as const,
            label: "Pictographs",
            id: "construct-sequence-tab",
            controls: "construct-sequence-panel",
          },
        ]
      : [
          {
            value: "build" as const,
            label: "Build",
            id: "construct-build-tab",
            controls: "construct-build-panel",
          },
          {
            value: "sequence" as const,
            label: "Sequence",
            id: "construct-sequence-tab",
            controls: "construct-sequence-panel",
          },
        ]
  );

  // sequence.word is DATA (the expanded letters); what the user reads is the
  // simplified form — repeated words always collapse to their smallest form.
  const rawWord = $derived(steps.map((s) => s.letter ?? "").join(""));
  const displayWord = $derived(simplifyRepeatedWord(rawWord));

  // ---- Real workspace plumbing (WorkspaceGrid is the canonical layout:
  // start position owns column 1, steps flow in columns 2+). ----
  const workspaceDisplayState = createStepGridDisplayState();
  const workspaceScrollState = createScrollState();

  const startStepData = $derived<StepData | null>(
    startPosition
      ? {
          ...pictographDataToStepData(
            startPosition,
            startPosition.id ?? "demo-start"
          ),
          stepNumber: 0,
        }
      : null
  );
  const stepData = $derived<StepData[]>(
    steps.map((p, i) => ({
      ...pictographDataToStepData(p, p.id ?? `demo-step-${i}`),
      stepNumber: i + 1,
    }))
  );

  // StepGrid needs the complete live frame for its arrival animation. The
  // attract act may update that local frame, but only visitor-owned work is
  // allowed to leave this panel and replace the examples below it.
  const composedSequence = $derived<SequenceData | null>(
    startStepData && stepData.length > 0
      ? createSequenceData({
          id: `construct-demo-${rawWord}-${stepData.length}`,
          name: displayWord,
          word: rawWord,
          steps: stepData,
          startPosition: startStepData as unknown as StartPositionData,
          thumbnails: [],
          gridMode,
        })
      : null
  );

  let lastObservedSequenceId = "";
  $effect(() => {
    if (!composedSequence || composedSequence.id === lastObservedSequenceId) {
      return;
    }
    lastObservedSequenceId = composedSequence.id;
    if (!isVisitorOwnedConstructSequence(visitorOwnsBuild, composedSequence))
      return;
    onVisitorComposed?.(composedSequence);
  });

  let wsW = $state(0);
  let wsH = $state(0);
  // The calculator's narrow few-steps branch sizes cells by width only (mobile
  // convention: a scroll container handles the overflow). This demo's frame is
  // fixed-height and must NEVER scroll — cap the cell to what the frame can
  // actually show (frame minus the grid's own 16px padding ring).
  const gridLayout = $derived.by(() => {
    const raw = calculateGridLayout(
      stepData.length,
      wsW || 600,
      wsH || 240,
      null,
      {
        manualColumnCount: STEP_COLUMNS,
      }
    );
    const maxCell = Math.floor(((wsH || 240) - 40) / raw.rows);
    return { ...raw, cellSize: Math.min(raw.cellSize, maxCell) };
  });

  function handleOptionSelected(option: PictographData) {
    if (isContinuous && editingStepNumber) {
      recordHistory();
      steps = [...steps.slice(0, editingStepNumber - 1), option];
      editingStepNumber = null;
      playingStepNumber = null;
      return;
    }
    if (steps.length >= MAX_STEPS) return;
    recordHistory();
    steps = [...steps, option];
  }

  // ── build history ────────────────────────────────────────────────────────
  // Composing UndoGlyph in a demo-local history rather than reusing UndoButton:
  // that button's behavior owner is CreateModuleState + the create undo-manager,
  // and this prerendered marketing surface deliberately constructs neither (see
  // the header note on staying out of the shared create singleton). Sharing the
  // glyph is what keeps the two from ever drawing a different undo arrow.
  type BuildSnapshot = {
    startPosition: PictographData | null;
    steps: PictographData[];
  };

  /** Deep enough for the 8-step cap plus the start pick, several times over. */
  const HISTORY_LIMIT = 32;

  let past = $state<BuildSnapshot[]>([]);
  let future = $state<BuildSnapshot[]>([]);
  const canUndo = $derived(past.length > 0);
  const canRedo = $derived(future.length > 0);

  /** The attract act drives these same handlers. Only a person's edits are
      history, so the act's build never fills the stacks — and a takeover
      starts from an empty one rather than offering to undo the machine. */
  function actIsDriving(): boolean {
    return !!act && !act.dead && !act.paused;
  }

  function snapshot(): BuildSnapshot {
    return { startPosition, steps: [...steps] };
  }

  /** Call BEFORE a mutation: a fresh action invalidates the redo branch. */
  function recordHistory() {
    if (actIsDriving()) {
      past = [];
      future = [];
      return;
    }
    past = [...past, snapshot()].slice(-HISTORY_LIMIT);
    future = [];
  }

  function applySnapshot(target: BuildSnapshot) {
    startPosition = target.startPosition;
    steps = [...target.steps];
    playing = false;
    playingStepNumber = null;
    editingStepNumber = null;
    if (!isContinuous || !target.startPosition || target.steps.length === 0) {
      dropPlayerRefs();
    }
    compactPane = "build";
    // Put the restored pick back in the picker. setSelectedPosition notifies
    // with source "sync", which our listener ignores, so this cannot recurse
    // into the selection branch that wipes the steps we just restored.
    startPositionState.setSelectedPosition(target.startPosition);
  }

  function undo() {
    if (!canUndo) return;
    const previous = past[past.length - 1];
    future = [snapshot(), ...future];
    past = past.slice(0, -1);
    applySnapshot(previous);
  }

  function redo() {
    if (!canRedo) return;
    const next = future[0];
    past = [...past, snapshot()];
    future = future.slice(1);
    applySnapshot(next);
  }

  // ---- Play phase: the built sequence, packaged for the real AnimationPlayer.
  // Steps carry full motion data (the option pipeline bakes it in), so the
  // player runs standalone with no gallery lookup.
  const playSequence = $derived<SequenceData | null>(
    isContinuous || phase === "play" ? composedSequence : null
  );

  // The player reports the playing step (0-indexed; null = start position) and
  // the workspace highlights it via the canonical selection mechanism.
  function handlePlayerStepChange(
    stepIndex: number | null,
    isPlaying: boolean
  ) {
    playingStepNumber = stepIndex === null ? 0 : stepIndex + 1;
    playerIsPlaying = isPlaying;
  }

  // Viewer-parity seek: clicking a workspace cell during play snaps the
  // animation to that step, preserving play state — the same semantics as the
  // sequence viewer's left rail (playback-controller.svelte.ts handleStepClick).
  function handleWorkspaceStepClick(stepNumber: number) {
    clearStartHold();
    if (isContinuous) editingStepNumber = stepNumber;
    playerController?.seekToStep(stepNumber);
  }

  // Start cell: park at the start pose, hold a beat, then play — the viewer's
  // hold-then-play restart, verbatim.
  function handleWorkspaceStartClick() {
    if (!playerController) return;
    clearStartHold();
    if (playerIsPlaying) playerController.togglePlayback();
    playerController.seekToStep(0);
    startHoldTimer = setTimeout(() => {
      startHoldTimer = null;
      if (playerController && !playerIsPlaying)
        playerController.togglePlayback();
    }, 700);
  }

  function seekRelative(delta: number) {
    const current = playingStepNumber ?? 0;
    playerController?.seekToStep(
      Math.max(0, Math.min(steps.length, current + delta))
    );
  }

  function clearStartHold() {
    if (startHoldTimer !== null) {
      clearTimeout(startHoldTimer);
      startHoldTimer = null;
    }
  }

  // The player unmounts whenever the phase leaves "play" — drop the refs so a
  // stale controller can never receive a seek meant for a dead instance.
  function dropPlayerRefs() {
    clearStartHold();
    playerController = null;
    playerToggle = null;
    playerIsPlaying = false;
  }

  function reset() {
    recordHistory();
    steps = [];
    startPosition = null;
    playing = false;
    playingStepNumber = null;
    editingStepNumber = null;
    dropPlayerRefs();
    startPositionState.clearSelectedPosition();
    compactPane = "build";
  }
</script>

{#snippet propControl()}
  <div class="tool-group prop-group">
    <span class="tool-label">Prop</span>
    <PropPicker
      value={demoProp}
      onchange={(p) => (demoProp = p)}
      options={SHOP_PROP_OPTIONS}
    />
  </div>
{/snippet}

{#snippet playPhaseActions()}
  <div class="play-actions">
    {#if steps.length < MAX_STEPS}
      <button
        type="button"
        class="cta-btn quiet"
        onclick={() => {
          playing = false;
          playingStepNumber = null;
          compactPane = "build";
          dropPlayerRefs();
        }}
      >
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        Keep building
      </button>
    {/if}
    <button type="button" class="cta-btn" data-demo-again onclick={reset}>
      <i class="fas fa-rotate-left" aria-hidden="true"></i>
      Build another
    </button>
  </div>
{/snippet}

{#snippet player(sequence: SequenceData)}
  {#await import("$lib/shared/sequence-viewer/components/AnimationPlayer.svelte") then mod}
    <div class="play-pane">
      <div class="player-frame" data-demo-stage>
        <mod.default
          {sequence}
          autoPlay={!isContinuous}
          showControls={false}
          hideWordHeader={!isCompactDemo}
          tapToToggle
          progressLine
          progressLineSeekable
          hoverHint="badge"
          leftPropType={demoProp}
          rightPropType={demoProp}
          trailSettingsOverride={HERO_TRAIL_PRESET}
          tipEffectMap={HERO_TIP_EFFECT_MAP}
          onStepChange={handlePlayerStepChange}
          onTogglePlaybackRef={(fn: () => void) => (playerToggle = fn)}
          onControllerReady={(ctrl: AnimationPlaybackController) =>
            (playerController = ctrl)}
        />
      </div>
    </div>
  {/await}
{/snippet}

<section
  class="construct-demo"
  class:compact-demo={isCompactDemo}
  class:play-phase={phase === "play"}
  class:guided-build={isGuidedBuild}
  class:continuous-workspace={isContinuous}
  bind:this={bandEl}
  onpointerdowncapture={takeover}
  onfocusincapture={takeover}
>
  <div class="demo-shell">
    {#if isCompactDemo && !usesFocusedLayout}
      <div class="compact-view-switch">
        <SegmentedControl
          options={compactPaneOptions}
          value={compactPane}
          onchange={(pane) => (compactPane = pane)}
          color="accent"
          size="sm"
          semantics="tabs"
          ariaLabel="Construct demo view"
        />
      </div>
    {/if}

    <!-- Two column stacks: prop + workspace left, turns + picker right. Each
       control sits directly above the panel it affects, and the turns strip
       lives INSIDE the right column — when it slides away for the play phase
       the player pane (flex: 1) expands upward into the freed strip and the
       canvas gets bigger. The columns' total height stays constant across
       phases (the strip's space is reserved), so the page never shifts. -->
    <div class="demo-columns" class:compact-layout={isCompactDemo}>
      <div
        class="demo-col sequence-column"
        id={isCompactDemo && !usesFocusedLayout
          ? "construct-sequence-panel"
          : undefined}
        role={isCompactDemo && !usesFocusedLayout ? "tabpanel" : undefined}
        aria-labelledby={isCompactDemo && !usesFocusedLayout
          ? "construct-sequence-tab"
          : undefined}
        hidden={isCompactDemo &&
          !usesFocusedLayout &&
          compactPane !== "sequence"}
      >
        {#if !isCompactDemo && !isGuidedBuild}
          {@render propControl()}
        {/if}

        {#if isContinuous}
          <div
            class="continuous-preview"
            class:has-motion={!!playSequence}
            role="region"
            aria-label="Live motion preview"
          >
            {#if playSequence}
              {@render player(playSequence)}
            {:else}
              <p>Motion preview begins after the first step.</p>
            {/if}
          </div>
        {/if}

        <!-- WORKSPACE: the real WorkspaceGrid — start column + step columns. -->
        <div class="workspace" class:has-sequence={!!startStepData}>
          <!-- Canonical word display: the same WordLabel the real workspace shows
           top-center (TKA glyphs, click-to-copy, letter highlighting during
           playback). No step counter — the app doesn't count steps at you. -->
          <header
            class="demo-status word-label-area"
            aria-live={tookOver ? "polite" : "off"}
          >
            <span class="region-label">Your sequence</span>
            <div class="status-content">
              {#if rawWord}
                <WordLabel
                  word={rawWord}
                  activeStepNumber={(phase === "play" || isContinuous) &&
                  playingStepNumber
                    ? playingStepNumber
                    : null}
                />
              {:else}
                <p class="hint">
                  {#if phase === "pick-start" && act && !tookOver}
                    Watch it build. Tap anything to take over.
                  {:else if phase === "pick-start"}
                    Pick a starting position to begin.
                  {:else}
                    Tap a pictograph to add it.
                  {/if}
                </p>
              {/if}
            </div>
          </header>

          <div class="ws-frame" bind:clientWidth={wsW} bind:clientHeight={wsH}>
            {#if startStepData}
              {#if isGuidedBuild}
                <StepGrid
                  steps={stepData}
                  startPosition={startStepData}
                  selectedStepNumber={isContinuous
                    ? (editingStepNumber ?? playingStepNumber)
                    : phase === "play"
                      ? playingStepNumber
                      : null}
                  onStepClick={phase === "play" || isContinuous
                    ? (stepNumber) => handleWorkspaceStepClick(stepNumber)
                    : undefined}
                  onStartClick={phase === "play" || isContinuous
                    ? handleWorkspaceStartClick
                    : undefined}
                  activeMode="construct"
                  manualColumnCount={STEP_COLUMNS}
                  allowFewStepOverflowOnNarrow={false}
                  arrivalSequence={composedSequence}
                  leftPropTypeOverride={demoProp}
                  rightPropTypeOverride={demoProp}
                  sequenceWord={rawWord}
                />
              {:else}
                <WorkspaceGrid
                  steps={stepData}
                  startPosition={startStepData}
                  {gridLayout}
                  displayState={workspaceDisplayState}
                  scrollState={workspaceScrollState}
                  selectedStepNumber={isContinuous
                    ? (editingStepNumber ?? playingStepNumber)
                    : phase === "play"
                      ? playingStepNumber
                      : null}
                  onStepClick={phase === "play" || isContinuous
                    ? (stepNumber) => handleWorkspaceStepClick(stepNumber)
                    : undefined}
                  onStartClick={phase === "play" || isContinuous
                    ? handleWorkspaceStartClick
                    : undefined}
                  getStepKey={(beat, index) => beat.id ?? `demo-key-${index}`}
                  getDurationDisplay={(stepIndex) => String(stepIndex + 1)}
                  leftPropTypeOverride={demoProp}
                  rightPropTypeOverride={demoProp}
                  sequenceWord={rawWord}
                />
              {/if}
            {:else}
              <p class="ws-empty" aria-hidden="true">
                The sequence appears here as it's built.
              </p>
            {/if}
          </div>

          <!-- The app's ButtonPanel center zone, miniaturized: the canonical green
           View/Play button sits bottom-center of the workspace; during play
           the SAME slot crossfades to Build another (answers "where does Build
           another go on wide screens" — the canonical action slot, not under
           the canvas). -->
          <div class="action-slot">
            <!-- Left zone: the real app's clear button — back out of a build to
             pick a different start position. Play phase has Build another. -->
            <div class="slot-side">
              {#if phase === "add-step"}
                <ClearSequenceButton onclick={reset} />
              {/if}
            </div>
            <div class="action-swap">
              <Crossfade key={phase} duration={DURATION.normal} mode="swap">
                <div class="action-swap-state">
                  {#if phase === "add-step"}
                    {#if isContinuous}
                      <span
                        style:visibility={steps.length > 0
                          ? "visible"
                          : "hidden"}
                      >
                        <HorizontalTransportRow
                          isPlaying={playerIsPlaying}
                          onPlaybackToggle={() => playerToggle?.()}
                          onRestartToStart={() =>
                            playerController?.seekToStep(0)}
                          onStepFullFwd={() => seekRelative(1)}
                          onStepFullBack={() => seekRelative(-1)}
                        />
                      </span>
                    {:else}
                      <span
                        data-demo-play
                        style:visibility={steps.length > 0
                          ? "visible"
                          : "hidden"}
                      >
                        <ViewSequenceButton
                          purpose="play"
                          onclick={() => {
                            playing = true;
                            compactPane = "build";
                          }}
                        />
                      </span>
                    {/if}
                  {:else if phase === "play" && !isCompactDemo}
                    {@render playPhaseActions()}
                  {/if}
                </div>
              </Crossfade>
            </div>
            <!-- Right zone: step-by-step history. Always mounted and merely
             disabled when a direction is empty — the app's own undo button does
             the same, and a slot that appeared on the first pick would shove
             the play button sideways mid-build. -->
            <div class="slot-side history-side">
              <button
                type="button"
                class="history-button"
                onclick={undo}
                disabled={!canUndo}
                title={canUndo ? "Undo the last change" : "Nothing to undo"}
                aria-label={canUndo
                  ? "Undo the last change"
                  : "Nothing to undo"}
              >
                <UndoGlyph size={20} direction="undo" />
              </button>
              <button
                type="button"
                class="history-button"
                onclick={redo}
                disabled={!canRedo}
                title={canRedo ? "Redo the last change" : "Nothing to redo"}
                aria-label={canRedo
                  ? "Redo the last change"
                  : "Nothing to redo"}
              >
                <UndoGlyph size={20} direction="redo" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        class="demo-col build-column"
        id={isCompactDemo && !usesFocusedLayout
          ? "construct-build-panel"
          : undefined}
        role={isCompactDemo && !usesFocusedLayout ? "tabpanel" : undefined}
        aria-labelledby={isCompactDemo && !usesFocusedLayout
          ? "construct-build-tab"
          : undefined}
        hidden={isCompactDemo && !usesFocusedLayout && compactPane !== "build"}
      >
        {#if isCompactDemo && phase !== "play" && !isGuidedBuild && !isContinuous}
          {@render propControl()}
        {/if}

        <!-- Turns imply "you can change the playing sequence's turns" — not true
         during playback, so they slide away for the play phase (freeing their
         strip for the player) and return on Keep building / Build another. -->
        {#if phase !== "play" && !isGuidedBuild && (!isContinuous || !isCompactDemo)}
          <div
            class="turns-pair"
            transition:slide={{ duration: motionDuration(DURATION.normal) }}
          >
            <div class="tool-group turns-group blue">
              <span class="tool-label"
                ><span class="hand-dot blue" aria-hidden="true"></span>Left
                turns</span
              >
              <SegmentedControl
                options={TURN_OPTIONS}
                value={leftTurnsValue}
                onchange={(v) => (leftTurnsValue = v)}
                color="blue"
              />
            </div>
            <div class="tool-group turns-group red">
              <span class="tool-label"
                ><span class="hand-dot red" aria-hidden="true"></span>Right
                turns</span
              >
              <SegmentedControl
                options={TURN_OPTIONS}
                value={rightTurnsValue}
                onchange={(v) => (rightTurnsValue = v)}
                color="red"
              />
            </div>
          </div>
        {/if}

        {#if isGuidedBuild || isContinuous}
          <!-- One line, not two. This carried a tracked-out uppercase eyebrow
               ("NEXT STEP") above the instruction it introduced ("Choose step
               2") — the same thing said twice, in two typographic voices. -->
          <div
            class="guided-build-status"
            aria-live={isContinuous || tookOver ? "polite" : "off"}
          >
            <span class="region-label">
              {isContinuous && editingStepNumber
                ? "Replace beat"
                : phase === "play"
                  ? "Playback"
                  : "Next move"}
            </span>
            <strong>
              {isContinuous && editingStepNumber
                ? `Choose a new step ${editingStepNumber}`
                : phase === "pick-start"
                  ? "Choose where the props begin"
                  : phase === "add-step"
                    ? steps.length >= MAX_STEPS
                      ? "Eight-count ready to play"
                      : `Choose step ${steps.length + 1}`
                    : `${steps.length} steps playing`}
            </strong>
          </div>
        {/if}

        <!-- PICKER / PLAYER: the real primitives; phase swap lives HERE only. -->
        <div class="picker-pane">
          {#if phase === "pick-start"}
            {#await import("$lib/features/create/construct/start-position-picker/components/StartPositionPicker.svelte") then mod}
              <mod.default
                {startPositionState}
                embedded
                leftPropTypeOverride={demoProp}
                rightPropTypeOverride={demoProp}
              />
            {/await}
          {:else if phase === "add-step"}
            {#await import("$lib/features/create/construct/option-picker/components/OptionPicker.svelte") then mod}
              <!-- The FULL option set: every letter family, sectioned into the
               real swipe layout (embla pages + arrows), with the picker's own
               All/Continuous filter pill. The old Type-1-only training wheels
               are off — this is the real construct experience in miniature. -->
              <mod.default
                currentSequence={pickerSequence}
                currentGridMode={gridMode}
                onOptionSelected={handleOptionSelected}
                hideFilters={isGuidedBuild}
                leftPropTypeOverride={demoProp}
                rightPropTypeOverride={demoProp}
                leftTurnsOverride={leftTurns}
                rightTurnsOverride={rightTurns}
              />
            {/await}
          {:else if playSequence}
            {@render player(playSequence)}
          {/if}
        </div>

        {#if isContinuous && isCompactDemo && phase !== "play"}
          <details class="continuous-settings">
            <summary>Prop and turn settings</summary>
            <div class="continuous-settings-content">
              {@render propControl()}
              <div class="turns-pair">
                <div class="tool-group turns-group blue">
                  <span class="tool-label"><span class="hand-dot blue" aria-hidden="true"></span>Left turns</span>
                  <SegmentedControl options={TURN_OPTIONS} value={leftTurnsValue} onchange={(v) => (leftTurnsValue = v)} color="blue" />
                </div>
                <div class="tool-group turns-group red">
                  <span class="tool-label"><span class="hand-dot red" aria-hidden="true"></span>Right turns</span>
                  <SegmentedControl options={TURN_OPTIONS} value={rightTurnsValue} onchange={(v) => (rightTurnsValue = v)} color="red" />
                </div>
              </div>
            </div>
          </details>
        {/if}
      </div>
    </div>

    {#if isCompactDemo && phase === "play"}
      <div class="compact-play-actions">
        {@render playPhaseActions()}
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

<style>
  .construct-demo {
    container-type: inline-size;
    position: relative;
    width: 100%;
    margin: 0 auto;
    color: var(--theme-text, #fff);
  }

  /* One presentation stage holds the real Composer surfaces. Internal regions
     separate through hierarchy and spacing instead of each becoming another
     bordered card. */
  .demo-shell {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: var(--shell-w, min(1720px, 92vw));
    margin-inline: auto;
    padding: clamp(1rem, 1.8cqw, 1.5rem);
    border-radius: 1.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(16, 16, 26, 0.55)) 85%,
      transparent
    );
    box-sizing: border-box;
  }

  /* The public page already owns the composition band. Applying its shell cap
     again here created a second inset at laptop widths, so the two examples
     missed each other's edge even though they belong to the same story. */
  .guided-build .demo-shell,
  .continuous-workspace .demo-shell {
    max-width: none;
  }

  /* ===== Column stacks =====
     Narrow: one vertical flow (prop, workspace, turns, picker). Wide: two
     stacks side by side — each control directly above the panel it drives. */
  .demo-columns {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
  }

  .demo-col {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  /* Phones and tablets use one coherent stage instead of a four-screen-tall
     stack. Build/Player and Sequence/Pictographs are two views of the same
     live state, so moving between them never resets the visitor's work. */
  .compact-view-switch {
    width: min(100%, 28rem);
    margin-inline: auto;
  }

  .compact-view-switch :global(.segmented-control) {
    width: 100%;
  }

  .compact-demo .demo-shell {
    --compact-stage-height: 38rem;
    gap: 12px;
    padding: 12px;
    border-radius: 20px;
  }

  .demo-columns.compact-layout {
    display: block;
    min-height: var(--compact-stage-height);
  }

  .demo-columns.compact-layout > [hidden] {
    display: none;
  }

  .compact-layout .demo-col {
    min-height: var(--compact-stage-height);
  }

  .compact-layout .sequence-column .workspace {
    flex: 1;
    min-height: var(--compact-stage-height);
  }

  /* Definite height for the same reason the wide tier has one: StepGrid's
     container is a `container-type: size` query container and the arrival card
     sizes in `cqh`, so an auto-height ancestor collapses that unit to 0 and the
     picked step never pops forward. Stretching to the leftover flex space also
     left the stage 57px tall here — shorter than one grid cell, so the grid was
     a scrollbar rather than a workspace. */
  .compact-layout .sequence-column .ws-frame {
    flex: 0 0 auto;
    height: clamp(11rem, 22cqw, 16rem);
    min-height: 0;
  }

  .compact-layout .build-column {
    gap: 12px;
  }

  .compact-layout .build-column .picker-pane {
    flex: 1 1 auto;
    height: clamp(19rem, 52svh, 22rem);
    min-height: 19rem;
  }

  .compact-demo.play-phase .build-column .picker-pane {
    flex: 1 1 0;
    height: auto;
    min-height: var(--compact-stage-height);
  }

  /* The focused story has only two ideas left: the growing sequence and its
     next choices. On a phone they stay stacked in one scroll instead of being
     separated by tabs, so every pick still has a visible destination. */
  .guided-build .demo-columns.compact-layout,
  .continuous-workspace .demo-columns.compact-layout {
    display: flex;
    min-height: 0;
  }

  .guided-build .compact-layout .demo-col,
  .continuous-workspace .compact-layout .demo-col {
    min-height: 0;
  }

  .guided-build .compact-layout .sequence-column .workspace {
    min-height: clamp(13rem, 32svh, 18rem);
  }

  .guided-build .compact-layout .build-column .picker-pane,
  .guided-build.compact-demo.play-phase .build-column .picker-pane {
    min-height: clamp(18rem, 46svh, 22rem);
  }

  .continuous-workspace .compact-layout .sequence-column .workspace {
    min-height: 7rem;
  }

  .continuous-workspace
    .compact-layout
    .sequence-column
    .workspace.has-sequence {
    min-height: 13rem;
  }

  .continuous-workspace.compact-demo .continuous-preview {
    flex-basis: 4.5rem;
    min-height: 4.5rem;
  }

  .continuous-workspace.compact-demo .continuous-preview.has-motion {
    flex-basis: 11rem;
    min-height: 11rem;
  }

  .continuous-workspace .compact-layout .sequence-column .ws-frame {
    height: 5rem;
  }

  .continuous-workspace
    .compact-layout
    .sequence-column
    .workspace.has-sequence
    .ws-frame {
    height: 8rem;
  }

  .continuous-workspace .compact-layout .build-column .picker-pane {
    min-height: clamp(27rem, 70svh, 32rem);
  }

  .continuous-workspace.compact-demo .action-slot {
    grid-template-columns: 1fr 1fr;
    row-gap: 0.35rem;
  }

  .continuous-workspace.compact-demo .action-swap {
    grid-column: 1 / -1;
    grid-row: 1;
  }

  .continuous-workspace.compact-demo .slot-side {
    grid-row: 2;
  }

  .continuous-workspace.compact-demo .continuous-settings {
    margin-top: 0.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    background: var(--theme-card-bg, rgba(10, 10, 18, 0.72));
  }

  .continuous-settings summary {
    min-height: var(--min-touch-target, 44px);
    line-height: 1.5rem;
    padding: 0.75rem 1rem;
    color: var(--theme-text, #fff);
    font-weight: 600;
    cursor: pointer;
  }

  .continuous-settings-content {
    display: grid;
    gap: 1rem;
    padding: 0 1rem 1rem;
  }

  .compact-play-actions {
    min-height: 52px;
    display: grid;
    place-items: center;
  }

  .compact-play-actions .play-actions {
    flex-wrap: wrap;
  }

  .tool-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  /* The pair fills whatever cell it's given; each hand's picker takes half.
     Definite widths all the way down, so the controls' width:100% resolves
     (the old content-sized column collapsed them to min-content). */
  .turns-pair {
    display: flex;
    gap: 14px 18px;
    width: 100%;
    min-width: 0;
  }

  .turns-group {
    flex: 1 1 0;
    min-width: 0;
  }

  .tool-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  /* Height stays reserved so the picker below it never moves as the wording
     changes between phases. */
  .guided-build-status {
    min-height: 3.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    font-size: clamp(1rem, 0.96rem + 0.14vw, 1.15rem);
  }

  .guided-build-status strong {
    color: var(--theme-text, #fff);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .region-label {
    flex: 0 0 auto;
    min-width: 6rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.56));
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
    letter-spacing: 0.01em;
  }

  .hand-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .hand-dot.blue {
    background: var(--prop-blue, #4a7bd8);
  }

  .hand-dot.red {
    background: var(--prop-red, #d84a4a);
  }

  /* Prop tiles GROW to fill their toolbar cell — edge-to-edge, no void after
     the last tile. (Denser than the shop's 104px configurator basis.) */
  .tool-group :global(.prop-option) {
    flex: 1 1 84px;
    min-width: 72px;
  }

  /* ===== Per-hand glass turn pickers =====
     Color-coding does the explaining: the blue picker IS blue, the red picker
     IS red — tinted glass shells, and a glossy gradient indicator with a glow
     for the selected count. */
  .turns-group :global(.segmented-control) {
    width: 100%;
    border-radius: 14px;
    padding: 4px;
    gap: 3px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  .turns-group.blue :global(.segmented-control) {
    background: color-mix(
      in srgb,
      var(--prop-blue, #4a7bd8) 10%,
      rgba(255, 255, 255, 0.02)
    );
    border-color: color-mix(
      in srgb,
      var(--prop-blue, #4a7bd8) 38%,
      transparent
    );
  }

  .turns-group.red :global(.segmented-control) {
    background: color-mix(
      in srgb,
      var(--prop-red, #d84a4a) 10%,
      rgba(255, 255, 255, 0.02)
    );
    border-color: color-mix(in srgb, var(--prop-red, #d84a4a) 38%, transparent);
  }

  .turns-group :global(.segmented-control .indicator) {
    border-radius: 10px;
  }

  .turns-group.blue :global(.segmented-control .indicator) {
    background: linear-gradient(
      160deg,
      color-mix(in srgb, var(--prop-blue, #4a7bd8) 70%, white) 0%,
      var(--prop-blue, #4a7bd8) 55%,
      color-mix(in srgb, var(--prop-blue, #4a7bd8) 75%, black) 100%
    );
    box-shadow:
      0 2px 14px color-mix(in srgb, var(--prop-blue, #4a7bd8) 55%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }

  .turns-group.red :global(.segmented-control .indicator) {
    background: linear-gradient(
      160deg,
      color-mix(in srgb, var(--prop-red, #d84a4a) 70%, white) 0%,
      var(--prop-red, #d84a4a) 55%,
      color-mix(in srgb, var(--prop-red, #d84a4a) 75%, black) 100%
    );
    box-shadow:
      0 2px 14px color-mix(in srgb, var(--prop-red, #d84a4a) 55%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }

  .turns-group :global(.segment) {
    min-height: 48px;
    font-size: 1.05rem;
    font-weight: 650;
  }

  /* Side-by-side once the band is wide enough: workspace stack left (result
     reads first), picker stack right (the side the ghost taps). Workspace ≥
     picker: the built sequence is the star, the picker is the menu.

     The min-height reserve is the trick that lets the player GROW without
     shifting the page: the row's height always includes the turns strip
     (~85px + 16px stack gap), so during the build the strip fills it and
     during play the picker (flex: 1) expands upward into it — same total,
     bigger canvas. */
  @container (min-width: 1100px) {
    .demo-columns {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(28rem, 1fr);
      gap: 0;
      align-items: stretch;
      min-height: calc(clamp(18.75rem, 38vh, 33.75rem) + 6.75rem);
    }

    .sequence-column {
      padding-right: clamp(1.25rem, 2cqw, 2rem);
    }

    .build-column {
      padding-left: clamp(1.25rem, 2cqw, 2rem);
      border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    }

    .workspace {
      flex: 1;
    }

    .picker-pane {
      /* flex-basis 0: the pane fills whatever the row gives it but its
         CONTENT never drives the row height — the start picker's intrinsic
         size was pushing the row 21px taller than the other phases, shifting
         the page on every first pick. */
      flex: 1 1 0;
      height: auto;
      min-height: clamp(18.75rem, 38vh, 33.75rem);
      overflow: hidden;
    }
  }

  .workspace,
  .picker-pane {
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0;
    box-sizing: border-box;
  }

  .workspace {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    min-width: 0;
  }

  /* Word row: the canonical WordLabel, centered like the real workspace.
     Fixed height so hint ↔ word swaps never shift the grid below. WordLabel
     reads --text-color (its default is a light-theme navy). */
  .demo-status {
    min-height: 3.25rem;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    --text-color: var(--theme-text, #fff);
  }

  .status-content {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    justify-content: flex-end;
    text-align: right;
  }

  .status-content :global(.word-label-container) {
    justify-content: flex-end;
  }

  .hint {
    margin: 0;
    font-size: 0.95rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  /* The ButtonPanel slot, three zones like the real app: clear bottom-left,
     green play / Build another dead center (equal side columns keep it truly
     centered whether or not clear is showing). Height reserved — phase swaps
     never shift the grid above it. */
  .action-slot {
    min-height: 3.25rem;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding-top: 0.75rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));

    /* Clear, play, and history share the global touch-target floor. The rem
       side lets browser zoom enlarge the controls with their labels. */
    --min-touch-target: max(44px, 2.75rem);
  }

  /* Play and the wider playback actions are one control state, not two boxes.
     Reserving their shared width keeps the outgoing Play button centered while
     the replacement arrives; swap mode then prevents two actionable labels
     from becoming readable at the same time. */
  .action-swap {
    min-inline-size: var(--min-touch-target);
  }

  .action-swap-state {
    min-block-size: var(--min-touch-target);
    display: grid;
    place-items: center;
  }

  .action-swap-state [data-demo-play] {
    display: grid;
    place-items: center;
  }

  @container (min-width: 1100px) {
    .action-swap {
      inline-size: 21rem;
    }
  }

  .slot-side {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .history-side {
    justify-content: flex-end;
    gap: 0.4rem;
  }

  /* Matched to the real UndoButton: a filled accent circle, not an outline.
     The row holds three controls — clear, play, history — and the app gives
     each a saturated fill with a matching glow (red, green, purple). An
     outlined ghost pair beside two solid discs read as three unrelated
     control languages in one row. */
  .history-button {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border-radius: 50%;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent-strong, #6b5cff) 30%, transparent);
    background: linear-gradient(
      135deg,
      var(--theme-accent-strong, #6b5cff) 0%,
      color-mix(
          in srgb,
          var(--theme-accent-strong, #6b5cff) 85%,
          var(--theme-panel-bg, oklch(0.13 0.025 270))
        )
        100%
    );
    color: var(--theme-text, #fff);
    cursor: pointer;
    transition:
      transform var(--duration-emphasis, 240ms) cubic-bezier(0.4, 0, 0.2, 1),
      background var(--duration-fast, 140ms) ease,
      box-shadow var(--duration-fast, 140ms) ease,
      opacity var(--duration-fast, 140ms) ease;
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-accent-strong, #6b5cff) 40%, transparent);
  }
  .history-button:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 6px 16px
      color-mix(in srgb, var(--theme-accent-strong, #6b5cff) 60%, transparent);
  }
  .history-button:active:not(:disabled) {
    transform: scale(0.95);
    transition-duration: var(--duration-instant, 80ms);
  }
  .history-button:focus-visible {
    outline: 2px solid var(--theme-accent, #8b8cff);
    outline-offset: 2px;
  }
  /* Disabled reads as unavailable, not absent: the slot keeps its footprint so
     nothing beside it moves when history becomes available. */
  .history-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .history-button,
    .history-button:hover:not(:disabled),
    .history-button:active:not(:disabled) {
      transition: none;
      transform: none;
    }
  }

  /* ===== Ghost hover mirror =====
     The fake pointer can't trip CSS :hover, so the act tags its current
     target with .ghost-hover and we mirror the real affordances: buttons
     lift/brighten, and the canvas shows its pause/play badge — the ghost
     reads as someone truly interacting. */
  .construct-demo :global(.ghost-hover) {
    filter: brightness(1.2);
  }

  /* The independent `scale` property, NOT transform: the embla pager arrows
     center themselves with transform: translateY(-50%), and a transform
     override here replaced that — the arrow slid down its half-height over
     the hover transition. `scale` composes with any transform. */
  .construct-demo :global(button.ghost-hover) {
    scale: 1.06;
  }

  /* Fully :global — the ghost-hover class is added at runtime by the act, so
     a scoped selector would be pruned as "unused" at compile time and the
     badge mirror would never ship. .construct-demo keeps it page-scoped. */
  :global(.construct-demo .player-frame.ghost-hover .hover-hint) {
    opacity: 1;
  }

  :global(.construct-demo .player-frame.ghost-hover .hint-stack) {
    transform: scale(1);
  }

  /* Fixed-height frame reserves the workspace footprint before anything is
     built — the grid appears INSIDE it, so nothing below ever shifts. */
  .ws-frame {
    height: clamp(11.25rem, 26vh, 20rem);
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
  }

  /* Side-by-side tier: reserve the tallest the grid ever gets — two rows at the
     8-step cap — and stop there.

     This used to `flex: 1` up to the picker column's full height, which made the
     frame ~80px taller than the grid could ever be. StepGrid pins construct mode
     to four stable columns so cells never resize mid-build, so the grid is a
     fixed-height row block; stretching the frame past it just banked void around
     it, and a small strip floating in a tall box is what read as unfinished. The
     column ends where its content ends.

     The height is DEFINITE (`height`, not `height: auto` + `min-height`) and
     that is load-bearing, not stylistic. StepGrid's container declares
     `container-type: size` and the arrival card that pops a picked step forward
     sizes itself in `cqh`. Size containment means the container's own contents
     cannot supply its block size, so an auto-height ancestor leaves it
     indefinite: `80cqh` resolves to 0, the card renders zero-wide, and the
     arrival plays as a bare scrim darkening with nothing flying into the grid.
     A definite height here is what the whole chain of `height: 100%` resolves
     against.

     The value tracks the grid rather than a flat rem constant. StepGrid lays
     the 8-step cap plus the start tile out as two rows of square cells across
     the frame, and the frame is a stable fraction of this container, so the
     tallest the grid ever gets stays proportional to container width — measured
     318px at a 1669px container, 420 at 2221, 478 at 2528, i.e. ~19cqw
     throughout. 19.5cqw clears all three with the pop reserve intact. The rem
     bounds hold the small end and stop it running away past the 2600px band
     cap. A flat 18rem cut the last row off by 14px at 1920 and 73 at 2560. */
  @container (min-width: 1100px) {
    .ws-frame {
      flex: 0 0 auto;
      height: clamp(18rem, 19.5cqw, 32rem);
      /* The real workspace centers its grid between the title and button panel.
         Split the spare height around this fixed frame to match it. */
      margin-block: auto;
    }
  }

  .ws-empty {
    margin: 0;
    text-align: center;
    font-size: 0.85rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
  }

  /* The picker still needs an explicit height for its internal grid-fit math,
     but far tighter than the old 54vh — and it now shares the row with the
     workspace instead of floating alone in a void. Capped low enough that the
     whole toy (header + toolbar + body) fits a laptop viewport without
     scrolling — the first impression IS the fit. */
  .picker-pane {
    width: 100%;
    height: clamp(18.75rem, 38vh, 33.75rem);
  }

  /* The option grid caps its tile size; in a tall picker it top-aligns because
     the single-section fallback drops the grid into a flex item that isn't a
     flex container. Center it, scoped to this demo picker. */
  .picker-pane :global(.swipe-container) {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  /* The shared grid now sizes each tile from the room it actually has (cell
     width vs row height), which fills this pane on its own. The old 42cqmin
     override was compensating for a sizing bug upstream and now works against
     it — it would shrink the tiles it used to grow. */

  /* The All/Continuous pill FLOATS top-left over the pane (same move as the
     picker's own corner mode) — in flow it pushed the whole grid down when it
     appeared, and centered it read as a header instead of a mode control. */
  .picker-pane {
    position: relative;
  }

  .picker-pane :global(.filter-header) {
    position: absolute;
    top: 8px;
    left: 8px;
    width: auto;
    z-index: 6;
    align-items: flex-start;
  }

  .play-pane {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .continuous-preview {
    display: flex;
    flex: 0 0 clamp(10rem, 22vh, 17rem);
    min-height: 10rem;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    background: var(--theme-card-bg, rgba(10, 10, 18, 0.72));
  }

  .continuous-preview .play-pane,
  .continuous-preview .player-frame {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .continuous-preview > p {
    max-width: 24rem;
    margin: 0;
    padding: 1rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-min, 0.875rem);
    text-align: center;
  }

  .player-frame {
    flex: 1;
    width: 100%;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Sized in rem with a px floor so browser zoom enlarges these alongside the
     round buttons while normal viewports retain the 44px target. */
  .cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: max(44px, 2.75rem);
    padding: 0 1.375rem;
    border-radius: 999px;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 55%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 22%,
      transparent
    );
    color: var(--theme-text, #fff);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      transform var(--transition-fast);
  }

  .cta-btn:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 34%,
      transparent
    );
    transform: translateY(-1px);
  }

  .cta-btn:active {
    transform: translateY(0);
  }

  .cta-btn i {
    font-size: 0.8em;
  }

  /* Play-phase pair: quiet "Keep building" beside the primary Build another. */
  .play-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .cta-btn.quiet {
    background: transparent;
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.16));
  }

  .cta-btn.quiet:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  @media (max-width: 480px) {
    .compact-demo .demo-shell {
      --compact-stage-height: 41rem;
    }

    .picker-pane {
      height: clamp(320px, 56vh, 520px);
    }

    .compact-layout .build-column .picker-pane {
      height: clamp(19rem, 52svh, 22rem);
    }

    .compact-demo.play-phase .build-column .picker-pane {
      height: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cta-btn {
      transition: none;
    }
  }
</style>
