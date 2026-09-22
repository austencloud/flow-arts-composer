<!--
  ShapeEngineTab.svelte - Shape Engine mounted as the Create module's Shape
  tab. The shared app owns everything; this host supplies persistence, the
  settings-backed prop source, and a sized box. The standalone /shape-engine
  route persists to the URL for deep-linking; inside the app the tab
  remembers its matrix state locally, because module tabs do not own the
  URL, and takes its prop pair from settings like every other surface.
-->
<script lang="ts">
  import ShapeMatrixApp from "$lib/shared/shape-matrix/app/ShapeMatrixApp.svelte";
  import {
    getSettings,
    updateSettings,
  } from "$lib/shared/application/state/app-state.svelte";
  import { createShapeEnginePersistence } from "./shape-engine-persistence";
  import { createShapeEnginePropSource } from "./shape-engine-prop-source";

  const persistence = createShapeEnginePersistence(localStorage);
  // The prop pair is the app's, not the tab's: settings win over the stored
  // snapshot on restore, and a pick inside the engine writes settings.
  const propSource = createShapeEnginePropSource({
    getSettings,
    updateSettings,
  });
</script>

<div class="shape-engine-tab">
  <ShapeMatrixApp {persistence} {propSource} variant="embedded" />
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
