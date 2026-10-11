<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import ArrangeTab from "#lib/features/compose/tabs/arrange/ArrangeTab.svelte";
  import {
    createArrangeGridState,
    setArrangeGridStateContext,
  } from "#lib/features/compose/tabs/arrange/state/arrange-grid-state.svelte.js";
  import type { ArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";

  let {
    snapshot,
    onapply,
    oncancel,
    active = true,
    title = "Arrange",
  }: {
    snapshot: ArrangementSnapshot;
    onapply: (snapshot: ArrangementSnapshot) => void;
    oncancel: () => void;
    title?: string;
    active?: boolean;
  } = $props();

  const grid = createArrangeGridState({ persist: false });
  grid.restoreSnapshot(untrack(() => snapshot));
  grid.clearUndoHistory();
  // What the grid opened with, in the form it captures, to tell edits apart.
  const opened = JSON.stringify(grid.captureSnapshot());
  let confirmingDiscard = $state(false);
  const changed = () => JSON.stringify(grid.captureSnapshot()) !== opened;
  const firstVisiblePopulatedCell = grid.cells
    .filter(
      (cell) =>
        cell.row < grid.gridRows &&
        cell.col < grid.gridCols &&
        cell.layers.length > 0
    )
    .sort((a, b) => a.row - b.row || a.col - b.col)[0];
  if (firstVisiblePopulatedCell) grid.selectCell(firstVisiblePopulatedCell.id);
  setArrangeGridStateContext(grid);
  onDestroy(() => grid.dispose());
  $effect(() => {
    if (!active) grid.stop();
  });

  function apply(): void {
    grid.stop();
    // Applying nothing would still add an undo step to the post.
    if (!changed()) oncancel();
    else onapply(grid.captureSnapshot());
  }

  function cancel(): void {
    if (changed()) confirmingDiscard = true;
    else oncancel();
  }
</script>

<section class="arrangement-editor" aria-label="Edit arrangement">
  <header>
    <div class="heading">
      <h2>{title}</h2>
      <span>Edit cells and layers</span>
    </div>
    {#if confirmingDiscard}
      <div class="actions" role="group" aria-label="Discard changes">
        <span class="question">Discard your changes to this arrangement?</span>
        <button type="button" onclick={() => (confirmingDiscard = false)}
          >Keep editing</button
        >
        <button type="button" class="discard" onclick={oncancel}>Discard</button
        >
      </div>
    {:else}
      <div class="actions">
        <button type="button" onclick={cancel}>Cancel</button>
        <button type="button" class="apply" onclick={apply}
          >Apply arrangement</button
        >
      </div>
    {/if}
  </header>
  <div class="body"><ArrangeTab embedded /></div>
</section>

<style>
  .arrangement-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--theme-stroke);
  }
  .heading {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
  }
  h2 {
    font-size: 16px;
    margin: 0;
  }
  .heading span {
    font-size: 12px;
    color: var(--theme-text-secondary);
  }
  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
  }
  .question {
    font-size: 14px;
  }
  button {
    min-height: 44px;
    padding: 8px 12px;
    color: inherit;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-md);
    cursor: pointer;
  }
  button:hover {
    background: var(--theme-card-hover-bg);
  }
  button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .apply {
    font-weight: 600;
  }
  .discard {
    border-color: var(--semantic-error);
    color: var(--semantic-error);
  }
  .body {
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
</style>
