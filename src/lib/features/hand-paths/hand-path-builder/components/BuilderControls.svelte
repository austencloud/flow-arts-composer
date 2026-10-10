<!--
  BuilderControls.svelte - Hand switcher, undo, clear, save, and phase controls

  Guides the user through the three phases:
  - Left: tap locations, then "Next Hand" when done (min 2)
  - Right: tap locations to match the left path length, then "Complete"
  - Complete: shows both path names, offers save

  Save calls HandPathFactory + HandPathRepository to persist both paths.
-->
<script lang="ts">

import { getHandPathSaveOrchestrator } from "#lib/features/library/get-hand-path-save-orchestrator.js";
  import { getBuilderContext } from "../context/builder-context";
  import { createHandPath } from "#lib/shared/foundation/services/hand-path-factory.js";
  import type { HandPathSaveOrchestrator } from "#lib/features/library/services/hand-path-save-orchestrator.js";
  import type { HandPathData } from "#lib/shared/foundation/domain/models/hand-path-data.js";

  const builder = getBuilderContext();

  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let savedLeft = $state<HandPathData | null>(null);
  let savedRight = $state<HandPathData | null>(null);

  // Phase instruction copy
  const instruction = $derived.by(() => {
    if (builder.phase === "left") {
      if (builder.leftLocations.length === 0) return "Tap grid points to draw the left hand path.";
      if (builder.leftLocations.length === 1) return "Tap at least one more point, then switch to red.";
      return `${builder.leftLocations.length} points - tap "Next Hand" when ready.`;
    }
    if (builder.phase === "right") {
      const remaining = builder.leftLocations.length - builder.rightLocations.length;
      if (builder.rightLocations.length === 0) return "Now draw the right hand path.";
      if (remaining > 0) return `${remaining} more point${remaining > 1 ? "s" : ""} to match blue.`;
      return `Paths match - tap "Complete" to finish.`;
    }
    return "Both paths built.";
  });

  async function handleSave(): Promise<void> {
    if (builder.phase !== "complete") return;
    saving = true;
    saveError = null;
    savedLeft = null;
    savedRight = null;

    try {
      const orchestrator = getHandPathSaveOrchestrator();

      const left = createHandPath(builder.leftLocations, {
        name: builder.leftPathName,
      });
      const right = createHandPath(builder.rightLocations, {
        name: builder.rightPathName,
      });

      await Promise.all([
        orchestrator.save(left, builder.leftPathName),
        orchestrator.save(right, builder.rightPathName),
      ]);

      savedLeft = left;
      savedRight = right;
    } catch (err) {
      saveError = err instanceof Error ? err.message : "Save failed.";
    } finally {
      saving = false;
    }
  }
</script>

<div class="builder-controls" data-edit-history-shortcut-scope>
  <!-- Phase instruction -->
  {#if builder.phase !== "complete"}
    <p class="instruction">{instruction}</p>
  {/if}

  <!-- Action buttons -->
  <div class="button-row">
    <!-- Undo -->
    {#if builder.phase !== "complete"}
      <button
        data-undo-shortcut
        data-undo-shortcut-label="Last tap"
        class="btn btn-ghost"
        disabled={!builder.canUndo}
        onclick={builder.undo}
        title="Undo last tap"
        aria-label="Undo last tap"
      >
        <i class="fas fa-undo" aria-hidden="true"></i>
        Undo
      </button>
    {/if}

    <!-- Reset -->
    <button
      class="btn btn-ghost"
      onclick={builder.reset}
      aria-label="Reset all paths"
    >
      <i class="fas fa-trash-alt" aria-hidden="true"></i>
      Reset
    </button>

    <!-- Phase advance buttons -->
    {#if builder.phase === "left"}
      <button
        class="btn btn-primary"
        disabled={!builder.canSwitchToRight}
        onclick={builder.switchToRight}
        aria-label="Switch to right hand"
      >
        Next Hand
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </button>
    {:else if builder.phase === "right"}
      <button
        class="btn btn-primary"
        disabled={!builder.canComplete}
        onclick={builder.complete}
        aria-label="Complete both paths"
      >
        Complete
        <i class="fas fa-check" aria-hidden="true"></i>
      </button>
    {/if}
  </div>

  <!-- Complete state: result panel -->
  {#if builder.phase === "complete"}
    <div class="result-panel">
      <div class="result-row">
        <span class="result-label blue-label">Left:</span>
        <code class="result-name">{builder.leftPathName}</code>
      </div>
      <div class="result-row">
        <span class="result-label red-label">Right:</span>
        <code class="result-name">{builder.rightPathName}</code>
      </div>

      {#if savedLeft && savedRight}
        <p class="save-success">
          <i class="fas fa-check-circle" aria-hidden="true"></i>
          Saved to library.
        </p>
      {:else if saveError}
        <p class="save-error">
          <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
          {saveError}
        </p>
      {/if}

      <div class="button-row">
        <button
          class="btn btn-ghost"
          onclick={builder.reset}
          aria-label="Build a new path"
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
          New Path
        </button>

        {#if !savedLeft}
          <button
            data-save-shortcut
            class="btn btn-primary"
            disabled={saving}
            onclick={handleSave}
            aria-label="Save both hand paths"
          >
            {#if saving}
              <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
              Saving…
            {:else}
              <i class="fas fa-save" aria-hidden="true"></i>
              Save Paths
            {/if}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .builder-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }

  .instruction {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.55));
    text-align: center;
    margin: 0;
  }

  .button-row {
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 16px;
    border-radius: 8px;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: background 0.15s ease, opacity 0.15s ease, color 0.15s ease;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  .btn-ghost {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .btn-ghost:not(:disabled):hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #fff);
  }

  .btn-primary {
    background: var(--theme-accent, #3b82f6);
    color: var(--theme-text-on-accent, #fff);
  }

  .btn-primary:not(:disabled):hover {
    background: color-mix(in srgb, var(--theme-accent, #3b82f6) 80%, white);
  }

  /* Complete / result panel */
  .result-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
  }

  .result-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .result-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    width: 36px;
    flex-shrink: 0;
  }

  .blue-label {
    color: var(--prop-blue, #2e8bf0);
  }

  .red-label {
    color: var(--prop-red, #ed1c24);
  }

  .result-name {
    font-family: monospace;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    padding: 3px 8px;
    border-radius: 5px;
  }

  .save-success {
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-success, #22c55e);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .save-error {
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-error, #ef4444);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
