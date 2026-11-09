<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { SequenceViewerVisibilityState } from "#lib/shared/sequence-viewer/state/viewer-visibility-state.svelte.js";
  import { setViewerVisibilityContext } from "#lib/shared/sequence-viewer/context/viewer-visibility-context.js";
  import {
    flyFade,
    growFade,
    motionDuration,
    reducedMotion,
  } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { createLayoutMotion } from "#lib/shared/transitions/layout-flip.js";
  import { getEscapeLayerManager } from "#lib/shared/keyboard/get-escape-layer-manager.js";
  import { getGuideChromeContext } from "../../_components/guide-chrome-context";
  import { browser } from "$app/env";
  import MotionPathTransitionStage from "./MotionPathTransitionStage.svelte";
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import PathShapePanel from "#lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte";
  import { setAnimationVisibilityContext } from "#lib/shared/animation-engine/state/animation-visibility-context.js";
  import { setAnimationScopeContext } from "#lib/shared/animation-engine/state/animation-scope-context.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import AnimationPanel from "#lib/shared/animation-panel/components/AnimationPanel.svelte";
  import UnifiedTimeline from "#lib/shared/timeline/UnifiedTimeline.svelte";
  import { createAnimatorPlaybackAdapter } from "#lib/shared/timeline/adapters/animator-playback-adapter.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PillId } from "#lib/shared/animation-panel/pill-nav/pill-types.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import ChoreoCard from "#lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import TurnNotationControls from "@tka/shape-engine/app/components/TurnNotationControls.svelte";
  import ShapeMatrixGrid from "@tka/shape-engine/components/ShapeMatrixGrid.svelte";
  import ElementChipRow from "@tka/shape-engine/components/ElementChipRow.svelte";
  import { applyFilter } from "@tka/shape-domain";
  import {
    matrixFiltersForTurns,
    type MatrixLabelMode,
  } from "@tka/shape-domain";
  import {
    flowerKey,
    flowerPetals,
    type Flower,
  } from "@tka/shape-domain";
  import { pairAtTurns } from "@tka/shape-domain";
  import { buildModeRealization } from "@tka/shape-engine/services/build-mode-realizations.js";
  import {
    loadShapeMatrix,
    shapeMatrixTipPoint,
    type ShapeMatrixData,
  } from "@tka/shape-engine/services/shape-matrix-flowers.js";
  import type { VtgMode } from "@tka/shape-domain";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    createMotionPathExplorerState,
    type ExplorerSource,
  } from "../_data/motion-path-explorer-state.svelte";
  import { explorerLayout, type StudioPhase } from "../_data/explorer-layout";
  import { loopDetector } from "#lib/features/create/generate/circular/services/loop-detector.js";
  import { registerLoopDetector } from "#lib/shared/create/get-loop-detector.js";
  import { initializeAppServices } from "#lib/shared/application/state/services.svelte.js";
  import type { TurnValue } from "#lib/shared/create/services/level-turn-values.js";
  import type { MandalaPathShape } from "#lib/shared/mandala/domain/mandala-types.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";

  const explorer = createMotionPathExplorerState();
  const matrixTipDx = $derived(shapeMatrixTipPoint(explorer.propType)?.dx);
  // The toy box under the canvas (Effects, Props, Effort, Display) is the
  // shared animation panel, bound to this surface's own scope.
  setAnimationScopeContext(explorer.scope);
  setAnimationVisibilityContext(explorer.scope.visibility);
  setEffectsConfigContext(explorer.scope.effects);
  // The canvas's own transport, the viewer's: play, the scrubber, and tempo
  // behind its "…" button. It follows the canvas on screen, so while a
  // replacement path loads it still scrubs the one being shown.
  let seekDisplayed: ((step: number) => void) | null = null;
  let displayedSequence = $state.raw<SequenceData | null>(null);
  const transport = createAnimatorPlaybackAdapter({
    getCurrentStep: () => explorer.liveStep,
    getSteps: () => (displayedSequence ?? explorer.sequence).steps,
    getIsPlaying: () => explorer.playing,
    onSeek: (step) => seekDisplayed?.(step),
    onTogglePlay: () => (explorer.playing = !explorer.playing),
    getBpm: () => explorer.bpm,
    onBpmChange: (bpm) => explorer.setBpm(bpm),
  });
  let pickerOpen = $state(false);
  // The screen gives the explorer its room and the explorer composes to it
  // (explorer-layout.ts): nothing here pans. When the room cannot hold what
  // picks what plays beside the canvas, that opens behind one button.
  //
  // `room` is the height this has right now. `layoutRoom` is what it has with
  // the studio shut: a screen that clears its intro for the studio grows `room`
  // while the studio is open, and the mode must not change under it.
  let {
    room = null,
    layoutRoom = null,
    onstudiophase,
  }: {
    room?: number | null;
    layoutRoom?: number | null;
    /** Called in the same flush as the phase it reports, so a screen that
        resizes this in answer is part of what the studio's motion measures. */
    onstudiophase?: (phase: StudioPhase) => void;
  } = $props();
  const restingRoom = $derived(layoutRoom ?? room ?? 0);
  let explorerWidth = $state(0);
  const layout = $derived(explorerLayout(explorerWidth, restingRoom));
  const chooserInGrid = $derived(
    layout.mode === "quad" || layout.mode === "trio"
  );
  // A guide screen shorter than the window the four boxes were drawn for
  // keeps the hand-relationship chips at their compact size.
  const shortRoom = $derived(restingRoom > 0 && restingRoom < 820);
  // A small phone: the studio gives up the transport so the canvas stays large
  // enough to watch while choosing. Playback keeps running.
  const TIGHT_STUDIO_ROOM = 460;
  // The toy box is a studio: one thing at a time. A pill under the canvas
  // opens it on that section. What picks what plays (Trace, the path tiles,
  // the chooser) fades away first, then the canvas takes the room and the
  // section opens beside it (landscape) or under it (portrait). The pills
  // stay under the canvas and switch sections from there; the pressed pill,
  // Back to paths or Escape brings the paths back the same way round. The
  // phases are spelled out in explorer-layout.ts.
  //
  // "Change what plays" is one more such section where it has no box of its
  // own: it opens the same way, from a button in the lesson row.
  type StudioSection = PillId | "sequence";
  let toySection = $state<StudioSection | null>(null);
  // The page the panel shows. It keeps the last section while the panel
  // fades out, so the page does not change under the fade.
  let shownSection = $state<StudioSection>("display");
  const pillSection = $derived(toySection === "sequence" ? null : toySection);
  let studioPhase = $state<StudioPhase>("rest");
  function setStudioPhase(next: StudioPhase): void {
    studioPhase = next;
    onstudiophase?.(next);
  }
  const restFaded = $derived(studioPhase !== "rest");
  const studioLayout = $derived(
    studioPhase === "open" || studioPhase === "closing"
  );
  const TOY_SECTION_KEYS: Partial<Record<StudioSection, string>> = {
    sequence: "guide_paths_change_sequence",
    effects: "guide_paths_effects",
    props: "guide_paths_props",
    effort: "guide_paths_effort",
    display: "guide_paths_display",
  };
  const shownLabel = $derived(
    tDynamic(TOY_SECTION_KEYS[shownSection] ?? "guide_paths_animation")
  );
  // Beside the canvas in a landscape room, the canvas over its section in a
  // portrait one. The shape of the room decides it (explorer-layout.ts), not
  // the window's: a short landscape room has no height for a band under the
  // canvas. The page fits whichever box that leaves (fitRoom): nothing scrolls.
  const studioSideBySide = $derived(layout.studioSide);
  const sequenceShown = $derived(shownSection === "sequence");
  // Stacked on a phone every row counts, and the pressed pill already names the
  // section, so its header gives its height back and Back joins the pills.
  const backInDock = $derived(
    studioLayout &&
      layout.mode === "stack" &&
      !studioSideBySide &&
      !sequenceShown
  );
  // On a phone what plays takes the whole room. The canvas stays mounted out
  // of sight so the playing sequence is still there on the way back.
  const sequenceBesideCanvas = $derived(layout.mode !== "stack");
  let explorerElement = $state<HTMLElement>();
  let phaseTimer: ReturnType<typeof setTimeout> | undefined;
  // The canvas and the dock are what the two layouts share, so they fly
  // between them. The canvas scales as artwork; the dock keeps its pills at
  // their size while its width changes.
  const stageMotion = createLayoutMotion({
    getRoot: () => explorerElement,
    groups: [{ selector: "[data-studio-stage]", datasetKey: "studioStage" }],
    getDuration: () => motionDuration(DURATION.emphasis),
  });
  const dockMotion = createLayoutMotion({
    getRoot: () => explorerElement,
    groups: [
      { selector: "[data-studio-transport]", datasetKey: "studioTransport" },
      { selector: "[data-studio-dock]", datasetKey: "studioDock" },
    ],
    getDuration: () => motionDuration(DURATION.emphasis),
    resize: "layout",
  });

  function recompose(next: "open" | "revealing"): void {
    stageMotion.capture();
    dockMotion.capture();
    setStudioPhase(next);
    void tick().then(() => {
      stageMotion.play();
      dockMotion.play();
      if (next === "open") {
        if (studioPhase === "open") bringStudioIntoView();
        return;
      }
      // Laid out at no opacity by the play above, the lesson's pickers now
      // fade back in, unless a pill was pressed again in the meantime.
      if (studioPhase !== "revealing") return;
      setStudioPhase("rest");
      if (focusChangeOnRest) {
        focusChangeOnRest = false;
        // Hidden until its fade begins, and a hidden button takes no focus.
        afterFade(() => {
          if (studioPhase !== "rest") return;
          explorerElement
            ?.querySelector<HTMLElement>(".change-sequence button")
            ?.focus({ preventScroll: true });
        });
      }
    });
  }

  function bringStudioIntoView(): void {
    const element = explorerElement;
    if (!element) return;
    const margin = parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
    if (Math.abs(element.getBoundingClientRect().top - margin) < 2) return;
    element.scrollIntoView({
      block: "start",
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  }

  function afterFade(next: () => void): void {
    clearTimeout(phaseTimer);
    phaseTimer = setTimeout(next, motionDuration(DURATION.fast));
  }

  function chooseToySection(next: StudioSection | null): void {
    toySection = next;
    if (next !== null) {
      // A pill pressed while what plays is open (or the reverse) changes the
      // shape of the studio, so its canvas and dock fly to their new places.
      if (studioPhase === "open" && (next === "sequence") !== sequenceShown) {
        stageMotion.capture();
        dockMotion.capture();
        shownSection = next;
        void tick().then(() => {
          stageMotion.play();
          dockMotion.play();
        });
        return;
      }
      shownSection = next;
      if (studioPhase === "closing") {
        // Pressed again while the panel was leaving: it comes straight back.
        clearTimeout(phaseTimer);
        setStudioPhase("open");
      }
      if (studioPhase !== "rest" && studioPhase !== "revealing") return;
      setStudioPhase("clearing");
      afterFade(() => recompose("open"));
      return;
    }
    if (studioPhase === "clearing") {
      // Let go before the studio opened: the pickers fade straight back.
      clearTimeout(phaseTimer);
      setStudioPhase("rest");
    } else if (studioPhase === "open") {
      setStudioPhase("closing");
      afterFade(() => recompose("revealing"));
    }
  }

  // Back to paths and Escape leave from inside the panel, which is about to
  // go, so focus goes to what opened it: the pill that was pressed, or the
  // "Change what plays" button once the lesson row is back.
  let focusChangeOnRest = false;
  function leaveStudio(): void {
    focusChangeOnRest = toySection === "sequence";
    const pill = explorerElement?.querySelector<HTMLElement>(
      '[data-studio-dock] [aria-pressed="true"]'
    );
    chooseToySection(null);
    pill?.focus({ preventScroll: true });
  }

  // A window grown until what plays has its own box again: the drill closes.
  $effect(() => {
    if (chooserInGrid && toySection === "sequence")
      untrack(() => chooseToySection(null));
  });

  // While the studio is asked for, Escape leaves it and the guide's floating
  // contents pill stays tucked off the studio's controls.
  const guideChrome = getGuideChromeContext();
  const studioRequested = $derived(toySection !== null);
  $effect(() => {
    if (!studioRequested) return;
    const releaseEscape = getEscapeLayerManager().register({
      id: "motion-paths:toy-studio",
      canDismiss: () => true,
      dismiss: leaveStudio,
    });
    const releasePill = guideChrome?.holdPillAway();
    return () => {
      releaseEscape();
      releasePill?.();
    };
  });

  // The public guide may run without the app's shortcut service, which is
  // what normally hands Escape to the layer manager.
  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (!studioRequested) return;
    event.preventDefault();
    getEscapeLayerManager().dismissTopLayer();
  }

  $effect(() => () => {
    clearTimeout(phaseTimer);
    stageMotion.cancel();
    dockMotion.cancel();
  });
  // Which hands the canvas draws. The animator owns per-hand motion
  // visibility; this surface scopes its own instance so a header's solo hides
  // the other prop and its trail through that owner, as the Shape Engine does.
  const motionVisibility = new SequenceViewerVisibilityState(true);
  setViewerVisibilityContext(motionVisibility);
  $effect(() => {
    const solo = explorer.soloHand;
    untrack(() => {
      motionVisibility.leftMotion = solo !== "right";
      motionVisibility.rightMotion = solo !== "left";
    });
  });
  // The first thing on screen is a real matrix shape, not a frozen example.
  // One turn each keeps both hands drawing petals (pro 2, anti 4), and mixing
  // pro with anti means the Hybrid default puts each hand on a different path.
  const DEFAULT_TURN: TurnValue = 1;
  const DEFAULT_PAIR: { left: Flower; right: Flower } = {
    left: {
      style: "pro",
      turns: DEFAULT_TURN,
      ori: "in",
      grid: "diamond",
      petals: flowerPetals({ style: "pro", turns: DEFAULT_TURN }),
    },
    right: {
      style: "anti",
      turns: DEFAULT_TURN,
      ori: "in",
      grid: "diamond",
      petals: flowerPetals({ style: "anti", turns: DEFAULT_TURN }),
    },
  };
  let ready = $state(false);
  let playerFailed = $state(false);
  let matrixData = $state<ShapeMatrixData | null>(null);
  let matrixPreviews = $state<Map<string, ShapeMatrixData>>(new Map());
  let matrixError = $state<string | null>(null);
  let leftTurn = $state<TurnValue>(DEFAULT_TURN);
  let rightTurn = $state<TurnValue>(DEFAULT_TURN);
  let labelMode = $state<MatrixLabelMode>("turns");
  let mounted = true;
  let matrixRequest = 0;
  const matrixFilters = $derived(matrixFiltersForTurns(leftTurn, rightTurn));
  // The matrix always traces prop tips. Hand paths are identical across the
  // whole grid, so a hands-traced matrix would show one shape in every cell.
  const previewMatrix = $derived(
    matrixPreviews.get(
      `${explorer.selectedPath}:tips:${explorer.selectedPath === "hybrid" ? explorer.fixedPath : "arc"}`
    )
  );
  const rowAxis = $derived(
    matrixData ? applyFilter(matrixData.axis, matrixFilters.left, false) : []
  );
  const colAxis = $derived(
    matrixData ? applyFilter(matrixData.axis, matrixFilters.right, false) : []
  );

  const SOURCE_OPTIONS: { value: ExplorerSource; label: string }[] = $derived([
    { value: "matrix", label: tDynamic("guide_paths_shape_matrix") },
    { value: "sequence", label: tDynamic("guide_paths_sequence") },
  ]);

  function describeHand(flower: Flower): string {
    if (flower.style === "float") return tDynamic("guide_paths_float");
    const style =
      flower.style === "pro"
        ? tDynamic("guide_paths_prospin")
        : tDynamic("guide_paths_antispin");
    const turns = tDynamic(
      flower.turns === 1 ? "guide_paths_one_turn" : "guide_paths_many_turns",
      { count: flower.turns }
    );
    return `${style}, ${turns}`;
  }

  // One plain line for what the canvas is playing. Sighted readers get it
  // from the canvas's own glyphs; this line is announced, not shown.
  const nowPlaying = $derived.by(() => {
    if (explorer.source === "sequence") {
      const word = simplifyRepeatedWord(explorer.browsed.word ?? "");
      const count = explorer.browsed.steps.length;
      const steps = tDynamic(
        count === 1 ? "guide_paths_one_step" : "guide_paths_many_steps",
        { count }
      );
      return word
        ? `${word}, ${steps}.`
        : tDynamic("guide_paths_browsed_sequence", { steps });
    }
    const pair = explorer.selectedPair;
    if (!pair) return tDynamic("guide_paths_loading_sequence");
    if (explorer.soloHand === "left")
      return tDynamic("guide_paths_left_solo", {
        hand: describeHand(pair.left),
      });
    if (explorer.soloHand === "right")
      return tDynamic("guide_paths_right_solo", {
        hand: describeHand(pair.right),
      });
    return tDynamic("guide_paths_both_hands", {
      left: describeHand(pair.left),
      right: describeHand(pair.right),
    });
  });

  function chooseSource(value: ExplorerSource): void {
    if (value === explorer.source) return;
    if (value === "sequence") explorer.showSequence();
    else
      explorer.showMatrix(
        pairAtTurns(DEFAULT_PAIR, leftTurn, rightTurn),
        buildMatrixSequence
      );
  }

  function chooseTurn(hand: "left" | "right", value: TurnValue): void {
    if (hand === "left") leftTurn = value;
    else rightTurn = value;
    // A turn change asks to see the same shapes at the new turn value, so the
    // loaded animation follows the selection instead of going stale.
    const pair = explorer.selectedPair;
    if (!pair) return;
    explorer.chooseMatrixPair(
      pairAtTurns(pair, leftTurn, rightTurn),
      buildMatrixSequence
    );
  }

  // A prop change reloads the matrix for that prop's tips. The current grid
  // stays on screen until the new one is ready, and the selection is kept.
  async function loadMatrix(): Promise<void> {
    const request = ++matrixRequest;
    const propType = explorer.propType;
    matrixError = null;
    try {
      const paths: MandalaPathShape[] = ["arc", "linear", "concave", "hybrid"];
      const previews = await Promise.all(
        paths.flatMap((pathShape) =>
          (pathShape === "hybrid"
            ? (["arc", "linear", "concave"] as const)
            : (["arc"] as const)
          ).map(async (hybridFallback) => {
            const data = await loadShapeMatrix(propType, {
              pathShape,
              trace: "tips",
              hybridFallback,
            });
            return [`${pathShape}:tips:${hybridFallback}`, data] as const;
          })
        )
      );
      if (mounted && request === matrixRequest) {
        matrixPreviews = new Map(previews);
        // Realization matching uses the original flower geometry. Changing
        // the displayed path should never select a different sequence.
        matrixData = matrixPreviews.get("arc:tips:arc")!;
        if (!explorer.selectedPair)
          explorer.chooseMatrixPair(DEFAULT_PAIR, buildMatrixSequence);
      }
    } catch {
      if (mounted && request === matrixRequest)
        matrixError = tDynamic("guide_paths_matrix_error");
    }
  }

  async function buildMatrixSequence(
    pair: { left: Flower; right: Flower },
    mode: VtgMode
  ) {
    if (!matrixData) return null;
    const realization = await buildModeRealization(
      pair,
      {
        left: matrixData.left.get(flowerKey(pair.left))?.left ?? [],
        right: matrixData.right.get(flowerKey(pair.right))?.right ?? [],
        tips: matrixData.tips,
      },
      mode
    );
    return realization?.seq ?? null;
  }

  function choosePropType(propType: PropType): void {
    if (propType === explorer.propType) return;
    explorer.propType = propType;
    void loadMatrix();
  }

  onMount(() => {
    // The toy box's prop look, fan build, colours and grip are the viewer's
    // saved settings, the ones the canvas and the card's pictographs draw.
    // Until the settings owner starts, those picks are dropped. The canvas
    // already loads it, so starting it here adds no download.
    initializeAppServices().catch(() => {});
    registerLoopDetector(loopDetector);
    void loadMatrix();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    explorer.playing = !preference.matches;
    const pauseForReducedMotion = () => {
      if (preference.matches) explorer.playing = false;
    };
    preference.addEventListener("change", pauseForReducedMotion);
    return () => {
      mounted = false;
      preference.removeEventListener("change", pauseForReducedMotion);
    };
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- One section's page, for the studio panel. -->
{#snippet sectionPage()}
  <AnimationPanel
    isExporting={false}
    layout="bottom"
    presentation="content"
    controlledSection={shownSection === "sequence" ? null : shownSection}
    isPlaying={explorer.playing}
    bpm={explorer.bpm}
    onBpmChange={explorer.setBpm}
    onPlaybackToggle={() => (explorer.playing = !explorer.playing)}
    showEffectsPlayback={false}
    showTempoControls={false}
    showPathShape={false}
    showWordToggle={false}
    selectedPropType={explorer.propType}
    onPropChange={choosePropType}
    sequence={explorer.sequence}
    fillPages
    fitRoom
  />
{/snippet}

<!-- Which of the two sources plays. In the drill it shares the header row with
     Back, which leaves the matrix the height. -->
{#snippet sourceChoice()}
  <SegmentedControl
    options={SOURCE_OPTIONS}
    value={explorer.source}
    size={layout.mode === "stack" ? "sm" : undefined}
    ariaLabel={tDynamic("guide_paths_sequence_source")}
    onchange={chooseSource}
  />
{/snippet}

<!-- What plays: the played sequence has two sources. Each owns its own controls
     and its own stage, and the two swap in place. The box decides how they sit:
     side by side when it is wider than tall, the stage taking the rest of the
     height when it is not. -->
{#snippet chooserBody(inStudio: boolean)}
  <div class="chooser-box">
    <div class="chooser">
      <div class="source-controls">
        {#if !inStudio}
          <div class="picker-heading">{@render sourceChoice()}</div>
        {/if}
        <!-- Stacked, the box eases between the two control heights. Beside a
             stage in the four boxes the controls fill their row, so the layers
             fill the box and the chips take what the turn picker leaves. -->
        <Crossfade
          key={explorer.source}
          duration={DURATION.normal}
          animateHeight
          fill={layout.mode === "quad"}
        >
          {#if explorer.source === "matrix"}
            <div class="matrix-controls">
              <div class="turn-picker">
                <TurnNotationControls
                  {leftTurn}
                  {rightTurn}
                  {labelMode}
                  oneRow={layout.mode !== "quad"}
                  onturn={chooseTurn}
                  onlabelmodechange={(value) => (labelMode = value)}
                />
              </div>
              <!-- Timing and direction belong to the matrix pair. A solo has
                   one hand, so the row leaves with it. -->
              {#if !explorer.soloHand}
                <div
                  class="relationship"
                  transition:growFade={{
                    axis: "y",
                    duration: DURATION.normal,
                  }}
                >
                  <ElementChipRow
                    selected={explorer.selectedMode}
                    columns={layout.mode === "quad" ? 3 : 2}
                    compact={layout.mode !== "quad" || shortRoom}
                    fill={layout.mode === "quad" && !shortRoom}
                    disabled={!explorer.selectedPair}
                    onpick={(mode) =>
                      explorer.chooseHandRelationship(
                        mode,
                        buildMatrixSequence
                      )}
                  />
                </div>
              {/if}
            </div>
          {:else}
            <div class="browse-row">
              <PanelButton fullWidth onclick={() => (pickerOpen = true)}
                >{tDynamic("guide_paths_browse_sequences")}</PanelButton
              >
            </div>
          {/if}
        </Crossfade>
        <!-- The strip keeps its height while idle so a build in progress
             moves nothing beside it. -->
        <div class="picker-feedback" aria-live="polite">
          {#if explorer.pickerStatus === "loading"}
            <span>{tDynamic("guide_paths_building_sequence")}</span>
          {:else if explorer.pickerError}
            <span role="alert"
              >{tDynamic(
                explorer.pickerError.startsWith("That hand relationship")
                  ? "guide_paths_relationship_error"
                  : "guide_paths_sequence_error"
              )}</span
            >
            <PanelButton onclick={explorer.retryMatrixSelection}
              >{tDynamic("guide_paths_try_again")}</PanelButton
            >
          {/if}
        </div>
      </div>
      <!-- The stage is the largest square its share of the box holds, and the
           matrix's cells shrink to share it. -->
      <div class="source-stage">
        <div class="source-square">
          <Crossfade key={explorer.source} duration={DURATION.normal} fill>
            {#if explorer.source === "matrix"}
              <div class="matrix-stage" aria-busy={!matrixData && !matrixError}>
                {#if matrixError}
                  <div class="matrix-status error" role="alert">
                    <p>{matrixError}</p>
                    <PanelButton onclick={() => void loadMatrix()}
                      >{tDynamic("guide_paths_try_again")}</PanelButton
                    >
                  </div>
                {:else if !matrixData}
                  <p class="matrix-status" role="status">
                    {tDynamic("guide_paths_building_matrix")}
                  </p>
                {:else}
                  <ShapeMatrixGrid
                    data={previewMatrix}
                    {rowAxis}
                    {colAxis}
                    maxCellPx={108}
                    minCellPx={14}
                    selectedPair={explorer.selectedPair}
                    soloHand={explorer.soloHand}
                    onselect={(pair) =>
                      explorer.chooseMatrixPair(pair, buildMatrixSequence)}
                    onsolo={(hand, flower) =>
                      explorer.chooseMatrixSolo(
                        hand,
                        flower,
                        pairAtTurns(DEFAULT_PAIR, leftTurn, rightTurn),
                        buildMatrixSequence
                      )}
                  />
                {/if}
              </div>
            {:else}
              <!-- The browsed sequence's card, with the notation the player is
                   reading. The path controls change the animation, not the
                   notation, so the card stays put while the path switches.
                   Contained, the card picks the grid that best fills the
                   matrix's square. -->
              <div class="card-stage">
                <ChoreoCard
                  sequence={explorer.browsed}
                  showWord
                  showStepNumbers
                  includeStartPlacement={false}
                  showDifficultyLevel={false}
                  showNotes={false}
                  showLoopGlyph={false}
                  darkMode
                  leftPropType={explorer.propType}
                  rightPropType={explorer.propType}
                  hideSoloHeader
                  forceContain
                  fitWidth
                />
              </div>
            {/if}
          </Crossfade>
        </div>
      </div>
    </div>
  </div>
{/snippet}

<section
  class="explorer"
  style:--explorer-room={room != null ? `${room}px` : undefined}
  style:--canvas-column={layout.canvasColumn
    ? `${layout.canvasColumn}px`
    : undefined}
  style:--tile-column={layout.tileColumn
    ? `${layout.tileColumn}px`
    : undefined}
  aria-label={tDynamic("guide_paths_comparison")}
  bind:clientWidth={explorerWidth}
  bind:this={explorerElement}
>
  <div
    class="explorer-workspace mode-{layout.mode}"
    class:beside={layout.tilesBeside}
    class:studio={studioLayout}
    class:tight={layout.mode === "stack" &&
      room != null &&
      room < TIGHT_STUDIO_ROOM}
    class:back-in-dock={backInDock}
    class:side={studioSideBySide && !sequenceShown}
    class:sequence={sequenceShown}
    class:with-canvas={sequenceBesideCanvas}
    class:faded={restFaded && !studioLayout}
  >
    <!-- The path comes first. It is the one thing this page teaches, so it is
         the first thing to see and the first thing to touch. -->
    <div class="path-column">
      <div class="path-panel" data-rest-only inert={restFaded}>
        <PathShapePanel
          showHelp={false}
          fill={layout.mode !== "stack" || layout.tilesBeside}
          columns={layout.tileColumns}
          onSettingChange={() => explorer.syncPolicy()}
        >
          {#snippet preview(path: MandalaPathShape, size: number)}
            <SequenceMandala
              sequence={explorer.variants[path]}
              pathShape={path}
              show={explorer.soloHand ?? "both"}
              {size}
              mode="gallery"
              darkMode
              leftPropType={explorer.propType}
              rightPropType={explorer.propType}
              tipEnds={1}
              tipDx={explorer.trace === "hands" ? 0 : matrixTipDx}
              animate={false}
            />
          {/snippet}
        </PathShapePanel>
      </div>
      <!-- Trace is the lesson's own switch: which point the mandala follows.
           Everything else about the canvas lives in the toy box under it. -->
      <div class="lesson" data-rest-only inert={restFaded}>
        <div class="trace-choice">
          <span class="control-label">{tDynamic("guide_paths_trace")}</span>
          <SegmentedControl
            options={[
              { value: "hands", label: tDynamic("guide_paths_hands") },
              { value: "tips", label: tDynamic("guide_paths_prop_tips") },
            ]}
            value={explorer.trace}
            size={layout.mode === "stack" ? "sm" : undefined}
            ariaLabel={tDynamic("guide_paths_trace_point")}
            onchange={(value) => (explorer.trace = value)}
          />
        </div>
        {#if !chooserInGrid}
          <div class="change-sequence">
            <PanelButton onclick={() => chooseToySection("sequence")}>
              {tDynamic("guide_paths_change_sequence")}
              <i class="fas fa-chevron-right chooser-chevron" aria-hidden="true"
              ></i>
            </PanelButton>
          </div>
        {/if}
      </div>
    </div>

    <div class="motion-column">
      <div
        class="motion-stage"
        aria-label={tDynamic("guide_paths_selected_animation")}
      >
        <div class="animation" data-studio-stage>
          {#if browser}
            <MotionPathTransitionStage
              sequence={explorer.sequence}
              transitionKey={explorer.transitionKey}
              scope={explorer.scope}
              playing={explorer.playing}
              bpm={explorer.bpm}
              trace={explorer.trace}
              leftPropType={explorer.propType}
              rightPropType={explorer.propType}
              hideGlyph={explorer.soloHand !== null}
              onplayingchange={(value) => (explorer.playing = value)}
              onstepchange={(value) => (explorer.liveStep = value)}
              onseekref={(seek) => (seekDisplayed = seek)}
              ondisplayedsequencechange={(shown) => (displayedSequence = shown)}
              onready={() => {
                ready = true;
                playerFailed = false;
              }}
              onloaderror={() => {
                ready = true;
                playerFailed = true;
              }}
            />
          {/if}
          {#if !ready}<span class="loading" role="status"
              >{tDynamic("guide_paths_loading_animation")}</span
            >{/if}
        </div>
      </div>
      <div class="canvas-transport" data-studio-transport>
        <UnifiedTimeline playback={transport} compact />
      </div>
      <!-- The toy box: the same controls the viewer and the Shape Engine
           offer, scoped to this canvas. Path shape is left out because the
           tiles beside the canvas are that control here, and tempo because
           the transport above holds it. Its pills open the studio and stay
           its section tabs. -->
      <div class="toy-box" data-studio-dock>
        {#if backInDock}
          <div
            class="dock-back"
            transition:growFade={{ axis: "x", duration: DURATION.normal }}
          >
            <PanelButton
              onclick={leaveStudio}
              ariaLabel={tDynamic("guide_paths_back")}
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
            </PanelButton>
          </div>
        {/if}
        <div class="toy-pills">
          <AnimationPanel
            isExporting={false}
            layout="bottom"
            isPlaying={explorer.playing}
            bpm={explorer.bpm}
            onBpmChange={explorer.setBpm}
            onPlaybackToggle={() => (explorer.playing = !explorer.playing)}
            showEffectsPlayback={false}
            showTempoControls={false}
            showPathShape={false}
            showWordToggle={false}
            selectedPropType={explorer.propType}
            onPropChange={choosePropType}
            sequence={explorer.sequence}
            presentation="navigation"
            controlledSection={pillSection}
            onActiveSectionChange={chooseToySection}
            regionLabel={tDynamic("guide_paths_animation_controls")}
          />
        </div>
      </div>
      <span class="sr-only" aria-live="polite">{nowPlaying}</span>
    </div>

    {#if chooserInGrid}
      <section
        class="chooser-cell"
        aria-label={tDynamic("guide_paths_change_sequence")}
        data-rest-only
        inert={restFaded}
      >
        {@render chooserBody(false)}
      </section>
    {/if}

    {#if studioPhase === "open"}
      <!-- Fades out before the layout changes back, over the same beat the
           layout waits for; a pill pressed mid-fade reverses it. -->
      <section
        class="toy-section"
        aria-label={tDynamic("guide_paths_settings", { section: shownLabel })}
        transition:flyFade={{ y: 8, duration: DURATION.fast }}
      >
        {#if backInDock}
          <h3 class="sr-only">{shownLabel}</h3>
        {:else}
          <header class="toy-section-header">
            <PanelButton
              onclick={leaveStudio}
              ariaLabel={tDynamic("guide_paths_back")}
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              {#if !(sequenceShown && layout.mode === "stack")}
                <span>{tDynamic("guide_paths_back")}</span>
              {/if}
            </PanelButton>
            {#if sequenceShown}
              <h3 class="sr-only">{shownLabel}</h3>
              <div class="header-source">{@render sourceChoice()}</div>
            {:else}
              <h3 class="toy-section-title">{shownLabel}</h3>
            {/if}
          </header>
        {/if}
        <div class="toy-section-body" class:sequence-body={sequenceShown}>
          {#if sequenceShown}
            {@render chooserBody(true)}
          {:else}
            <Crossfade key={shownSection} duration={DURATION.normal} fill>
              <div class="dense-page">
                {@render sectionPage()}
              </div>
            </Crossfade>
          {/if}
        </div>
      </section>
    {/if}
  </div>
</section>

{#if pickerOpen}
  {#await import("#lib/shared/components/sequence-picker/SequencePickerModal.svelte")}
    <p role="status">{tDynamic("guide_paths_loading_picker")}</p>
  {:then { default: SequencePickerModal }}
    <SequencePickerModal
      open
      onClose={() => (pickerOpen = false)}
      onSelect={(sequence) => explorer.chooseSequence(sequence)}
      title={tDynamic("guide_paths_picker_title")}
    />
  {:catch}
    <p role="alert">{tDynamic("guide_paths_picker_error")}</p>
    <PanelButton onclick={() => (pickerOpen = false)}
      >{tDynamic("guide_paths_close")}</PanelButton
    >
  {/await}
{/if}

<style>
  .explorer {
    container-type: inline-size;
    min-width: 0;
    /* Under the fixed site header when something scrolls to it. */
    scroll-margin-top: calc(56px + var(--spacing-md, 16px));
  }
  /* The workspace is exactly the room its screen gives it, in every mode.
     What goes in it comes from explorer-layout.ts, so nothing can push the
     screen taller than its frame. */
  .explorer-workspace {
    position: relative;
    display: grid;
    align-items: stretch;
    gap: var(--spacing-lg, 24px);
    height: var(--explorer-room);
    min-width: 0;
  }

  /* ── The tiles and the lesson row ─────────────────────────────────── */
  .path-column {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
    min-height: 0;
  }
  .path-panel {
    display: grid;
    flex: 1 1 0;
    /* The panel's width sets the tiles' width, so the tiles must never set the
       panel's: an open-ended column stayed as wide as the tiles it held, and
       after a window resize they ran under the canvas and never shrank back. */
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 0;
  }
  .path-panel :global(.path-header) {
    align-items: center;
    min-height: 24px;
    margin-bottom: var(--spacing-sm, 8px);
  }
  .path-panel :global(.rt-section-label) {
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    flex-shrink: 0;
  }
  .path-panel :global(.path-shape-grid) {
    margin-top: 0;
    min-height: 0;
  }
  .lesson {
    display: flex;
    flex-wrap: wrap;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm, 8px);
    min-height: 44px;
  }
  .trace-choice {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
  }
  /* A set width, not a flex basis: the row sizes itself from content, and
     a basis is not content, so the control would shrink to the labels and
     wrap the longer one. */
  .trace-choice :global(.segmented-control) {
    flex: 0 1 auto;
    width: 13rem;
    max-width: 100%;
  }
  .control-label {
    color: var(--theme-text-muted);
    font-size: var(--font-size-sm, 14px);
  }
  .change-sequence > :global(button) {
    flex-shrink: 0;
  }
  .chooser-chevron {
    margin-left: var(--spacing-xs, 4px);
  }

  /* ── The canvas, its transport and its pills ──────────────────────── */
  .motion-column {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  /* The canvas is the largest square the room holds. */
  .motion-stage {
    display: grid;
    flex: 1 1 0;
    place-items: center;
    width: 100%;
    min-height: 0;
    container-type: size;
  }
  .animation {
    position: relative;
    width: min(100cqw, 100cqh);
    aspect-ratio: 1;
  }
  .loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    color: var(--theme-text-muted);
  }
  /* The transport sits on the canvas's bottom edge, as in the viewer. It
     counts the steps of the path that is loading, so its row is there from
     the first paint and nothing moves when the canvas arrives. */
  .canvas-transport {
    flex-shrink: 0;
    min-width: 0;
    overflow: hidden;
    border-radius: 12px;
  }
  .toy-box {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    min-width: 0;
    margin-top: var(--spacing-sm, 8px);
  }
  .toy-pills {
    flex: 1 1 0;
    min-width: 0;
  }
  .dock-back {
    flex: none;
    overflow: hidden;
    padding-inline-end: var(--spacing-xs, 4px);
  }

  /* ── What plays ───────────────────────────────────────────────────── */
  .chooser-cell {
    min-width: 0;
    min-height: 0;
  }
  .chooser-box {
    container: chooser / size;
    flex: 1 1 0;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .chooser {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--spacing-sm, 8px);
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
  }
  /* Wider than tall: the controls beside the largest square left over. */
  @container chooser (min-aspect-ratio: 5 / 4) {
    .chooser {
      grid-template-rows: minmax(0, 1fr);
      grid-template-columns:
        minmax(16rem, 1fr)
        minmax(0, min(100cqh, calc(100cqw - 16rem - var(--spacing-sm, 8px))));
    }
  }
  .source-controls,
  .matrix-controls {
    display: grid;
    align-content: start;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
  }
  .picker-heading {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    min-height: 44px;
  }
  .picker-heading :global(.segmented-control) {
    flex: 1;
  }
  .browse-row {
    margin-block: var(--spacing-xs, 4px);
  }
  .turn-picker {
    display: grid;
    gap: var(--spacing-xs, 4px);
    min-width: 0;
    margin-block: var(--spacing-xs, 4px);
    container-type: inline-size;
  }
  .relationship {
    min-width: 0;
  }
  .picker-feedback {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    min-height: 1.4em;
    color: var(--theme-text-muted);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
  }
  .source-stage {
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    container-type: size;
  }
  .source-square {
    position: relative;
    width: min(100cqw, 100cqh);
    aspect-ratio: 1;
  }
  /* A phone keeps the strip's row for the matrix: a build in progress speaks
     over the matrix's foot, and moves nothing. */
  .mode-stack .chooser {
    position: relative;
  }
  .mode-stack .picker-feedback {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    z-index: 1;
    justify-content: center;
    min-height: 0;
    background: var(--theme-panel-bg);
  }
  .mode-stack .picker-feedback:not(:empty) {
    padding: var(--spacing-xs, 4px);
  }
  .card-stage {
    width: 100%;
    height: 100%;
    min-width: 0;
  }
  .matrix-stage {
    height: 100%;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-panel-bg);
  }
  .matrix-status {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--spacing-sm, 8px);
    height: 100%;
    margin: 0;
    padding: var(--spacing-md, 16px);
    color: var(--theme-text-muted);
    text-align: center;
  }
  .matrix-status p {
    margin: 0;
  }
  .matrix-status.error {
    color: var(--semantic-error);
  }

  /* ── The four modes (explorer-layout.ts) ──────────────────────────── */
  /* Four boxes: the tiles and the canvas over the controls and the matrix,
     the top row a little taller because its transport rows are fixed. */
  .mode-quad:not(.studio) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1.2fr) minmax(0, 1fr);
  }
  .mode-quad:not(.studio) .motion-column {
    justify-self: center;
    width: 100%;
    max-width: 640px;
  }
  .mode-quad .chooser-cell {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  /* The columns match the workspace, so the stage sits under the canvas and
     the controls under the tiles. */
  .mode-quad .chooser {
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: var(--spacing-lg, 24px);
    padding-top: var(--spacing-md, 16px);
    border-top: 1px solid var(--theme-stroke);
  }
  /* The controls fill the row: heading, then the crossfaded controls, then
     the status strip. The crossfade's layers fill that middle box, so a
     source switch changes nothing beside it, and the chip row takes what the
     turn picker leaves. */
  .mode-quad .source-controls {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .mode-quad .source-controls > :global(.crossfade.fill) {
    flex: 1 1 0;
    height: auto;
    min-height: 0;
  }
  .mode-quad .matrix-controls {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .mode-quad .relationship {
    flex: 1 1 0;
    min-height: 0;
  }
  /* Three columns: wide but not tall. The canvas takes all the height it can
     use; the tiles and what plays share the width left. */
  .mode-trio:not(.studio) {
    grid-template-columns:
      minmax(0, 0.7fr) var(--canvas-column) minmax(0, 1.5fr);
    grid-template-rows: minmax(0, 1fr);
  }
  /* The tiles beside the canvas, what plays one tap away. */
  .mode-split:not(.studio) {
    grid-template-columns: minmax(0, 1fr) var(--canvas-column);
    grid-template-rows: minmax(0, 1fr);
  }
  /* A phone: the canvas with its tiles beside it or in a row under it. Every
     piece is a grid item here, so the canvas takes whatever height is left. */
  .mode-stack:not(.studio) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto auto auto auto;
    grid-template-areas: "stage" "transport" "dock" "tiles" "lesson";
    gap: var(--spacing-sm, 8px);
  }
  .mode-stack.beside:not(.studio) {
    grid-template-columns: minmax(0, 1fr) var(--tile-column);
    grid-template-rows: minmax(0, 1fr) auto auto auto;
    grid-template-areas:
      "stage tiles"
      "transport tiles"
      "dock tiles"
      "lesson lesson";
  }
  .mode-stack:not(.studio) .path-column,
  .mode-stack:not(.studio) .motion-column {
    display: contents;
  }
  .mode-stack:not(.studio) .motion-stage {
    grid-area: stage;
  }
  .mode-stack:not(.studio) .canvas-transport {
    grid-area: transport;
  }
  .mode-stack:not(.studio) .toy-box {
    grid-area: dock;
    margin-top: 0;
  }
  .mode-stack:not(.studio) .path-panel {
    grid-area: tiles;
  }
  .mode-stack:not(.studio) .lesson {
    grid-area: lesson;
    flex-wrap: nowrap;
    min-height: 36px;
  }
  /* Too narrow for a caption; the tile's own label names the path. The tiles
     take the panel's first row then, so that row is the one that stretches. */
  .mode-stack.beside .path-panel {
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .mode-stack.beside .path-panel :global(.path-header) {
    display: none;
  }
  /* The dock's four pills share a phone's width rather than scrolling it. */
  .mode-stack .toy-box {
    --min-touch-target: 2rem;
  }
  /* One line on a phone: the segmented control names its own choices. */
  .mode-stack .control-label,
  .mode-stack .chooser-chevron {
    display: none;
  }
  .mode-stack .trace-choice {
    flex: none;
  }
  .mode-stack .trace-choice :global(.segmented-control) {
    width: auto;
    white-space: nowrap;
  }

  /* ── Leaving for the studio and coming back ───────────────────────── */
  /* The lesson's pickers leave before the studio takes their room and come
     back after it gives the room back. */
  [data-rest-only] {
    transition:
      opacity var(--transition-fast),
      visibility var(--transition-fast);
  }
  .faded [data-rest-only] {
    opacity: 0;
    visibility: hidden;
  }
  .studio [data-rest-only] {
    display: none;
  }
  .toy-section {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-panel-bg);
  }
  /* A panel still finishing its fade when the lesson layout returns stays
     out of the lesson's grid. */
  .explorer-workspace:not(.studio) .toy-section {
    position: absolute;
    visibility: hidden;
  }
  .back-in-dock .toy-section {
    grid-template-rows: minmax(0, 1fr);
  }
  .toy-section-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-md, 16px);
    min-height: var(--min-touch-target, 44px);
    padding: var(--spacing-xs, 4px) var(--spacing-sm, 8px);
    border-bottom: 1px solid var(--theme-stroke);
  }
  .toy-section-header :global(.panel-btn) {
    flex: 0 0 auto;
  }
  .header-source {
    flex: 1 1 0;
    min-width: 0;
  }
  .toy-section-title {
    margin: 0;
    min-width: 0;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
  }
  .toy-section-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  /* The name the chips answer to: at phone width they become one row of six
     icons (ElementChipRow), the way the Shape Engine draws them on a phone. */
  .toy-section-body.sequence-body {
    container: shape-matrix-app / inline-size;
    padding: var(--spacing-sm, 8px);
    box-sizing: border-box;
  }
  .toy-section-body > :global(.crossfade) {
    flex: 1 1 0;
    min-height: 0;
  }
  /* The page fills this box and does not scroll (fitRoom), so the inset is all
     that stands between its tiles and the panel's edge. */
  .dense-page {
    height: 100%;
    padding: 6px 8px;
    box-sizing: border-box;
  }

  /* ── The studio ───────────────────────────────────────────────────── */
  /* The canvas, its pills and one section, nothing else. Stacked, the section
     is a band under the pills; side by side, it takes the tiles' column and
     the canvas grows where it already was. */
  .explorer-workspace.studio {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(0, clamp(11rem, 42%, 28rem));
    gap: var(--spacing-md, 16px);
  }
  .explorer-workspace.studio.tight:not(.side, .sequence) {
    grid-template-rows: minmax(0, 1fr) minmax(0, 10rem);
  }
  .explorer-workspace.studio.back-in-dock {
    gap: var(--spacing-sm, 8px);
  }
  .studio.tight .canvas-transport {
    display: none;
  }
  /* Side by side, the canvas group sets the height: a square canvas as wide
     as its column, its transport and its pills, up to the room. A wide column
     no longer leaves a band of empty stage above and below the canvas, and
     the section card is placed beside it without sizing the row (see
     .toy-section below). */
  .explorer-workspace.studio.side {
    height: auto;
    max-height: var(--explorer-room);
    grid-template-columns: clamp(18rem, 40%, 40rem) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }
  /* The canvas and its pills are one group, centered in the room, so a
     column taller than it is wide doesn't leave the pills under a strip of
     empty stage. */
  .studio .motion-column {
    grid-column: 1;
    grid-row: 1;
    justify-content: center;
    align-self: stretch;
    container-type: inline-size;
  }
  .studio.side .motion-column {
    grid-column: 2;
  }
  /* Positioned in its grid area rather than placed in it, so its content
     never stretches the row: the card is exactly as tall as the canvas group
     beside it, and every page spends that height (see fillPages). Both lines
     are named: a positioned box with an open end line reaches the grid's
     edge instead of its track's. */
  .studio.side .toy-section {
    position: absolute;
    inset: 0;
    grid-column: 1 / 2;
    grid-row: 1 / 2;
  }
  .studio .motion-stage {
    max-height: 100cqw;
  }
  /* Its own square first. A room too short for it squeezes the stage, and
     the canvas inside takes the stage's shorter side. */
  .studio.side .motion-stage {
    flex: 0 1 auto;
    aspect-ratio: 1;
    max-height: none;
  }
  /* What plays in the studio: beside the canvas, which holds still, or the
     whole room on a phone with the canvas mounted out of sight. */
  .explorer-workspace.studio.sequence {
    grid-template-rows: minmax(0, 1fr);
  }
  .explorer-workspace.studio.sequence .toy-section {
    grid-column: 1;
    grid-row: 1;
  }
  .explorer-workspace.studio.sequence.with-canvas {
    grid-template-columns: minmax(0, 1fr) min(var(--canvas-column, 50%), 50%);
  }
  .studio.sequence.with-canvas .motion-column {
    grid-column: 2;
  }
  .studio.sequence:not(.with-canvas) .motion-column {
    position: absolute;
    inset: 0;
    visibility: hidden;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    [data-rest-only] {
      transition: none;
    }
  }
</style>
