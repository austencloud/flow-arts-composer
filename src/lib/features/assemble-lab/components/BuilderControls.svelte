<!--
  BuilderControls.svelte - Context-sensitive controls for the assemble grid.

  One dock under the grid on every screen size: the turn settings (or, before
  the first point, the grid picker) sit centered above the hand switch, with
  Complete in a fixed slot beside it. Nothing floats over the dots. Wide
  panels also get the numpad toggle at the end of the turn row.
-->
<script lang="ts">
  import type { AssembleState } from "../state/assemble-state.svelte";
  import GridModePicker from "./GridModePicker.svelte";
  import BuilderHandPicker from "./BuilderHandPicker.svelte";
  import BuilderPhaseControls from "./BuilderPhaseControls.svelte";
  import BuilderKeyboardControl from "./BuilderKeyboardControl.svelte";
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

{#snippet finishAction()}
  {#if isComplete}
    <PanelButton
      variant="primary"
      fullWidth
      onclick={() => builderState.reset()}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>New</span>
    </PanelButton>
  {:else}
    <PanelButton
      variant={builderState.canFinishHand ? "primary" : "secondary"}
      fullWidth
      disabled={!builderState.canFinishHand || isAnimating}
      ariaBusy={isAnimating}
      onclick={() => builderState.finishHand()}
    >
      <i class="fas fa-check" aria-hidden="true"></i>
      <span>Complete</span>
    </PanelButton>
  {/if}
{/snippet}

<!-- The phase row keeps its height when empty so the grid never resizes as
     the phase changes. -->
<div class="dock">
  <div class="dock-phase-row">
    <div class="dock-phase-center">
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
    <div class="dock-keyboard">
      <BuilderKeyboardControl {builderState} />
    </div>
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
      {@render finishAction()}
    </div>
  </div>
</div>

<style>
  .dock {
    display: flex;
    grid-row: 2;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    width: 100%;
    max-width: 48rem;
    padding: 6px 8px 8px;
  }

  /* Tall enough for the grid picker, so the grid keeps its size when the
     first point swaps the picker for the turn settings. The side columns
     match, so the turn button stays centered under the grid. */
  .dock-phase-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    min-height: max(52px, var(--min-touch-target, 44px));
  }

  .dock-phase-center {
    display: flex;
    grid-column: 2;
    justify-content: center;
  }

  .dock-keyboard {
    display: flex;
    grid-column: 3;
    justify-content: flex-end;
  }

  @container tool-panel (max-width: 768px) {
    .dock-keyboard {
      display: none;
    }
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

  .dock-hand-row.dimmed {
    pointer-events: none;
  }

  .dock-hand-row.dimmed.can-finish :global(.panel-btn:disabled),
  .dock-hand-picker :global(.segment:disabled) {
    opacity: 1;
  }

  .dock-hand-row.can-finish :global(.panel-btn--primary) {
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

  .dock-hand-row.can-finish :global(.panel-btn--primary:hover:not(:disabled)) {
    filter: brightness(1.08);
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
