<script lang="ts">
  import { useRenderer } from "@threlte/core";
  import { ACESFilmicToneMapping, type WebGLRenderer } from "three";

  const { renderer } = useRenderer<WebGLRenderer>();

  $effect(() => {
    const gl = renderer;
    if (!gl) return;
    const previousMapping = gl.toneMapping;
    const previousExposure = gl.toneMappingExposure;
    // Must match the ocean branch of ScenePostProcessing, which the harness
    // route does not mount. AgX was in both and was the main reason the reef
    // read as washed out: it is a low-contrast, deliberately desaturating
    // curve meant to be finished with a look LUT this scene never had, so a
    // dim underwater grade came out of it as uniform slate. Same frame under
    // ACES has orange corals, warm firelight on the ruin, and cyan jellies.
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.15;
    return () => {
      gl.toneMapping = previousMapping;
      gl.toneMappingExposure = previousExposure;
    };
  });
</script>
