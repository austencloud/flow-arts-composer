<!--
  Formation coordinates the preset browser, the tuner and the color groups. The
  sidebar shows colors inline; the short dock tray drills into them instead.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TunnelViewController } from "../../tunnel/tunnel-view-controller.svelte";
  import ArtDrillBack from "./ArtDrillBack.svelte";
  import TunnelPresetBrowser from "./TunnelPresetBrowser.svelte";
  import TunnelPrimitiveTuner from "./TunnelPrimitiveTuner.svelte";
  import TunnelConfigurationSummary from "./TunnelConfigurationSummary.svelte";
  import TunnelColorSettings from "./TunnelColorSettings.svelte";
  import TunnelColorDrillRows, {
    type TunnelColorDrill,
  } from "./TunnelColorDrillRows.svelte";
  import TunnelCastLinks from "./TunnelCastLinks.svelte";
  import type { ArtSettingChangeHandler } from "./art-settings-types";

  interface Props {
    controller: TunnelViewController;
    dense: boolean;
    onSaveTunnel?: () => void;
    saveTunnelLabel?: string;
    onArtSettingChange?: ArtSettingChangeHandler;
  }

  let {
    controller,
    dense,
    onSaveTunnel,
    saveTunnelLabel = t("viewer_detail_save_tunnel"),
    onArtSettingChange,
  }: Props = $props();

  function openTuner(source: "custom_card" | "customize_button"): void {
    if (controller.lookEditorOpen) return;
    controller.lookEditorOpen = true;
    reportDrill("presets", "customize", source);
  }

  function closeTuner(): void {
    if (!controller.lookEditorOpen) return;
    controller.lookEditorOpen = false;
    reportDrill("customize", "presets", "back_button");
  }

  // Dock-only color screens; local, so a reopened tray lands on the presets.
  let colorDrill = $state<TunnelColorDrill | null>(null);

  function openColorDrill(id: TunnelColorDrill): void {
    colorDrill = id;
    reportDrill("presets", id, "drill_row");
  }

  function closeColorDrill(): void {
    const previous = colorDrill ?? "presets";
    colorDrill = null;
    reportDrill(previous, "presets", "back_button");
  }

  // An analytics sink must never strand somebody in the preset surface. The
  // controller owns the edit state; telemetry is only an observer.
  function reportDrill(previous: string, value: string, source: string): void {
    try {
      onArtSettingChange?.(
        "art_navigation",
        "tunnel_drill",
        previous,
        value,
        false,
        source
      );
    } catch (error) {
      console.warn("[TunnelLookSettings] tunnel drill not recorded:", error);
    }
  }
</script>

{#snippet colorDrillRows()}
  <TunnelColorDrillRows {controller} onOpen={openColorDrill} />
{/snippet}
<div class="section-pad">
  {#if dense && colorDrill}
    <ArtDrillBack label={t("create_ui_presets")} onBack={closeColorDrill} />
    <TunnelColorSettings
      {controller}
      {dense}
      section={colorDrill === "performers" ? "performers" : "tunnel"}
      {onArtSettingChange}
    />
  {:else}
    <TunnelConfigurationSummary {controller} {dense} />
    <TunnelCastLinks links={controller.castLinks} />
    {#if !dense}
      <TunnelColorSettings {controller} {dense} {onArtSettingChange} />
    {/if}
    {#if controller.lookEditorOpen}
      <TunnelPrimitiveTuner
        {controller}
        onBack={closeTuner}
        {onArtSettingChange}
      />
    {:else}
      <!-- Dense: Display owns the grid toggle; Custom opens the tuner. -->
      <TunnelPresetBrowser
        {controller}
        {dense}
        {onSaveTunnel}
        {saveTunnelLabel}
        showGridControl={!dense}
        showCustomizeButton={!dense}
        beforeActions={dense ? colorDrillRows : undefined}
        onCustomize={(source) => openTuner(source)}
        {onArtSettingChange}
      />
    {/if}
  {/if}

  {#if controller.heavyLoad}
    <p class="warn">
      Dense stack ({controller.propCount} props): a heavy effect may drop frames on
      weaker devices.
    </p>
  {/if}
</div>

<style>
  .section-pad {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 16px 20px;
  }
  .warn {
    margin: 0;
    font-size: 0.72rem;
    color: var(--semantic-warning, #fbbf24);
  }

  /* Mobile dock tray: tighten the shared section bodies. Buttons/inputs keep
     their var(--min-touch-target) floor — only gaps and outer paddings collapse
     so the tray stays compact floating over the art. */
  :global(.dock-dense) .section-pad {
    gap: 8px;
    padding: 2px 2px 6px;
  }
</style>
