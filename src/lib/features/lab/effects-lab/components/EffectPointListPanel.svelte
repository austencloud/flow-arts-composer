<!--
  EffectPointListPanel.svelte

  Point list with delete buttons, and auto-saved actions
  (set default, reset, copy, import). Edits unified tip points
  shared by all effects.

  Keyboard navigation:
    Up/Down arrows  - move between points
    Enter           - focus dx input for editing
    Tab             - dx → dy → next point's dx (skips action buttons)
    Escape          - return focus to point row
    Delete          - delete selected point
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import type { EffectPointEditorState } from "../state/effect-point-editor-state.svelte";
  import TrailPointAssignmentSection from "./TrailPointAssignmentSection.svelte";

  interface Props {
    editorState: EffectPointEditorState;
  }

  const { editorState }: Props = $props();

  let showImport = $state(false);
  let importText = $state("");
  let importError = $state<string | null>(null);
  let copyFeedback = $state(false);
  let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  // Refs for programmatic focus
  let rowEls: HTMLDivElement[] = [];
  let dxInputEls: HTMLInputElement[] = [];
  let dyInputEls: HTMLInputElement[] = [];

  onDestroy(() => {
    if (copyFeedbackTimer !== null) clearTimeout(copyFeedbackTimer);
  });

  async function handleCopyJSON() {
    try {
      await navigator.clipboard.writeText(editorState.toJSON());
      copyFeedback = true;
      if (copyFeedbackTimer !== null) clearTimeout(copyFeedbackTimer);
      copyFeedbackTimer = setTimeout(() => { copyFeedback = false; copyFeedbackTimer = null; }, 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  function handleImport() {
    const err = editorState.importJSON(importText);
    if (err) {
      importError = err;
    } else {
      showImport = false;
      importText = "";
      importError = null;
    }
  }

  function handleCoordChange(index: number, field: "dx" | "dy", raw: string) {
    const value = parseFloat(raw);
    if (Number.isFinite(value)) {
      editorState.updatePoint(index, { [field]: Math.round(value * 10) / 10 });
    }
  }

  function handleCenterPoint(index: number) {
    editorState.movePoint(index, { dx: 0, dy: 0 });
  }

  function handleAddAtCenter() {
    editorState.addPoint(0, 0);
  }

  function selectAndFocusRow(index: number) {
    editorState.selectedPointIndex = index;
    // Wait for DOM update before focusing
    requestAnimationFrame(() => rowEls[index]?.focus());
  }

  function focusDxInput(index: number) {
    requestAnimationFrame(() => {
      const input = dxInputEls[index];
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  function handleRowKeydown(e: KeyboardEvent, index: number) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (index < editorState.points.length - 1) {
          selectAndFocusRow(index + 1);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (index > 0) {
          selectAndFocusRow(index - 1);
        }
        break;
      case "Enter":
        e.preventDefault();
        editorState.selectedPointIndex = index;
        focusDxInput(index);
        break;
      case "Delete":
        e.preventDefault();
        editorState.deletePoint(index);
        // Focus the next row (or previous if we deleted the last)
        requestAnimationFrame(() => {
          const newLen = editorState.points.length;
          if (newLen > 0) {
            const nextIndex = Math.min(index, newLen - 1);
            selectAndFocusRow(nextIndex);
          }
        });
        break;
    }
  }

  function handleInputKeydown(e: KeyboardEvent, pointIndex: number, field: "dx" | "dy") {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        rowEls[pointIndex]?.focus();
        break;
      case "Tab":
        if (!e.shiftKey) {
          // Forward tab: dx → dy → next point's dx
          if (field === "dx") {
            e.preventDefault();
            const dyInput = dyInputEls[pointIndex];
            if (dyInput) { dyInput.focus(); dyInput.select(); }
          } else if (field === "dy") {
            // Jump to next point's dx
            const nextIndex = pointIndex + 1;
            if (nextIndex < editorState.points.length) {
              e.preventDefault();
              editorState.selectedPointIndex = nextIndex;
              focusDxInput(nextIndex);
            }
            // else: let Tab naturally leave the list
          }
        } else {
          // Shift+Tab: reverse - dy → dx → previous point's dy
          if (field === "dy") {
            e.preventDefault();
            const dxInput = dxInputEls[pointIndex];
            if (dxInput) { dxInput.focus(); dxInput.select(); }
          } else if (field === "dx") {
            const prevIndex = pointIndex - 1;
            if (prevIndex >= 0) {
              e.preventDefault();
              editorState.selectedPointIndex = prevIndex;
              requestAnimationFrame(() => {
                const dyInput = dyInputEls[prevIndex];
                if (dyInput) { dyInput.focus(); dyInput.select(); }
              });
            }
            // else: let Shift+Tab naturally leave the list
          }
        }
        break;
      case "Enter":
        // Commit and move to next point's same field
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
        {
          const nextIndex = pointIndex + 1;
          if (nextIndex < editorState.points.length) {
            editorState.selectedPointIndex = nextIndex;
            if (field === "dx") focusDxInput(nextIndex);
            else {
              requestAnimationFrame(() => {
                const dyInput = dyInputEls[nextIndex];
                if (dyInput) { dyInput.focus(); dyInput.select(); }
              });
            }
          } else {
            // Last point - return to row
            rowEls[pointIndex]?.focus();
          }
        }
        break;
    }
  }

  // When clicking an input, also select the point and highlight the value
  function handleInputClick(e: MouseEvent, index: number) {
    e.stopPropagation();
    editorState.selectedPointIndex = index;
    const input = e.target as HTMLInputElement;
    input.select();
  }
</script>

<div
  class="list-panel themed-scrollbar"
  style="--effect-accent: var(--theme-accent, #8b5cf6); --effect-accent-mid: rgba(139, 92, 246, 0.15); --effect-accent-border: rgba(139, 92, 246, 0.3); --effect-accent-dim: rgba(139, 92, 246, 0.08)"
>
  <!-- Point list -->
  <div class="section">
    <div class="section-header">
      <h3>
        Points
        <span class="point-count">{editorState.points.length}</span>
      </h3>
      <button
        class="add-center-btn"
        onclick={handleAddAtCenter}
        aria-label="Add point at center (0, 0)"
        title="Add point at center (0, 0)"
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        Add at Center
      </button>
    </div>

    {#if editorState.points.length === 0}
      <div class="empty-hint">
        No points. Click the canvas or use "Add at Center."
      </div>
    {:else}
      <div class="point-list" role="listbox" aria-label="Tip points">
        {#each editorState.points as point, i (i)}
          <div
            class="point-row"
            class:selected={editorState.selectedPointIndex === i}
            bind:this={rowEls[i]}
            onclick={() => selectAndFocusRow(i)}
            onkeydown={(e) => handleRowKeydown(e, i)}
            role="option"
            tabindex={editorState.selectedPointIndex === i ? 0 : -1}
            aria-selected={editorState.selectedPointIndex === i}
            aria-label="Point {i + 1}: dx {point.dx}, dy {point.dy}"
          >
            <div class="point-top-row">
              <span class="point-index">{i + 1}</span>
              <div class="point-coords">
                <label class="coord-field">
                  <span class="coord-label">dx</span>
                  <input
                    type="number"
                    class="coord-input"
                    step="0.1"
                    bind:this={dxInputEls[i]}
                    value={point.dx}
                    tabindex={-1}
                    onchange={(e) => handleCoordChange(i, "dx", (e.target as HTMLInputElement).value)}
                    onclick={(e) => handleInputClick(e, i)}
                    onkeydown={(e) => handleInputKeydown(e, i, "dx")}
                    onfocus={() => { editorState.selectedPointIndex = i; }}
                  />
                </label>
                <label class="coord-field">
                  <span class="coord-label">dy</span>
                  <input
                    type="number"
                    class="coord-input"
                    step="0.1"
                    bind:this={dyInputEls[i]}
                    value={point.dy}
                    tabindex={-1}
                    onchange={(e) => handleCoordChange(i, "dy", (e.target as HTMLInputElement).value)}
                    onclick={(e) => handleInputClick(e, i)}
                    onkeydown={(e) => handleInputKeydown(e, i, "dy")}
                    onfocus={() => { editorState.selectedPointIndex = i; }}
                  />
                </label>
              </div>
              <button
                class="icon-btn center-btn"
                tabindex={-1}
                onclick={(e) => { e.stopPropagation(); handleCenterPoint(i); }}
                aria-label="Move point {i + 1} to center"
                title="Move to center (0, 0)"
              >
                <i class="fas fa-crosshairs" aria-hidden="true"></i>
              </button>
              <button
                class="icon-btn delete-btn"
                tabindex={-1}
                onclick={(e) => { e.stopPropagation(); editorState.deletePoint(i); }}
                aria-label="Delete point {i + 1}"
                title="Delete point"
              >
                <i class="fas fa-trash-alt" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Actions -->
  <div class="section actions-section">
    <h3>Actions</h3>

    <div class="action-buttons">
      <button
        data-save-shortcut
        class="action-btn default-btn"
        onclick={() => editorState.setAsDefault()}
        aria-label="Set current points as default for this prop"
        title="Save current points as your baseline default for this prop"
      >
        <i class="fas fa-bookmark" aria-hidden="true"></i>
        Set as Default
      </button>

      <button
        class="action-btn reset-btn"
        onclick={() => editorState.resetToUserDefault()}
        aria-label={editorState.hasUserDefault ? "Reset to my saved default" : "Reset to system defaults"}
        title={editorState.hasUserDefault ? "Revert to your saved default" : "Revert to system defaults (no custom default set)"}
      >
        <i class="fas fa-undo" aria-hidden="true"></i>
        {editorState.hasUserDefault ? "Reset to My Default" : "Reset to Defaults"}
      </button>

      {#if editorState.isOverridingCodeTable}
        <button
          class="action-btn code-table-btn"
          onclick={() => editorState.useCodeTable()}
          aria-label="Stop overriding the code table for this prop"
          title="Clear the stored points so the canvas follows prop-tip-points.ts again"
        >
          <i class="fas fa-code" aria-hidden="true"></i>
          Use Code Table
        </button>
      {/if}

      <button
        data-undo-shortcut
        data-undo-shortcut-label="Last point change"
        class="action-btn undo-btn"
        onclick={() => editorState.undo()}
        disabled={!editorState.canUndo}
        aria-label="Undo last change"
      >
        <i class="fas fa-undo-alt" aria-hidden="true"></i>
        Undo
      </button>

      <button
        class="action-btn copy-btn"
        onclick={handleCopyJSON}
        aria-label={copyFeedback ? "Copied to clipboard" : "Copy points as JSON"}
      >
        <i class="fas {copyFeedback ? 'fa-check' : 'fa-copy'}" aria-hidden="true"></i>
        {copyFeedback ? "Copied!" : "Copy JSON"}
      </button>

      <button
        class="action-btn import-btn"
        onclick={() => { showImport = !showImport; importError = null; }}
        aria-label={showImport ? "Cancel import" : "Import points from JSON"}
      >
        <i class="fas fa-file-import" aria-hidden="true"></i>
        Import JSON
      </button>

    </div>

    {#if showImport}
      <div class="import-section">
        <textarea
          class="import-textarea"
          bind:value={importText}
          placeholder={'{"points": [{"dx": 0, "dy": 0}]}'}
          rows="4"
        ></textarea>
        {#if importError}
          <p class="import-error">{importError}</p>
        {/if}
        <button class="action-btn" onclick={handleImport} aria-label="Apply imported JSON">
          Apply Import
        </button>
      </div>
    {/if}
  </div>

  <!-- Trail Points -->
  <TrailPointAssignmentSection {editorState} />

  <!-- Status -->
  <div class="status-bar">
    <span class="status-info">
      {editorState.points.length} {editorState.points.length === 1 ? "point" : "points"}
      {#if editorState.hasUserDefault}
        <span class="status-has-default" title="Custom default set">
          <i class="fas fa-bookmark" aria-hidden="true"></i>
        </span>
      {/if}
      {#if editorState.isOverridingCodeTable}
        <span
          class="status-override"
          title="These points come from the lab store, not prop-tip-points.ts. Edits to the code table are invisible for this prop until the override is cleared."
        >
          <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          Overriding code table
        </span>
      {:else if editorState.tipSource === "render-key"}
        <span class="status-source" title="Tips come from the build-specific table in prop-tip-points.ts">
          build table
        </span>
      {:else}
        <span class="status-source" title="Tips come from the notation table in prop-tip-points.ts">
          code table
        </span>
      {/if}
    </span>
    {#if editorState.actionFeedback}
      <span class="status-action-feedback">
        <i class="fas fa-check-circle" aria-hidden="true"></i>
        {editorState.actionFeedback}
      </span>
    {:else if editorState.saveIndicatorVisible}
      <span class="status-saved">
        <i class="fas fa-check" aria-hidden="true"></i>
        Saved
      </span>
    {/if}
  </div>
</div>

<style>
  .list-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 16px);
    overflow-y: auto;
    min-height: 0;
  }

  .section {
    padding: var(--spacing-md, 16px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-lg, 12px);
  }

  .section h3 {
    margin: 0 0 var(--spacing-sm, 8px);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, white);
    display: flex;
    align-items: center;
    gap: var(--spacing-xs, 4px);
  }

  .point-count {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    background: var(--theme-card-bg);
    padding: 2px 8px;
    border-radius: 9999px;
  }

  .empty-hint {
    padding: var(--spacing-lg, 24px) var(--spacing-md, 16px);
    text-align: center;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-sm, 8px);
  }

  .section-header h3 {
    margin: 0;
  }

  .add-center-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 8px 16px;
    border: 1px solid var(--effect-accent-border);
    border-radius: var(--border-radius-md, 8px);
    background: var(--effect-accent-dim);
    color: var(--effect-accent);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: background 100ms ease;
  }

  .add-center-btn:hover {
    background: var(--effect-accent-mid);
  }

  .add-center-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 1px;
  }

  .point-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .point-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid transparent;
    border-radius: var(--border-radius-md, 8px);
    cursor: pointer;
    transition: background 100ms ease;
  }

  .point-row:hover {
    background: var(--theme-card-bg);
  }

  .point-row.selected {
    background: var(--effect-accent-dim);
    border-color: var(--effect-accent-border);
  }

  .point-row:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: -2px;
  }

  /* Row 1: index + coords + icon buttons */
  .point-top-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .point-index {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--effect-accent);
    background: var(--effect-accent-mid);
    border-radius: 50%;
    flex-shrink: 0;
  }

  .point-coords {
    display: flex;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .coord-field {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .coord-label {
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    flex-shrink: 0;
  }

  .coord-input {
    width: 100%;
    min-width: 0;
    height: 36px;
    padding: 6px 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: var(--border-radius-sm, 4px);
    background: var(--theme-overlay-dark, rgba(0, 0, 0, 0.3));
    color: var(--theme-text, white);
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-min, 14px);
    text-align: right;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .coord-input::-webkit-inner-spin-button,
  .coord-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .coord-input:focus {
    outline: none;
    border-color: var(--effect-accent);
  }

  /* Icon buttons (center, delete) - 44px AAA touch target */
  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md, 8px);
    background: transparent;
    cursor: pointer;
    transition: all 100ms ease;
    flex-shrink: 0;
  }

  .icon-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 1px;
  }

  .icon-btn i {
    font-size: var(--font-size-min, 14px);
  }

  .center-btn {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .center-btn:hover {
    background: var(--effect-accent-dim);
    border-color: var(--effect-accent-border);
    color: var(--effect-accent);
  }

  .delete-btn {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .delete-btn:hover {
    background: var(--semantic-error-dim, rgba(239, 68, 68, 0.12));
    border-color: color-mix(in srgb, var(--semantic-error) 30%, transparent);
    color: var(--semantic-error, #ef4444);
  }

  .action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 16px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md, 8px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .action-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 1px;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .default-btn {
    border-color: var(--semantic-success-dim, rgba(34, 197, 94, 0.4));
    color: var(--semantic-success, #22c55e);
  }

  .default-btn:hover:not(:disabled) {
    background: var(--semantic-success-dim, rgba(34, 197, 94, 0.1));
  }

  .reset-btn {
    border-color: var(--semantic-error-dim, rgba(239, 68, 68, 0.3));
    color: var(--semantic-error, #ef4444);
  }

  .reset-btn:hover:not(:disabled) {
    background: var(--semantic-error-dim, rgba(239, 68, 68, 0.1));
  }

  .code-table-btn {
    border-color: var(--semantic-warning-dim, rgba(245, 158, 11, 0.4));
    color: var(--semantic-warning, #f59e0b);
  }

  .code-table-btn:hover:not(:disabled) {
    background: var(--semantic-warning-dim, rgba(245, 158, 11, 0.1));
  }

  .import-section {
    margin-top: var(--spacing-sm, 8px);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }

  .import-textarea {
    width: 100%;
    min-height: 80px;
    padding: 10px 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md, 8px);
    background: var(--theme-overlay-dark, rgba(0, 0, 0, 0.3));
    color: var(--theme-text, white);
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-min, 14px);
    resize: vertical;
  }

  .import-error {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: var(--semantic-error, #ef4444);
  }

  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    font-size: var(--font-size-min, 14px);
  }

  .status-info {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-has-default {
    color: var(--semantic-success, #22c55e);
    font-size: var(--font-size-compact, 12px);
  }

  .status-override {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--semantic-warning-dim, rgba(245, 158, 11, 0.4));
    color: var(--semantic-warning, #f59e0b);
    font-size: var(--font-size-compact, 12px);
  }

  .status-source {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-compact, 12px);
  }

  .status-saved {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    display: flex;
    align-items: center;
    gap: 4px;
    animation: fade-in-out 1.2s ease;
  }

  .status-action-feedback {
    color: var(--semantic-success, #22c55e);
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 500;
    animation: action-pop 2s ease;
  }

  @keyframes fade-in-out {
    0% { opacity: 0; }
    15% { opacity: 1; }
    75% { opacity: 1; }
    100% { opacity: 0; }
  }

  @keyframes action-pop {
    0% { opacity: 0; transform: scale(0.95); }
    10% { opacity: 1; transform: scale(1.02); }
    20% { transform: scale(1); }
    80% { opacity: 1; }
    100% { opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .action-btn,
    .point-row,
    .icon-btn,
    .add-center-btn {
      transition: none;
    }

    .status-saved,
    .status-action-feedback {
      animation: none;
    }
  }
</style>
