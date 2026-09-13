<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import { createStartPositionFromBeatStart } from "$lib/shared/create/services/sequence-transforms";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";
  import { FUSE_LIVE_GRID_GAP } from "../services/fuse-workspace-split";

  let {
    sequence,
    side,
    columns,
    cellSize,
    includeStart = false,
    showMandala = false,
    highlightedStepIndex = null,
    onStepClick,
    posePicker = false,
    leftPropType,
    rightPropType,
  }: {
    sequence: SequenceData;
    side: FuseSide;
    columns: number;
    cellSize: number;
    includeStart?: boolean;
    showMandala?: boolean;
    highlightedStepIndex?: number | null;
    onStepClick?: (stepIndex: number) => void;
    /** Choose Start picker: step tiles render as the pose after their beat. */
    posePicker?: boolean;
    leftPropType?: PropType;
    rightPropType?: PropType;
  } = $props();

  const safeColumns = $derived(Math.max(1, columns));
  const gridColumns = $derived(safeColumns + (includeStart ? 1 : 0));
  const stepRows = $derived(
    Math.max(1, Math.ceil(sequence.steps.length / safeColumns))
  );
  const gridRows = $derived(
    includeStart && showMandala ? Math.max(2, stepRows) : stepRows
  );
  // Match the canonical Choreo Card's mandala-to-cell ratio. A full-cell
  // mandala pushes its outer glow into the cell edge and reads as cropped,
  // especially in the large Fuse cards.
  const safeCellSize = $derived(Math.max(1, cellSize));
  const mandalaSize = $derived(Math.max(1, Math.round(safeCellSize * 0.78)));
  const startPosition = $derived(
    sequence.startPosition ??
      sequence.startingPosition ??
      (sequence.steps[0]
        ? createStartPositionFromBeatStart(sequence.steps[0])
        : null)
  );

  function stepColumn(index: number): number {
    return (includeStart ? 2 : 1) + (index % safeColumns);
  }

  function stepRow(index: number): number {
    return 1 + Math.floor(index / safeColumns);
  }
</script>

