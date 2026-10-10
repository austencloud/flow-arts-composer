<!-- Mandala settings compose the canonical category control in two layouts. -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { fade } from "svelte/transition";
  import ControlDock, {
    type ControlDockAction,
    type ControlDockTab,
  } from "../ControlDock.svelte";
  import MandalaCategoryControl, {
    type MandalaCategory,
  } from "../mandala/MandalaCategoryControl.svelte";
  import type { MandalaViewerController } from "../../state/mandala-viewer-controller.svelte";
  import ArtSettingsSidebarFrame from "./ArtSettingsSidebarFrame.svelte";
  import ArtActionFooter from "./ArtActionFooter.svelte";
  import type { ArtSettingChangeHandler } from "./art-settings-types";

  type MandalaRailId = MandalaCategory;

  interface Props {
    mandalaController: MandalaViewerController;
    layout: "sidebar" | "bottom";
    onExport: () => void;
    showExport: boolean;
    showTitle?: boolean;
    onArtSettingChange?: ArtSettingChangeHandler;
    exporting: boolean;
    reduceMotion: boolean;
  }

  let {
    mandalaController,
    layout,
    onExport,
    showExport,
    showTitle = true,
    onArtSettingChange,
    exporting,
    reduceMotion,
  }: Props = $props();

  function reportSetting(
    group: string,
    setting: string,
    previousValue: string | number | boolean | null,
    value: string | number | boolean | null
  ): void {
    if (previousValue === value) return;
    onArtSettingChange?.(group, setting, previousValue, value);
  }

  const mandalaRail = $derived<
    { id: MandalaRailId; icon?: string; label: string }[]
  >([
    { id: "speed", icon: "fa-gauge-high", label: t("viewer_ui_speed") },
    { id: "shape", icon: "fa-bezier-curve", label: t("viewer_ui_shape") },
    { id: "spin", icon: "fa-arrows-rotate", label: t("viewer_ui_spin") },
    { id: "colors", icon: "fa-palette", label: t("viewer_ui_colors") },
    { id: "weight", icon: "fa-grip-lines", label: t("viewer_ui_weight") },
    { id: "depth", icon: "fa-wave-square", label: t("viewer_ui_depth") },
    { id: "download", icon: "fa-download", label: t("viewer_ui_download") },
  ]);

  // Mandala shows ALL its controls stacked (each is a single compact row, so a
  // per-section rail would leave the tall panel mostly empty). The rail is kept
  // for the tunnel, whose sections carry real content.
  //
  // Download is resolution / fps / loop-count for the mandala's own render, so
  // it goes with the export button: a host that owns the render (Post Studio)
  // never performs this one, and its settings would steer nothing.
  const mandalaStack = $derived<{ id: MandalaRailId; label: string }[]>(
    mandalaRail
      .filter(({ id }) => showExport || id !== "download")
      .map(({ id, label }) => ({ id, label }))
  );

  let openMandalaCat = $state<MandalaRailId | null>(null);

  function selectMandalaDock(id: string): void {
    const cid = id as MandalaRailId;
    const previous = openMandalaCat;
    openMandalaCat = previous === cid ? null : cid;
    reportSetting(
      "art_navigation",
      "mobile_mandala_section",
      previous ?? "closed",
      openMandalaCat ?? "closed"
    );
  }

  const mandalaDockTabs = $derived<ControlDockTab[]>(
    mandalaRail
      .filter((c) => c.id !== "download")
      .map((c) =>
        c.id === "colors"
          ? { id: c.id, label: c.label, dots: mandalaController.accentPair }
          : { id: c.id, label: c.label, icon: c.icon }
      )
  );

  // Export is the dock's one trailing action now. Share moved out entirely:
  // the header carries it on every pane, and a second one down here was the
  // duplicate Austen asked to be rid of.
  const mandalaDockExport = $derived<ControlDockAction>({
    icon: "fa-download",
    label: t("viewer_ui_export_mp4"),
    accent: true,
    onClick: () => onExport(),
  });
</script>

