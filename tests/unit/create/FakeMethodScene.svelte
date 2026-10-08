<!-- A stand-in method preview scene. It reports ready on mount, unless a
     test switches that off, and shows the props the preview box passes it. -->
<script module lang="ts">
  /**
   * Tests change these to shape the scene's first report.
   * reportsReady: false holds the scene before its first picture.
   * readyTimes: how many times it calls onready (a real scene can repeat).
   * readyDelayMs: report this long after mount instead of at once.
   */
  export const fakeScene = {
    reportsReady: true,
    readyTimes: 1,
    readyDelayMs: 0,
  };
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

  // The delayed report is never cancelled on destroy, on purpose: it stands
  // for a renderer that reports from a promise after the box has gone.
  onMount(() => {
    if (!fakeScene.reportsReady) return;
    const times = fakeScene.readyTimes;
    const report = () => {
      for (let i = 0; i < times; i++) onready();
    };
    if (fakeScene.readyDelayMs > 0) setTimeout(report, fakeScene.readyDelayMs);
    else report();
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
