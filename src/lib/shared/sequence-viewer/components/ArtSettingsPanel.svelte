<!--
  Stable public dispatcher for the two Art settings products. Tunnel and
  Mandala own their controls; the shared frame owns desktop card chrome.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import MandalaArtSettings from "./art-settings/MandalaArtSettings.svelte";
  import TunnelArtSettings from "./art-settings/TunnelArtSettings.svelte";
  import type { ArtSettingsPanelProps } from "./art-settings/art-settings-types";

  let {
    sequence,
    controller,
    mandalaController,
    artType,
    layout = "sidebar",
    onExport,
    showExport = true,
    showTitle = true,
    onSaveTunnel,
    saveTunnelLabel = t("viewer_detail_save_tunnel"),
    bpm = $bindable(60),
    playbackMode = "continuous",
    isPlaying = false,
    onBpmChange = () => {},
    onPlaybackModeChange = () => {},
    onPlaybackToggle = () => {},
    leftPropType = null,
    onPropChange,
    fanAppearance,
    onFanAppearanceChange,
    onArtSettingChange,
    exporting = false,
  }: ArtSettingsPanelProps = $props();

  let reduceMotion = $state(false);
  $effect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion = mq.matches;
    const onChange = () => (reduceMotion = mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  });
</script>

{#if artType === "tunnel"}
  <TunnelArtSettings
    {sequence}
    {controller}
    {layout}
    {onExport}
    {showExport}
    {showTitle}
    {onSaveTunnel}
    {saveTunnelLabel}
    {bpm}
    {playbackMode}
    {isPlaying}
    {onBpmChange}
    {onPlaybackModeChange}
    {onPlaybackToggle}
    {leftPropType}
    {onPropChange}
    {fanAppearance}
    {onFanAppearanceChange}
    {onArtSettingChange}
    {exporting}
    {reduceMotion}
  />
{:else}
  <MandalaArtSettings
    {mandalaController}
    {layout}
    {onExport}
    {showExport}
    {showTitle}
    {onArtSettingChange}
    {exporting}
    {reduceMotion}
  />
{/if}
