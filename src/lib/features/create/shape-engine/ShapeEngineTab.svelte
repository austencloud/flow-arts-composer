<!--
  ShapeEngineTab.svelte - Shape Engine mounted as the Create module's Shape
  tab. The shared app owns everything; this host only supplies persistence
  and a sized box. The standalone /shape-engine route persists to the URL
  for deep-linking; inside the app the tab remembers its state locally,
  because module tabs do not own the URL.
-->
<script lang="ts">
  import ShapeMatrixApp from "$lib/shared/shape-matrix/app/ShapeMatrixApp.svelte";
  import { createShapeEnginePersistence } from "./shape-engine-persistence";

  const persistence = createShapeEnginePersistence(localStorage);
</script>

<div class="shape-engine-tab">
  <ShapeMatrixApp {persistence} variant="embedded" />
</div>

<style>
  .shape-engine-tab {
    flex: 1;
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
</style>
