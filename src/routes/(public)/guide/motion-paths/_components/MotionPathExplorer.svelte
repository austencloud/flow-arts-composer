<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { SequenceViewerVisibilityState } from "$lib/shared/sequence-viewer/state/viewer-visibility-state.svelte";
  import { setViewerVisibilityContext } from "$lib/shared/sequence-viewer/context/viewer-visibility-context";
  import {
    createIntrinsicHeightMotion,
    flyFade,
    growFade,
    motionDuration,
    reducedMotion,
    type IntrinsicHeightMotion,
  } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { createLayoutMotion } from "$lib/shared/transitions/layout-flip";
  import { getEscapeLayerManager } from "$lib/shared/keyboard/get-escape-layer-manager";
  import { getGuideChromeContext } from "../../_components/guide-chrome-context";
  import { browser } from "$app/environment";
  import MotionPathTransitionStage from "./MotionPathTransitionStage.svelte";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import PathShapePanel from "$lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte";
  import { setAnimationVisibilityContext } from "$lib/shared/animation-engine/state/animation-visibility-context";
  import { setAnimationScopeContext } from "$lib/shared/animation-engine/state/animation-scope-context";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import AnimationPanel from "$lib/shared/animation-panel/components/AnimationPanel.svelte";
  import UnifiedTimeline from "$lib/shared/timeline/UnifiedTimeline.svelte";
  import { createAnimatorPlaybackAdapter } from "$lib/shared/timeline/adapters/animator-playback-adapter.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PillId } from "$lib/shared/animation-panel/pill-nav/pill-types";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import TurnNotationControls from "$lib/shared/shape-matrix/app/components/TurnNotationControls.svelte";
  import ShapeMatrixGrid from "$lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte";
  import ElementChipRow from "$lib/shared/shape-matrix/components/ElementChipRow.svelte";
  import { applyFilter } from "$lib/shared/shape-matrix/domain/filter-flower-axis";
  import {
    matrixFiltersForTurns,
    type MatrixLabelMode,
  } from "$lib/shared/shape-matrix/domain/matrix-turn-band";
  import {
    flowerKey,
    flowerPetals,
    type Flower,
  } from "$lib/shared/shape-matrix/domain/flower-signature";
  import { pairAtTurns } from "$lib/shared/shape-matrix/domain/flower-at-turn";
  import { buildModeRealization } from "$lib/shared/shape-matrix/services/build-mode-realizations";
  import {
    loadShapeMatrix,
    shapeMatrixTipPoint,
    type ShapeMatrixData,
  } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
  import type { VtgMode } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    createMotionPathExplorerState,
    type ExplorerSource,
  } from "../_data/motion-path-explorer-state.svelte";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import type { TurnValue } from "$lib/shared/create/services/level-turn-values";
  import type { MandalaPathShape } from "$lib/shared/mandala/domain/mandala-types";

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
  // The lesson is the path. Everything that picks what plays (the matrix, a
  // browsed sequence, turns, timing) waits behind one button.
  let chooserOpen = $state(false);
  // Four boxes on one screen. Once the tiles and the canvas sit side by side
  // (a 900px container) on a viewport tall enough (900px), the workspace
  // takes the viewport's height, every box scales to its quadrant and the
  // chooser is simply there. The fit-mode CSS below carries the same two
  // thresholds; this flag drives what CSS cannot (the tiles' size, the
  // chooser's presence, the chips' shape).
  const FIT_MIN_CONTAINER = 900;
  const FIT_MEDIA = "(min-height: 900px)";
  let explorerWidth = $state(0);
  let viewportTall = $state(false);
  const fitMode = $derived(explorerWidth >= FIT_MIN_CONTAINER && viewportTall);
  // The toy box is a studio: one thing at a time. A pill under the canvas
  // opens it on that section. What picks what plays (Trace, the path tiles,
  // the chooser) fades away first, then the canvas takes the room and the
  // section opens beside it (landscape) or under it (portrait). The pills
  // stay under the canvas and switch sections from there; the pressed pill,
  // Back to paths or Escape brings the paths back the same way round.
  //
  //   rest       the lesson layout
  //   clearing   the lesson's pickers fading out, layout unchanged
  //   open       studio layout, section panel showing
  //   closing    studio layout, section panel fading out
  //   revealing  lesson layout back, its pickers about to fade in
  type StudioPhase = "rest" | "clearing" | "open" | "closing" | "revealing";
  let toySection = $state<PillId | null>(null);
  // The page the panel shows. It keeps the last section while the panel
  // fades out, so the page does not change under the fade.
  let shownSection = $state<PillId>("display");
  let studioPhase = $state<StudioPhase>("rest");
  const restFaded = $derived(studioPhase !== "rest");
  const studioLayout = $derived(
    studioPhase === "open" || studioPhase === "closing"
  );
  const TOY_SECTION_LABELS: Partial<Record<PillId, string>> = {
    effects: "Effects",
    props: "Props",
    effort: "Effort",
    display: "Display",
  };
  const shownLabel = $derived(TOY_SECTION_LABELS[shownSection] ?? "Animation");
  // Side by side on a landscape screen, the canvas over its section on a
  // portrait one. The shape of the screen decides it, not its width: a short
  // landscape room (a phone on its side, a zoomed-in laptop) has no height
  // for a band under the canvas. The minimum only keeps the section's own
  // column plus some canvas. The side-by-side panel is tall, so it gets the
  // inspector's page; the stacked one is short and wide, so it gets the dock
  // tray's dense page.
  const STUDIO_SIDE_MIN_CONTAINER = 480;
  let landscape = $state(false);
  const studioSideBySide = $derived(
    explorerWidth >= STUDIO_SIDE_MIN_CONTAINER && landscape
  );
  // Side by side, the canvas group sets the studio's height and the card
  // beside it takes the height of the page it shows. A short page (Effort,
  // Display) gets a card its own size instead of one stretched down the
  // canvas; a page laid out in whatever room it has (Props, Effects) gets
  // all of it and scrolls. Undefined until the page first reports.
  let studioPageHeight = $state<number | null>();
  let studioRowHeight = $state(0);
  let toySectionHeaderHeight = $state(0);
  let toySectionElement = $state<HTMLElement>();
  let cardMotion = $state<IntrinsicHeightMotion | null>(null);
  let cardRowHeight = 0;
  $effect(() => {
    const element = toySectionElement;
    if (!element || !studioSideBySide) return;
    const motion = createIntrinsicHeightMotion(element);
    cardMotion = motion;
    return () => {
      motion.cancel();
      cardMotion = null;
      cardRowHeight = 0;
      studioPageHeight = undefined;
    };
  });
  $effect(() => {
    const motion = cardMotion;
    const element = toySectionElement;
    const page = studioPageHeight;
    const row = studioRowHeight;
    const header = toySectionHeaderHeight;
    if (!motion || !element || page === undefined || row <= 0) return;
    untrack(() => {
      const border = element.offsetHeight - element.clientHeight;
      const target =
        page === null ? row : Math.min(header + page + border, row);
      // A page that changed height animates there. A room that changed size
      // (a resized window, the card's first page) takes the card with it.
      const from =
        row === cardRowHeight
          ? (motion.currentHeight() ?? element.offsetHeight)
          : target;
      cardRowHeight = row;
      motion.resize(from, target);
    });
  });
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
    studioPhase = next;
    void tick().then(() => {
      stageMotion.play();
      dockMotion.play();
      if (next === "open") {
        if (studioPhase === "open") bringStudioIntoView();
        return;
      }
      // Laid out at no opacity by the play above, the lesson's pickers now
      // fade back in, unless a pill was pressed again in the meantime.
      if (studioPhase === "revealing") studioPhase = "rest";
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

  function chooseToySection(next: PillId | null): void {
    toySection = next;
    if (next !== null) {
      shownSection = next;
      if (studioPhase === "closing") {
        // Pressed again while the panel was leaving: it comes straight back.
        clearTimeout(phaseTimer);
        studioPhase = "open";
      }
      if (studioPhase !== "rest" && studioPhase !== "revealing") return;
      studioPhase = "clearing";
      afterFade(() => recompose("open"));
      return;
    }
    if (studioPhase === "clearing") {
      // Let go before the studio opened: the pickers fade straight back.
      clearTimeout(phaseTimer);
      studioPhase = "rest";
    } else if (studioPhase === "open") {
      studioPhase = "closing";
      afterFade(() => recompose("revealing"));
    }
  }

  // Back to paths and Escape leave from inside the panel, which is about to
  // go, so focus goes to the pill that was pressed.
  function leaveStudio(): void {
    const pill = explorerElement?.querySelector<HTMLElement>(
      '[data-studio-dock] [aria-pressed="true"]'
    );
    chooseToySection(null);
    pill?.focus({ preventScroll: true });
  }

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

  const SOURCE_OPTIONS: { value: ExplorerSource; label: string }[] = [
    { value: "matrix", label: "Shape matrix" },
    { value: "sequence", label: "Sequence" },
  ];

  function describeHand(flower: Flower): string {
    if (flower.style === "float") return "float";
    const turns = flower.turns === 1 ? "1 turn" : `${flower.turns} turns`;
    return `${flower.style}, ${turns}`;
  }

  // One plain line for what the canvas is playing. Sighted readers get it
  // from the canvas's own glyphs; this line is announced, not shown.
  const nowPlaying = $derived.by(() => {
    if (explorer.source === "sequence") {
      const word = simplifyRepeatedWord(explorer.browsed.word ?? "");
      const count = explorer.browsed.steps.length;
      const steps = `${count} ${count === 1 ? "step" : "steps"}`;
      return word ? `${word}, ${steps}.` : `A browsed sequence, ${steps}.`;
    }
    const pair = explorer.selectedPair;
    if (!pair) return "Loading a sequence…";
    if (explorer.soloHand === "left")
      return `Left hand ${describeHand(pair.left)}, on its own.`;
    if (explorer.soloHand === "right")
      return `Right hand ${describeHand(pair.right)}, on its own.`;
    return `Left hand ${describeHand(pair.left)}. Right hand ${describeHand(pair.right)}.`;
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
        matrixError = "The Shape Matrix could not load.";
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
    registerLoopDetector(loopDetector);
    void loadMatrix();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    explorer.playing = !preference.matches;
    const pauseForReducedMotion = () => {
      if (preference.matches) explorer.playing = false;
    };
    preference.addEventListener("change", pauseForReducedMotion);
    const tall = window.matchMedia(FIT_MEDIA);
    viewportTall = tall.matches;
    const syncTall = () => (viewportTall = tall.matches);
    tall.addEventListener("change", syncTall);
    const orientation = window.matchMedia("(orientation: landscape)");
    landscape = orientation.matches;
    const syncOrientation = () => (landscape = orientation.matches);
    orientation.addEventListener("change", syncOrientation);
    return () => {
      mounted = false;
      preference.removeEventListener("change", pauseForReducedMotion);
      tall.removeEventListener("change", syncTall);
      orientation.removeEventListener("change", syncOrientation);
    };
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- One section's page, for the studio panel. -->
{#snippet sectionPage(layout: "bottom" | "sidebar")}
  <AnimationPanel
    isExporting={false}
    {layout}
    presentation="content"
    controlledSection={shownSection}
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
    onPageHeight={layout === "sidebar"
      ? (height) => (studioPageHeight = height)
      : undefined}
  />
{/snippet}

<section
  class="explorer"
  aria-label="Motion path comparison"
  bind:clientWidth={explorerWidth}
  bind:this={explorerElement}
>
  <div
    class="explorer-workspace"
    class:studio={studioLayout}
    class:side={studioSideBySide}
    class:faded={restFaded && !studioLayout}
  >
    <!-- The path comes first. It is the one thing this page teaches, so it is
         the first thing to see and the first thing to touch. -->
    <div class="path-column" data-rest-only inert={restFaded}>
      <PathShapePanel
        showHelp={false}
        fill={fitMode}
        onSettingChange={() => explorer.syncPolicy()}
      >
        {#snippet preview(path, size)}
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

    <div class="motion-column" bind:clientHeight={studioRowHeight}>
      <!-- Trace is the lesson's own switch: which point the mandala follows.
           Everything else about the canvas lives in the toy box under it. -->
      <div class="transport" data-rest-only inert={restFaded}>
        <span class="stage-label">Animation</span>
        <div class="trace-choice">
          <span class="control-label">Trace</span>
          <SegmentedControl
            options={[
              { value: "hands", label: "Hands" },
              { value: "tips", label: "Prop tips" },
            ]}
            value={explorer.trace}
            ariaLabel="Trace point"
            onchange={(value) => (explorer.trace = value)}
          />
        </div>
      </div>
      <div class="motion-stage" aria-label="Selected path animation">
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
              >Loading animation…</span
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
          controlledSection={toySection}
          onActiveSectionChange={chooseToySection}
          regionLabel="Animation controls"
        />
      </div>
      <span class="sr-only" aria-live="polite">{nowPlaying}</span>
      {#if !fitMode}
        <div class="now-playing" data-rest-only inert={restFaded}>
          <PanelButton
            ariaExpanded={chooserOpen}
            ariaControls="motion-path-chooser"
            onclick={() => (chooserOpen = !chooserOpen)}
          >
            Change what plays
            <i
              class="fas fa-chevron-down chooser-chevron"
              class:open={chooserOpen}
              aria-hidden="true"
            ></i>
          </PanelButton>
        </div>
      {/if}
    </div>

    {#if chooserOpen || fitMode}
      <!-- The played sequence has two sources. Each owns its own controls and
           its own stage, and the two swap in place. -->
      <section
        id="motion-path-chooser"
        class="chooser"
        aria-label="Change what plays"
        data-rest-only
        inert={restFaded}
        transition:growFade={{ axis: "y", duration: DURATION.normal }}
      >
        <div class="source-controls">
          <div class="picker-heading">
            <SegmentedControl
              options={SOURCE_OPTIONS}
              value={explorer.source}
              ariaLabel="Sequence source"
              onchange={chooseSource}
            />
          </div>
          <!-- Stacked, the box eases between the two control heights. In fit
               mode the controls fill their row, so the layers fill the box
               and the chips take whatever the turn picker leaves. -->
          <Crossfade
            key={explorer.source}
            duration={DURATION.normal}
            animateHeight
            fill={fitMode}
          >
            {#if explorer.source === "matrix"}
              <div class="matrix-controls">
                <div class="turn-picker">
                  <TurnNotationControls
                    {leftTurn}
                    {rightTurn}
                    {labelMode}
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
                      columns={3}
                      compact={!fitMode}
                      fill={fitMode}
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
                  >Browse sequences</PanelButton
                >
              </div>
            {/if}
          </Crossfade>
          <!-- The strip keeps its height while idle so a build in progress
               moves nothing beside it. -->
          <div class="picker-feedback" aria-live="polite">
            {#if explorer.pickerStatus === "loading"}
              <span>Building that sequence…</span>
            {:else if explorer.pickerError}
              <span role="alert">{explorer.pickerError}</span>
              <PanelButton onclick={explorer.retryMatrixSelection}
                >Try again</PanelButton
              >
            {/if}
          </div>
        </div>
        <!-- The stage is a square the height of the controls beside it (never
             smaller than 20rem, never larger than the matrix's 34rem), so the
             chooser packs into one band with nothing under the controls. -->
        <div class="source-stage">
          <Crossfade key={explorer.source} duration={DURATION.normal} fill>
            {#if explorer.source === "matrix"}
              <div class="matrix-stage" aria-busy={!matrixData && !matrixError}>
                {#if matrixError}
                  <div class="matrix-status error" role="alert">
                    <p>{matrixError}</p>
                    <PanelButton onclick={() => void loadMatrix()}
                      >Try again</PanelButton
                    >
                  </div>
                {:else if !matrixData}
                  <p class="matrix-status" role="status">
                    Building the Shape Matrix…
                  </p>
                {:else}
                  <ShapeMatrixGrid
                    data={previewMatrix}
                    {rowAxis}
                    {colAxis}
                    maxCellPx={108}
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
      </section>
    {/if}

    {#if studioPhase === "open"}
      <!-- Fades out before the layout changes back, over the same beat the
           layout waits for; a pill pressed mid-fade reverses it. -->
      <section
        class="toy-section"
        aria-label="{shownLabel} settings"
        transition:flyFade={{ y: 8, duration: DURATION.fast }}
        bind:this={toySectionElement}
      >
        <header
          class="toy-section-header"
          bind:offsetHeight={toySectionHeaderHeight}
        >
          <PanelButton onclick={leaveStudio}>
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
            <span>Back to paths</span>
          </PanelButton>
          <h3 class="toy-section-title">{shownLabel}</h3>
        </header>
        <div class="toy-section-body">
          {#if studioSideBySide}
            {@render sectionPage("sidebar")}
          {:else}
            <Crossfade key={shownSection} duration={DURATION.normal} fill>
              <div class="dense-page">
                {@render sectionPage("bottom")}
              </div>
            </Crossfade>
          {/if}
        </div>
      </section>
    {/if}
  </div>
</section>

{#if pickerOpen}
  {#await import("$lib/shared/components/sequence-picker/SequencePickerModal.svelte")}
    <p role="status">Loading sequence picker…</p>
  {:then { default: SequencePickerModal }}
    <SequencePickerModal
      open
      onClose={() => (pickerOpen = false)}
      onSelect={(sequence) => explorer.chooseSequence(sequence)}
      title="Compare a sequence’s motion paths"
    />
  {:catch}
    <p role="alert">The sequence picker could not load.</p>
    <PanelButton onclick={() => (pickerOpen = false)}>Close</PanelButton>
  {/await}
{/if}

<style>
  .explorer {
    container-type: inline-size;
    min-width: 0;
    /* Under the fixed site header when something scrolls to it. */
    scroll-margin-top: calc(56px + var(--spacing-md, 16px));
  }
  .explorer-workspace,
  .chooser {
    display: grid;
    align-items: start;
    gap: var(--spacing-lg, 24px);
    min-width: 0;
  }
  .chooser {
    gap: var(--spacing-sm, 8px);
    padding-top: var(--spacing-md, 16px);
    border-top: 1px solid var(--theme-stroke);
  }
  .source-controls,
  .matrix-controls {
    display: grid;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
  }
  .picker-heading,
  .transport,
  .now-playing {
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
  /* Stacked, the stage is a square as wide as the matrix reads well; the
     layers inside fill it, so the card takes the matrix's square and the
     swap changes nothing below. */
  .source-stage {
    position: relative;
    width: 100%;
    max-width: 34rem;
    aspect-ratio: 1;
    min-width: 0;
  }
  .card-stage {
    width: 100%;
    height: 100%;
    min-width: 0;
  }
  .stage-label {
    margin: 0;
    margin-right: auto;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
  }
  .turn-picker {
    display: grid;
    gap: var(--spacing-xs, 4px);
    min-width: 0;
    margin-block: var(--spacing-xs, 4px);
    container-type: inline-size;
  }
  .control-label {
    color: var(--theme-text-muted);
    font-size: var(--font-size-sm, 14px);
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
  .picker-feedback {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    min-height: 2.8em;
    color: var(--theme-text-muted);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
  }
  .motion-column,
  .path-column {
    min-width: 0;
    width: 100%;
  }
  .motion-column {
    max-width: 580px;
    margin-inline: auto;
  }
  /* Stacked, the canvas and the first row of tiles share one phone screen,
     and the chooser opens right under the button that names it. Side by
     side, the path comes first; the placements below make that explicit. */
  .path-column {
    order: 1;
  }
  .animation {
    position: relative;
    aspect-ratio: 1;
  }
  .motion-stage {
    width: 100%;
  }
  .loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    color: var(--theme-text-muted);
  }
  .transport {
    flex-wrap: wrap;
    margin-bottom: var(--spacing-sm, 8px);
  }
  .now-playing {
    justify-content: flex-end;
    margin-top: var(--spacing-sm, 8px);
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
    flex-shrink: 0;
    min-width: 0;
    margin-top: var(--spacing-sm, 8px);
  }
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
  .toy-section-body > :global(.animator-inspector),
  .toy-section-body > :global(.crossfade) {
    flex: 1 1 0;
    min-height: 0;
  }
  /* The panel reads top-down under its header, as the Shape Engine's
     customize pane does, instead of floating a short page mid-column. */
  .toy-section-body :global(.panel-center-inner) {
    margin-block: 0 auto;
  }
  .toy-section-body :global(.panel-center-inner:not(.fill-body)) {
    padding-top: var(--spacing-sm, 8px);
  }
  /* The dense page scrolls itself and ends on its own padding. The inset is
     the dock tray's, which these pages are drawn for. A short page (the
     tempo row) sits in the middle of the band rather than over a strip of
     empty panel; a tall one scrolls from its top. */
  .dense-page {
    height: 100%;
    padding-inline: 14px;
    box-sizing: border-box;
  }
  .dense-page :global(.external-section-body) {
    display: grid;
    align-content: safe center;
  }
  .now-playing > :global(button) {
    flex-shrink: 0;
  }
  .chooser-chevron {
    margin-left: var(--spacing-xs, 4px);
    transition: transform var(--duration-fast) var(--ease-out);
  }
  .chooser-chevron.open {
    transform: rotate(180deg);
  }
  .relationship {
    min-width: 0;
  }
  .path-column :global(.path-header) {
    align-items: center;
    min-height: 44px;
    margin-bottom: var(--spacing-sm, 8px);
  }
  .path-column :global(.rt-section-label) {
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    flex-shrink: 0;
  }
  .path-column :global(.path-shape-grid) {
    margin-top: 0;
  }
  .trace-choice {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    margin-left: auto;
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
  @container (min-width: 640px) {
    .explorer-workspace {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .path-column {
      display: grid;
      grid-column: 1;
      grid-row: 1;
      grid-template-rows: auto minmax(0, 1fr);
      align-self: stretch;
      order: 0;
    }
    .motion-column {
      grid-column: 2;
      grid-row: 1;
      display: flex;
      flex-direction: column;
      align-self: stretch;
    }
    /* The transport stays on the canvas; the room left over goes under it. */
    .canvas-transport {
      margin-bottom: auto;
    }
    .path-column :global(.path-shape-grid) {
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }
    .chooser {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
  /* Two columns in the chooser only once the controls column can hold the
     timing chips unclipped. The columns match the workspace so the stage
     sits under the canvas and the controls under the tiles. The stage
     stretches to the row the controls set and takes its width from that. */
  @container (min-width: 900px) {
    .chooser {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      column-gap: var(--spacing-lg, 24px);
    }
    .source-controls {
      grid-column: 1;
      align-self: start;
    }
    .source-stage {
      grid-column: 2;
      align-self: stretch;
      justify-self: center;
      width: auto;
      max-width: 100%;
      min-height: 20rem;
      max-height: 34rem;
    }
  }
  @container (min-width: 1100px) {
    .motion-column {
      max-width: 640px;
    }
  }
  /* Fit mode: the same two thresholds as the script. The workspace takes the
     viewport under the 56px site header, the top row gets a little more than
     the bottom (its transport and caption rows are fixed), and each box is
     the largest square its quadrant holds. Capped where the natural layout
     already fits. */
  @container (min-width: 900px) {
    @media (min-height: 900px) {
      .explorer-workspace {
        height: min(calc(100dvh - 56px - 2 * var(--spacing-md, 16px)), 1400px);
        grid-template-rows: minmax(0, 1.2fr) minmax(0, 1fr);
        align-items: stretch;
      }
      .path-column,
      .motion-column,
      .path-column :global(.path-shape-grid) {
        min-height: 0;
      }
      .motion-stage {
        display: flex;
        justify-content: center;
        flex: 1 1 0;
        min-height: 0;
        margin-bottom: 0;
      }
      .animation {
        height: 100%;
        width: auto;
        max-width: 100%;
      }
      .chooser {
        grid-template-rows: minmax(0, 1fr);
        align-self: stretch;
        min-height: 0;
      }
      /* The controls fill the row: heading, then the crossfaded controls,
         then the status strip. The crossfade's layers fill that middle box,
         so a source switch changes nothing the page anchors its scroll to,
         and the chip row takes what the turn picker leaves. */
      .source-controls {
        display: flex;
        flex-direction: column;
        align-self: stretch;
        min-height: 0;
      }
      .source-controls > :global(.crossfade.fill) {
        flex: 1 1 0;
        height: auto;
        min-height: 0;
      }
      .matrix-controls {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }
      .relationship {
        flex: 1 1 0;
        min-height: 0;
      }
      .source-stage {
        align-self: center;
        height: 100%;
        min-height: 0;
        max-height: 34rem;
      }
    }
  }
  /* The studio: the canvas, its pills and one section, nothing else. Like
     fit mode it takes the viewport under the site header. Stacked, the
     section is a band under the pills; side by side, it takes the tiles'
     column and the canvas grows where it already was. */
  .explorer-workspace.studio {
    height: min(calc(100dvh - 56px - 2 * var(--spacing-md, 16px)), 1400px);
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(0, clamp(16rem, 42%, 28rem));
    align-items: stretch;
    gap: var(--spacing-md, 16px);
  }
  /* Side by side, the canvas group sets the height: a square canvas as wide
     as its column, its transport and its pills, up to the room under the
     site header. A wide column no longer leaves a band of empty stage above
     and below the canvas, and the section card is placed beside it without
     sizing the row (see .toy-section below). */
  .explorer-workspace.studio.side {
    position: relative;
    height: auto;
    max-height: min(calc(100dvh - 56px - 2 * var(--spacing-md, 16px)), 1400px);
    grid-template-columns: clamp(18rem, 40%, 40rem) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }
  /* The canvas and its pills are one group, centered in the room, so a
     column taller than it is wide doesn't leave the pills under a strip of
     empty stage. */
  .studio .motion-column {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-self: stretch;
    max-width: none;
    min-height: 0;
    container-type: inline-size;
  }
  .studio.side .motion-column {
    grid-column: 2;
  }
  /* Positioned in its grid area rather than placed in it, so its content
     never stretches the row. The script sets its height to the page's own
     height, capped at the canvas group's, and animates the change when the
     section changes. Both lines are named: a positioned box with an open
     end line reaches the grid's edge instead of its track's. */
  .studio.side .toy-section {
    position: absolute;
    inset: 0 0 auto;
    grid-column: 1 / 2;
    grid-row: 1 / 2;
    max-height: 100%;
  }
  /* The canvas is the largest square the room holds. */
  .studio .motion-stage {
    flex: 1 1 0;
    min-height: 0;
    max-height: 100cqw;
    margin: 0;
    container-type: size;
    display: grid;
    place-items: center;
  }
  .studio .animation {
    width: min(100cqw, 100cqh);
    height: auto;
    max-width: none;
  }
  /* Its own square first. A room too short for it squeezes the stage, and
     the canvas inside takes the stage's shorter side. */
  .studio.side .motion-stage {
    flex: 0 1 auto;
    aspect-ratio: 1;
    max-height: none;
  }
  /* The canvas, its transport and the pills stay one centered group. */
  .studio .canvas-transport {
    margin-bottom: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    [data-rest-only] {
      transition: none;
    }
  }
</style>
