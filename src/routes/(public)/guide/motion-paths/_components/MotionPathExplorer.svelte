<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { SequenceViewerVisibilityState } from "$lib/shared/sequence-viewer/state/viewer-visibility-state.svelte";
  import { setViewerVisibilityContext } from "$lib/shared/sequence-viewer/context/viewer-visibility-context";
  import { growFade } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { browser } from "$app/environment";
  import MotionPathTransitionStage from "./MotionPathTransitionStage.svelte";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import PathShapePanel from "$lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte";
  import { setAnimationVisibilityContext } from "$lib/shared/animation-engine/state/animation-visibility-context";
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
  import StepStrip from "$lib/shared/timeline/StepStrip.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
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
  const matrixTipDx = shapeMatrixTipPoint(PropType.STAFF)?.dx;
  setAnimationVisibilityContext(explorer.scope.visibility);
  let pickerOpen = $state(false);
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
  // pro with anti means Hybrid differs from Arc on the first click.
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
  let displayedSequence = $state<SequenceData | null>(null);
  let stageSeek = $state<((step: number) => void) | null>(null);
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

  async function loadMatrix(): Promise<void> {
    const request = ++matrixRequest;
    matrixError = null;
    matrixData = null;
    try {
      const paths: MandalaPathShape[] = ["arc", "linear", "concave", "hybrid"];
      const previews = await Promise.all(
        paths.flatMap((pathShape) =>
          (pathShape === "hybrid"
            ? (["arc", "linear", "concave"] as const)
            : (["arc"] as const)
          ).map(async (hybridFallback) => {
            const data = await loadShapeMatrix(PropType.STAFF, {
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
        tipPoint: matrixData.tipPoint,
        clubTipDx: matrixData.clubTipDx,
      },
      mode
    );
    return realization?.seq ?? null;
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
    return () => {
      mounted = false;
      preference.removeEventListener("change", pauseForReducedMotion);
    };
  });
</script>

<section class="explorer" aria-label="Motion path comparison">
  <div class="explorer-workspace">
    <!-- The played sequence has two sources. Each owns its own controls and
         its own stage, and the two swap in place. -->
    <section class="shape-picker" aria-label="Sequence source">
      <div class="source-controls">
        <div class="picker-heading">
          <SegmentedControl
            options={SOURCE_OPTIONS}
            value={explorer.source}
            ariaLabel="Sequence source"
            onchange={chooseSource}
          />
        </div>
        <Crossfade
          key={explorer.source}
          duration={DURATION.normal}
          animateHeight
        >
          {#if explorer.source === "matrix"}
            <div class="turn-picker">
              <TurnNotationControls
                {leftTurn}
                {rightTurn}
                {labelMode}
                onturn={chooseTurn}
                onlabelmodechange={(value) => (labelMode = value)}
              />
            </div>
          {:else}
            <div class="browse-row">
              <PanelButton fullWidth onclick={() => (pickerOpen = true)}
                >Browse sequences</PanelButton
              >
            </div>
          {/if}
        </Crossfade>
      </div>
      <div class="source-stage">
        <Crossfade key={explorer.source} duration={DURATION.normal}>
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
                leftPropType={PropType.STAFF}
                rightPropType={PropType.STAFF}
                hideSoloHeader
                forceContain
                fitWidth
              />
            </div>
          {/if}
        </Crossfade>
      </div>

      <div class="picker-feedback" aria-live="polite">
        {#if explorer.pickerStatus === "loading"}
          <span>Building that sequence…</span>
        {:else if explorer.pickerError}
          <span role="alert">{explorer.pickerError}</span>
          <PanelButton onclick={explorer.retryMatrixSelection}
            >Try again</PanelButton
          >
        {:else}
          <span
            >{explorer.source === "sequence"
              ? "Switch the path while it plays."
              : explorer.soloHand
                ? "One hand on its own. Pick a cell to pair it again."
                : explorer.selectedPair
                  ? "Change the motion path to compare these shapes."
                  : "Pick a cell to animate its shapes."}</span
          >
        {/if}
      </div>
    </section>

    <div class="comparison">
      <div class="motion-column">
        <div class="transport">
          <span class="stage-label">Animation</span>
          <PanelButton
            disabled={!ready || playerFailed}
            onclick={() => (explorer.playing = !explorer.playing)}
          >
            {explorer.playing ? "Pause" : "Play"}
          </PanelButton>
          <PanelButton
            ariaPressed={explorer.guides}
            onclick={explorer.toggleGuides}>Path lines</PanelButton
          >
        </div>
        <!-- Timing and direction sit above the canvas as they do in the Shape
             Engine's drill. A solo has one hand, so the row leaves with it;
             a browsed sequence has no matrix pair to rebuild, so it has no row. -->
        {#if !explorer.soloHand && explorer.source === "matrix"}
          <div
            class="relationship"
            transition:growFade={{ axis: "y", duration: DURATION.normal }}
          >
            <ElementChipRow
              selected={explorer.selectedMode}
              disabled={!explorer.selectedPair}
              onpick={(mode) =>
                explorer.chooseHandRelationship(mode, buildMatrixSequence)}
            />
          </div>
        {/if}
        <div class="motion-stage" aria-label="Selected path animation">
          <div class="animation">
            {#if browser}
              <MotionPathTransitionStage
                sequence={explorer.sequence}
                transitionKey={explorer.transitionKey}
                scope={explorer.scope}
                playing={explorer.playing}
                trace={explorer.trace}
                leftPropType={PropType.STAFF}
                rightPropType={PropType.STAFF}
                hideGlyph={explorer.soloHand !== null}
                onplayingchange={(value) => (explorer.playing = value)}
                onstepchange={(value) => (explorer.liveStep = value)}
                onseekref={(seek) => (stageSeek = seek)}
                ondisplayedsequencechange={(sequence) =>
                  (displayedSequence = sequence)}
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
          <div
            class="sequence-rail"
            role="group"
            aria-label="Pictograph timeline"
            aria-busy={!displayedSequence}
          >
            {#if displayedSequence}
              <StepStrip
                sequence={displayedSequence}
                includeStartPlacement={false}
                currentStep={explorer.liveStep}
                bpm={48}
                density="compact"
                fillHeight
                anchor="center"
                loop
                leftPropType={PropType.STAFF}
                rightPropType={PropType.STAFF}
                onCellClick={stageSeek ? (step) => stageSeek(step) : null}
              />
            {/if}
          </div>
        </div>
      </div>

      <div class="path-column">
        <PathShapePanel
          showHelp={false}
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
              leftPropType={PropType.STAFF}
              rightPropType={PropType.STAFF}
              tipEnds={1}
              tipDx={explorer.trace === "hands" ? 0 : matrixTipDx}
              animate={false}
            />
          {/snippet}
        </PathShapePanel>
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
    </div>
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
  }
  .explorer-workspace,
  .shape-picker,
  .comparison {
    display: grid;
    align-items: start;
    gap: var(--spacing-lg, 24px);
    min-width: 0;
  }
  .source-controls {
    display: grid;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
  }
  .shape-picker {
    gap: var(--spacing-sm, 8px);
  }
  .picker-heading,
  .transport {
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
  .source-stage {
    min-width: 0;
  }
  /* The card takes the matrix's square, so the swap changes nothing below. */
  .card-stage {
    width: 100%;
    aspect-ratio: 1;
    min-width: 0;
  }
  .stage-label {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
  }
  .stage-label {
    margin-right: auto;
  }
  .turn-picker {
    display: grid;
    gap: var(--spacing-xs, 4px);
    min-width: 0;
  }
  .turn-picker {
    margin-block: var(--spacing-xs, 4px);
    container-type: inline-size;
  }
  .control-label {
    color: var(--theme-text-muted);
    font-size: var(--font-size-sm, 14px);
  }
  .matrix-stage {
    aspect-ratio: 1;
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
    /* ElementChipRow narrows to three tracks inside a drill-named container;
       this column plays the drill's part here. */
    container: shape-matrix-drill / inline-size;
  }
  .animation {
    position: relative;
    aspect-ratio: 1;
  }
  .motion-stage {
    width: 100%;
  }
  .sequence-rail {
    height: clamp(4.25rem, 7cqw, 6rem);
    min-width: 0;
    margin-top: var(--spacing-xs, 4px);
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-panel-bg);
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
    margin-bottom: var(--spacing-sm, 8px);
  }
  .relationship {
    min-width: 0;
    margin-bottom: var(--spacing-sm, 8px);
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
    margin-top: var(--spacing-md, 16px);
  }
  .trace-choice :global(.segmented-control) {
    flex: 1;
  }
  @container (min-width: 640px) {
    .shape-picker {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto;
      column-gap: var(--spacing-lg, 24px);
    }
    .source-controls {
      grid-column: 1;
      grid-row: 1;
    }
    .source-stage {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
    .picker-feedback {
      grid-column: 2;
      grid-row: 3;
    }
    .comparison {
      grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    }
    .path-column {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      align-self: stretch;
    }
    .path-column :global(.path-shape-grid) {
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }
  }
  @container (min-width: 1100px) {
    .explorer-workspace {
      grid-template-columns: minmax(20rem, 1fr) minmax(0, 1.3fr) minmax(0, 1fr);
    }
    .comparison {
      display: contents;
    }
    .shape-picker {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm, 8px);
    }
    .shape-picker > * {
      width: 100%;
    }
    .source-stage {
      flex: none;
    }
  }
</style>
