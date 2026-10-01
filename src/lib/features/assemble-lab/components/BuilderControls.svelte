<!--
  BuilderControls.svelte - Context-sensitive controls for the assemble grid.

  One dock under the grid on every screen size: the hand switch, with
  Complete in a fixed slot beside it. The grid, orientation and turn chips
  float in the grid's top-right corner (BuilderStageActions), so the dock
  stays one row and the grid gets the height.
-->
<script lang="ts">
  import type { AssembleState } from "../state/assemble-state.svelte";
  import BuilderHandPicker from "./BuilderHandPicker.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import EditHistoryShortcutBridge from "$lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";

  let { builderState }: { builderState: AssembleState } = $props();

  const isAnimating = $derived(builderState.phase === "animating");
  const isComplete = $derived(builderState.phase === "complete");

  const actionsDimmed = $derived(isAnimating);
  const handSelectionDisabled = $derived(isAnimating || isComplete);
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

<div class="dock">
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
    flex: 0 0 auto;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    max-width: 48rem;
    padding: 6px 8px 8px;
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
