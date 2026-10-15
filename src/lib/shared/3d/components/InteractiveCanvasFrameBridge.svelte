<script lang="ts">
  import {
    resolveThrelteScene,
    resolveThrelteRenderer,
  } from "../scene-boot/threlte-handles";
  import { useThrelte } from "@threlte/core";
  import { onDestroy } from "svelte";

  import { registerInteractiveCanvasFrameProvider } from "../rendering/interactive-canvas-frame";

  const { renderer: rendererValue, scene: sceneValue, camera } = useThrelte();
  const scene = resolveThrelteScene(sceneValue);
  const renderer = resolveThrelteRenderer(rendererValue);
  const canvas = renderer.domElement;
  const unregister = registerInteractiveCanvasFrameProvider(canvas, () => {
    renderer.render(scene, camera.current);
  });

  onDestroy(unregister);
</script>
