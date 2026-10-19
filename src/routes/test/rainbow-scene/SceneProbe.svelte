<script lang="ts">
  import { useRenderer, useScene, useTask, useThrelte } from "@threlte/core";
  import type { WebGLRenderer } from "three";
  let { onSample, worldName = "rainbow-environment-world" } = $props<{
    onSample: (value: string) => void;
    worldName?: string;
  }>();
  const { camera } = useThrelte();
  const { scene } = useScene();
  const { renderer } = useRenderer<WebGLRenderer>();
  let elapsed = 0;
  useTask((delta) => {
    elapsed += delta;
    if (elapsed < 1) return;
    elapsed = 0;
    onSample(
      JSON.stringify({
        children: scene.children.map((object) => object.name || object.type),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        camera: camera.current.position.toArray(),
        venue: !!scene.getObjectByName(worldName),
      })
    );
  });
</script>
