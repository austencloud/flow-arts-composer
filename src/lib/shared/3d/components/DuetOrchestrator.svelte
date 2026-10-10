<script lang="ts">
  /**
   * DuetOrchestrator
   *
   * Manages duet browser and creator panels.
   * Extracted from the 3D viewer to reduce complexity.
   */

  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { DuetSequenceWithData } from "../domain/duet-sequence";
  import type { PerformerManager } from "../state/performer-manager.svelte";
  import SequencePickerModal from "#lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import DuetBrowserPanel from "./panels/DuetBrowserPanel.svelte";
  import DuetCreatorPanel from "./panels/DuetCreatorPanel.svelte";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

  type BrowserViewMode = "sequences" | "duets";

  interface Props {
    /** Whether browser is open */
    open: boolean;
    /** Performer manager for loading sequences */
    performerManager: PerformerManager;
    /** Callback when browser closes */
    onClose: () => void;
  }

  let { open, performerManager, onClose }: Props = $props();

  // Internal state
  let browserViewMode = $state<BrowserViewMode>("sequences");
  let duetCreatorOpen = $state(false);

  /**
   * Handle single sequence selection
   */
  function handleSequenceSelect(sequence: SequenceData) {
    try {
      const activeState = performerManager.activeState;
      if (!activeState) {
        toast.error("No performer selected");
        return;
      }

      activeState.loadSequence(sequence);
      const name = sequence.word || sequence.name || "Sequence";
      toast.success(`Loaded "${name}"`);
      onClose();
    } catch (err) {
      console.error("[DuetOrchestrator] Failed to load sequence:", err);
      toast.error("Failed to load sequence. Please try again.");
    }
  }

  function handleDuetSelect(duet: DuetSequenceWithData) {
    try {
      // Ensure we have at least 2 performers
      performerManager.ensurePerformerCount(2);

      // Load sequences into first two performers
      const performers = performerManager.performers;
      performers[0]?.loadSequence(duet.performer1Sequence);
      performers[1]?.loadSequence(duet.performer2Sequence);

      // Apply beat offset via sync state
      const syncState = performerManager.syncState;
      if (syncState) {
        syncState.setOffset(duet.stepOffset);
        // Enable sync if there's an offset
        if (duet.stepOffset !== 0 && !syncState.isSyncEnabled) {
          syncState.toggleSync();
        }
      }

      toast.success(`Loaded duet "${duet.name}"`);
      onClose();
    } catch (err) {
      console.error("[DuetOrchestrator] Failed to load duet:", err);
      toast.error("Failed to load duet. Please try again.");
    }
  }

  /**
   * Handle duet creation complete
   */
  function handleDuetCreated(duetId: string) {
    duetCreatorOpen = false;
    browserViewMode = "duets";
    toast.success("Duet created successfully!");
  }
</script>

<!-- Sequence Picker Modal (when in sequences mode) -->
<SequencePickerModal
  open={open && browserViewMode === "sequences"}
  title="Load Sequence"
  onSelect={handleSequenceSelect}
  onClose={onClose}
/>

<!-- Duets Browser Panel (when in duets mode) -->
{#if open && browserViewMode === "duets"}
  <div class="browser-overlay">
    <div class="browser-panel">
      <header class="browser-header">
        <h2>Load Duet</h2>
        <button
          class="close-browser-btn"
          onclick={onClose}
          aria-label="Close browser"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </header>

      <DuetBrowserPanel
        viewMode={browserViewMode}
        onSelectDuet={handleDuetSelect}
        onCreateDuet={() => (duetCreatorOpen = true)}
        onViewModeChange={(mode) => (browserViewMode = mode)}
      />

      <!-- View Mode Toggle at bottom -->
      <div class="browser-footer">
        <button
          class="view-mode-btn"
          onclick={() => (browserViewMode = "sequences")}
          aria-label="View solo sequences"
          aria-pressed={false}
        >
          <i class="fas fa-film" aria-hidden="true"></i>
          Solo Sequences
        </button>
        <button
          class="view-mode-btn active"
          onclick={() => (browserViewMode = "duets")}
          aria-label="View duets"
          aria-pressed={true}
        >
          <i class="fas fa-users" aria-hidden="true"></i>
          Duets
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Duet Creator Panel -->
{#if duetCreatorOpen}
  <div class="duet-creator-overlay">
    <div class="duet-creator-panel">
      <DuetCreatorPanel
        onCreated={handleDuetCreated}
        onCancel={() => (duetCreatorOpen = false)}
      />
    </div>
  </div>
{/if}

<style>
  .browser-overlay,
  .duet-creator-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-overlay-dark, rgba(0, 0, 0, 0.7));
    backdrop-filter: blur(4px);
  }

  .browser-panel {
    display: flex;
    flex-direction: column;
    width: min(90vw, 600px);
    max-height: 80vh;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    overflow: hidden;
  }

  .browser-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .browser-header h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .close-browser-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 1rem;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .close-browser-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #ffffff);
  }

  .close-browser-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .browser-footer {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .view-mode-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .view-mode-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #ffffff);
  }

  .view-mode-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .view-mode-btn.active {
    background: var(--theme-accent, #8b5cf6);
    border-color: var(--theme-accent, #8b5cf6);
    color: var(--theme-on-accent, #000);
  }

  .duet-creator-panel {
    width: min(90vw, 500px);
    max-height: 90vh;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    overflow: hidden;
  }
</style>