{#if layout === "bottom"}
  <ControlDock
    tabs={mandalaDockTabs}
    activeTab={openMandalaCat}
    onTabSelect={selectMandalaDock}
    trailingAction={showExport ? mandalaDockExport : undefined}
    trayMaxHeight="min(33vh, 250px)"
  >
    {#snippet tray()}
      <div class="dock-dense">
        {#if openMandalaCat}
          <MandalaCategoryControl
            ctrl={mandalaController}
            category={openMandalaCat}
            showExportButton={false}
            onSettingChange={onArtSettingChange}
          />
        {/if}
      </div>
    {/snippet}
  </ControlDock>
{:else}
  <ArtSettingsSidebarFrame label="Mandala" {exporting} showLabel={showTitle}>
    <!-- Mandala: every control stacked (no rail). Each control is one compact
         row, so a per-section rail would leave the tall panel mostly empty. -->
    <div class="sidebar-main">
      <div
        class="panel-scroll mandala-stack"
        in:fade={{ duration: reduceMotion ? 0 : 180 }}
      >
        {#each mandalaStack as cat (cat.id)}
          <div class="section-pad mandala-cat">
            <span class="rt-section-label">{cat.label}</span>
            <MandalaCategoryControl
              ctrl={mandalaController}
              category={cat.id}
              showExportButton={false}
              onSettingChange={onArtSettingChange}
            />
          </div>
        {/each}
      </div>

      {#if showExport}
        <ArtActionFooter {onExport} exportLabel="Export MP4" />
      {/if}
    </div>
  </ArtSettingsSidebarFrame>
{/if}

<style>
  .sidebar-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .panel-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
  }
  .panel-scroll::-webkit-scrollbar {
    width: 5px;
  }
  .panel-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .panel-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 3px;
  }

  /* Mandala: stacked categories, each separated by a hairline. */
  .mandala-stack {
    padding-bottom: 8px;
  }

  /* A property panel, not a stack of full-width bars. The name sits in its own
     column and the control sits beside it, so SPEED no longer shouts one line
     above MOTION saying nearly the same thing, and the panel loses roughly a
     third of its height. */
  /* Compound with .section-pad, which is on the same element and would
     otherwise win on source order and put this back to a flex column. */
  .mandala-cat.section-pad {
    /* Everything in the control column shares one width, so the rows line up
       down a single edge instead of each ending wherever its content does. */
    --control-w: min(24rem, 100%);
    display: grid;
    grid-template-columns: minmax(4.5rem, 7rem) minmax(0, 1fr);
    align-items: start;
    column-gap: 1.25rem;
    row-gap: 0.375rem;
    padding: 0.875rem 1rem;
  }
  .mandala-cat + .mandala-cat {
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }
  .section-pad {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 16px 20px;
  }
  .rt-section-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  /* Aligns the name with the first control's text rather than its box top. */
  .mandala-cat > .rt-section-label {
    padding-top: 0.75rem;
  }

  /* --- The control column ------------------------------------------------
     Everything below stops a control from spanning the whole inspector. The
     panel is ~860px wide here and grows past 1200 at 4K; three short words
     stretched across that read as a progress bar, not a choice. */

  /* Segments size to how many there are, so two options don't get the same
     384px a four-option row needs. `--count` is set inline by the control. */
  .mandala-cat :global(.segmented-control) {
    width: min(calc(var(--count) * 6.5rem), var(--control-w));
  }

  /* Chips size to their labels instead of splitting the row between them. */
  .mandala-cat :global(.tray-chips) {
    flex-wrap: wrap;
  }
  .mandala-cat :global(.tray-chips) > :global(.chip) {
    flex: 0 0 auto;
    padding-inline: 1.125rem;
  }

  .mandala-cat :global(.tray-previews),
  .mandala-cat :global(.tray-slider),
  .mandala-cat :global(.tray-colors),
  .mandala-cat :global(.preset-row),
  .mandala-cat :global(.custom-flow) {
    width: var(--control-w);
  }

  /* The palette button was pushed to the far right by space-between, stranding
     it a column away from the Solid/Flow pair it belongs with. */
  .mandala-cat :global(.colors-head) {
    justify-content: flex-start;
    gap: 0.75rem;
  }

  /* One level of shouting per row. The section name is the uppercase one; a
     sub-label inside the column is a label, not a second heading. */
  .mandala-cat :global(.control-label) {
    font-weight: 600;
    letter-spacing: 0.01em;
    text-transform: none;
  }
</style>
