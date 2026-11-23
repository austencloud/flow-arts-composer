<script lang="ts">
  import { BackgroundType } from "@austencloud/backgrounds";

  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import ThemeShowroom from "#lib/shared/settings/components/tabs/background/showroom/ThemeShowroom.svelte";
  import type { AppSettings } from "#lib/shared/settings/domain/app-settings.js";

  let settings = $state<AppSettings>({
    gridMode: GridMode.DIAMOND,
    backgroundType: BackgroundType.AUTUMN,
  });

  function handleUpdate(event: { key: string; value: unknown }): void {
    if (event.key !== "backgroundType") return;
    settings = {
      ...settings,
      backgroundType: event.value as BackgroundType,
    };
  }
</script>

<svelte:head>
  <title>Theme showroom</title>
</svelte:head>

<div class="test-page">
  <ThemeShowroom
    {settings}
    onUpdate={handleUpdate}
    initialPreview={BackgroundType.CELESTIAL}
  />
</div>

<style>
  :global(body) {
    overflow: hidden;
    background: #08090d;
  }

  .test-page {
    /* the showroom's title is its first row, so the holder starts it below a phone's status bar */
    position: fixed;
    inset: 0;
    padding-top: var(--safe-top);
  }
</style>
