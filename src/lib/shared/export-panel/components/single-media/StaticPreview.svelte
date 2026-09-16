<!--
  StaticPreview.svelte

  Static image format preview using the actual ImageComposer.
  Shows a real preview of what the exported image will look like.

  Features:
  - Uses saved visibility settings from ImageCompositionManager
  - Quick-access toggle chips for common settings
  - White background always
  - High quality export

  Domain: Export Panel - Single Media - Static Image Format
-->
<script lang="ts">
  import { getExportPanelState } from "../../state/export-panel-state.svelte";
  import { getSequenceRenderer } from "$lib/shared/render/get-sequence-renderer";
  import type { SequenceRenderer } from "$lib/shared/render/services/sequence-renderer";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { onMount } from "svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";

  const hubState = getExportPanelState();
  const imageSettings = getImageCompositionManager();

  // Preview state
  let previewDataUrl = $state<string | null>(null);
  let isLoading = $state(false);
  let previewError = $state<string | null>(null);
  let renderService = $state<SequenceRenderer | null>(null);
  let renderVersion = $state(0); // Increment to trigger re-render
  let rendererAttempt = $state(0); // Increment to retry renderer acquisition
  // Monotonic token: every preview request bumps this, and only the response
  // matching the latest token is allowed to write state. A slow request from an
  // older settings snapshot can no longer clobber a newer preview.
  let previewRequestId = 0;

  // Local reactive copies of settings (for UI)
  let addWord = $state(imageSettings.addWord);
  let addStepNumbers = $state(imageSettings.addStepNumbers);
  let includeStartPlacement = $state(imageSettings.includeStartPlacement);
  let addDifficultyLevel = $state(imageSettings.addDifficultyLevel);
  let showNotes = $state(imageSettings.showNotes);
  let darkMode = $state(imageSettings.darkMode);

  // Load render service on mount (re-runs when rendererAttempt changes for retry)
  $effect(() => {
    const _attempt = rendererAttempt;
    try {
      renderService = getSequenceRenderer();
      if (!renderService) {
        console.warn("⚠️ SequenceRenderer not available in container");
        previewError = "Preview renderer is unavailable";
      }
    } catch (error) {
      console.error("Failed to get sequenceRenderer from container:", error);
      renderService = null;
      previewError = "Preview renderer is unavailable";
    }
  });

  function retryPreview() {
    previewError = null;
    rendererAttempt++; // Re-attempt renderer acquisition
    renderVersion++; // Re-trigger preview generation
  }

  // Sync settings from manager and listen for changes
  onMount(() => {
    const updateFromManager = () => {
      addWord = imageSettings.addWord;
      addStepNumbers = imageSettings.addStepNumbers;
      includeStartPlacement = imageSettings.includeStartPlacement;
      addDifficultyLevel = imageSettings.addDifficultyLevel;
      showNotes = imageSettings.showNotes;
      darkMode = imageSettings.darkMode;
      renderVersion++; // Trigger re-render
    };

    imageSettings.registerObserver(updateFromManager);
    return () => imageSettings.unregisterObserver(updateFromManager);
  });

  // Generate preview when sequence, settings, or render service changes
  $effect(() => {
    const sequence = hubState.sequence;
    const service = renderService;
    // Track all settings for reactivity
    const _word = addWord;
    const _beats = addStepNumbers;
    const _start = includeStartPlacement;
    const _diff = addDifficultyLevel;
    const _notes = showNotes;
    const _darkMode = darkMode;
    const _version = renderVersion;
    // Track prop type settings for reactivity
    const _catDogMode = settingsService.settings.catDogMode;
    const _leftPropType = settingsService.settings.leftPropType;
    const _rightPropType = settingsService.settings.rightPropType;
    if (!sequence || !service) {
      previewDataUrl = null;
      return;
    }

    // Generate preview with user's saved settings
    const requestId = ++previewRequestId;
    isLoading = true;
    previewError = null;

    service
      .generatePreview(sequence, {
        backgroundColor: _darkMode ? "#0a0a0f" : "#FFFFFF",
        quality: 1.0,
        stepScale: 1.0,
        includeStartPlacement: _start,
        addStepNumbers: _beats,
        addWord: _word,
        addUserInfo: _notes,
        addDifficultyLevel: _diff,
        showNotes: _notes,
        // Include prop type settings so preview updates when prop type changes
        leftPropTypeOverride: _leftPropType,
        rightPropTypeOverride: _catDogMode ? _rightPropType : _leftPropType,
        // Pass dark mode as visibility override
        visibilityOverrides: {
          darkMode: _darkMode,
        },
      })
      .then((dataUrl) => {
        // Drop stale responses: a newer request superseded this one.
        if (requestId !== previewRequestId) return;
        previewDataUrl = dataUrl;
        isLoading = false;
      })
      .catch((error) => {
        if (requestId !== previewRequestId) return;
        console.error("Preview generation failed:", error);
        previewError =
          error instanceof Error ? error.message : "Preview failed";
        isLoading = false;
      });
  });

  // Toggle handlers - update manager (which persists to localStorage)
  function toggleWord() {
    imageSettings.toggle("addWord");
  }

  function toggleStepNumbers() {
    imageSettings.toggle("addStepNumbers");
  }

  function toggleStartPlacement() {
    imageSettings.toggle("includeStartPlacement");
  }

  function toggleDifficulty() {
    imageSettings.toggle("addDifficultyLevel");
  }

  function toggleNotes() {
    imageSettings.toggle("showNotes");
  }

  function toggleDarkMode() {
    imageSettings.toggle("darkMode");
  }
