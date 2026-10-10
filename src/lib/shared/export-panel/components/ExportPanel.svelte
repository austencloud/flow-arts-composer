<!--
  ExportPanel.svelte

  Main unified export panel combining Single Media and Composite modes.
  Animation state is consumed from AnimationExportContext (no prop drilling).

  Architecture:
  - Top: ModeToggle (Single Media | Composite) - hidden for MVP
  - Middle: Conditional view based on mode (SingleMediaView | CompositeView)
  - Overlay: SettingsPanel (slides in from right when gear clicked)
-->
<script lang="ts">
  import { createExportPanelState } from "../state/export-panel-state.svelte";
  import SingleMediaView from "./single-media/SingleMediaView.svelte";
  import CompositeView from "./composite/CompositeView.svelte";
  import SettingsPanel from "./settings/SettingsPanel.svelte";
  import AnimationSettings from "./settings/AnimationSettings.svelte";
  import StaticSettingsPanel from "./settings/StaticSettings.svelte";
  import PerformanceSettingsPanel from "./settings/PerformanceSettings.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { untrack } from "svelte";
  import type { ExportSettings } from "../domain/models/export-settings";

  let {
    sequence,
    isSequenceSaved = true,
    isMobile = false,
    onExport,
  }: {
    sequence?: SequenceData | null;
    isSequenceSaved?: boolean;
    isMobile?: boolean;
    onExport?: (
      mode: "single" | "composite",
      settings?: ExportSettings
    ) => Promise<void>;
  } = $props();

  const panelState = createExportPanelState();

  // Initialize sequence once on mount
  let sequenceInitialized = false;
  $effect.pre(() => {
    if (!sequenceInitialized && sequence !== undefined) {
      sequenceInitialized = true;
      untrack(() => {
        panelState.setSequence(sequence ?? null);
      });
    }
  });

  // Settings panel title based on context
  const settingsTitle = $derived(
    panelState.settingsContext
      ? `${panelState.settingsContext.format.charAt(0).toUpperCase() + panelState.settingsContext.format.slice(1)} Settings${
          panelState.settingsContext.pieceIndex
            ? ` (Piece ${panelState.settingsContext.pieceIndex})`
            : ""
        }`
      : "Settings"
  );

  // Handle export - passes current settings to parent
  async function handleExport() {
    if (panelState.mode === "single") {
      const format = panelState.selectedFormat;
      const exportSettings: ExportSettings = {
        format,
        staticSettings:
          format === "static" ? { ...panelState.staticSettings } : undefined,
        animationSettings:
          format === "animation"
            ? { ...panelState.animationSettings }
            : undefined,
        performanceSettings:
          format === "performance"
            ? { ...panelState.performanceSettings }
            : undefined,
      };
      await onExport?.(panelState.mode, exportSettings);
    } else {
      await onExport?.(panelState.mode, undefined);
    }
  }

  function handleModeChange(mode: "single" | "composite") {
    panelState.mode = mode;
    if (panelState.settingsPanelOpen) {
      panelState.settingsPanelOpen = false;
      panelState.settingsContext = null;
    }
  }
</script>

<div class="export-panel">
  <!-- MVP: Mode toggle hidden - only Single Media available -->
  <!-- <div class="mode-toggle-container">
    <ModeToggle mode={panelState.mode} onModeChange={handleModeChange} />
  </div> -->

  <!-- Content Area - Animation props come from context -->
  <div class="content-area">
    <SingleMediaView {isSequenceSaved} {isMobile} onExport={handleExport} />
  </div>

  <!-- Settings Panel Overlay -->
  {#if panelState.settingsPanelOpen && panelState.settingsContext}
    <SettingsPanel
      isOpen={panelState.settingsPanelOpen}
      title={settingsTitle}
      onClose={() => {
        panelState.settingsPanelOpen = false;
        panelState.settingsContext = null;
      }}
    >
      {#if panelState.settingsContext.format === "animation"}
        <AnimationSettings />
      {:else if panelState.settingsContext.format === "static"}
        <StaticSettingsPanel />
      {:else if panelState.settingsContext.format === "performance"}
        <PerformanceSettingsPanel />
      {/if}
    </SettingsPanel>
  {/if}
</div>

<style>
  .export-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--theme-panel-bg);
    position: relative;
    overflow: hidden;
  }

  .content-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
</style>
