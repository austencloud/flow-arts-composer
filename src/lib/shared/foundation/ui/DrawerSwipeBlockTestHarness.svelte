<!--
  DrawerSwipeBlockTestHarness.svelte

  Harness for DrawerSwipeBlock.svelte.test.ts. A real bottom Drawer holding
  ordinary content and one region that owns its own vertical drags, the way
  the 3D view does inside the sequence viewer's sheet.
-->
<script lang="ts">
  import Drawer from "./Drawer.svelte";
  import { blockSheetSwipe } from "./drawer/block-sheet-swipe.js";
  import type { CloseReason } from "@austencloud/drawer";

  let {
    isOpen = $bindable(true),
    onclose,
  }: {
    isOpen?: boolean;
    onclose?: (event: CustomEvent<{ reason: CloseReason }>) => void;
  } = $props();
</script>

<Drawer bind:isOpen {onclose} placement="bottom" title="Viewer">
  <div class="plain" data-testid="plain">Ordinary sheet content</div>
  <div class="stage" data-testid="stage" data-swipe-block use:blockSheetSwipe>
    <canvas data-testid="stage-canvas"></canvas>
  </div>
</Drawer>

<style>
  .plain {
    height: 140px;
  }

  .stage {
    height: 260px;
  }

  .stage canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
</style>
