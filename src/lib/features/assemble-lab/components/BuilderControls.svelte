<!--
  BuilderControls.svelte - Context-sensitive controls for the assemble grid.

  Mobile: a dock under the grid holds the turn settings (or, before the first
  point, the grid picker), centered, above the hand switch, with Complete in a
  fixed slot beside it. Nothing floats over the dots. Desktop keeps these
  controls in the builder header.
-->
<script lang="ts">
  import type { AssembleState } from "../state/assemble-state.svelte";
  import GridModePicker from "./GridModePicker.svelte";
  import BuilderHandPicker from "./BuilderHandPicker.svelte";
  import BuilderPhaseControls from "./BuilderPhaseControls.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import EditHistoryShortcutBridge from "$lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";

  let { builderState }: { builderState: AssembleState } = $props();

  const isAnimating = $derived(builderState.phase === "animating");
  const isComplete = $derived(builderState.phase === "complete");

  const actionsDimmed = $derived(isAnimating);
  const handSelectionDisabled = $derived(isAnimating || isComplete);
  // The grid is chosen before the first point; once a start point exists the
  // row belongs to the orientation and turn settings.
  const showGridPicker = $derived(
    builderState.canChangeGridMode && builderState.phase === "idle"
  );
</script>

<EditHistoryShortcutBridge
  onUndo={builderState.undoStep}
  onRedo={builderState.redoStep}
  canUndo={builderState.canUndo}
  canRedo={builderState.canRedo}
  undoLabel={builderState.undoLabel}
  redoLabel={builderState.redoLabel}
/>

{#snippet finishAction(fullWidth: boolean)}
  {#if isComplete}
    <PanelButton
      variant="primary"
      {fullWidth}
      onclick={() => builderState.reset()}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>New</span>
    </PanelButton>
  {:else}
    <PanelButton
      variant={builderState.canFinishHand ? "primary" : "secondary"}
      {fullWidth}
      disabled={!builderState.canFinishHand || isAnimating}
      ariaBusy={isAnimating}
      onclick={() => builderState.finishHand()}
    >
      <i class="fas fa-check" aria-hidden="true"></i>
      <span>Complete</span>
    </PanelButton>
  {/if}
{/snippet}

<!-- Mobile dock under the grid. The phase row keeps its height when empty so
     the grid never resizes as the phase changes. -->
<div class="mobile-dock">
  <div class="dock-phase-row">
    {#if showGridPicker}
      <GridModePicker
        gridMode={builderState.gridMode}
        showCenter={builderState.showCenter}
        onGridModeChange={(mode) => builderState.setGridMode(mode)}
        onCenterChange={(show) => builderState.setShowCenter(show)}
      />
    {:else}
      <BuilderPhaseControls {builderState} reserveSlots={false} />
    {/if}
  </div>

  <div
    class="dock-hand-row"
    class:dimmed={actionsDimmed}
    class:can-finish={builderState.canFinishHand}
  >
    <div class="dock-hand-picker">
      <BuilderHandPicker
        activeHand={builderState.activeHand}
        leftCount={builderState.leftSteps.length}
        rightCount={builderState.rightSteps.length}
        disabled={handSelectionDisabled}
        onchange={(hand) => builderState.switchToHand(hand)}
      />
    </div>

    <div class="dock-action-slot">
      {@render finishAction(true)}
    </div>
  </div>
</div>

<!-- Persistent hand rail: desktop only. The reserved action slot keeps the two
     hand targets stable when Complete becomes available. -->
<div
  class="action-row"
  class:dimmed={actionsDimmed}
  class:can-finish={builderState.canFinishHand}
>
  <div class="desktop-hand-picker">
    <BuilderHandPicker
      activeHand={builderState.activeHand}
      leftCount={builderState.leftSteps.length}
      rightCount={builderState.rightSteps.length}
      disabled={handSelectionDisabled}
      onchange={(hand) => builderState.switchToHand(hand)}
    />
  </div>

  <div class="desktop-action-slot">
    {@render finishAction(true)}
  </div>
</div>

<style>
  /* ── Mobile dock ── */
  .mobile-dock {
    display: none;
    grid-row: 2;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    width: 100%;
    padding: 6px 8px 8px;
  }

  @container tool-panel (max-width: 768px) {
    .mobile-dock {
      display: flex;
    }
  }

  /* Tall enough for the grid picker, so the grid keeps its size when the
     first point swaps the picker for the turn settings. */
  .dock-phase-row {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: max(52px, var(--min-touch-target, 44px));
  }

  .dock-hand-row {
    display: flex;
    align-items: stretch;
    gap: var(--settings-spacing-sm, 8px);
    min-width: 0;
  }

  .dock-hand-picker {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* Sized for the bold ready state, so the hand targets never shift when
     Complete turns green. */
  .dock-action-slot {
    display: flex;
    flex: 0 0 8.25rem;
    min-width: 0;
  }

  .dock-action-slot :global(.panel-btn) {
    padding-inline: 12px;
  }

  .dock-hand-row.dimmed,
  .action-row.dimmed {
    pointer-events: none;
  }

  .dock-hand-row.dimmed.can-finish :global(.panel-btn:disabled),
  .action-row.dimmed.can-finish :global(.panel-btn:disabled),
  .desktop-hand-picker :global(.segment:disabled),
  .dock-hand-picker :global(.segment:disabled) {
    opacity: 1;
  }

  .dock-hand-row.can-finish :global(.panel-btn--primary),
  .action-row.can-finish .desktop-action-slot :global(.panel-btn--primary) {
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 52%,
      white
    );
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 82%, white);
    color: #04150a;
    font-size: var(--assemble-action-size, 15px);
    font-weight: 900;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.32),
      0 0 18px
        color-mix(in srgb, var(--semantic-success, #22c55e) 38%, transparent);
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .dock-hand-row.can-finish :global(.panel-btn--primary:hover:not(:disabled)),
  .action-row.can-finish
    .desktop-action-slot
    :global(.panel-btn--primary:hover:not(:disabled)) {
    filter: brightness(1.08);
  }

  /* ── Action row (desktop only) ── */
  .action-row {
    display: flex;
    grid-row: 1;
    align-items: stretch;
    gap: var(--settings-spacing-md, 12px);
    padding: 10px 12px;
    width: 100%;
    flex-shrink: 0;
    min-height: var(--min-touch-target, 44px);
    border-bottom: 1px solid var(--assemble-builder-stroke, var(--theme-stroke));
    background: color-mix(in srgb, var(--theme-text, #fff) 3%, transparent);
  }

  .desktop-hand-picker {
    min-width: 0;
    flex: 1 1 auto;
  }

  .desktop-action-slot {
    display: flex;
    width: 9rem;
    flex: 0 0 9rem;
  }

  @container tool-panel (max-width: 768px) {
    .action-row {
      display: none;
    }
  }

  @container tool-panel (max-width: 360px) {
    .dock-action-slot {
      flex-basis: 7.5rem;
    }

    .dock-action-slot :global(.panel-btn) {
      padding-inline: 10px;
    }
  }
</style>