</script>

<div class="static-preview">
  <!-- Preview Canvas -->
  <div class="preview-canvas">
    {#if !hubState.sequence}
      <div class="empty-state">
        <i class="fas fa-image" aria-hidden="true"></i>
        <p>No sequence loaded</p>
      </div>
    {:else if previewError}
      <div class="error-state">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        <p>{previewError}</p>
        <button class="retry-button" onclick={retryPreview}>
          <i class="fas fa-redo" aria-hidden="true"></i> Retry
        </button>
      </div>
    {:else if isLoading || !renderService}
      <div class="loading-state">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <p>Generating preview...</p>
      </div>
    {:else if previewDataUrl}
      <img src={previewDataUrl} alt="Sequence preview" class="preview-image" />
    {:else}
      <div class="empty-state">
        <i class="fas fa-image" aria-hidden="true"></i>
        <p>No preview available</p>
      </div>
    {/if}
  </div>

  <!-- Quick Settings Chips: independent boolean toggles → FilterChipBase mode="toggle" -->
  <div class="settings-chips">
    <FilterChipBase
      label="Dark Mode"
      mode="toggle"
      size="sm"
      active={darkMode}
      onclick={toggleDarkMode}
    />
    <FilterChipBase
      label="Word"
      mode="toggle"
      size="sm"
      active={addWord}
      onclick={toggleWord}
    />
    <FilterChipBase
      label="Beat #s"
      mode="toggle"
      size="sm"
      active={addStepNumbers}
      onclick={toggleStepNumbers}
    />
    <FilterChipBase
      label="Start Pos"
      mode="toggle"
      size="sm"
      active={includeStartPlacement}
      onclick={toggleStartPlacement}
    />
    <FilterChipBase
      label="Difficulty"
      mode="toggle"
      size="sm"
      active={addDifficultyLevel}
      onclick={toggleDifficulty}
    />
    <FilterChipBase
      label="Footer"
      mode="toggle"
      size="sm"
      active={showNotes}
      onclick={toggleNotes}
    />
  </div>
</div>

<style>
  .static-preview {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 12px;
  }

  .preview-canvas {
    flex: 1;
    min-height: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    background: var(--theme-card-bg);
  }

  .preview-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 4px 16px var(--theme-shadow);
  }

  .empty-state,
  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: var(--theme-text-dim);
  }

  .empty-state i,
  .loading-state i,
  .error-state i {
    font-size: var(--font-size-3xl);
    opacity: 0.3;
  }

  .error-state i {
    color: var(--semantic-error);
    opacity: 0.7;
  }

  .empty-state p,
  .loading-state p,
  .error-state p {
    font-size: var(--font-size-min);
    margin: 0;
    text-align: center;
  }

  .retry-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    min-height: var(--min-touch-target); /* WCAG 2.1 AA touch target */
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: var(--font-size-min);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .retry-button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .retry-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* Settings Chips */
  .settings-chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
  }

  /* Mobile: horizontal scroll if needed; FilterChipBase keeps its own touch targets */
  @media (max-width: 600px) {
    .settings-chips {
      padding: 10px;
      gap: 8px;
      overflow-x: auto;
      flex-wrap: nowrap;
      -webkit-overflow-scrolling: touch;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .retry-button {
      transition: none;
    }
  }
</style>
