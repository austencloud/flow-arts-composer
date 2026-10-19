<script lang="ts">
  import { useRenderer } from "@threlte/core";
  import { AgXToneMapping, type WebGLRenderer } from "three";

  const { renderer } = useRenderer<WebGLRenderer>();

  $effect(() => {
    const gl = renderer;
    const previousMapping = gl.toneMapping;
    const previousExposure = gl.toneMappingExposure;
    gl.toneMapping = AgXToneMapping;
    gl.toneMappingExposure = 1;
    return () => {
      gl.toneMapping = previousMapping;
      gl.toneMappingExposure = previousExposure;
    };
  });
</script>
