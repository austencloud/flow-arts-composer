<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import { createStartPlacementFromBeatStart } from "#lib/shared/create/services/sequence-transforms.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte.js";
  import {
    FUSE_LIVE_GRID_GAP,
    type FuseContextPlacement,
  } from "../services/fuse-workspace-split";

  let {
    sequence,
    side,
    columns,
    cellSize,
    includeStart = false,
    showMandala = false,
    contextPlacement = "column",
    highlightedStepIndex = null,
    startHighlighted = false,
    onStepClick,
    onStepSeek,
    onStartSeek,
    posePicker = false,
    animateEdits = false,
    leftPropType,
    rightPropType,
  }: {
    sequence: SequenceData;
    side: FuseSide;
    columns: number;
    cellSize: number;
    includeStart?: boolean;
    showMandala?: boolean;
    /** Start and the mandala in a column beside the steps, or in a row above
     * two step columns (tall side cards). */
    contextPlacement?: FuseContextPlacement;
    highlightedStepIndex?: number | null;
    /** Live card: the animation is holding at the starting position. */
    startHighlighted?: boolean;
    /** Choose Start picker: the path begins after the chosen step. */
    onStepClick?: (stepIndex: number) => void;
    /** Live card: take the animation to this step. */
    onStepSeek?: (stepIndex: number) => void;
    /** Live card: take the animation to the starting position. */
    onStartSeek?: () => void;
    /** Choose Start picker: step tiles render as the pose after their beat. */
    posePicker?: boolean;
    /** Let a transform of this path travel across the drawings. Left off, every
     * change snaps. */
    animateEdits?: boolean;
    leftPropType?: PropType;
    rightPropType?: PropType;
  } = $props();

  // An explicit `darkMode` marks a pictograph as an export capture, which never
  // joins the shared edit clock. The theme override gives the same dark drawing
  // and keeps it live.
  const look = $derived(
    animateEdits
      ? ({ themeOverride: "dark" } as const)
      : ({ darkMode: true } as const)
  );

  const safeColumns = $derived(Math.max(1, columns));
  const contextRow = $derived(
    includeStart &&
      showMandala &&
      contextPlacement === "row" &&
      safeColumns >= 2
  );
  const contextColumn = $derived(includeStart && !contextRow);
  const gridColumns = $derived(safeColumns + (contextColumn ? 1 : 0));
  const stepRows = $derived(
    Math.max(1, Math.ceil(sequence.steps.length / safeColumns))
  );
  const gridRows = $derived(
    contextRow
      ? stepRows + 1
      : includeStart && showMandala
        ? Math.max(2, stepRows)
        : stepRows
  );
  const mandalaColumn = $derived(contextRow ? gridColumns : 1);
  const mandalaRow = $derived(contextRow ? 1 : gridRows);
  // Match the canonical Choreo Card's mandala-to-cell ratio. A full-cell
  // mandala pushes its outer glow into the cell edge and reads as cropped,
  // especially in the large Fuse cards.
  const safeCellSize = $derived(Math.max(1, cellSize));
  const mandalaSize = $derived(Math.max(1, Math.round(safeCellSize * 0.78)));
  const startPlacement = $derived(
    sequence.startPlacement ??
      sequence.startingPlacement ??
      (sequence.steps[0]
        ? createStartPlacementFromBeatStart(sequence.steps[0])
        : null)
  );
  // Step 0 makes the picture draw its own "Start", sized and translated like
  // the step numbers beside it.
  const startTile = $derived(
    startPlacement ? { ...startPlacement, stepNumber: 0 } : null
  );

  function stepColumn(index: number): number {
    return (contextColumn ? 2 : 1) + (index % safeColumns);
  }

  function stepRow(index: number): number {
    return (contextRow ? 2 : 1) + Math.floor(index / safeColumns);
  }
</script>

{#snippet startPictograph()}
  <PictographContainer
    pictographData={startTile}
    showHandColorKey={false}
    disableTransitions={true}
    disableContentTransitions={true}
    showGrid={true}
    showTKA={false}
    showReversals={true}
    showNonRadialPoints={false}
    showTnD={false}
    showElemental={false}
    showPlacements={false}
    showHandPoints={true}
    visibleHand={side}
    {...look}
    leftPropTypeOverride={leftPropType}
    rightPropTypeOverride={rightPropType}
    stepNumberOverride={false}
    transitionKey={`fuse-${side}-start`}
  />
{/snippet}

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
    showPlacements={false}
    showHandPoints={true}
    visibleHand={side}
    {...look}
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
  aria-label={t(
    side === "left" ? "fuse_grid_notation_left" : "fuse_grid_notation_right"
  )}
>
  {#if includeStart && startTile}
    {#if onStartSeek}
      <button
        type="button"
        class="live-cell start-cell seek-cell"
        class:current={startHighlighted}
        style="grid-column:1;grid-row:1;"
        onclick={onStartSeek}
        aria-label={t("viewer_detail_go_to_start_placement")}
        aria-current={startHighlighted ? "step" : undefined}
      >
        {@render startPictograph()}
      </button>
    {:else}
      <div class="live-cell start-cell" style="grid-column:1;grid-row:1;">
        {@render startPictograph()}
      </div>
    {/if}
  {/if}

  {#if includeStart && showMandala}
    <div
      class="live-cell mandala-cell"
      style="grid-column:{mandalaColumn};grid-row:{mandalaRow};"
      role="img"
      aria-label={t(
        side === "left" ? "fuse_grid_mandala_left" : "fuse_grid_mandala_right"
      )}
    >
      <SequenceMandala
        {sequence}
        mode="card-back"
        style={"stroke"}
        show={side}
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
          ? t("fuse_grid_already_start")
          : t("fuse_grid_start_after_step", { step: index + 1 })}
      >
        {@render stepPictograph(step, index)}
      </button>
    {:else if onStepSeek}
      <button
        type="button"
        class="live-cell step-cell seek-cell"
        class:current={highlightedStepIndex === index}
        class:played={highlightedStepIndex !== null &&
          index < highlightedStepIndex}
        style="grid-column:{stepColumn(index)};grid-row:{stepRow(index)};"
        onclick={() => onStepSeek(index)}
        aria-label={t("browse_audit_go_to_step", { step: index + 1 })}
        aria-current={highlightedStepIndex === index ? "step" : undefined}
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
      background-color var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard);
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

  /* Drawn over the pictograph, which would cover a ring on the cell itself. */
  .seek-cell::after {
    content: "";
    position: absolute;
    inset: 0;
    border: 0 solid
      color-mix(in srgb, var(--source-color) 55%, var(--theme-text));
    pointer-events: none;
  }

  .seek-cell.current::after {
    border-width: 2px;
  }

  .seek-cell:focus-visible {
    z-index: 3;
    outline: none;
  }

  .seek-cell:focus-visible::after {
    border-width: 3px;
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

  /* A played step dims, and comes back to full under the pointer or focus. */
  .live-cell.played:not(.current, :focus-visible) {
    opacity: 0.74;
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

    .seek-cell:not(.current, :focus-visible):hover::after {
      border-width: 2px;
      border-color: color-mix(
        in srgb,
        var(--source-color) 52%,
        var(--theme-stroke)
      );
    }

    .seek-cell.played:hover {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .live-cell {
      transition: none;
    }
  }
</style>
