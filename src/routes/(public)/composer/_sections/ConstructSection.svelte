<!--
  ConstructSection.svelte — live construct demo for the composer-wings TEST page.
  Spec: docs/superpowers/specs/2026-07-19-construct-attract-demo-design.md

  Toolbar strip (prop picker + turns picker) above two panes, like the real
  Create tab: the REAL WorkspaceGrid (start position in its own column, steps
  flowing beside it — the canonical workspace layout) beside the REAL
  StartPlacementPicker / OptionPicker. Building ends in a PLAY phase: the right
  pane swaps to the real AnimationPlayer and the workspace highlights the
  currently-playing step via the canonical selection mechanism.

  While nobody touches it, the Construct Attract Act builds a random valid walk
  on loop with a ghost pointer — including pressing Play and letting the
  sequence animate — and the first real pointerdown or focusin kills the act
  for the visit. Reduced motion: no act, no ghost, plain interactive.

  Prop policy: the public page owns the selected pair and passes
  leftPropTypeOverride/rightPropTypeOverride down the whole chain, so the
  user's global prop setting never reaches this demo. Turns policy is the same
  move: the demo pins its available turn values via per-hand pickers (left/right) and
  passes leftTurnsOverride/rightTurnsOverride, so the user's sticky Create-tab
  turns (localStorage) never leak in. Every visible demo value stays at or
  below 1.5 turns, so the public examples do not imply a higher ceiling.
  The start picker is the same again: presets only, with the picker's saved
  Create-tab choices neither read nor written. Presets are also what the
  attract act taps, so a saved Build choice would leave it nothing to pick.

  Fully self-contained — owns its own local $state and deliberately does NOT
  touch the shared create-tutorial singleton, so this preview can never collide
  with a real build in progress. Marketing-demo surface, not shipping chrome.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount, onDestroy, tick, untrack, type Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { createSimplifiedStartPlacementState } from "#lib/shared/create/state/start-placement-state.svelte.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { pictographDataToStepData } from "#lib/shared/pictograph/shared/domain/utils/step-pictograph-conversion.js";
  import { calculateGridLayout } from "#lib/shared/create/utils/grid-calculations.js";
  import WorkspaceGrid from "#lib/features/create/shared/workspace-panel/sequence-display/components/WorkspaceGrid.svelte";
  import StepGrid from "#lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte";
  import { createStepGridDisplayState } from "#lib/features/create/shared/workspace-panel/sequence-display/state/step-grid-display-state.svelte.js";
  import { createScrollState } from "#lib/features/create/shared/workspace-panel/sequence-display/state/scroll-state.svelte.js";
  import ComposerWordRow from "../_components/ComposerWordRow.svelte";
  import ConstructPlayStrip from "./ConstructPlayStrip.svelte";
  import ViewSequenceButton from "#lib/features/create/shared/workspace-panel/shared/components/buttons/ViewSequenceButton.svelte";
  import HorizontalTransportRow from "#lib/shared/sequence-viewer/components/HorizontalTransportRow.svelte";
  import ClearSequenceButton from "#lib/features/create/shared/workspace-panel/shared/components/buttons/ClearSequenceButton.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import UndoGlyph from "#lib/features/create/shared/workspace-panel/shared/components/buttons/UndoGlyph.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    controlArrive,
    controlLeave,
  } from "#lib/shared/transitions/control-presence.js";
  import {
    growFade,
    motionDuration,
    reducedMotion,
  } from "#lib/shared/transitions/motion.js";
  import { focusFirstOrContainer } from "#lib/shared/foundation/ui/modal/helpers/focus-restore.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { ViewerCustomColorPair } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import type { AnimationPlaybackController } from "#lib/shared/animation-engine/services/animation-playback-controller.js";
  import {
    HERO_TIP_EFFECT_MAP,
    HERO_TRAIL_PRESET,
  } from "@tka/shape-engine/services/hero-trail-preset.js";
  import GhostPointer from "#lib/shared/attract/components/GhostPointer.svelte";
  import {
    createConstructAttractAct,
    type ConstructAttractAct,
  } from "./construct-attract-act.svelte";
  import { isVisitorOwnedConstructSequence } from "../_components/composer-sequence-ownership";
  import { bootProfiler } from "#lib/shared/analytics/boot-profiler.js";
  import { pictographDrawState } from "#lib/shared/pictograph/shared/utils/pictograph-draw-state.js";
  import { morphConstructPhase } from "./construct-play-morph";
  import { setTypeNavigationHostContext } from "#lib/features/create/construct/option-picker/context/type-navigation-host-context.js";

  type ConstructPresentationMode = "full" | "guided-build" | "continuous";

  let {
    presentationMode = "full",
    onVisitorComposed,
    leftPropType,
    rightPropType,
    primaryPropColors,
    active = true,
    embedded = false,
    propControl,
  }: {
    presentationMode?: ConstructPresentationMode;
    onVisitorComposed?: (sequence: SequenceData) => void;
    leftPropType?: PropType;
    rightPropType?: PropType;
    primaryPropColors?: ViewerCustomColorPair | null;
    active?: boolean;
    embedded?: boolean;
    /** The host page's prop chooser, shown at the start of the word row. */
    propControl?: Snippet;
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
  let startPlacement = $state<PictographData | null>(null);
  let gridMode = $state<GridMode>(GridMode.DIAMOND);
  let steps = $state<PictographData[]>([]);
  let playing = $state(false);
  let playingStepNumber = $state<number | null>(null);
  let editingStepNumber = $state<number | null>(null);

  // The page owns the 2D demo pair; standalone demo routes still default to
  // staff without inheriting a visitor's global prop setting.
  const effectiveLeftPropType = $derived(leftPropType ?? PropType.STAFF);
  const effectiveRightPropType = $derived(
    rightPropType ?? effectiveLeftPropType
  );

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
  let playerController = $state.raw<AnimationPlaybackController | null>(null);
  let playerIsPlaying = $state(false);

  let gatedController: AnimationPlaybackController | null = null;
  let resumeAfterInactive = false;

  // AnimationPlayer exposes its controller; host visibility belongs to this section.
  $effect(() => {
    const controller = playerController;
    const isPlaying = playerIsPlaying;
    if (controller !== gatedController) {
      gatedController = controller;
      resumeAfterInactive = false;
    }
    if (!controller) return;
    if (!active && isPlaying) {
      resumeAfterInactive = true;
      untrack(() => controller.togglePlayback());
    } else if (active && resumeAfterInactive && !isPlaying) {
      resumeAfterInactive = false;
      untrack(() => controller.togglePlayback());
    }
  });

  let startHoldTimer: ReturnType<typeof setTimeout> | null = null;
  let compactPane = $state<CompactPane>("build");
  const compactDemoQuery =
    typeof window === "undefined"
      ? null
      : new MediaQuery("(max-width: 74.99rem)");
  const isCompactDemo = $derived(compactDemoQuery?.current ?? false);

  // The real start-placement picker drives its own state object; we subscribe to
  // the user's pick and lift it into our local demo state (source "sync" changes
  // — e.g. our own clear on reset — are ignored, exactly like the tutorial step).
  const startPlacementState = createSimplifiedStartPlacementState();
  let unsubscribe: (() => void) | null = null;

  // Attract act wiring (spec §Attract loop / §Takeover).
  let bandEl = $state<HTMLElement | null>(null);
  let act: ConstructAttractAct | null = $state(null);
  let tookOver = $state(false);
  let visitorOwnsBuild = $state(false);
  let inViewport = $state(false);
  let io: IntersectionObserver | null = null;

  $effect(() => {
    const visible = active && inViewport;
    act?.setVisible(visible);
    if (visible) act?.start();
  });

  onMount(() => {
    unsubscribe = startPlacementState.onSelectedPlacementChange(
      (position, source) => {
        if (source === "user" && position) {
          const carry = holdsFocus(pickerPaneEl);
          recordHistory();
          startPlacement = position;
          gridMode = startPlacementState.currentGridMode;
          steps = [];
          playing = false;
          editingStepNumber = null;
          dropPlayerRefs();
          if (carry) void focusPickerPane();
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
          inViewport = entries.some((e) => e.isIntersecting);
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
    startPlacement ? [startPlacement, ...steps] : []
  );
  const pickerSequence = $derived<PictographData[]>(
    isContinuous && editingStepNumber
      ? currentSequence.slice(0, editingStepNumber)
      : currentSequence
  );

  // Three phases, derived straight from state. Hitting the 8-step cap plays
  // automatically; before that, the Play button flips `playing`.
  const phase = $derived<"pick-start" | "add-step" | "play">(
    !startPlacement
      ? "pick-start"
      : !isContinuous && (playing || steps.length >= MAX_STEPS)
        ? "play"
        : "add-step"
  );
  // Stacked, the picker spans the card under the action row, and a row of
  // letter-type tabs across its top costs the grid a whole row of height.
  // There the tabs stand in the picker's left rail instead, the pattern the
  // app uses on the unfolded Fold, and the action row keeps the app's own
  // clear, Play, undo/redo. Side by side the picker is narrow and tall, so the
  // tabs stay across its top. Under 600px the rail would squeeze the grid.
  const TYPE_RAIL_MIN_WIDTH = 600;
  let demoWidth = $state(0);
  const typeRailInDemo = $derived(
    isGuidedBuild &&
      demoWidth >= TYPE_RAIL_MIN_WIDTH &&
      demoWidth < 1100
  );
  setTypeNavigationHostContext({ preferRail: () => typeRailInDemo });

  // The option picker is a lazy chunk, and its first load parses the whole
  // motion dataset. Fetched only when the first pick came in, both stalled the
  // pane for a second or two between the start tiles leaving and the options
  // arriving. The visitor spends that time choosing a start, so fetch them then.
  let pickerWarmed = false;
  $effect(() => {
    if (phase !== "pick-start" || pickerWarmed) return;
    const warm = () => {
      pickerWarmed = true;
      void import(
        "#lib/features/create/construct/option-picker/components/OptionPicker.svelte"
      ).catch(() => {});
      void import(
        "#lib/shared/pictograph/shared/services/motion-query-handler.js"
      )
        .then(({ motionQueryHandler }) => motionQueryHandler.prewarm())
        .catch(() => {});
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(warm, { timeout: 1500 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(warm, 300);
    return () => clearTimeout(id);
  });

  // Play turns the guided card into one player with a step strip: the grid and
  // the picker give way to them, and the play actions stay in the action slot.
  const fullPlayer = $derived(isGuidedBuild && phase === "play");
  const actionsInSlot = $derived(!isCompactDemo || isGuidedBuild);
  let hasLeftPlayer = $state(false);
  $effect(() => {
    if (fullPlayer) hasLeftPlayer = true;
  });
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
    startPlacement
      ? {
          ...pictographDataToStepData(
            startPlacement,
            startPlacement.id ?? "demo-start"
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
          startPlacement: startStepData as unknown as StartPlacementData,
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
    const finishCommit = bootProfiler.startSpan("construct:option-commit", {
      previousStepCount: steps.length,
      viewerCanvasMounted: Boolean(
        document.querySelector(".viewer-demo canvas")
      ),
      viewerDialogOpen: Boolean(
        document.querySelector("dialog.composer-3d-modal[open]")
      ),
    });
    if (isContinuous && editingStepNumber) {
      recordHistory();
      steps = [...steps.slice(0, editingStepNumber - 1), option];
      editingStepNumber = null;
      playingStepNumber = null;
      void tick().then(() => finishCommit("ok", { mode: "replace" }));
      return;
    }
    if (steps.length >= MAX_STEPS) {
      finishCommit("cancelled", { reason: "step-limit" });
      return;
    }
    // A second tap in the frame before the eighth step's morph lands would
    // append a ninth.
    if (phasePending) {
      finishCommit("cancelled", { reason: "phase-morph" });
      return;
    }
    const carry = holdsFocus(pickerPaneEl);
    const append = () => {
      recordHistory();
      steps = [...steps, option];
    };
    // The eighth step plays at once, so it crosses into the player the way
    // Play does.
    const entersPlay =
      !isContinuous && !playing && steps.length + 1 >= MAX_STEPS;
    const appended = entersPlay
      ? morphPhase(append)
      : (append(), Promise.resolve());
    void appended.then(() => {
      void tick().then(() =>
        finishCommit("ok", { mode: "append", stepCount: steps.length })
      );
      // The player replaces the options, so focus goes to the play actions,
      // as it does from Play.
      if (carry && phase === "play") void focusPlayControls();
    });
  }

  // ── build history ────────────────────────────────────────────────────────
  // Composing UndoGlyph in a demo-local history rather than reusing UndoButton:
  // that button's behavior owner is CreateModuleState + the create undo-manager,
  // and this prerendered marketing surface deliberately constructs neither (see
  // the header note on staying out of the shared create singleton). Sharing the
  // glyph is what keeps the two from ever drawing a different undo arrow.
  type BuildSnapshot = {
    startPlacement: PictographData | null;
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
    return { startPlacement, steps: [...steps] };
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
    startPlacement = target.startPlacement;
    steps = [...target.steps];
    playing = false;
    playingStepNumber = null;
    editingStepNumber = null;
    if (!isContinuous || !target.startPlacement || target.steps.length === 0) {
      dropPlayerRefs();
    }
    compactPane = "build";
    // Put the restored pick back in the picker. setSelectedPlacement notifies
    // with source "sync", which our listener ignores, so this cannot recurse
    // into the selection branch that wipes the steps we just restored.
    startPlacementState.setSelectedPlacement(target.startPlacement);
  }

  // Undo from a full eight steps, or redo back to them, crosses between the
  // player and the build like Play and Keep building do.
  function crossesPlay(target: BuildSnapshot): boolean {
    const targetPlays =
      !isContinuous &&
      !!target.startPlacement &&
      target.steps.length >= MAX_STEPS;
    return targetPlays !== (phase === "play");
  }

  function undo() {
    const previous = past[past.length - 1];
    if (!previous || phasePending) return;
    const apply = () => {
      future = [snapshot(), ...future];
      past = past.slice(0, -1);
      applySnapshot(previous);
    };
    if (crossesPlay(previous)) void morphPhase(apply);
    else apply();
  }

  function redo() {
    const next = future[0];
    if (!next || phasePending) return;
    const apply = () => {
      past = [...past, snapshot()];
      future = future.slice(1);
      applySnapshot(next);
    };
    if (crossesPlay(next)) void morphPhase(apply);
    else apply();
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

  // The pane crossfades between the start picker and the options, as the real
  // Create page does. Leaving the full-card player is the exception: the pane
  // already rises back in with its own animation there, and a crossfade inside
  // it would show a shrunken ghost of the player fading out.
  let paneCut = $state(false);
  const paneKey = $derived(phase === "pick-start" ? "start" : "build");

  // Clear and the side Play join the build once the action row's middle has
  // swapped over, so the whole row arrives together.
  const arriveLead = () => DURATION.normal;

  // ── Build ↔ play ────────────────────────────────────────────────────────
  // Every way across the line between building and the full-card player goes
  // through morphPhase, so the parts travel instead of swapping in place
  // (construct-play-morph.ts). While it runs, the crossfades inside the moving
  // parts cut: the morph already carries them, and a fade inside one would
  // ghost. Where it cannot run (reduced motion), `cssSwap` lets the CSS
  // arrivals below play instead. It stays off after a morph, so those
  // arrivals never replay over parts that have already landed.
  let morphing = $state(false);
  let cssSwap = $state(true);
  // Between the tap and the swap, a frame later. Input that lands there would
  // act on the board the swap is about to replace, so it waits it out.
  let phasePending = false;
  let wsFrameEl = $state<HTMLElement | null>(null);
  let actionSlotEl = $state<HTMLElement | null>(null);

  function paneMorphName(): string {
    if (phase === "play") return "construct-stage";
    return phase === "pick-start" ? "construct-starts" : "construct-options";
  }

  // The new phase is ready to capture once the step tiles in the frame have
  // drawn, since those are what fly. The pane arrives live (see
  // construct-play-morph.ts), so its pictures keep drawing during the flight.
  function phaseSettled(): boolean {
    return !wsFrameEl || pictographDrawState(wsFrameEl) !== "drawing";
  }

  /** Resolves once `mutate` has run, morphed or not. */
  function morphPhase(mutate: () => void): Promise<void> {
    if (!isGuidedBuild) {
      mutate();
      return Promise.resolve();
    }
    morphing = true;
    cssSwap = false;
    phasePending = true;
    const transition = morphConstructPhase(
      {
        frame: () => wsFrameEl,
        pane: () => pickerPaneEl,
        actions: () => actionSlotEl,
        paneName: paneMorphName,
        settled: phaseSettled,
      },
      mutate
    );
    if (!transition) {
      // Ran plainly, in this same update: the CSS arrivals take over.
      morphing = false;
      cssSwap = true;
      phasePending = false;
      return Promise.resolve();
    }
    void transition.finished
      .catch(() => {})
      .finally(() => (morphing = false));
    return transition.updateCallbackDone
      .catch(() => {})
      .finally(() => (phasePending = false));
  }

  function clearBoard() {
    if (fullPlayer) {
      // Held past the swap: Svelte reads the transition's length when the
      // transition starts, which can be a task after this update lands.
      paneCut = true;
      setTimeout(() => (paneCut = false), DURATION.normal);
    }
    recordHistory();
    steps = [];
    startPlacement = null;
    playing = false;
    playingStepNumber = null;
    editingStepNumber = null;
    dropPlayerRefs();
    startPlacementState.clearSelectedPlacement();
    compactPane = "build";
  }

  // Clearing from the player is Build another: it crosses back like Keep
  // building, onto the start picker.
  function reset(): Promise<void> {
    if (fullPlayer) return morphPhase(clearBoard);
    clearBoard();
    return Promise.resolve();
  }

  // Focus follows the build when a phase change removes the control that held
  // it. The action slot's crossfade covers controls inside the slot; the
  // handlers below cover the rest. Below 1200 px the full demo's play actions
  // sit under the player, outside the slot, so Play hands focus to Keep
  // building and leaving play hands it back to the slot, as the crossfade does
  // where they share it. Either end can be off screen, so it scrolls just into
  // view.
  let actionSwapEl = $state<HTMLElement | null>(null);
  let actionFade = $state<ReturnType<typeof Crossfade> | null>(null);
  let playActionsEl = $state<HTMLElement | null>(null);
  let pickerPaneEl = $state<HTMLElement | null>(null);
  let clearSideEl = $state<HTMLElement | null>(null);

  function holdsFocus(element: HTMLElement | null): boolean {
    return !!element?.contains(document.activeElement);
  }

  function reveal(element: Element | null) {
    element?.scrollIntoView({
      block: "nearest",
      behavior: reducedMotion() ? "instant" : "smooth",
    });
  }

  function play() {
    if (phasePending) return;
    const carry = holdsFocus(actionSwapEl) || holdsFocus(clearSideEl);
    void morphPhase(() => {
      playing = true;
      compactPane = "build";
    }).then(() => {
      if (carry) void focusPlayControls();
    });
  }

  async function focusPlayActions() {
    await tick();
    if (!playActionsEl) return;
    focusFirstOrContainer(playActionsEl, { preventScroll: true });
    reveal(playActionsEl);
  }

  function focusPlayControls() {
    return actionsInSlot ? focusActionSlot() : focusPlayActions();
  }

  function holdsPlayControls(): boolean {
    return holdsFocus(actionsInSlot ? actionSwapEl : playActionsEl);
  }

  // Picking a start swaps the start picker for the step options. They load
  // after the swap, so focus usually lands on the pane itself, and Tab
  // reaches the first option.
  async function focusPickerPane() {
    await tick();
    if (!pickerPaneEl) return;
    focusFirstOrContainer(pickerPaneEl, { preventScroll: true });
  }

  function keepBuilding() {
    if (phasePending) return;
    const carry = holdsPlayControls();
    void morphPhase(() => {
      playing = false;
      playingStepNumber = null;
      compactPane = "build";
      dropPlayerRefs();
    }).then(() => {
      if (carry) void focusActionSlot();
    });
  }

  function buildAnother() {
    if (phasePending) return;
    const carry = holdsPlayControls();
    void reset().then(() => {
      if (carry) void focusActionSlot();
    });
  }

  // Clear sequence goes away with the build it clears, so focus goes to the
  // slot beside it, as it does from Build another.
  function clearSequence() {
    if (phasePending) return;
    const carry = holdsFocus(clearSideEl);
    void reset().then(() => {
      if (carry) void focusActionSlot();
    });
  }

  async function focusActionSlot() {
    await tick();
    reveal(actionFade?.focusShown({ preventScroll: true }) ?? null);
  }
</script>

{#snippet playPhaseActions()}
  <div class="play-actions">
    {#if steps.length < MAX_STEPS}
      <PanelButton variant="secondary" onclick={keepBuilding}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        {t("composer_demo_keep_building")}
      </PanelButton>
    {/if}
    <PanelButton
      variant="primary"
      ariaLabel="Build another"
      onclick={buildAnother}
    >
      <i class="fas fa-rotate-left" aria-hidden="true"></i>
      {t("composer_demo_build_another")}
    </PanelButton>
  </div>
{/snippet}

{#snippet player(sequence: SequenceData)}
  {#await import("#lib/shared/sequence-viewer/components/AnimationPlayer.svelte") then mod}
    <div class="play-pane">
      <div class="player-frame" data-demo-stage>
        <mod.default
          {sequence}
          autoPlay={active && !isContinuous}
          showControls={false}
          hideWordHeader={!isCompactDemo || isGuidedBuild}
          tapToToggle
          progressLine
          progressLineSeekable
          hoverHint="badge"
          leftPropType={effectiveLeftPropType}
          rightPropType={effectiveRightPropType}
          {primaryPropColors}
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
  class:full-player={fullPlayer}
  class:back-from-player={hasLeftPlayer && !fullPlayer}
  class:css-swap={cssSwap}
  class:at-step-cap={steps.length >= MAX_STEPS}
  class:continuous-workspace={isContinuous}
  class:embedded
  bind:this={bandEl}
  bind:clientWidth={demoWidth}
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
          size="md"
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
        {#if isContinuous}
          <div
            class="continuous-preview"
            class:has-motion={!!playSequence}
            role="region"
            aria-label={t("composer_demo_live_preview")}
          >
            {#if playSequence}
              {@render player(playSequence)}
            {:else}
              <p>{t("composer_demo_preview_first_step")}</p>
            {/if}
          </div>
        {/if}

        <!-- WORKSPACE: the real WorkspaceGrid — start column + step columns. -->
        <div class="workspace" class:has-sequence={!!startStepData}>
          <!-- The page's one word row (see ComposerWordRow). No step counter:
               the app doesn't count steps at you. -->
          <ComposerWordRow
            word={rawWord}
            activeStepNumber={(phase === "play" || isContinuous) &&
            playingStepNumber
              ? playingStepNumber
              : null}
            live={tookOver ? "polite" : "off"}
            {propControl}
          >
            {#snippet hint()}
              <p class="hint">
                {#if phase === "pick-start" && act && !tookOver}
                  Watch it build. Tap anything to take over.
                {:else if phase === "pick-start"}
                  Pick a starting position to begin.
                {:else}
                  Tap a pictograph to add it.
                {/if}
              </p>
            {/snippet}
          </ComposerWordRow>

          <div
            class="ws-frame"
            data-start-morph-landing
            bind:this={wsFrameEl}
            bind:clientWidth={wsW}
            bind:clientHeight={wsH}
          >
            {#if startStepData}
              {#if fullPlayer}
                <ConstructPlayStrip
                  start={startStepData}
                  steps={stepData}
                  selectedStepNumber={playingStepNumber}
                  follow={!morphing}
                  onStepClick={handleWorkspaceStepClick}
                  onStartClick={handleWorkspaceStartClick}
                  leftPropType={effectiveLeftPropType}
                  rightPropType={effectiveRightPropType}
                  leftColor={primaryPropColors?.left}
                  rightColor={primaryPropColors?.right}
                />
              {:else if isGuidedBuild}
                <!-- Stacked, this grid gets a short band it can't scroll, and
                     nothing in it can be selected. So it sizes like a passive
                     preview: no floor to overflow at, no room held for a
                     selection pop, and the column count that gives every step
                     the biggest cell that fits. -->
                <StepGrid
                  steps={stepData}
                  startPlacement={startStepData}
                  activeMode="construct"
                  sizingProfile={isCompactDemo ? "preview" : "workbench"}
                  manualColumnCount={isCompactDemo ? null : STEP_COLUMNS}
                  allowFewStepOverflowOnNarrow={false}
                  fitAllSteps={isCompactDemo}
                  arrivalSequence={composedSequence}
                  leftPropTypeOverride={effectiveLeftPropType}
                  rightPropTypeOverride={effectiveRightPropType}
                  leftColorOverride={primaryPropColors?.left}
                  rightColorOverride={primaryPropColors?.right}
                  sequenceWord={rawWord}
                />
              {:else}
                <WorkspaceGrid
                  steps={stepData}
                  startPlacement={startStepData}
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
                  leftPropTypeOverride={effectiveLeftPropType}
                  rightPropTypeOverride={effectiveRightPropType}
                  leftColorOverride={primaryPropColors?.left}
                  rightColorOverride={primaryPropColors?.right}
                  sequenceWord={rawWord}
                />
              {/if}
            {:else}
              <p class="ws-empty" aria-hidden="true">
                {t("composer_demo_sequence_appears")}
              </p>
            {/if}
          </div>

          <!-- The app's ButtonPanel center zone, miniaturized: the canonical green
           View/Play button sits bottom-center of the workspace; during play
           the SAME slot crossfades to Build another (answers "where does Build
           another go on wide screens" — the canonical action slot, not under
           the canvas). -->
          <div class="action-slot" bind:this={actionSlotEl}>
            <!-- Left zone: the real app's clear button — back out of a build to
             pick a different start position. Play phase has Build another. -->
            <div class="slot-side" bind:this={clearSideEl}>
              <!-- Its own block, so clear's arrival and exit play. Across the
               play line the row travels as one piece, so it cuts there. -->
              {#if phase === "add-step"}
                <span
                  class="side-control"
                  in:controlArrive={{
                    edge: "left",
                    ring: 1,
                    lead: arriveLead,
                    animate: () => !morphing,
                  }}
                  out:controlLeave={{
                    edge: "left",
                    ring: 1,
                    animate: () => !morphing,
                  }}
                >
                  <ClearSequenceButton onclick={clearSequence} />
                </span>
              {/if}
            </div>
            <div class="action-swap" bind:this={actionSwapEl}>
              <Crossfade
                bind:this={actionFade}
                key={phase}
                duration={morphing ? 0 : DURATION.normal}
                mode="swap"
                label={phase === "pick-start"
                  ? t("create_ui_choose_your_start_placement")
                  : undefined}
              >
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
                        class:awaiting-step={steps.length === 0}
                      >
                        <ViewSequenceButton purpose="play" onclick={play} />
                      </span>
                    {/if}
                  {:else if phase === "play" && actionsInSlot}
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
                title={canUndo
                  ? t("composer_demo_undo")
                  : t("composer_demo_nothing_undo")}
                aria-label={canUndo
                  ? t("composer_demo_undo")
                  : t("composer_demo_nothing_undo")}
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
        <!-- Turns imply "you can change the playing sequence's turns" — not true
         during playback, so they slide away for the play phase (freeing their
         strip for the player) and return on Keep building / Build another. -->
        {#if phase !== "play" && !isGuidedBuild && (!isContinuous || !isCompactDemo)}
          <div
            class="turns-pair"
            transition:growFade={{ duration: DURATION.normal }}
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

        <!-- PICKER / PLAYER: the real primitives; phase swap lives HERE only. -->
        <div class="picker-pane" bind:this={pickerPaneEl}>
          <!-- Swap, not overlap, for ConstructTabContent's reason: the start
           tiles and the options share no chrome. Play keeps the "build" key,
           so the player keeps its own arrival. -->
          <Crossfade
            key={paneKey}
            duration={paneCut || morphing ? 0 : DURATION.normal}
            mode="swap"
            fill
          >
          {#if phase === "pick-start"}
            {#await import("#lib/features/create/construct/start-placement-picker/components/StartPlacementPicker.svelte") then mod}
              <mod.default
                {startPlacementState}
                embedded
                morphIntoWorkspace
                lockedPath="presets"
                rememberPreferences={false}
                leftPropTypeOverride={effectiveLeftPropType}
                rightPropTypeOverride={effectiveRightPropType}
              />
            {/await}
          {:else if phase === "add-step"}
            {#await import("#lib/features/create/construct/option-picker/components/OptionPicker.svelte") then mod}
              <!-- The FULL option set: every letter family, sectioned into the
               real swipe layout (embla pages + arrows), with the picker's own
               All/Continuous filter pill. The old Type-1-only training wheels
               are off — this is the real construct experience in miniature. -->
              <mod.default
                currentSequence={pickerSequence}
                currentGridMode={gridMode}
                onOptionSelected={handleOptionSelected}
                hideFilters={isGuidedBuild}
                leftPropTypeOverride={effectiveLeftPropType}
                rightPropTypeOverride={effectiveRightPropType}
                leftTurnsOverride={leftTurns}
                rightTurnsOverride={rightTurns}
              />
            {/await}
          {:else if playSequence}
            {@render player(playSequence)}
          {/if}
          </Crossfade>
        </div>

        {#if isContinuous && isCompactDemo && phase !== "play"}
          <details class="continuous-settings">
            <summary>{t("composer_demo_prop_turn_settings")}</summary>
            <div class="continuous-settings-content">
              <div class="turns-pair">
                <div class="tool-group turns-group blue">
                  <span class="tool-label"
                    ><span class="hand-dot blue" aria-hidden="true"></span>{t(
                      "composer_demo_left_turns"
                    )}</span
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
                    ><span class="hand-dot red" aria-hidden="true"></span>{t(
                      "composer_demo_right_turns"
                    )}</span
                  >
                  <SegmentedControl
                    options={TURN_OPTIONS}
                    value={rightTurnsValue}
                    onchange={(v) => (rightTurnsValue = v)}
                    color="red"
                  />
                </div>
              </div>
            </div>
          </details>
        {/if}
      </div>
    </div>

    {#if !actionsInSlot && phase === "play"}
      <div class="compact-play-actions" bind:this={playActionsEl}>
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

  .construct-demo.embedded .demo-shell {
    padding: clamp(1rem, 1.8cqw, 1.5rem);
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .guided-build,
  .guided-build .demo-shell {
    height: 100%;
  }

  .guided-build .demo-columns {
    flex: 1;
    min-height: 0;
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

  /* The page sizes the guided frame to the window's room, and the sequence
     and the picker split it. The grid band asks for what its cells can use:
     one row at the 200px cell cap plus StepGrid's 40px of padding and edge
     room (15rem), or two rows of width-sized cells in a narrow frame. The
     picker takes the rest and never less than half of a short frame (21rem
     once half is more than that, which a tall frame's picker never reaches),
     so a short frame shrinks the band first and StepGrid fits its cells to what
     is left (fitAllSteps). Every height down to the band stays definite: the
     frame is definite, so each flexed size is too. StepGrid's size container
     needs that; see the .ws-frame notes below. */
  .guided-build .compact-layout .sequence-column {
    flex: 0 1 auto;
    min-height: 0;
  }

  .guided-build .compact-layout .build-column {
    flex: 1 1 0;
    min-height: min(50%, 21rem);
  }

  .guided-build .compact-layout .sequence-column .workspace {
    flex: 1 1 auto;
    min-height: 0;
  }

  .guided-build .compact-layout .sequence-column .ws-frame {
    flex: 0 1 min(15rem, 40cqw + 1.5rem);
    height: auto;
    min-height: 0;
  }

  .guided-build .compact-layout .build-column .picker-pane,
  .guided-build.compact-demo.play-phase .build-column .picker-pane {
    flex: 1 1 0;
    height: auto;
    min-height: 0;
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
    font-size: var(--font-size-min, 0.875rem);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
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
    flex: none;
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

  /* Holds Play's height with or without Play, so the first pick doesn't push the
     picker down by the difference. */
  .action-swap-state {
    min-block-size: max(
      var(--min-touch-target),
      var(--workspace-play-action-height, 50px)
    );
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

  .side-control {
    display: grid;
    place-items: center;
  }

  /* Play holds its place before the first step, so the row never reflows, and
     steps forward into it when there is something to play. */
  [data-demo-play] {
    transition:
      opacity var(--duration-fast) var(--ease-standard-out, ease-out),
      transform var(--duration-normal) var(--ease-spring, ease-out),
      visibility 0s;
  }

  [data-demo-play].awaiting-step {
    opacity: 0;
    transform: scale(0.94);
    visibility: hidden;
    transition:
      opacity var(--duration-fast) var(--ease-standard-in, ease-in),
      transform var(--duration-fast) var(--ease-standard-in, ease-in),
      visibility 0s linear var(--duration-fast);
  }

  @media (prefers-reduced-motion: reduce) {
    [data-demo-play],
    [data-demo-play].awaiting-step {
      transition: none;
    }
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
      transform var(--duration-emphasis) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard);
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
    transition-duration: var(--duration-instant);
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
    font-size: var(--font-size-min, 0.875rem);
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

  /* The picker's own 300px floor is for a page that can scroll. A short window
     leaves this pane less than that, and the start tiles sized themselves from
     the floor and ran out of the bottom of the pane. */
  .picker-pane :global(.start-placement-picker) {
    min-height: 0;
  }

  /* The option grid caps its tile size; in a tall picker it top-aligns because
     the single-section fallback drops the grid into a flex item that isn't a
     flex container. Center it, scoped to this demo picker. */
  .picker-pane :global(.swipe-container) {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  /* The type rail sits flush against the carousel. When the grid fills the
     pane's width, its first column touched the rail's edge and read as part of
     the rail; this gives the two the gap the grid keeps between its own tiles
     and a little more. */
  .picker-pane :global(.swipe-layout.type-rail) {
    gap: 0.75rem;
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

  .play-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
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

  /* ===== Full-card player =====
     Play turns the guided card into one player with a step strip. The word row
     and the action row keep the card's top and bottom edges; between them the
     canvas gets everything the strip leaves. The columns dissolve so their
     parts can sit directly on this grid, and every rule above that sized them
     for building loses to the longer selectors here.

     The card's shape picks the strip's side. The canvas is square, so a wide
     card gives it the most room with a column beside it and a tall card with a
     row beneath it. The min-height only matters where no host gives the card a
     height: size containment would otherwise collapse it. */
  .construct-demo.full-player .demo-shell {
    container: play-shell / size;
    min-height: 20rem;
  }

  .construct-demo.full-player .demo-shell .demo-columns {
    --play-tile: clamp(4.25rem, 16cqh, 8rem);
    /* Tile plus the strip's padding and a thin scrollbar. */
    --play-strip-size: calc(var(--play-tile) + 1.5rem);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) var(--play-strip-size) auto;
    grid-template-areas:
      "word"
      "player"
      "strip"
      "actions";
    row-gap: 0.5rem;
    min-height: 0;
  }

  .construct-demo.full-player .sequence-column,
  .construct-demo.full-player .workspace,
  .construct-demo.full-player .build-column {
    display: contents;
  }

  .construct-demo.full-player :global(.word-row) {
    grid-area: word;
    min-width: 0;
  }

  /* Size containment: the strip scrolls its tiles, so however many there are
     they never add to the height of the row it sits in. */
  .construct-demo.full-player .demo-shell .ws-frame {
    grid-area: strip;
    flex: none;
    height: auto;
    min-height: 0;
    margin: 0;
    contain: size;
  }

  .construct-demo.full-player .demo-shell .build-column .picker-pane {
    grid-area: player;
    flex: none;
    height: auto;
    min-height: 0;
    overflow: hidden;
  }

  /* Crossing the play line is a view transition (construct-play-morph.ts);
     these arrivals stand in only when it ran plainly. */
  .construct-demo.css-swap.full-player .demo-shell .ws-frame {
    animation: strip-arrive-from-below var(--duration-normal)
      var(--ease-out, ease-out) both;
  }

  .construct-demo.css-swap.full-player .demo-shell .build-column .picker-pane {
    animation: player-arrive var(--duration-normal)
      var(--ease-out, ease-out) both;
  }

  /* The player's own sizing reserves room for a word header and a full
     transport. Here the word row is above it and the transport is a thin line,
     so the canvas takes that room back, keeping just the line's grab band. */
  .construct-demo.full-player :global(.animation-player),
  .construct-demo.full-player :global(.canvas-wrap) {
    padding: 0;
  }

  .construct-demo.full-player :global(.animation-container) {
    --sequence-seek-target-size: 1rem;
  }

  .construct-demo.full-player :global(.animation-container .content-wrapper) {
    width: min(100cqw, 100cqh - var(--sequence-seek-target-size));
    max-width: none;
  }

  .construct-demo.full-player .action-slot {
    grid-area: actions;
  }

  /* The fixed height stops the row settling when the taller Play button finishes
     fading out, which would nudge the canvas above it. */
  .construct-demo.full-player .action-swap {
    inline-size: auto;
    block-size: var(--min-touch-target);
  }

  /* The strip and the canvas stay together and centered however wide the card
     is, while the word and action rows keep its full width. The canvas column
     is as wide as the height it gets, less what the width can spare. */
  @container play-shell (orientation: landscape) {
    .construct-demo.full-player .demo-shell .demo-columns {
      --play-tile: clamp(5.5rem, 22cqh, 11rem);
      --play-strip-size: calc(var(--play-tile) + 2.5rem);
      grid-template-columns:
        minmax(0, 1fr)
        var(--play-strip-size)
        minmax(
          0,
          min(100cqh - 8.5rem, 100cqw - var(--play-strip-size))
        )
        minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto;
      grid-template-areas:
        "word word word word"
        ". strip player ."
        "actions actions actions actions";
    }

    .construct-demo.full-player .demo-shell .ws-frame {
      padding-inline-end: 0.75rem;
    }

    .construct-demo.css-swap.full-player .demo-shell .ws-frame {
      animation-name: strip-arrive-from-side;
    }
  }

  /* A narrow action row has no room for history beside both actions. Keep
     building leads back to the build, where history lives, so history only
     stays when the eight-step cap has removed that way back. Then Build another
     is alone and gives up the center so history fits beside it. */
  @container play-shell (max-width: 36rem) {
    .construct-demo.full-player .action-slot {
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    }

    .construct-demo.full-player.at-step-cap .action-slot {
      grid-template-columns: 0 auto minmax(0, 1fr);
    }

    .construct-demo.full-player:not(.at-step-cap) .history-side {
      display: none;
    }
  }

  /* The smallest phones fit both labels on one line only without their icons. */
  @container play-shell (max-width: 20rem) {
    .construct-demo.full-player .play-actions {
      gap: 0.5rem;
      white-space: nowrap;
    }

    .construct-demo.full-player .play-actions :global(i) {
      display: none;
    }
  }

  /* Leaving the player, the build rises back into place. The pane is the same
     element in both phases and an animation only restarts when its name changes,
     so arriving in each direction needs its own keyframes. */
  .construct-demo.css-swap.back-from-player .ws-frame,
  .construct-demo.css-swap.back-from-player .picker-pane {
    animation: build-arrive var(--duration-normal)
      var(--ease-out, ease-out) both;
  }

  /* The actions fade out in the narrower column Play is arriving into. Wrapping
     there would make the row taller until they are gone, then let it hop back. */
  .construct-demo.back-from-player .play-actions {
    white-space: nowrap;
  }

  @keyframes player-arrive {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
  }

  @keyframes build-arrive {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
  }

  @keyframes strip-arrive-from-below {
    from {
      opacity: 0;
      transform: translateY(0.75rem);
    }
  }

  @keyframes strip-arrive-from-side {
    from {
      opacity: 0;
      transform: translateX(-0.75rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .construct-demo.css-swap.full-player .demo-shell .ws-frame,
    .construct-demo.css-swap.full-player
      .demo-shell
      .build-column
      .picker-pane {
      animation-name: player-dissolve-in;
    }

    .construct-demo.css-swap.back-from-player .ws-frame,
    .construct-demo.css-swap.back-from-player .picker-pane {
      animation-name: build-dissolve-in;
    }
  }

  @keyframes player-dissolve-in {
    from {
      opacity: 0;
    }
  }

  @keyframes build-dissolve-in {
    from {
      opacity: 0;
    }
  }
</style>
