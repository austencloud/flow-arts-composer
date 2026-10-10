<!--
  ExportControlsSection.svelte

  Reusable export controls for SequencePreviewPanel (preview mode).
  Export format is determined by the parent's media type selection (no duplicate selector).

  Features:
  - Settings button per format
  - Export button with progress
  - Integrates with existing export settings panels
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { MediaFormat } from "#lib/shared/export-panel/domain/models/media-format.js";
  import type { ExportProgress, ExportSettings } from "../domain/types";
  import ExportButton from "#lib/shared/export-panel/components/shared/ExportButton.svelte";
  import SettingsPanel from "#lib/shared/export-panel/components/settings/SettingsPanel.svelte";
  import AnimationSettings from "#lib/shared/export-panel/components/settings/AnimationSettings.svelte";
  import StaticSettingsPanel from "#lib/shared/export-panel/components/settings/StaticSettings.svelte";
  import PerformanceSettingsPanel from "#lib/shared/export-panel/components/settings/PerformanceSettings.svelte";

  let {
    selectedFormat = "animation" as MediaFormat,
    isExporting = false,
    exportProgress = null as ExportProgress | null,
    isSequenceSaved = true,
    isMobile = false,
    onExport,
    onSettingsChange,
  }: {
    selectedFormat?: MediaFormat;
    isExporting?: boolean;
    exportProgress?: ExportProgress | null;
    isSequenceSaved?: boolean;
    isMobile?: boolean;
    onExport?: (format: MediaFormat, settings: ExportSettings) => void;
    onSettingsChange?: (format: MediaFormat, settings: any) => void;
  } = $props();

  // Local state
  let settingsPanelOpen = $state(false);

  // Derived labels
  const formatLabel = $derived(
    selectedFormat === "animation"
      ? "Animation"
      : selectedFormat === "static"
        ? "Image"
        : t("viewer_detail_video")
  );
  const actionVerb = $derived(isMobile ? "Share" : "Save");
  const buttonLabel = $derived(
    isSequenceSaved
      ? `${actionVerb} ${formatLabel}`
      : `Save & ${actionVerb} ${formatLabel}`
  );

  const settingsTitle = $derived(`${formatLabel} Settings`);

  // Progress text
  const progressText = $derived.by(() => {
    if (!exportProgress) return null;
    switch (exportProgress.stage) {
      case "capturing":
        return `Capturing frames... ${Math.round(exportProgress.progress * 100)}%`;
      case "encoding":
        return `Encoding... ${Math.round(exportProgress.progress * 100)}%`;
      case "complete":
        return "Complete!";
      case "error":
        return "Error";
      default:
        return null;
    }
  });

  function handleExport() {
    onExport?.(selectedFormat, { format: selectedFormat });
  }

  function openSettings() {
    settingsPanelOpen = true;
  }

  function closeSettings() {
    settingsPanelOpen = false;
  }
</script>


<!-- Note: This is a stub component - markup not yet implemented -->
