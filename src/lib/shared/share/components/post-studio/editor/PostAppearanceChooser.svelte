<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";
  import SettingsDrillRow from "$lib/shared/ui/components/settings-drill/SettingsDrillRow.svelte";
  import { responsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
  import { appearanceControlsFit } from "./post-appearance-fit";

  let {
    title,
    value,
    fill,
    count,
    tileWidth,
    tileHeight,
    insetX = 0,
    chromeHeight = 0,
    columnChoices,
    children,
  }: {
    title: string;
    value: string;
    fill: boolean;
    count: number;
    tileWidth: number;
    tileHeight: number;
    insetX?: number;
    chromeHeight?: number;
    columnChoices?: readonly number[];
    children: Snippet<[boolean]>;
  } = $props();

  let width = $state(0);
  let height = $state(0);
  let open = $state(false);
  let sideBySide = $state(false);
  const fits = $derived(
    appearanceControlsFit(
      width,
      fill ? height : Infinity,
      count,
      tileWidth,
      tileHeight,
      insetX,
      chromeHeight,
      columnChoices
    )
  );

  onMount(() => {
    const update = () =>
      (sideBySide = responsiveLayoutManager.shouldUseSideBySideLayout());
    update();
    return responsiveLayoutManager.onLayoutChange(update);
  });
</script>

<div
  class="chooser"
  class:fill
  bind:clientWidth={width}
  bind:clientHeight={height}
>
  {#if !fits || open}
    <SettingsDrillRow label={title} {value} onclick={() => (open = true)} />
  {:else}
    {@render children(fill)}
  {/if}
</div>

<Drawer
  bind:isOpen={open}
  placement={sideBySide ? "right" : "bottom"}
  ariaLabel={title}
  class="post-appearance-drawer"
  showHandle={!sideBySide}
>
  <div class="appearance-sheet">
    <DrawerHeader
      {title}
      onBack={() => (open = false)}
      onClose={() => (open = false)}
    />
    <div class="drawer-controls">{@render children(true)}</div>
  </div>
</Drawer>

<style>
  .chooser,
  .appearance-sheet,
  .drawer-controls {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .chooser.fill,
  .appearance-sheet,
  .drawer-controls {
    flex: 1;
  }
  .chooser.fill {
    contain: size;
  }
  .drawer-controls {
    padding: 12px 16px max(16px, env(safe-area-inset-bottom));
    overflow-y: auto;
  }
  :global(.post-appearance-drawer) {
    --sheet-bg:
      linear-gradient(
        var(--theme-panel-bg, #0f0f14),
        var(--theme-panel-bg, #0f0f14)
      ),
      var(--sheet-bg-solid, #0f0f14);
    --sheet-filter: none;
    --prop-comfortable-min: 6rem;
  }
  :global(.post-appearance-drawer[data-placement="right"]) {
    --sheet-width: min(640px, 92vw);
  }
  :global(.post-appearance-drawer[data-placement="bottom"]) {
    height: calc(100dvh - env(safe-area-inset-top, 0px));
    --sheet-max-width: 640px;
    border-radius: var(--sheet-radius-large, 20px)
      var(--sheet-radius-large, 20px) 0 0;
  }
</style>
