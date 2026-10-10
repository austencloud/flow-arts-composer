<!--
  StaticSettings.svelte

  Settings panel for static image export footer customization.
  Works in two modes:
  1. Standalone mode: Directly modifies persistent defaults (ImageCompositionManager)
  2. Export panel mode: Uses per-export overrides via ExportPanelState context

  Domain: Export Panel - Settings - Static Image Format
-->
<script lang="ts">
  import { getContext } from "svelte";
  import type { ExportPanelState } from "../../state/export-panel-state.svelte";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import { onMount, onDestroy } from "svelte";
  import CardFooterEditor from "#lib/shared/share/components/CardFooterEditor.svelte";
  import {
    cardPresentationFromFooterSettings,
    resolveCardFooter,
    type CardPresentation,
  } from "#lib/shared/share/domain/models/card-presentation.js";

  // Try to get export panel context (may not exist if used standalone)
  const EXPORT_PANEL_STATE_KEY = Symbol.for("ExportPanelState");
  const exportPanelState = getContext<ExportPanelState | undefined>(
    EXPORT_PANEL_STATE_KEY
  );
  const isInExportPanel = !!exportPanelState;

  const imageCompositionManager = getImageCompositionManager();

  // Local state for footer settings (initialized from defaults)
  let showNotes = $state(imageCompositionManager.showNotes);
  let customNotesText = $state(imageCompositionManager.customNotesText);
  let isCustomized = $state(false);
  const cardPresentation = $derived(
    cardPresentationFromFooterSettings(showNotes, customNotesText)
  );

  // Sync with persistent settings changes
  function handleSettingsChange() {
    if (!isCustomized) {
      showNotes = imageCompositionManager.showNotes;
      customNotesText = imageCompositionManager.customNotesText;
    }
  }

  onMount(() => {
    imageCompositionManager.registerObserver(handleSettingsChange);

    // If in export panel, check if already customized for this export
    if (isInExportPanel && exportPanelState) {
      const currentSettings = exportPanelState.staticSettings;
      if (currentSettings.isUsingCustomFooter) {
        showNotes = currentSettings.showNotes ?? showNotes;
        customNotesText = currentSettings.customNotesText ?? customNotesText;
        isCustomized = true;
      }
    }
  });

  onDestroy(() => {
    imageCompositionManager.unregisterObserver(handleSettingsChange);
  });

  function changeCardPresentation(value: CardPresentation) {
    const footer = resolveCardFooter(value);
    showNotes = footer.show;
    if (footer.show) customNotesText = footer.text;
    applyChanges();
  }

  function applyChanges() {
    if (isInExportPanel && exportPanelState) {
      // Per-export override mode
      isCustomized = true;
      exportPanelState.staticSettings = {
        ...exportPanelState.staticSettings,
        showNotes,
        customNotesText,
        isUsingCustomFooter: true,
      };
    } else {
      // Standalone mode - update persistent defaults directly
      imageCompositionManager.setShowNotes(showNotes);
      imageCompositionManager.setCustomNotesText(customNotesText);
    }
  }

  function resetToDefaults() {
    showNotes = imageCompositionManager.showNotes;
    customNotesText = imageCompositionManager.customNotesText;
    isCustomized = false;

    // Clear custom settings from export panel state
    if (isInExportPanel && exportPanelState) {
      exportPanelState.staticSettings = {
        ...exportPanelState.staticSettings,
        showNotes: undefined,
        customNotesText: undefined,
        isUsingCustomFooter: false,
      };
    }
  }
</script>

<div class="static-settings">
  <!-- Header with status indicator -->
  <div class="settings-header">
    <h4>Footer Content</h4>
    {#if isInExportPanel}
      <span class="status-badge" class:customized={isCustomized}>
        {isCustomized ? "Custom for this export" : "Using your defaults"}
      </span>
    {/if}
  </div>

  <CardFooterEditor
    value={cardPresentation}
    onchange={changeCardPresentation}
    description={isInExportPanel
      ? "Applies to this export only."
      : "Sets the default for new cards."}
    idBase="static-export-footer"
  />

  <!-- Reset button (only shown when customized in Export panel mode) -->
  {#if isInExportPanel && isCustomized}
    <button class="reset-btn" onclick={resetToDefaults}>
      <i class="fas fa-undo" aria-hidden="true"></i>
      Reset to defaults
    </button>
  {/if}
</div>

<style>
  .static-settings {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .settings-header h4 {
    font-size: var(--font-size-min);
    font-weight: 600;
    color: var(--theme-text, white);
    margin: 0;
  }

  .status-badge {
    font-size: var(--font-size-compact);
    padding: 4px 10px;
    border-radius: 20px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text-dim);
    transition:
      background-color var(--duration-fast) ease,
      border-color var(--duration-fast) ease,
      color var(--duration-fast) ease;
  }

  .status-badge.customized {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
    color: var(--theme-accent);
  }

  .reset-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 16px;
    background: transparent;
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .reset-btn:hover {
    background: var(--theme-card-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .reset-btn i {
    font-size: var(--font-size-compact);
  }

  @media (prefers-reduced-motion: reduce) {
    .reset-btn,
    .status-badge {
      transition: none;
    }
  }
</style>
