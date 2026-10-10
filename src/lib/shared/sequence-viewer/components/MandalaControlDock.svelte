<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import ControlDock, {
    type ControlDockAction,
    type ControlDockTab,
  } from "./ControlDock.svelte";
  import MandalaCategoryControl, {
    type MandalaCategory,
  } from "./mandala/MandalaCategoryControl.svelte";
  import type { MandalaViewerController } from "../state/mandala-viewer-controller.svelte";

  interface Props {
    ctrl: MandalaViewerController;
    /** Reports the dock's measured height so the stage can reserve room. */
    onHeightChange?: (px: number) => void;
    showDownload?: boolean;
    /** Replaces Download when the embedded viewer has a different primary action. */
    trailingAction?: ControlDockAction;
  }

  let {
    ctrl,
    onHeightChange,
    showDownload = true,
    trailingAction,
  }: Props = $props();

  let activeCategory = $state<MandalaCategory | null>(null);

  const tabs = $derived<ControlDockTab[]>([
    { id: "speed", icon: "fa-gauge-high", label: t("viewer_ui_speed") },
    { id: "shape", icon: "fa-bezier-curve", label: t("viewer_ui_shape") },
    { id: "spin", icon: "fa-arrows-rotate", label: t("viewer_ui_spin") },
    { id: "colors", dots: ctrl.accentPair, label: t("viewer_ui_colors") },
    { id: "weight", icon: "fa-grip-lines", label: t("viewer_ui_weight") },
    { id: "depth", icon: "fa-wave-square", label: t("viewer_ui_depth") },
  ]);

  function toggleCategory(id: string): void {
    const category = id as MandalaCategory;
    activeCategory = activeCategory === category ? null : category;
  }

  function exportMandala(): void {
    activeCategory = null;
    ctrl.startExport();
  }

  const dockAction = $derived<ControlDockAction | undefined>(
    showDownload
      ? {
          icon: "fa-download",
          label: t("viewer_ui_download_options"),
          onClick: () => toggleCategory("download"),
          active: activeCategory === "download",
        }
      : trailingAction
  );
</script>

{#snippet tray()}
  {#if activeCategory}
    <MandalaCategoryControl
      {ctrl}
      category={activeCategory}
      onExport={exportMandala}
    />
  {/if}
{/snippet}

<ControlDock
  {tabs}
  activeTab={activeCategory}
  onTabSelect={toggleCategory}
  {tray}
  trailingAction={dockAction}
  {onHeightChange}
  labelMinWidth={340}
  overlay
/>