{#snippet stepPictograph(step: SequenceData["steps"][number], index: number)}
  <PictographContainer
    pictographData={step}
    disableTransitions={true}
    disableContentTransitions={true}
    poseOnly={posePicker}
    showGrid={true}
    showTKA={false}
    showReversals={true}
    showNonRadialPoints={false}
    showTnD={false}
    showElemental={false}
    showPositions={false}
    showHandPoints={true}
    visibleHand={side}
    darkMode={true}
    leftPropTypeOverride={leftPropType}
    rightPropTypeOverride={rightPropType}
    stepNumberOverride={true}
    cellIndex={index}
    transitionKey={`fuse-${side}-step-${index}`}
  />
{/snippet}

<div
  class="live-path-grid"
  style:--live-grid-columns={gridColumns}
  style:--live-grid-rows={gridRows}
  style:--live-cell-size={`${safeCellSize}px`}
  style:--live-grid-gap={`${FUSE_LIVE_GRID_GAP}px`}
  aria-label="{side === 'left' ? 'Left' : 'Right'} one-hand LOOP notation"
>
  {#if includeStart && startPosition}
    <div class="live-cell start-cell" style="grid-column:1;grid-row:1;">
      <PictographContainer
        pictographData={startPosition}
        disableTransitions={true}
        disableContentTransitions={true}
        showGrid={true}
        showTKA={false}
        showReversals={true}
        showNonRadialPoints={false}
        showTnD={false}
        showElemental={false}
        showPositions={false}
        showHandPoints={true}
        visibleHand={side}
        darkMode={true}
        leftPropTypeOverride={leftPropType}
        rightPropTypeOverride={rightPropType}
        stepNumberOverride={false}
        transitionKey={`fuse-${side}-start`}
      />
      <span class="cell-caption">Start</span>
    </div>
  {/if}

  {#if includeStart && showMandala}
    <div
      class="live-cell mandala-cell"
      style="grid-column:1;grid-row:{gridRows};"
      role="img"
      aria-label="{side === 'left' ? 'Left' : 'Right'} path mandala"
    >
      <SequenceMandala
        {sequence}
        mode="card-back"
        style={"stroke"}
        show={side === "left" ? "blue" : "red"}
        size={mandalaSize}
        darkMode={true}
        {leftPropType}
        {rightPropType}
        morphChanges={true}
      />
    </div>
  {/if}

  {#each sequence.steps as step, index (index)}
    {#if onStepClick}
      <button
        type="button"
        class="live-cell step-cell first-step-choice"
        class:current-first-step={index === sequence.steps.length - 1}
        style="grid-column:{stepColumn(index)};grid-row:{stepRow(index)};"
        onclick={() => onStepClick(index)}
        aria-label={index === sequence.steps.length - 1
          ? "This pose is already the start"
          : `Start from the pose after step ${index + 1}`}
      >
        {@render stepPictograph(step, index)}
      </button>
    {:else}
      <div
        class="live-cell step-cell"
        class:current={highlightedStepIndex === index}
        class:played={highlightedStepIndex !== null &&
          index < highlightedStepIndex}
        style="grid-column:{stepColumn(index)};grid-row:{stepRow(index)};"
      >
        {@render stepPictograph(step, index)}
      </div>
    {/if}
  {/each}
</div>

<style>
  .live-path-grid {
    display: grid;
    grid-template-columns: repeat(
      var(--live-grid-columns),
      var(--live-cell-size)
    );
    grid-template-rows: repeat(var(--live-grid-rows), var(--live-cell-size));
    place-content: center;
    gap: var(--live-grid-gap);
    width: 100%;
    min-width: 100%;
    min-height: 100%;
    background: var(--theme-panel-bg);
  }

  .live-cell {
    position: relative;
    width: var(--live-cell-size);
    height: var(--live-cell-size);
    overflow: hidden;
    background: var(--theme-card-bg);
    box-shadow: inset 0 0 0 1px var(--theme-stroke);
    transition:
      background-color 180ms ease,
      box-shadow 180ms ease,
      opacity 180ms ease;
  }

  button.live-cell {
    appearance: none;
    padding: 0;
    border: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .first-step-choice {
    z-index: 1;
    box-shadow: inset 0 0 0 2px
      color-mix(in srgb, var(--source-color) 34%, var(--theme-stroke));
  }

  .first-step-choice.current-first-step {
    background: color-mix(
      in srgb,
      var(--source-color) 12%,
      var(--theme-card-bg)
    );
    box-shadow: inset 0 0 0 2px
      color-mix(in srgb, var(--source-color) 72%, var(--theme-text));
  }

  .first-step-choice:focus-visible {
    z-index: 3;
    outline: 3px solid
      color-mix(in srgb, var(--source-color) 80%, var(--theme-text));
    outline-offset: -4px;
  }

  .live-cell.current {
    z-index: 1;
    background: color-mix(
      in srgb,
      var(--source-color) 13%,
      var(--theme-card-bg)
    );
    box-shadow:
      inset 0 0 0 2px
        color-mix(in srgb, var(--source-color) 78%, var(--theme-text)),
      0 0 18px color-mix(in srgb, var(--source-color) 36%, transparent);
  }

  .live-cell.played:not(.current) {
    opacity: 0.74;
  }

  .cell-caption {
    position: absolute;
    z-index: 2;
    top: 8px;
    left: 10px;
    color: var(--theme-text, white);
    font-family: Georgia, serif;
    font-size: clamp(14px, 1.1rem, 18px);
    font-weight: 700;
    pointer-events: none;
  }

  .mandala-cell {
    display: grid;
    place-items: center;
  }

  @media (hover: hover) and (pointer: fine) {
    .first-step-choice:hover {
      z-index: 2;
      background: color-mix(
        in srgb,
        var(--source-color) 18%,
        var(--theme-card-bg)
      );
      box-shadow:
        inset 0 0 0 3px
          color-mix(in srgb, var(--source-color) 82%, var(--theme-text)),
        0 0 22px color-mix(in srgb, var(--source-color) 40%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .live-cell {
      transition: none;
    }
  }
</style>
