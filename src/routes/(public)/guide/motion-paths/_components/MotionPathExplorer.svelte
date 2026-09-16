<script lang="ts">
  import { onMount } from "svelte";
  import { growFade } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { browser } from "$app/environment";
  import MotionPathTransitionStage from "./MotionPathTransitionStage.svelte";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import PathShapePanel from "$lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte";
  import { setAnimationVisibilityContext } from "$lib/shared/animation-engine/state/animation-visibility-context";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
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
  import {
    MODE_LABEL,
    type VtgMode,
  } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
  import StepStrip from "$lib/shared/timeline/StepStrip.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { createMotionPathExplorerState } from "../_data/motion-path-explorer-state.svelte";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import type { TurnValue } from "$lib/shared/create/services/level-turn-values";
  import type { MandalaPathShape } from "$lib/shared/mandala/domain/mandala-types";

  const explorer = createMotionPathExplorerState();
  const matrixTipDx = shapeMatrixTipPoint(PropType.STAFF)?.dx;
  setAnimationVisibilityContext(explorer.scope.visibility);
  let pickerOpen = $state(false);
  // Timing and direction is the one selector that needs vocabulary the intro
  // never taught, so it stays folded until asked for.
  let relationshipOpen = $state(false);
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
    <section class="shape-picker" aria-labelledby="shape-picker-title">
      <div class="source-controls">
        <div class="picker-heading">
          <h3 id="shape-picker-title">Shapes</h3>
          <PanelButton onclick={() => (pickerOpen = true)}
            >Browse sequences</PanelButton
          >
        </div>
        <div class="turn-picker">
          <TurnNotationControls
            {leftTurn}
            {rightTurn}
            {labelMode}
            onturn={chooseTurn}
            onlabelmodechange={(value) => (labelMode = value)}
          />
        </div>
      </div>
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
            onselect={(pair) =>
              explorer.chooseMatrixPair(pair, buildMatrixSequence)}
          />
        {/if}
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
            >{explorer.selectedPair
              ? "Change the motion path to compare these shapes."
              : "Pick a cell to animate its shapes."}</span
          >
        {/if}
      </div>

      <div class="relationship">
        <PanelButton
          ariaExpanded={relationshipOpen}
          onclick={() => (relationshipOpen = !relationshipOpen)}
        >
          <span class="relationship-label">
            <span>Timing and direction</span>
            {#if explorer.selectedMode}
              <span class="relationship-current"
                >{MODE_LABEL[explorer.selectedMode]}</span
              >
            {/if}
          </span>
          <i
            class="fas fa-chevron-down relationship-chevron"
            class:open={relationshipOpen}
            aria-hidden="true"
          ></i>
        </PanelButton>
        {#if relationshipOpen}
          <div
            class="relationship-picker"
            transition:growFade={{ axis: "y", duration: DURATION.normal }}
          >
            <ElementChipRow
              selected={explorer.selectedMode}
              columns={3}
              compact
              onpick={(mode) =>
                explorer.chooseHandRelationship(mode, buildMatrixSequence)}
            />
          </div>
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
  .picker-heading {
    justify-content: space-between;
  }
  .picker-heading h3,
  .stage-label {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
  }
  .stage-label {
    margin-right: auto;
  }
  .relationship-picker,
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
    display: grid;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
  }
  .relationship > :global(button) {
    justify-content: space-between;
    width: 100%;
  }
  .relationship-label {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs, 4px) var(--spacing-sm, 8px);
    min-width: 0;
    text-align: left;
  }
  .relationship-current {
    color: var(--theme-text-muted);
    font-weight: 500;
  }
  .relationship-chevron {
    flex-shrink: 0;
    transition: transform var(--duration-fast) var(--ease-out);
  }
  .relationship-chevron.open {
    transform: rotate(180deg);
  }
  .relationship-picker {
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
    margin-top: var(--spacing-md, 16px);
  }
  .trace-choice :global(.segmented-control) {
    flex: 1;
  }
  @container (min-width: 640px) {
    .shape-picker {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      /* The fr row absorbs the matrix height so the timing disclosure stays
         directly under the turn controls instead of drifting to mid-column. */
      grid-template-rows: auto minmax(0, 1fr) auto;
      column-gap: var(--spacing-lg, 24px);
    }
    .source-controls {
      grid-column: 1;
      grid-row: 1;
    }
    .matrix-stage {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
    .picker-feedback {
      grid-column: 2;
      grid-row: 3;
    }
    /* Sits directly under the turn controls; the matrix owns the tall rows. */
    .relationship {
      grid-column: 1;
      grid-row: 2;
      align-self: start;
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
    .matrix-stage {
      flex: none;
    }
  }
</style>
