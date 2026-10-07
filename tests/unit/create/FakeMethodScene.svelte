<!-- A stand-in method preview scene. It reports ready on mount, unless a
     test switches that off, and shows the props the preview box passes it. -->
<script module lang="ts">
  /** Tests switch this off to hold a scene before its first picture. */
  export const fakeScene = { reportsReady: true };
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import type { MethodPreviewSceneProps } from "$lib/features/create/shared/components/method-previews/method-preview-scenes";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  onMount(() => {
    if (fakeScene.reportsReady) onready();
  });
</script>

<span
  class="fake-scene"
  data-playing={String(playing)}
  data-turn={String(turn)}
  data-shape={shape}
  data-size={`${width}x${height}`}
  data-accent={accent}
></span>
