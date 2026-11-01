<!--
  The phone dock's way into the tunnel's color groups: one drill row for the
  tunnel colors and one for the per-performer overrides, each summarising its
  current value. Side by side where the width allows, stacked on a narrow
  cover screen. The rows are the shared settings drill row; opening a screen
  is the Look coordinator's job.
-->
<script module lang="ts">
  export type TunnelColorDrill = "colors" | "performers";
</script>

<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SettingsDrillRow from "#lib/shared/ui/components/settings-drill/SettingsDrillRow.svelte";
  import type { TunnelViewController } from "../../tunnel/tunnel-view-controller.svelte";

  let {
    controller,
    onOpen,
  }: {
    controller: TunnelViewController;
    onOpen: (id: TunnelColorDrill) => void;
  } = $props();

  const colorModeLabel = $derived(
    controller.colorMode === "spectrum"
      ? t("viewer_ui_spectrum")
      : controller.colorMode === "custom"
        ? t("viewer_ui_custom_pair")
        : t("viewer_ui_hand_colors")
  );
  const overrideCount = $derived(
    Object.keys(controller.performerColors).length
  );
  const performersValue = $derived(
    overrideCount === 0
      ? t("viewer_ui_inherit")
      : t("viewer_ui_performers_customized", { count: overrideCount })
  );
</script>

<div class="drill-boxes">
  <SettingsDrillRow
    label={t("viewer_ui_colors")}
    value={colorModeLabel}
    onclick={() => onOpen("colors")}
  />
  {#if controller.colorPerformers.length > 0}
    <SettingsDrillRow
      label={t("viewer_ui_performers")}
      value={performersValue}
      onclick={() => onOpen("performers")}
    />
  {/if}
</div>

<style>
  .drill-boxes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 6px;
  }
</style>
